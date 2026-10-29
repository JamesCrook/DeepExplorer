import { SYS } from '../omni-support/sys.js';
import { BasicCollectionNode } from '../nodes2d/basic-collection-node.js';
import '../nodes2d/drag-point-node.js';   // 'drag-point'
import '../nodes2d/pipped-edge-ref-node.js';   // 'pipped-edge'
export { GraphModel };
// GraphModel — base class for generated graphs: junction drag-points joined by pipped edges
class GraphModel {
  get btnClass() { return 'green'; }
  get displayType() { return '2d'; }

  buildScene(positions, edges) {
    const group = SYS.makeNode('group', { connections: [] });
    const sub = group.subtree;
    const conns = group.value.connections;
    const nodes = [];

// 1. Create junction nodes
    positions.forEach((p, i) => {
      const node = SYS.makeNode('drag-point', { 
        x: p.x, 
        y: p.y, 
        label: p.label || `${i}`, 
        color: p.color || '#445', 
        r: 8, 
        stroke: '#223' 
      });
      sub.push(node); 
      nodes.push(node);
    });

// 2. Create edges and wire their pips to the junctions
    edges.forEach(([a, b]) => {
      const nA = nodes[a], nB = nodes[b];
      const edge = SYS.makeNode('pipped-edge', { 
        x1: nA.value.x, y1: nA.value.y, 
        x2: nB.value.x, y2: nB.value.y 
      });
      sub.push(edge);
      conns.push(
        { a: edge.value.id, pipA: 0, b: nA.value.id, pipB: 0 }, 
        { a: edge.value.id, pipA: 1, b: nB.value.id, pipB: 0 }
        );
    });

    BasicCollectionNode._sortSubtree(sub);
    return group;
  }
}
