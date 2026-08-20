import { PipSetManager, PipperNode, EdgeSnapController, RaftSnapController,
         SnapEngine, makeNode } from './bundle.test.mjs';
const P = {};
const STEP = 30 * Math.cos(Math.PI/4) * 2;
const tile = (x,y) => makeNode('pipped-polygon', {x,y,r:30,n:4,tilt:Math.PI/4});
const arena = c => { const a = makeNode('pipper-node', {}); a.inst = {controllers:c}; return a; };

// t1 and t2 both carry edges out to junctions; then they are brought together.
const a = arena([new EdgeSnapController(), new RaftSnapController()]);
const t1 = tile(0,0), t2 = tile(STEP + 6, 0);          // 6px short of abutting
const j1 = makeNode('drag-point', {x:0,y:-200,r:5});
const j2 = makeNode('drag-point', {x:0,y: 200,r:5});
const e1 = makeNode('pipped-edge', {x1:21.21, y1:0, x2:0, y2:-200});
const e2 = makeNode('pipped-edge', {x1:STEP+6-21.21, y1:0, x2:0, y2:200});
a.subtree = [t1,t2,j1,j2,e1,e2];
const mgr = PipperNode.manager(a);
mgr.join({node:e1,pip:0},{node:t1,pip:1},P);           // edge on t1's right pip
mgr.join({node:e1,pip:1},{node:j1,pip:0},P);
mgr.join({node:e2,pip:0},{node:t2,pip:3},P);           // edge on t2's left pip
mgr.join({node:e2,pip:1},{node:j2,pip:0},P);

console.log('before  | sets', mgr.sets.length,
            '| t1 right pip held by edge:', !!mgr.setFor(t1,1),
            '| t2 left pip held by edge:', !!mgr.setFor(t2,3));

const snapped = SnapEngine.apply(mgr, a, a.subtree, new Set([t2]), 12, P);

const held1 = mgr.setFor(t1,1), held2 = mgr.setFor(t2,3);
console.log('snapped:', snapped);
console.log('after   | sets', mgr.sets.length,
            '| edges left', a.subtree.filter(n => n.type==='pipped-edge').length);
console.log('t1 and t2 now share a set:', held1 && held1 === held2);
console.log('that set is tile-only:', held1 && held1.every(e => mgr.kindAt(e.node,e.pip).anchors));
console.log('squeezed-out edges deleted:', !a.subtree.includes(e1) && !a.subtree.includes(e2));

let bad = 0;
for (const s of mgr.sets) for (const e of s) if (mgr.setFor(e.node,e.pip) !== s) bad++;
console.log('slot/set violations:', bad, '| empty sets:', mgr.sets.filter(s=>s.length<2).length);

// a pip already in a tile-tile join must NOT be squeezable
console.log('existing tile join is not squeezable:', !mgr.squeezable({node:t1,pip:1}));
