import { SceneNode, sceneRegistry } from '../omni-support/scene.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ProjectionMorpher } from '../3d-support/projection-morpher.js';

/**
 * CameraNode — owns a PerspectiveCamera, OrbitControls, and ProjectionMorpher.
 *
 * AST wiring:
 *   new MiniAstNode('camera', [], {
 *     fov: 75,
 *     near: 0.1,              // optional, default 0.1
 *     far: 1000,              // optional, default 1000
 *     position: [x, y, z],
 *     baseDistance,
 *     zoomRange: [0.1, 2],
 *     enableDamping: true,    // optional, default true
 *     dampingFactor: 0.05,    // optional, default 0.05
 *   })
 *
 * ctxMix supplies: { THREE, container, canvas }
 *   canvas is the renderer's domElement, set by ThreeSceneNode.before_build
 *
 * After build:
 *   node.inst.camera    — THREE.PerspectiveCamera
 *   node.inst.controls  — OrbitControls
 *
 * Phases handled: build, update, resize, teardown
 */

class CameraNode extends SceneNode {

  static rebuildParams = [];
  static updateParams = ['zoom', 'ortho'];

  // ── Build ──────────────────────────────────────────────

  build(ctxMix, node, params) {
    if (this.camera) return;

    const cfg = node.value;
    const [px, py, pz] = cfg.position;
    const near = cfg.near ?? 0.1;
    const far  = cfg.far ?? 1000;

    this.baseDistance = cfg.baseDistance;
    this._settingZoom = false;

    // Camera
    const aspect = ctxMix.container.clientWidth / ctxMix.container.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(cfg.fov, aspect, near, far);
    this.camera.position.set(px, py, pz);

    // OrbitControls — bound to the renderer canvas
    this.controls = new OrbitControls(this.camera, ctxMix.canvas);
    this.controls.enableDamping = cfg.enableDamping ?? true;
    this.controls.dampingFactor = cfg.dampingFactor ?? 0.05;

    const [zMin, zMax] = cfg.zoomRange ?? [0.1, 2];
    this.controls.minDistance = this.baseDistance / zMax;
    this.controls.maxDistance = this.baseDistance / zMin;

    // Projection morpher for ortho ↔ perspective
    this.projectionMorpher = new ProjectionMorpher(
      this.camera, this.controls, cfg.fov, near, far
    );

    // Zoom-change callback — set by the app for slider sync
    this.onZoomChange = null;

    this.controls.addEventListener('change', () => {
      if (this._settingZoom) return;
      const dist = this.camera.position.distanceTo(this.controls.target);
      const zoom = this.baseDistance / dist;
      if (this.onZoomChange) this.onZoomChange(zoom);
    });
  }

  // ── Update ─────────────────────────────────────────────

  update(ctxMix, node, params) {
    if (params.zoom !== undefined) {
      this.setZoom(params.zoom);
    }
    if (params.ortho !== undefined) {
      this.setOrtho(params.ortho);
    }
    this.controls.update();
  }

  // ── Resize ─────────────────────────────────────────────

  resize(ctxMix, node, params) {
    const rect = ctxMix.container.getBoundingClientRect();
    if (rect.width && rect.height) {
      this.camera.aspect = rect.width / rect.height;
      this.camera.updateProjectionMatrix();
    }
  }

  // ── Teardown ───────────────────────────────────────────

  teardown(ctxMix, node, params) {
    this.clear();
  }

  // ── Zoom ───────────────────────────────────────────────

  setZoom(zoom) {
    const target = this.controls.target;
    const dir = this.camera.position.clone().sub(target).normalize();
    const desiredDist = this.baseDistance / zoom;

    this._settingZoom = true;
    this.camera.position.copy(target).add(dir.multiplyScalar(desiredDist));
    this.controls.update();
    this._settingZoom = false;
  }

  // ── Ortho morph ────────────────────────────────────────
  //    t: 0 = full perspective, 1 = full orthographic.
  //    Uses ProjectionMorpher to lerp between the actual
  //    projection matrices rather than faking via fov.

  setOrtho(t) {
    this.projectionMorpher.updateProjection(t, this.camera.aspect);
  }

  // ── Clear ──────────────────────────────────────────────

  clear() {
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
    this.camera = null;
    this.projectionMorpher = null;
    this.onZoomChange = null;
  }
}

sceneRegistry.registerNodeClass('camera', CameraNode);

export { CameraNode, ProjectionMorpher };
