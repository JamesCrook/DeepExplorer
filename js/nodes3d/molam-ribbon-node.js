import { sceneRegistry } from '../omni-support/scene.js';
import { RibbonNode } from './ribbon-node.js';
import { RibbonUI } from '../3d-support/ribbon3d.js';
import { getResidueColor } from '../3d-support/molam-objects.js';
import * as THREE from 'three';
// #mol/node/ribbon

/**
 * MolamRibbonNode — protein ribbon with per-residue coloring.
 *
 * Extends RibbonNode. Adds:
 *   - Per-vertex colors from amino acid properties (via getResidueColor)
 *   - Axis-based fade (referenceAxis + ribbonFade + colorSmoothing)
 *   - Arrow heads on beta-sheet segments
 *   - setData(points, rolls, atoms) for protein chain data
 *
 * AST wiring:
 *   new MiniAstNode('molam-ribbon', [], {
 *     key: 'ribbon-A',
 *     color: 0x4fc3f7,           // chain color (solid mode)
 *     samplesPerSegment: 40,
 *   })
 *
 * Data (set on inst before or after build):
 *   inst.setData(points, rolls, atoms)
 *     points — THREE.Vector3[] (CA positions)
 *     rolls  — number[] (per-point roll angles in degrees)
 *     atoms  — object[] (per-point residue data with resName, chainID, resSeq)
 *
 * Color params (injected via slider params):
 *   colorMode      — 0 = chain color, 1 = per-residue (RESIDUE_COLORS table)
 *   small, hydroxyl, hydrophobic, negative, polar,
 *   aliphatic, positive, large, sulfur, aromatic
 *                  — weighted amino acid property scheme blend
 *
 * Axis fade params:
 *   referenceAxis  — THREE.Vector3 (injected into params)
 *   ribbonFade     — threshold for tangent·axis dot product
 *   colorSmoothing — color blend sharpness at segment boundaries
 *
 * Phases handled: build, update, teardown (inherited + overrides)
 */

// Neutral chain color used when computing per-residue colors.
// Distinct from the actual chain color — this is the "background"
// against which property-based coloring blends.
const NEUTRAL_CHAIN_COLOR = 0x908882;

// Slider IDs for amino acid property color schemes
const COLOR_PARAM_IDS = [
  'small', 'hydroxyl', 'hydrophobic', 'negative', 'polar',
  'aliphatic', 'positive', 'large', 'sulfur', 'aromatic'
];

// All params that affect the ribbon appearance.
// Used for static updateParams — tells the registry which
// slider changes should trigger an update walk.
const ALL_MOLAM_RIBBON_PARAMS = [
  'width', 'thickness', 'smoothing', 'controlNodeSmoothing',
  'nodeScale', 'controlNodeSize', 'jointNodeSize', 'nitroNodeSize', 'nitroPos', 'normalIndicatorSize',
  'arrowHeads', 'colorSmoothing', 'colorMode', 'ribbonFade',
  ...COLOR_PARAM_IDS
];

class MolamRibbonNode extends RibbonNode {

  static rebuildParams = [];
  static updateParams = ALL_MOLAM_RIBBON_PARAMS;

  // ── Build ──────────────────────────────────────────────
  //    Override: reads key from cfg, no route machinery.

  build(ctxMix, node, params) {
    if (this.group) return;

    const cfg = node.value || {};

    this._route = null;
    this._routeCfg = {};
    this._atoms = null;

    this.group = new THREE.Group();
    this._sceneShim = this._makeSceneShim();

    this.ribbonUI = new RibbonUI(this._sceneShim, {
      key: cfg.key ?? 'molam-ribbon',
      color: cfg.color ?? 0x4fc3f7,
      samplesPerSegment: cfg.samplesPerSegment ?? 40,
    });
    this.ribbonUI.dragOwnerInst = this;

    this._prevRouteParams = null;
    this._prevRibbonParams = null;
    this._dataDirty = false;

    this.controlPoints = [];
    this.controlPointRolls = [];

    // Apply data if setData was called before build
    if (this._pendingData) {
      const { points, rolls, atoms } = this._pendingData;
      this._pendingData = null;
      this.controlPoints = points;
      this.controlPointRolls = rolls;
      this._atoms = atoms;
      this.ribbonUI.setData(points, rolls);
      this._dataDirty = true;
    }
  }

  // ── Data ───────────────────────────────────────────────
  //    Can be called before or after build.

  setData(points, rolls, atoms) {
    this.controlPoints = points;
    this.controlPointRolls = rolls;
    this._atoms = atoms || null;

    if (this.ribbonUI) {
      this.ribbonUI.setData(points, rolls);
      this._dataDirty = true;
    } else {
      // Deferred — will be applied during build
      this._pendingData = { points, rolls, atoms };
    }
  }

  // ── Param mapping ──────────────────────────────────────
  //    Override: Molam uses direct param names (width not ribbonWidth).
  //    Color-affecting params are included so that the base class
  //    change detection in _updateRibbon catches color changes.
  //    Ribbon.rebuild ignores the extra keys harmlessly.

  _mapRibbonParams(params) {
    const rp = {
      width:                params.width,
      thickness:            params.thickness,
      smoothing:            params.smoothing,
      controlNodeSmoothing: params.controlNodeSmoothing,
      nodeScale:            params.nodeScale,
      controlNodeSize:      params.controlNodeSize,
      jointNodeSize:        params.jointNodeSize,
      nitroNodeSize:        params.nitroNodeSize,
      nitroPos:             params.nitroPos,
      normalIndicatorSize:  params.normalIndicatorSize,
      arrowHeads:           params.arrowHeads,
      arrowHeads2:          params.arrowHeads2,
      colorMode:            params.colorMode,
      colorSmoothing:      params.colorSmoothing,
      ribbonFade:           params.ribbonFade,
    };
    for (const id of COLOR_PARAM_IDS) {
      rp[id] = params[id];
    }
    return rp;
  }

  // ── Update ─────────────────────────────────────────────
  //    Override: inject colors, axisInfo, arrowHeads onto
  //    RibbonUI/Ribbon before the base class triggers rebuild.

  _updateRibbon(params) {
    if (!this.ribbonUI) return;

    // Per-vertex colors from residue data
    this.ribbonUI.colors = this._computeColors(params);

    // Arrow heads on the underlying Ribbon
    this.ribbonUI.ribbon.arrowHeads = params.arrowHeads || 0;

    // Axis fade and blend boundaries.
    // Always set axisInfo — colorSmoothing controls color interpolation
    // between segments even when no reference axis is active.
    this.ribbonUI.ribbon.axisInfo = {
      referenceAxis:   params.referenceAxis || null,
      ribbonFade:      params.ribbonFade || 0,
      colorSmoothing: params.colorSmoothing ?? 0,
    };

    // Base class handles change detection and rebuild/partialRebuild
    super._updateRibbon(params);
  }

  // ── Teardown ────────────────────────────────────────────

  clear() {
    this._atoms = null;
    this._pendingData = null;
    super.clear();
  }

  // ── Internal: color computation ────────────────────────
  //    Returns per-control-point THREE.Color array, or null
  //    when solid chain color should be used.

  _computeColors(params) {
    if (!this._atoms) return null;

    const sumWeights = COLOR_PARAM_IDS.reduce(
      (sum, id) => sum + (params[id] || 0), 0
    );

    if (sumWeights <= 0) return null;

    return this.controlPoints.map((_, i) => {
      const atom = this._atoms[i];
      return getResidueColor(atom, params, NEUTRAL_CHAIN_COLOR, THREE);
    });
  }
}

sceneRegistry.registerNodeClass('molam-ribbon', MolamRibbonNode);

export { MolamRibbonNode };

// Auto-generated exports
if (typeof window !== 'undefined') window.ALL_MOLAM_RIBBON_PARAMS = ALL_MOLAM_RIBBON_PARAMS;
export { ALL_MOLAM_RIBBON_PARAMS };
if (typeof window !== 'undefined') window.COLOR_PARAM_IDS = COLOR_PARAM_IDS;
export { COLOR_PARAM_IDS };
if (typeof window !== 'undefined') window.NEUTRAL_CHAIN_COLOR = NEUTRAL_CHAIN_COLOR;
export { NEUTRAL_CHAIN_COLOR };
