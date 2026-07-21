import { SceneNode, sceneRegistry } from '../omni-support/scene.js';
import * as THREE from 'three';
// BondRenderer must be exported from molam-objects.js.
// Add to the export line: export { ..., AtomRenderer, BondRenderer };
import { BondRenderer } from '../3d-support/molam-objects.js';
// #mol/node/bond

/**
 * MolamBondNode — wraps BondRenderer as an AST leaf node.
 *
 * AST wiring:
 *   new MiniAstNode('molam-bonds', [], {})
 *
 * Data (set on inst before or after build):
 *   inst.setData(atoms, scale, chainColorMap)
 *     atoms         — normalised atom array
 *     scale         — model scale factor
 *     chainColorMap — Map<chainID, colorHex>
 *
 * After build:
 *   node.inst.group — THREE.Group (for parent to add to scene)
 *
 * Update params:
 *   bondRadius, bondOpacity, bondHalfColor, bondLightness, bondRingPink,
 *   atomRangeStart, atomRangeEnd, sidechainFade, referenceAxis (injected)
 *
 * Phases handled: build, update, teardown
 */

const BOND_UPDATE_PARAMS = [
  'bondRadius', 'bondOpacity', 'bondHalfColor', 'bondLightness', 'bondRingPink',
  'atomRangeStart', 'atomRangeEnd', 'sidechainFade'
];

class MolamBondNode extends SceneNode {

  static rebuildParams = [];
  static updateParams = BOND_UPDATE_PARAMS;

  // ── Build ──────────────────────────────────────────────

  build(ctxMix, node, params) {
    if (this.group) return;

    this.group = new THREE.Group();

    this._sceneShim = {
      add:    (obj) => this.group.add(obj),
      remove: (obj) => this.group.remove(obj),
    };

    this.renderer = new BondRenderer(THREE, this._sceneShim);

    // Apply data if setData was called before build
    if (this._pendingData) {
      const { atoms, scale, chainColorMap } = this._pendingData;
      this._pendingData = null;
      this.renderer.detectAndSetBonds(atoms, scale, chainColorMap);
    }
  }

  // ── Data ───────────────────────────────────────────────

  setData(atoms, scale, chainColorMap) {
    if (this.renderer) {
      this.renderer.detectAndSetBonds(atoms, scale, chainColorMap);
    } else {
      this._pendingData = { atoms, scale, chainColorMap };
    }
  }

  // ── Update ─────────────────────────────────────────────

  update(ctxMix, node, params) {
    if (!this.renderer) return;

    // Pass full params for bondColorByAminoAcid coloring in bondColor()
    this.renderer.params = params;

    if (params.bondRadius !== undefined) this.renderer.setRadius(params.bondRadius);
    this.renderer.updateAllBondInstances();
    if (params.bondHalfColor !== undefined) this.renderer.setHalfColor(params.bondHalfColor);
    if (params.bondLightness !== undefined) this.renderer.setbondLightness(params.bondLightness);
    if (params.bondRingPink !== undefined) this.renderer.setRingPink(params.bondRingPink);
    this.renderer.setOpacity(params.bondOpacity);
    this.renderer.setAtomRange(params.atomRangeStart, params.atomRangeEnd);

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

sceneRegistry.registerNodeClass('molam-bonds', MolamBondNode);

export { MolamBondNode };

// Auto-generated exports
if (typeof window !== 'undefined') window.BOND_UPDATE_PARAMS = BOND_UPDATE_PARAMS;
export { BOND_UPDATE_PARAMS };
