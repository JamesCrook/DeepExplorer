import { SYS } from '../omni-support/sys.js';
import { BasicCollectionNode } from '../nodes2d/basic-collection-node.js';
import '../nodes2d/drag-point-node.js';   // 'drag-point'
import '../nodes2d/pipped-edge-ref-node.js';   // 'pipped-edge'
export { MoleculeModel };

// MoleculeModel — base class for small molecules: CPK atoms as drag points, bonds as pipped edges, hydrogens placed

class MoleculeModel{
  get btnClass() { return 'green'; }
  get displayType() { return '2d'; }

  static CPK = {
    C: '#777777', H: '#e0e0e0', O: '#ff4136', N: '#4169e1',
    S: '#ffd700', P: '#ff8c00', Cl: '#1eff00', Br: '#a62929',
  };

  _placeH(parent, bondedPositions, nH, dist) {
    if (nH === 0) return [];
    const angles = bondedPositions.map(b => Math.atan2(b.y - parent.y, b.x - parent.x));
    let base = 0;
    if (angles.length > 0) {
      const sx = angles.reduce((s, a) => s + Math.cos(a), 0), sy = angles.reduce((s, a) => s + Math.sin(a), 0);
      base = Math.atan2(sy, sx) + Math.PI;
    }
    const spread = nH === 1 ? 0 : Math.min(Math.PI * 0.75, Math.PI * 0.55 * nH), result = [];
    for (let i = 0; i < nH; i++) {
      const a = base + (i - (nH - 1) / 2) * (nH > 1 ? spread / (nH - 1) : 0);
      result.push({ x: parent.x + dist * Math.cos(a), y: parent.y + dist * Math.sin(a) });
    }
    return result;
  }

  buildMoleculeScene(def) {
    const group = SYS.makeNode('group', { connections: [] });
    const sub = group.subtree, conns = group.value.connections, HR = 38;
    const atoms = [], allBonds = [];
    for (const h of def.heavy) 
      atoms.push({ symbol: h.symbol, x: h.x, y: h.y });
    for (const [a, b] of def.bonds) 
      allBonds.push([a, b]);
    for (let i = 0; i < def.heavy.length; i++) {
      const h = def.heavy[i];
      if (h.nH === 0)
        continue;
      const bondedPos = def.bonds.filter(([a, b]) => a === i || b === i).map(([a, b]) => a === i ? def.heavy[b] : def.heavy[a]);
      for (const hp of this._placeH(h, bondedPos, h.nH, HR)) {
        allBonds.push([i, atoms.length]);
        atoms.push({ symbol: 'H', x: hp.x, y: hp.y });
      }
    }

    const nodes = atoms.map((a, i) => {
      const isH = a.symbol === 'H';
      const node = SYS.makeNode('drag-point', { x: a.x, y: a.y, label: a.symbol, color: MoleculeModel.CPK[a.symbol] || '#888', r: isH ? 8 : 12, stroke: '#111', labelColor: isH ? '#222' : '#fff' });
      sub.push(node); return node;
    });

    for (const [a, b] of allBonds) {
      const nA = nodes[a], nB = nodes[b];
      const edge = SYS.makeNode('pipped-edge', { x1: nA.value.x, y1: nA.value.y, x2: nB.value.x, y2: nB.value.y });
      sub.push(edge);
      conns.push({ a: edge.value.id, pipA: 0, b: nA.value.id, pipB: 0 }, { a: edge.value.id, pipA: 1, b: nB.value.id, pipB: 0 });
    }
    BasicCollectionNode._sortSubtree(sub);
    return group;
  }
}
