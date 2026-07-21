import { SceneNode, sceneRegistry } from '../omni-support/scene.js';
import * as THREE from 'three';

/**
 * LightsNode — owns a set of THREE lights.
 *
 * AST wiring:
 *   new MiniAstNode('lights', [], {
 *     key:     { type: 'directional', color: 0xffffff, intensity: 1, position: [5, 5, 5], param: 'light1' },
 *     fill:    { type: 'directional', color: 0xffffff, intensity: 0.3, position: [-5, -5, -5], param: 'light2' },
 *     ambient: { type: 'ambient', color: 0x606060 },
 *   })
 *
 * Each entry may include a `param` key naming the slider parameter
 * that controls its intensity at update time.
 *
 * After build:
 *   node.inst.getLights()  — returns array of THREE.Light for parent to add to scene
 *   node.inst.lights       — Map<name, THREE.Light>
 *
 * Phases handled: build, update, teardown
 */

class LightsNode extends SceneNode {

  static rebuildParams = [];
  // Not required as checks vs _paramMap rather than vs fixed names.
  static updateParams = ['light1', 'light2', 'mainLight', 'fillLight', 'backLight'];

  // ── Build ──────────────────────────────────────────────

  build(ctxMix, node, params) {
    if (this.lights) return;

    const cfg = node.value;
    this.lights = new Map();
    this._paramMap = {};        // param name → light name

    for (const [name, spec] of Object.entries(cfg)) {
      let light;

      if (spec.type === 'directional') {
        light = new THREE.DirectionalLight(spec.color, spec.intensity);
        const [x, y, z] = spec.position;
        light.position.set(x, y, z);
      } else if (spec.type === 'ambient') {
        light = new THREE.AmbientLight(spec.color, spec.intensity ?? 1);
      } else if (spec.type === 'point') {
        light = new THREE.PointLight(spec.color, spec.intensity ?? 1);
        const [x, y, z] = spec.position;
        light.position.set(x, y, z);
      }

      if (light) {
        this.lights.set(name, light);
        if (spec.param) {
          this._paramMap[spec.param] = name;
        }
      }
    }
  }

  // ── Update ─────────────────────────────────────────────

  update(ctxMix, node, params) {
    for (const [param, name] of Object.entries(this._paramMap)) {
      if (params[param] !== undefined) {
        this.lights.get(name).intensity = params[param];
      }
    }
  }

  // ── Public accessor for parent ─────────────────────────

  getLights() {
    return [...this.lights.values()];
  }

  // ── Teardown ───────────────────────────────────────────

  teardown(ctxMix, node, params) {
    this.clear();
  }

  clear() {
    if (this.lights) {
      for (const light of this.lights.values()) {
        light.dispose?.();
      }
      this.lights = null;
    }
    this._paramMap = null;
  }
}

sceneRegistry.registerNodeClass('lights', LightsNode);

export { LightsNode };
