import { SYS } from '../omni-support/sys.js';
import { BasicCollectionNode } from '../nodes2d/basic-collection-node.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import '../nodes2d/drag-point-node-zones.js';   // 'drag-point'
import '../nodes2d/pipped-edge-ref-node.js';   // 'pipped-edge'
export { SilhouetteModel };
class SilhouetteModel {
  get name() { return 'Silhouette'; }
  get btnClass() { return 'green'; }
  get displayType() { return '2d'; }
  constructor() {
    this.visible = true;
    const group = this.getScene();
    this.sceneRoot = makeZoomableCamera(group, { centerOrigin: true });
  }

  static BODY_SILHOUETTE = [
    [.50,.03],[.55,.035],[.58,.05],[.59,.08],[.585,.11],[.57,.135],[.55,.15],[.54,.16],[.545,.19],[.62,.20],[.68,.21],[.72,.23],[.74,.28],[.745,.35],[.74,.42],[.735,.50],
    [.73,.55],[.72,.58],[.725,.60],[.73,.62],[.72,.63],[.70,.62],[.695,.59],[.64,.26],[.63,.52],[.63,.56],[.62,.62],[.61,.66],[.60,.70],
    [.59,.73],[.58,.78],[.575,.84],[.57,.90],[.565,.94],[.575,.96],[.585,.97],[.575,.98],[.555,.975],[.54,.96],[.535,.90],[.53,.82],[.525,.76],[.51,.62],
    [.49,.62],[.475,.76],[.47,.82],[.465,.90],[.46,.96],[.445,.975],[.425,.98],[.415,.97],[.425,.96],[.435,.94],[.43,.90],[.425,.84],[.42,.78],[.41,.73],
    [.40,.70],[.39,.66],[.38,.62],[.37,.56],[.375,.52],[.35,.26],[.305,.59],[.30,.62],[.28,.63],[.27,.62],[.275,.60],[.28,.58],[.27,.55],[.265,.50],[.26,.42],[.255,.35],[.26,.28],
    [.28,.23],[.32,.21],[.38,.20],[.455,.19],[.46,.16],[.45,.15],[.43,.135],[.415,.11],[.41,.08],[.42,.05],[.45,.035],
  ];

  _normToLocal(nx, ny) { return { x: (nx - 0.5) * 500, y: (ny - 0.5) * 700 }; }

  getScene() {
    const group = SYS.makeNode('group', { connections: [] });
    const sub = group.subtree, conns = group.value.connections;
    const nodes = SilhouetteModel.BODY_SILHOUETTE.map(pt => {
      const { x, y } = this._normToLocal(pt[0], pt[1]);
      const node = SYS.makeNode('drag-point', { x, y, group: 'silhouette' });
      sub.push(node); return node;
    });

    for (let i = 0; i < nodes.length; i++) {
      const j = (i + 1) % nodes.length;
      const edge = SYS.makeNode('pipped-edge', { x1: nodes[i].value.x, y1: nodes[i].value.y, x2: nodes[j].value.x, y2: nodes[j].value.y, group: 'silhouette' });
      sub.push(edge);
      conns.push( { a: edge.value.id, pipA: 0, b: nodes[i].value.id, pipB: 0 }, { a: edge.value.id, pipA: 1, b: nodes[j].value.id, pipB: 0 } );
    }
    BasicCollectionNode._sortSubtree(sub);
    return group;
  }
}

SYS.MODELS.push( new SilhouetteModel() )
