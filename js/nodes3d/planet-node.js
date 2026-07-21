import { SceneNode, sceneRegistry } from '../omni-support/scene.js';
import * as THREE from 'three';

/**
 * PlanetNode — owns crust, core, grid, cutaway planes, and clipping.
 *
 * AST wiring:
 *   new MiniAstNode('planet', [], {
 *     crustRadius: 1,                 // optional, default 1
 *     coreRadius: 0.6,                // optional, default 0.6
 *     earthTexture: 'https://...',    // optional, has default
 *   })
 *
 * After build:
 *   node.inst.group          — THREE.Group containing all planet meshes
 *   node.inst.clippingPlanes — [clipPlane1, clipPlane2] (for external use if needed)
 *
 * Phases handled: build, update, teardown
 *
 * Update params (cheap):
 *   rotation, wedgeStart, wedgeAngle, planeOpacity, coreOpacity
 *
 * Rebuild params (partial — core geometry + radial texture):
 *   coreRadius
 */

const DEFAULT_EARTH_TEXTURE =
  'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg';

class PlanetNode extends SceneNode {

  static rebuildParams = ['coreRadius'];
  static updateParams = ['rotation', 'wedgeStart', 'wedgeAngle',
                         'planeOpacity', 'coreOpacity'];

  // ── Build ──────────────────────────────────────────────

  build(ctxMix, node, params) {
    if (this.group) return;

    const cfg = node.value || {};
    this._crustRadius = cfg.crustRadius ?? 1;
    this._coreRadius  = cfg.coreRadius ?? 0.6;

    this.group = new THREE.Group();

    this._createClippingPlanes();
    this._createMaterials(cfg);
    this._createGeometry();
    this._updateRadialTexture(this._coreRadius, 1.0);
  }

  // ── Update ─────────────────────────────────────────────

  update(ctxMix, node, params) {
    // Clipping planes must compensate for parent sphereGroup rotation.
    // We read params.rotation directly (same source as SceneNode3D).
    const rotRad = ((params.rotation ?? 0) * Math.PI) / 180;

    // Wedge clipping
    const radStart = -((params.wedgeStart ?? 0) * Math.PI) / 180;
    const rad1 = radStart - rotRad;
    this.clipPlane1.normal.set(Math.cos(rad1), 0, Math.sin(rad1));
    this.plane1.rotation.y = -radStart + Math.PI / 2;

    const radEnd = radStart + Math.PI - ((params.wedgeAngle ?? 90) * Math.PI) / 180;
    const rad2 = radEnd - rotRad;
    this.clipPlane2.normal.set(Math.cos(rad2), 0, Math.sin(rad2));
    this.plane2.rotation.y = -radEnd + Math.PI / 2;

    // Core radius — partial rebuild if changed
    const coreRadius = params.coreRadius ?? this._coreRadius;
    if (coreRadius !== this._coreRadius) {
      this._coreRadius = coreRadius;
      this.group.remove(this.core);
      this.core.geometry.dispose();
      this.core.geometry = new THREE.SphereGeometry(coreRadius, 64, 64);
      this.group.add(this.core);
    }

    // Plane opacity
    if (params.planeOpacity !== undefined) {
      this.planeMat1.opacity = params.planeOpacity;
      this.planeMat2.opacity = params.planeOpacity;
    }

    // Radial texture (responds to both coreRadius and coreOpacity)
    this._updateRadialTexture(
      this._coreRadius,
      params.coreOpacity ?? 1.0
    );
  }

  // ── Teardown ───────────────────────────────────────────

  teardown(ctxMix, node, params) {
    this.clear();
  }

  clear() {
    if (!this.group) return;

    // Dispose geometries
    for (const mesh of [this.crust, this.core, this.grid, this.plane1, this.plane2]) {
      if (mesh) {
        mesh.geometry.dispose();
      }
    }

    // Dispose materials
    for (const mat of [this.crustMat, this.coreMat, this.gridMat, this.planeMat1, this.planeMat2]) {
      if (mat) {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      }
    }

    // Dispose radial texture
    if (this.radialTexture) {
      this.radialTexture.dispose();
      this.radialTexture = null;
    }

    // Remove children from group
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }

    this.group = null;
    this.crust = this.core = this.grid = this.plane1 = this.plane2 = null;
    this.crustMat = this.coreMat = this.gridMat = this.planeMat1 = this.planeMat2 = null;
    this.clipPlane1 = this.clipPlane2 = null;
    this.clippingPlanes = null;
  }

  // ── Internal: clipping planes ──────────────────────────

  _createClippingPlanes() {
    this.clipPlane1 = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    this.clipPlane2 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.clippingPlanes = [this.clipPlane1, this.clipPlane2];
  }

  // ── Internal: materials ────────────────────────────────

  _createMaterials(cfg) {
    const textureLoader = new THREE.TextureLoader();
    const earthTex = textureLoader.load(cfg.earthTexture ?? DEFAULT_EARTH_TEXTURE);

    this.crustMat = new THREE.MeshPhongMaterial({
      map: earthTex,
      clippingPlanes: this.clippingPlanes,
      clipIntersection: true,
      side: THREE.DoubleSide,
    });

    this.coreMat = new THREE.MeshPhongMaterial({
      color: 0xff6600,
      emissive: 0x441100,
      clippingPlanes: this.clippingPlanes,
      clipIntersection: true,
      side: THREE.DoubleSide,
    });

    this.gridMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
      clippingPlanes: this.clippingPlanes,
      clipIntersection: true,
    });

    this.planeMat1 = new THREE.MeshPhongMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });

    this.planeMat2 = new THREE.MeshPhongMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
  }

  // ── Internal: geometry ─────────────────────────────────

  _createGeometry() {
    const r = this._crustRadius;

    this.crust = new THREE.Mesh(
      new THREE.SphereGeometry(r, 64, 64), this.crustMat
    );
    this.group.add(this.crust);

    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(this._coreRadius, 64, 64), this.coreMat
    );
    this.group.add(this.core);

    this.grid = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.005, 32, 32), this.gridMat
    );
    this.group.add(this.grid);

    const planeGeom = new THREE.CircleGeometry(r, 64, -Math.PI / 2, Math.PI);

    this.plane1 = new THREE.Mesh(planeGeom, this.planeMat1);
    this.plane1.rotation.y = Math.PI / 2;
    this.group.add(this.plane1);

    this.plane2 = new THREE.Mesh(planeGeom, this.planeMat2);
    this.plane2.rotation.z = Math.PI;
    this.group.add(this.plane2);
  }

  // ── Internal: radial texture for cutaway planes ────────

  _createRadialTexture(coreRadius, coreOpacity) {
    const canvas = document.createElement('canvas');
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2, maxR = size / 2;

    ctx.clearRect(0, 0, size, size);

    // Mantle gradient
    const mantleGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    mantleGrad.addColorStop(0, '#d4a373');
    mantleGrad.addColorStop(0.5, '#8b6f47');
    mantleGrad.addColorStop(1, '#654321');
    ctx.fillStyle = mantleGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.fill();

    // Core punch-out and fill
    const coreR = maxR * coreRadius;
    if (coreOpacity < 1.0) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${1 - coreOpacity})`;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (coreOpacity > 0) {
      ctx.globalAlpha = coreOpacity;
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      coreGrad.addColorStop(0, '#ffff00');
      coreGrad.addColorStop(0.3, '#ff8800');
      coreGrad.addColorStop(0.7, '#ff4500');
      coreGrad.addColorStop(1, '#cc3300');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    // Ring guides
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let r = 0.2; r <= 1; r += 0.2) {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  _updateRadialTexture(coreRadius, coreOpacity) {
    if (this.radialTexture) this.radialTexture.dispose();
    this.radialTexture = this._createRadialTexture(coreRadius, coreOpacity);
    this.planeMat1.map = this.radialTexture;
    this.planeMat1.needsUpdate = true;
    this.planeMat2.map = this.radialTexture;
    this.planeMat2.needsUpdate = true;
  }
}

sceneRegistry.registerNodeClass('planet', PlanetNode);

export { PlanetNode };

// Auto-generated exports
if (typeof window !== 'undefined') window.DEFAULT_EARTH_TEXTURE = DEFAULT_EARTH_TEXTURE;
export { DEFAULT_EARTH_TEXTURE };
