import { SceneNode } from '../omni-support/scene.js';
import { THREE as BOOT_THREE } from '../3d-support/three-boot.js';
import { BondRenderer } from '../3d-support/bond-renderer.js';
import { SYS } from '../omni-support/sys.js';
// #mol/node/bond

/**
 * MolamBondNode — wraps BondRenderer as an AST leaf node.
 *
 * One class for both worlds (it replaces molam-bond-node-zones.js):
 *   Omni:  new MiniAstNode('molam-bonds', [], {}), driven by omni-3d.js /
 *          molam-widget.js through build / update / teardown.
 *   Zones: SYS.makeNode('molam-bond', {}), driven by a model or a parent
 *          node (dumbbell-node.js); node.inst is created by the registry.
 *
 * THREE comes from ctxMix.THREE (the Omni harnesses put it there) or else
 * from three-boot's live binding (Zones).  Nothing in this file's import
 * graph imports three.js, so a Zones page still loads it lazily.
 *
 * Data (on the instance, before or after build):
 *   node.inst.setData(atoms, scale, chainColorMap)
 *     atoms         — normalised atom array
 *     scale         — model scale factor
 *     chainColorMap — Map<chainID, colorHex>
 *
 * After build:
 *   node.inst.group — THREE.Group (for the parent to add to its scene)
 *
 * Update params:
 *   bondRadius, bondOpacity, bondHalfColor, bondLightness, bondRingPink,
 *   atomRangeStart, atomRangeEnd, sidechainFade, referenceAxis (injected)
 *
 * Phases handled: build, update, teardown.
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

    const THREE = ctxMix?.THREE ?? BOOT_THREE;
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
    // Defaults from the Zones version: visible, full range, when params omit them.
    this.renderer.setOpacity(params.bondOpacity ?? 1);
    this.renderer.setAtomRange(params.atomRangeStart ?? 0, params.atomRangeEnd ?? 100);

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

// One class, both type names: 'molam-bonds' (Omni) and 'molam-bond' (Zones).
SYS.NODE_CLASSES.push({ name: 'molam-bonds', cls: MolamBondNode });
SYS.NODE_CLASSES.push({ name: 'molam-bond',  cls: MolamBondNode });

export { MolamBondNode };

// Auto-generated exports
if (typeof window !== 'undefined') window.BOND_UPDATE_PARAMS = BOND_UPDATE_PARAMS;
export { BOND_UPDATE_PARAMS };
