import { SceneNode, sceneRegistry } from '../omni-support/scene.js';
import * as THREE from 'three';

/**
 * SceneNode3D — container that owns a THREE.Group (sphereGroup).
 *
 * Children are positional:
 *   [0] planet   [1] ribbon
 * Each child exposes inst.group which is added to the sphereGroup.
 *
 * The sphereGroup rotates independently of camera/lights.
 * SceneNode3D applies params.rotation to the group.
 * Children (e.g. PlanetNode) read params.rotation themselves
 * when they need to compensate (e.g. clipping plane normals).
 *
 * AST wiring:
 *   new MiniAstNode('scene', [planet, arc])
 *
 * After build:
 *   node.inst.group  — THREE.Group (for parent to add to scene)
 *
 * Phases handled: before_build, after_build, before_update,
 *                 resize (pass-through), after_teardown
 */

class SceneNode3D extends SceneNode {

  static rebuildParams = [];
  static updateParams = ['rotation'];

  // ── Build ──────────────────────────────────────────────

  before_build(ctxMix, node, params) {
    if (this.group) return;
    this.group = new THREE.Group();
  }

  after_build(ctxMix, node, params) {
    for (const child of node.subtree) {
      if (child.inst && child.inst.group) {
        this.group.add(child.inst.group);
      }
    }
  }

  // ── Update ─────────────────────────────────────────────

  before_update(ctxMix, node, params) {
    if (params.rotation !== undefined) {
      this.group.rotation.y = (params.rotation * Math.PI) / 180;
    }
  }

  // ── Teardown ───────────────────────────────────────────
  //    Children teardown first (dispose their own geometries/materials).
  //    after_teardown removes child groups and cleans up ours.

  after_teardown(ctxMix, node, params) {
    if (this.group) {
      while (this.group.children.length > 0) {
        this.group.remove(this.group.children[0]);
      }
      this.group = null;
    }
  }
}

sceneRegistry.registerNodeClass('scene', SceneNode3D);

export { SceneNode3D };
