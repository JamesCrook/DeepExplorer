import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { THREE } from '../3d-support/three-boot.js';
import './imposter-atom-node.js';   // registers 'imposter-atoms'
import './molam-bond-node.js';   // registers 'molam-bonds'
export { DumbbellNode };
class DumbbellNode {
  static build(ctxMix, node, params) {
    if (node.value.group) return;
    const v = node.value;
    v.group = new THREE.Group();
    const atoms = [ { x: -0.8, y: 0, z: 0, element: 'O' }, { x:  0.8, y: 0, z: 0, element: 'C' } ];

    v.atomNode = SYS.makeNode('imposter-atoms', {});
    v.bondNode = SYS.makeNode('molam-bonds', {});
    node.subtree.push(v.atomNode, v.bondNode);

    sceneRegistry.walkPhase(ctxMix, 'build', v.atomNode, params);
    sceneRegistry.walkPhase(ctxMix, 'build', v.bondNode, params);

    v.atomNode.inst.setData(atoms, 1.0, new Map());   // inst made by the registry during build
    v.bondNode.inst.setData(atoms, 1.0, new Map());   // inst made by the registry during build

    v.group.add(v.atomNode.inst.group);
    v.group.add(v.bondNode.inst.group);
  }
}
SYS.NODE_CLASSES.push({ name: 'dumbbell-node', cls: DumbbellNode });;
