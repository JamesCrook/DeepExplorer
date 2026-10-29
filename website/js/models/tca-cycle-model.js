import { SYS } from '../omni-support/sys.js';
import { Geo } from '../2d-support/geo.js';
import { Values } from '../omni-support/values.js';
import { BasicCollectionNode } from '../nodes2d/basic-collection-node.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import { PippedButtonNode } from '../nodes2d/pipped-button-node.js';
import '../nodes2d/pipped-edge-ref-node.js';   // 'pipped-edge'
export { TCACycleModel };

// Model 'TCA Cycle' — the citric acid cycle as pipped buttons joined by pipped edges

class TCACycleModel{
  get name() { return 'TCA Cycle'; }
  get btnClass() { return 'green'; }
  get displayType() { return '2d'; }
  constructor() {
    this.visible = true;
    const group = this.getScene();
    this.sceneRoot = makeZoomableCamera(group, { centerOrigin: true });
  }

  static STEPS = [
    { id: 'oaa', label: 'OAA',  sub: 'Oxaloacetate',   color: '#4a7eff' }, { id: 'cit', label: 'Cit',  sub: 'Citrate',         color: '#3fb950' },
    { id: 'iso', label: 'Iso',  sub: 'Isocitrate',      color: '#3fb950' }, { id: 'akg', label: 'αKG',  sub: 'α-Ketoglutarate', color: '#d29922' },
    { id: 'sca', label: 'SCoA', sub: 'Succinyl-CoA',    color: '#d29922' }, { id: 'suc', label: 'Suc',  sub: 'Succinate',        color: '#bc8cff' },
    { id: 'fum', label: 'Fum',  sub: 'Fumarate',         color: '#bc8cff' }, { id: 'mal', label: 'Mal',  sub: 'Malate',           color: '#4a7eff' },
  ];

  _bestPip(fromX, fromY, toX, toY) {
    const dx = toX - fromX, dy = toY - fromY, dirs = [[0,-1],[1,0],[0,1],[-1,0]];
    let best = 0, bestDot = -Infinity;
    for (let i = 0; i < 4; i++) {
      const dot = dx * dirs[i][0] + dy * dirs[i][1];
      if (dot > bestDot) { bestDot = dot; best = i; }
    }
    return best;
  }

  getScene() {
    const group = SYS.makeNode('group', { connections: [] });
    const sub = group.subtree, conns = group.value.connections, tcaR1 = 170, tcaR2=190, N = TCACycleModel.STEPS.length;
    const nodes = TCACycleModel.STEPS.map((step, i) => {
      const a = (i / N) * Geo.TAU - Geo.PI / 2;
      const tcaR = (i%2==0) ? tcaR1 : tcaR2; 
      const node = SYS.makeNode('pipped-button-node', {
        x: tcaR * Math.cos(a), y: tcaR * Math.sin(a), width: 70, height: 42, label: step.label, sub: step.sub, color: step.color,
      });
      sub.push(node); return node;
    });

    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, nA = nodes[i], nB = nodes[j];
      const pipA = this._bestPip(nA.value.x, nA.value.y, nB.value.x, nB.value.y);
      const pipB = this._bestPip(nB.value.x, nB.value.y, nA.value.x, nA.value.y);
      const pipsA = PippedButtonNode.getPips(Values, nA, {}), pipsB = PippedButtonNode.getPips(Values, nB, {});
      const edge = SYS.makeNode('pipped-edge', { x1: pipsA[pipA].x, y1: pipsA[pipA].y, x2: pipsB[pipB].x, y2: pipsB[pipB].y });
      sub.push(edge);
      conns.push( { a: edge.value.id, pipA: 0, b: nA.value.id, pipB: pipA }, { a: edge.value.id, pipA: 1, b: nB.value.id, pipB: pipB } );
    }
    BasicCollectionNode._sortSubtree(sub);
    return group;
  }
}

SYS.MODELS.push( new TCACycleModel() )
