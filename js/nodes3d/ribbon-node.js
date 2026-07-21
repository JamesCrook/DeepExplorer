import { SceneNode, sceneRegistry } from '../omni-support/scene.js';
import { RibbonUI } from '../3d-support/ribbon3d.js';
import { Spherical } from '../../js/utilities2/spherical.js';
import * as THREE from 'three';

/**
 * RibbonNode — owns a RibbonUI and optional route computation.
 *
 * AST wiring:
 *   new MiniAstNode('ribbon3d', [], {
 *     route: 'great-circle-arc',   // or null for manual control points
 *     color: 0x4fc3f7,
 *     samplesPerSegment: 40,
 *     numPoints: 5,                // for great-circle-arc route
 *     surfaceRadius: 1.005,        // for great-circle-arc route
 *     defaultPoints: [             // fallback when route is null
 *       [-2.0, 1.8, 0.5], [-0.8, 1.2, -0.8], ...
 *     ],
 *   })
 *
 * After build:
 *   node.inst.group         — THREE.Group (for parent to add)
 *   node.inst.ribbonUI      — RibbonUI instance
 *   node.inst.getDraggables — for drag interaction
 *
 * Route strategies:
 *   'great-circle-arc' — reads fromLat/fromLon/toLat/toLon/arcHeight
 *                         from params and computes control points.
 *   null               — control points set externally or via subtree.
 *
 * Phases handled: build, update, teardown
 *
 * Ribbon params (mapped from slider params):
 *   ribbonWidth → width, ribbonThickness → thickness,
 *   ribbonSmoothing → smoothing, controlNodeSmoothing,
 *   nodeScale, controlNodeSize, jointNodeSize, normalIndicatorSize
 *
 * Full rebuild triggered by node-related params.
 * Partial rebuild (geometry only) for width/thickness/smoothing.
 */

/*
# ESSENTIALS

Provides a 3D rectangular-cross-section Biarc Ribbon through chosen points.
The ribbon's cross-section dimensions can be modulated so as to produce arrow heads

The node also has some ribbon decorations, such as optional normal indicators and
spheres for control points.
*/ 

// Params that require a full RibbonUI rebuild (node meshes change)
const FULL_REBUILD_PARAMS = [
  'nodeScale', 'controlNodeSize', 'jointNodeSize', 'nitroNodeSize', 'nitroPos', 'normalIndicatorSize'
];

// All ribbon visual params
const ALL_RIBBON_PARAMS = [
  'ribbonWidth', 'ribbonThickness', 'ribbonSmoothing',
  'controlNodeSmoothing', 'nodeScale', 'controlNodeSize',
  'jointNodeSize', 'nitroNodeSize', 'nitroPos', 'normalIndicatorSize'
];

// Route params that trigger recomputation of control points
const ROUTE_PARAMS = ['fromLat', 'fromLon', 'toLat', 'toLon', 'arcHeight'];

class RibbonNode extends SceneNode {

  static rebuildParams = [...ROUTE_PARAMS, ...FULL_REBUILD_PARAMS];
  static updateParams = ALL_RIBBON_PARAMS;

  // ── Build ──────────────────────────────────────────────

  build(ctxMix, node, params) {
    if (this.group) return;

    const cfg = node.value || {};
    this._route = cfg.route ?? null;
    this._routeCfg = {
      numPoints: cfg.numPoints ?? 5,
      surfaceRadius: cfg.surfaceRadius ?? 1.005,
    };

    this.group = new THREE.Group();

    // RibbonUI needs a scene-like object to add/remove meshes.
    // We provide a shim that delegates to our group.
    this._sceneShim = this._makeSceneShim();

    this.ribbonUI = new RibbonUI(this._sceneShim, {
      key: 'ribbon3d',
      color: cfg.color ?? 0x4fc3f7,
      samplesPerSegment: cfg.samplesPerSegment ?? 40,
    });
    this.ribbonUI.dragOwnerInst = this;

    // Set initial control points
    this._prevRouteParams = null;
    this._prevRibbonParams = null;
    this._dataDirty = false;

    this._initControlPoints(cfg, params);
  }

  // ── Update ─────────────────────────────────────────────

  update(ctxMix, node, params) {
    if (!this.ribbonUI) return;

    // Route recomputation (if using a route strategy)
    if (this._route) {
      this._updateRoute(params);
    }

    // Ribbon visual rebuild/update
    this._updateRibbon(params);
  }

  // ── Teardown ───────────────────────────────────────────

  teardown(ctxMix, node, params) {
    this.clear();
  }

  clear() {
    if (this.ribbonUI) {
      this.ribbonUI.clear();
      this.ribbonUI = null;
    }
    if (this.group) {
      while (this.group.children.length > 0) {
        this.group.remove(this.group.children[0]);
      }
      this.group = null;
    }
    this._sceneShim = null;
    this._prevRouteParams = null;
    this._prevRibbonParams = null;
    this.controlPoints = null;
    this.controlPointRolls = null;
  }

  // ── Drag interface ─────────────────────────────────────
  //    Exposed for the app-level drag handler to use.

  getDraggables() {
    return this.ribbonUI ? this.ribbonUI.getDraggables() : [];
  }

  onDragStart(mesh) {
    if (this.ribbonUI) this.ribbonUI.onDragStart(mesh);
  }

  onDragEnd(mesh) {
    if (this.ribbonUI) this.ribbonUI.onDragEnd(mesh);
  }

  getDragScale(mesh, params) {
    return this.ribbonUI
      ? this.ribbonUI.getDragScale(mesh, this._mapRibbonParams(params))
      : 1;
  }

  getDragTargetForMesh(mesh) {
    return this.ribbonUI
      ? this.ribbonUI.getDragTargetForMesh(mesh)
      : null;
  }

  markDirty() {
    this._dataDirty = true;
  }

  // ── Internal: scene shim ───────────────────────────────
  //    RibbonUI calls only sceneManager.add() and .remove().
  //    We redirect both into our own group.

  _makeSceneShim() {
    const group = this.group;
    return {
      add:    (obj) => group.add(obj),
      remove: (obj) => group.remove(obj),
    };
  }

  // ── Internal: initial control points ───────────────────

  _initControlPoints(cfg, params) {
    if (this._route === 'great-circle-arc') {
      // Will be computed on first update from params
      this.controlPoints = [];
      this.controlPointRolls = [];
    } else if (cfg.defaultPoints) {
      this.controlPoints = cfg.defaultPoints.map(
        p => new THREE.Vector3(p[0], p[1], p[2])
      );
      this.controlPointRolls = Array(this.controlPoints.length).fill(0);
      this.ribbonUI.setData(this.controlPoints, this.controlPointRolls);
    } else {
      this.controlPoints = [];
      this.controlPointRolls = [];
    }
  }

  // ── Internal: route strategies ─────────────────────────

  _updateRoute(params) {
    if (params.fromLat === undefined || params.fromLon === undefined ||
        params.toLat  === undefined || params.toLon  === undefined) return;

    const arcHeight = params.arcHeight ?? 0.05;

    const routeChanged = !this._prevRouteParams ||
      this._prevRouteParams.fromLat    !== params.fromLat ||
      this._prevRouteParams.fromLon    !== params.fromLon ||
      this._prevRouteParams.toLat      !== params.toLat ||
      this._prevRouteParams.toLon      !== params.toLon ||
      this._prevRouteParams.arcHeight  !== arcHeight;

    if (!routeChanged) return;

    const { numPoints, surfaceRadius } = this._routeCfg;

    // Great circle arc on the sphere surface
    const arcPoints = Spherical.greatCircleArc(
      params.fromLat, params.fromLon,
      params.toLat, params.toLon,
      surfaceRadius, numPoints
    );

    // Parabolic height offset: max at midpoint, zero at endpoints
    this.controlPoints = arcPoints.map((pt, i) => {
      const t = i / (numPoints - 1);
      const heightFactor = 1 + 4 * t * (1 - t);
      const offsetDist = arcHeight * heightFactor;
      const normal = pt.clone().normalize();
      return pt.clone().add(normal.multiplyScalar(offsetDist));
    });

    this.controlPointRolls = Array(numPoints).fill(0);
    this.ribbonUI.setData(this.controlPoints, this.controlPointRolls);
    this._dataDirty = true;

    this._prevRouteParams = {
      fromLat: params.fromLat,
      fromLon: params.fromLon,
      toLat: params.toLat,
      toLon: params.toLon,
      arcHeight,
    };
  }

  // ── Internal: ribbon param mapping ─────────────────────

  _mapRibbonParams(params) {
    return {
      width:                 params.ribbonWidth,
      thickness:             params.ribbonThickness,
      smoothing:             params.ribbonSmoothing,
      controlNodeSmoothing:  params.controlNodeSmoothing,
      nodeScale:             params.nodeScale,
      controlNodeSize:       params.controlNodeSize,
      jointNodeSize:         params.jointNodeSize,
      nitroNodeSize:         params.nitroNodeSize,
      nitroPos:              params.nitroPos,
      normalIndicatorSize:   params.normalIndicatorSize,
    };
  }

  // ── Internal: rebuild vs partial rebuild ───────────────

  _updateRibbon(params) {
    const rp = this._mapRibbonParams(params);
    const prev = this._prevRibbonParams;

    const changed = !prev || this._dataDirty ||
      Object.keys(rp).some(k => rp[k] !== prev[k]);

    if (!changed) return;

    const needsFull = !prev || this._dataDirty ||
      FULL_REBUILD_PARAMS.some(k => rp[k] !== (prev ? prev[k] : undefined));

    if (needsFull) this.ribbonUI.rebuild(rp);
    else           this.ribbonUI.partialRebuild(rp, []);

    this._prevRibbonParams = { ...rp };
    this._dataDirty = false;
  }
}

sceneRegistry.registerNodeClass('ribbon3d', RibbonNode);

export { RibbonNode };

// Auto-generated exports
if (typeof window !== 'undefined') window.ALL_RIBBON_PARAMS = ALL_RIBBON_PARAMS;
export { ALL_RIBBON_PARAMS };
if (typeof window !== 'undefined') window.FULL_REBUILD_PARAMS = FULL_REBUILD_PARAMS;
export { FULL_REBUILD_PARAMS };
if (typeof window !== 'undefined') window.ROUTE_PARAMS = ROUTE_PARAMS;
export { ROUTE_PARAMS };
