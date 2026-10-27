import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { THREE } from '../3d-support/three-boot.js';
import { BondRenderer } from '../3d-support/bond-renderer.js';
export { MolamBondNode };
class MolamBondNode {
  static build3d(ctxMix, node, params) {
    if (node.value.group) return;
    const v = node.value;
    v.group = new THREE.Group();
    const shim = { add: (obj) => v.group.add(obj), remove: (obj) => v.group.remove(obj) };
    v.renderer = new BondRenderer(THREE, shim);
    if (v._pendingData) {
      const { atoms, scale, chainColorMap } = v._pendingData;
      v._pendingData = null;
      v.renderer.detectAndSetBonds(atoms, scale, chainColorMap);
    }
  }
  static setData(node, atoms, scale, chainColorMap) {
    if (node.value.renderer) node.value.renderer.detectAndSetBonds(atoms, scale, chainColorMap);
    else node.value._pendingData = { atoms, scale, chainColorMap };
  }
  static update3d(ctxMix, node, params) {
    const v = node.value;
    if (!v.renderer) return;
    v.renderer.params = params;
    if (params.bondRadius !== undefined) v.renderer.setRadius(params.bondRadius);
    v.renderer.updateAllBondInstances();
    if (params.bondHalfColor !== undefined) v.renderer.setHalfColor(params.bondHalfColor);
    if (params.bondLightness !== undefined) v.renderer.setbondLightness(params.bondLightness);
    if (params.bondRingPink !== undefined) v.renderer.setRingPink(params.bondRingPink);
    v.renderer.setOpacity(params.bondOpacity ?? 1);
    v.renderer.setAtomRange(params.atomRangeStart ?? 0, params.atomRangeEnd ?? 100);
    v.renderer.setFade(params.sidechainFade || 0, params.referenceAxis || null);
  }
}
SYS.NODE_CLASSES.push({ name: 'molam-bond', cls: MolamBondNode });;
