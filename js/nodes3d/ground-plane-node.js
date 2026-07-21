import { SceneNode, sceneRegistry } from '../omni-support/scene.js';
import * as THREE from 'three';

/**
 * GroundPlaneNode — owns a GridHelper and optional AxesHelper.
 *
 * AST wiring:
 *   new MiniAstNode('ground-plane', [], {
 *     grid: { size: 20, divisions: 20, y: -4, color1: 0x444444, color2: 0x333333 },
 *     axes: { size: 2, position: [-9, -3.9, -9] },   // optional
 *   })
 *
 * After build:
 *   node.inst.group  — THREE.Group (for parent to add to scene)
 *
 * Phases handled: build, teardown
 *
 * No update params — the ground plane is static once built.
 */

class GroundPlaneNode extends SceneNode {

  static rebuildParams = [];
  static updateParams = [];

  // ── Build ──────────────────────────────────────────────

  build(ctxMix, node, params) {
    if (this.group) return;

    const cfg = node.value || {};
    this.group = new THREE.Group();

    // Grid
    if (cfg.grid) {
      const g = cfg.grid;
      this.gridHelper = new THREE.GridHelper(
        g.size ?? 20,
        g.divisions ?? 20,
        g.color1 ?? 0x444444,
        g.color2 ?? 0x333333
      );
      if (g.y !== undefined) this.gridHelper.position.y = g.y;
      this.group.add(this.gridHelper);
    }

    // Axes
    if (cfg.axes) {
      const a = cfg.axes;
      this.axesHelper = new THREE.AxesHelper(a.size ?? 2);
      if (a.position) this.axesHelper.position.set(...a.position);
      this.group.add(this.axesHelper);
    }
  }

  // ── Teardown ───────────────────────────────────────────

  teardown(ctxMix, node, params) {
    this.clear();
  }

  clear() {
    if (this.gridHelper) {
      this.gridHelper.geometry.dispose();
      this.gridHelper.material.dispose();
      this.gridHelper = null;
    }
    if (this.axesHelper) {
      this.axesHelper.geometry.dispose();
      this.axesHelper.material.dispose();
      this.axesHelper = null;
    }
    if (this.group) {
      while (this.group.children.length > 0) {
        this.group.remove(this.group.children[0]);
      }
      this.group = null;
    }
  }
}

sceneRegistry.registerNodeClass('ground-plane', GroundPlaneNode);

export { GroundPlaneNode };
