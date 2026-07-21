import { SceneNode, sceneRegistry } from '../omni-support/scene.js';
import * as THREE from 'three';

// AtomRenderer must be exported from molam-objects.js.
// Add to the export line: export { ..., AtomRenderer, BondRenderer };
import { AtomRenderer } from '../3d-support/molam-objects.js';

// #mol/node/atom

/**
 * MolamAtomNode — wraps AtomRenderer as an AST leaf node.
 *
 * AST wiring:
 *   new MiniAstNode('molam-atoms', [], {})
 *
 * Data (set on inst before or after build):
 *   inst.setData(atoms, scale, chainColorMap)
 *     atoms         — normalised atom array (with x, y, z, element, resName, chainID, resSeq)
 *     scale         — model scale factor
 *     chainColorMap — Map<chainID, colorHex>
 *
 * After build:
 *   node.inst.group — THREE.Group (for parent to add to scene)
 *
 * Update params:
 *   atomRadius, atomOpacity, atomRangeStart, atomRangeEnd,
 *   sidechainFade, referenceAxis (injected)
 *
 * Phases handled: build, update, teardown
 */

const ATOM_UPDATE_PARAMS = [
  'atomRadius', 'atomOpacity', 'atomRangeStart', 'atomRangeEnd',
  'sidechainFade'
];

class MolamAtomNode extends SceneNode {

  static rebuildParams = [];
  static updateParams = ATOM_UPDATE_PARAMS;

  // ── Build ──────────────────────────────────────────────

  build(ctxMix, node, params) {
    if (this.group) return;

    this.group = new THREE.Group();

    this._sceneShim = {
      add:    (obj) => this.group.add(obj),
      remove: (obj) => this.group.remove(obj),
    };

    this.renderer = new AtomRenderer(THREE, this._sceneShim);

    // Apply data if setData was called before build
    if (this._pendingData) {
      const { atoms, scale, chainColorMap } = this._pendingData;
      this._pendingData = null;
      this.renderer.setAtoms(atoms, scale, chainColorMap);
    }
  }

  // ── Data ───────────────────────────────────────────────

  setData(atoms, scale, chainColorMap) {
    if (this.renderer) {
      this.renderer.setAtoms(atoms, scale, chainColorMap);
    } else {
      this._pendingData = { atoms, scale, chainColorMap };
    }
  }

  // ── Update ─────────────────────────────────────────────

  update(ctxMix, node, params) {
    if (!this.renderer) return;

    
    // Yield to ImposterAtomNode when opaque
    const opacity = params.atomOpacity ?? 1;
    if (opacity <= 0 || opacity > 0.98) {
      // hide all non-imposters (if any)
      this.renderer.setOpacity(0);
      return;
    }    

    // We are now using imposters throughout for atoms.
    // The update code below no longer affects the atoms.
    return;

    this.renderer.params = params;
    this.renderer.updateColors(params);


    for (const mesh of this.renderer.instancedMeshes.values()) {
        mesh.material.setLighting(params.mainLight, params.fillLight, params.backLight);
    }
    if (params.atomRadius !== undefined) {
      this.renderer.updateatomRadius(params.atomRadius);
    }
    this.renderer.updateColors(params);
    this.renderer.setOpacity(params.atomOpacity);
    this.renderer.setRange(params.atomRangeStart, params.atomRangeEnd);

    // Axis fade — referenceAxis injected into params by the app
    this.renderer.setFade(
      params.sidechainFade || 0,
      params.referenceAxis || null
    );
  }

  // ── Teardown ───────────────────────────────────────────

  teardown(ctxMix, node, params) {
    this.clear();
  }

  clear() {
    if (this.renderer) {
      this.renderer.clear();
      this.renderer = null;
    }
    this._sceneShim = null;
    this._pendingData = null;
    if (this.group) {
      while (this.group.children.length > 0) {
        this.group.remove(this.group.children[0]);
      }
      this.group = null;
    }
  }
}

sceneRegistry.registerNodeClass('molam-atoms', MolamAtomNode);

export { MolamAtomNode };

// Auto-generated exports
if (typeof window !== 'undefined') window.ATOM_UPDATE_PARAMS = ATOM_UPDATE_PARAMS;
export { ATOM_UPDATE_PARAMS };
