/**
 * omni-3d.js — 3D display backend for OmniScene
 *
 * Manages the Three.js lifecycle: builds the three-scene / camera / lights
 * AST shell (provided by the scene definition), runs build/update/resize/
 * teardown phases, drives the animation loop (OrbitControls damping + render),
 * and wires up drag interaction and depth-sorting.
 *
 * The scene definition (e.g. molam-scene.js) provides:
 *   sceneLayer.subtree[0]  →  MiniAstNode('three-scene', [camera, lights, content])
 *
 * Omni3d does NOT know about Molam, charts, or any specific content —
 * it only knows how to run a Three.js scene graph.
 *
 * Place in: omni-support/omni-3d.js
 */

import * as THREE                from 'three';
import { sceneRegistry }         from './scene.js';
import { ThreeSceneNode }        from '../nodes3d/three-scene-node.js';


class Omni3d {

  /**
   * @param {HTMLElement} viewport  — div where Three.js mounts its canvas
   * @param {HTMLElement} container — outer chart-container (resize target)
   * @param {Object}      app      — OmniSceneApp instance
   */
  constructor(viewport, container, app) {
    this.viewport  = viewport;
    this.container = container;
    this.app       = app;

    this._threeRoot      = null;   // MiniAstNode('three-scene', ...)
    this._ctxMix         = null;
    this._animFrame      = null;
    this._resizeObserver = null;
    this._destroyed      = true;
  }

  // ══════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ══════════════════════════════════════════════════════════

  /**
   * Build (or rebuild) the 3D scene from the current sceneLayer.
   * Idempotent — tears down any previous scene first.
   */
  activate() {
    this._cleanup();
    this._destroyed = false;

    this.viewport.style.display = '';

    const sceneLayer = this.app.sceneLayer;
    this._threeRoot  = sceneLayer.subtree[0];   // three-scene node

    // ── Build ────────────────────────────────────────────
    this._ctxMix = { THREE, container: this.viewport };
    sceneRegistry.runPhases(this._ctxMix, this._threeRoot, {}, ['build']);

    // ── Wire interactions ────────────────────────────────
    this._setupResize();
    this._setupCameraListener();
    this._setupDrag();
    this._wakeAnimLoop();

    // ── Initial update ───────────────────────────────────
    this.render(sceneLayer.value.params);
  }

  /** Tear down the 3D scene and hide the viewport. */
  deactivate() {
    this._cleanup();
    this.viewport.style.display = 'none';
  }

  // ══════════════════════════════════════════════════════════
  //  RENDER / UPDATE
  // ══════════════════════════════════════════════════════════

  /** Run the update phase so 3D nodes pick up new param values. */
  render(params) {
    if (!this._threeRoot) return;
    sceneRegistry.runPhases(this._ctxMix, this._threeRoot, params || {}, ['update']);
    this._renderFrame();
    this._wakeAnimLoop();   // keep damping alive if controls are updating
  }

  /** Handle container resize (called by OmniControlPanel onResize). */
  resize() {
    if (!this._threeRoot) return;
    sceneRegistry.runPhases(this._ctxMix, this._threeRoot, {}, ['resize']);
    this._renderFrame();
  }

  // ══════════════════════════════════════════════════════════
  //  CONTENT MANAGEMENT
  // ══════════════════════════════════════════════════════════

  /**
   * Swap the scene content node (three-scene.subtree[2]).
   * Tears down old content, builds new, adds to Three.js scene graph.
   */
  replaceContent(newSceneNode) {
    if (!this._threeRoot) return;

    const tsi          = this._threeRoot.inst;          // ThreeSceneNode
    const oldSceneNode = this._threeRoot.subtree[2];

    // Remove old
    if (oldSceneNode?.inst?.group) {
      tsi.scene.remove(oldSceneNode.inst.group);
    }
    sceneRegistry.runPhases(this._ctxMix, oldSceneNode, {}, ['teardown']);

    // Insert new
    this._threeRoot.subtree[2] = newSceneNode;
    sceneRegistry.runPhases(this._ctxMix, newSceneNode, {}, ['build']);

    if (newSceneNode.inst?.group) {
      tsi.scene.add(newSceneNode.inst.group);
    }
  }

  /** Reset OrbitControls target to origin. */
  resetCamera() {
    const cam = this.camera;
    if (!cam?.controls) return;
    cam.controls.target.set(0, 0, 0);
    cam.controls.update();
  }

  // ══════════════════════════════════════════════════════════
  //  ACCESSORS
  // ══════════════════════════════════════════════════════════

  /** CameraNode instance (three-scene.subtree[0].inst). */
  get camera() {
    return this._threeRoot?.subtree[0]?.inst;
  }

  /** ThreeSceneNode instance (three-scene.inst). */
  get threeScene() {
    return this._threeRoot?.inst;
  }

  /** The content SceneNode3D (three-scene.subtree[2]). */
  get contentNode() {
    return this._threeRoot?.subtree[2];
  }

  /** Collect all draggable objects from content children. */
  collectDraggables() {
    const sceneNode = this.contentNode;
    if (!sceneNode) return [];
    const all = [];
    for (const child of sceneNode.subtree) {
      if (child.inst?.getDraggables) all.push(...child.inst.getDraggables());
    }
    return all;
  }

  // ══════════════════════════════════════════════════════════
  //  INTERNALS
  // ══════════════════════════════════════════════════════════

  /** Immediate Three.js render (used after resize to avoid blank frame). */
  _renderFrame() {
    const tsi = this.threeScene;
    const cam = this.camera;
    if (tsi?.renderer && tsi?.scene && cam?.camera) {
      tsi.renderer.render(tsi.scene, cam.camera);
    }
  }

  // ── Animation loop (activity-timeout) ───────────────────
  //
  // Runs while the camera is in motion (OrbitControls damping)
  // and stops after _IDLE_MS of no camera changes.  Woken by
  // pointer events, orbit 'change' events, and explicit calls.

  static _IDLE_MS = 2000;

  _startAnimLoop() {
    if (this._animFrame) return;
    const step = () => {
      if (this._destroyed) { this._animFrame = null; return; }

      const cam = this.camera;
      if (cam?.controls) cam.controls.update();
      this._renderFrame();

      // Self-terminate when idle
      if (performance.now() - (this._lastActivity || 0) > Omni3d._IDLE_MS) {
        this._animFrame = null;
        return;
      }
      this._animFrame = requestAnimationFrame(step);
    };
    this._animFrame = requestAnimationFrame(step);
  }

  /** Wake the loop (call on any user interaction or camera change). */
  _wakeAnimLoop() {
    this._lastActivity = performance.now();
    this._startAnimLoop();
  }

  _stopAnimLoop() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }

  // ── Resize observer ───────────────────────────────────────

  _setupResize() {
    this._resizeObserver = new ResizeObserver(() => {
      if (this._destroyed) return;
      sceneRegistry.runPhases(this._ctxMix, this._threeRoot, {}, ['resize']);
      this._renderFrame();
    });
    this._resizeObserver.observe(this.container);
  }

  // ── Drag interaction ──────────────────────────────────────

  _setupDrag() {
    const canvas = this._ctxMix?.canvas;
    const cam    = this.camera;
    if (!canvas || !cam?.camera || !cam?.controls) return;

    ThreeSceneNode.setupDrag(canvas, cam.camera, cam.controls, {
      getDraggables: () => this.collectDraggables(),
      getParams:     () => this.app.sceneLayer.value.params,
      onDirty:       () => this.render(this.app.sceneLayer.value.params),
    });
  }

  // ── Camera change → depth sort ────────────────────────────

  _setupCameraListener() {
    const cam = this.camera;
    if (!cam?.controls) return;
    cam.controls.addEventListener('change', () => {
      this._wakeAnimLoop();
      const sceneNode = this.contentNode;
      if (!sceneNode) return;
      for (const child of sceneNode.subtree) {
        if (child.inst?.sortInstances) child.inst.sortInstances(cam.camera);
      }
    });
  }

  // ── Cleanup ───────────────────────────────────────────────

  _cleanup() {
    this._stopAnimLoop();
    this._destroyed = true;

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (this._threeRoot) {
      sceneRegistry.runPhases(this._ctxMix, this._threeRoot, {}, ['teardown']);

      const tsi = this._threeRoot.inst;
      if (tsi?.renderer) {
        tsi.renderer.dispose();
        if (tsi.renderer.domElement?.parentElement) {
          tsi.renderer.domElement.remove();
        }
      }
      this._threeRoot = null;
    }

    this._ctxMix = null;
  }
}


export { Omni3d };