import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { THREE } from '../3d-support/three-boot.js';
import { ImposterAtomNode } from './imposter-atom-node-zones.js';
import { MolamBondNode } from './molam-bond-node-zones.js';
export { DumbbellNode };
class DumbbellNode {
  static build3d(ctxMix, node, params) {
    if (node.value.group) return;
    const v = node.value;
    v.group = new THREE.Group();
    const atoms = [ { x: -0.8, y: 0, z: 0, element: 'O' }, { x:  0.8, y: 0, z: 0, element: 'C' } ];

    v.atomNode = SYS.makeNode('imposter-atom', {});
    v.bondNode = SYS.makeNode('molam-bond', {});
    node.subtree.push(v.atomNode, v.bondNode);

    sceneRegistry.walkPhase(ctxMix, 'build3d', v.atomNode, params);
    sceneRegistry.walkPhase(ctxMix, 'build3d', v.bondNode, params);

    ImposterAtomNode.setData(v.atomNode, atoms, 1.0, new Map());
    MolamBondNode.setData(v.bondNode, atoms, 1.0, new Map());

    v.group.add(v.atomNode.value.group);
    v.group.add(v.bondNode.value.group);
  }
}
SYS.NODE_CLASSES.push({ name: 'dumbbell-node', cls: DumbbellNode });;
