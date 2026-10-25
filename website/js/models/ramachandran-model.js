import { SYS } from '../omni-support/sys.js';
import { makeZoomableFrame } from '../2d-support/make-frame.js';
import { RamachandranChartNode } from '../nodes2d/ramachandran-chart-node.js';
import '../nodes2d/flyweight-array-node.js';   // 'flyweight-array'
import '../nodes2d/ramachandran-point-node.js';   // 'ramachandran-point'
export { RamachandranModel };
import { RC_DEFAULTS } from '../nodes2d/ramachandran-chart-node.js';

/* ─────────────────────────────────────────────────────────────────────────────
Value function — reads frame dimensions from ctxMix.getWH()
──────────────────────────────────────────────────────────────────────────── */

const ramachandranPointValueFn = (ctxMix, fwParent, params, index) => {
  const v = fwParent.value;
  const data = v.data || [];
  const pt = data[index];
  if (!pt) return null;

  const p = { ...RC_DEFAULTS, ...params };
  const g = RamachandranChartNode._geom(ctxMix, p); 
  const sPos = RamachandranChartNode.phiPsiToScreen(pt.phi, pt.psi, g);

  const chartId = v.originalNode ? v.originalNode.value.id : v.id;
  const isHovered = params.hoveredPoint?.nodeId === chartId && params.hoveredPoint?.index === index;

  return {
    index, 
    x: sPos.x, 
    y: sPos.y, 
    radius: 5, 
    hitRadiusSq: 81,
    color: pt.color || '#4fc3f7', 
    name: pt.name, 
    phi: pt.phi, 
    psi: pt.psi,
    isHovered,
    originalNode: v.originalNode || fwParent,
    applyDrag: (wx, wy) => {
      const angles = RamachandranChartNode.screenToPhiPsi(wx, wy, g);
      pt.phi = Math.max(-180, Math.min(180, angles.phi));
      pt.psi = Math.max(-180, Math.min(180, angles.psi));
    }
  };
};

/* ─────────────────────────────────────────────────────────────────────────────
Model — assembles the scene graph using frame-node
──────────────────────────────────────────────────────────────────────────── */

class RamachandranModel {
  get name() { return 'Ramachandran'; }

  get displayType() { return '2d'; }
  constructor() {
    this.visible = true;
    this.load();
    this.controls = [
      { type: 'separator', label: 'Plot Setting' },
      { type: 'select', id: 'regionSet', label: 'Region Set', options: [['general', 'General'], ['glycine', 'Glycine'], ['proline', 'Proline'], ['preProline', 'Pre-Proline']], value: 'general' },
      { type: 'checkbox', id: 'showRegions', label: 'Show Regions', value: true },
      { type: 'checkbox', id: 'showGrid', label: 'Show Grid', value: true },
      { id: 'aspectRatio', label: 'Aspect Ratio', min: 0.5, max: 2.0, step: 0.1, value: 1.0 },
      { type: 'separator', label: 'Framework' },
      { type: 'checkbox', id: 'showChartBounds', label: 'Show Frame', value: SYS.P.showChartBounds },
      { type: 'checkbox', id: 'screenMode', label: 'Screen Auto-Fit', value: SYS.P.screenMode },
    ];
  }

  load(app) {
    app?.clearAll();

    const residues = [
      { phi: -62,  psi:  47, name: 'ALA-12', color: '#4fc3f7' },
      { phi: -57,  psi:  48, name: 'LEU-13', color: '#4fc3f7' },
      { phi: -68,  psi:  39, name: 'GLU-14', color: '#4fc3f7' },
      { phi: -120, psi: 130, name: 'VAL-32', color: '#ffa726' },
      { phi: -135, psi: 118, name: 'ILE-33', color: '#ffa726' },
      { phi: -110, psi: 140, name: 'PHE-34', color: '#ffa726' },
      { phi:  60,  psi:  40, name: 'GLY-58', color: '#ab47bc' },
      { phi: -30,  psi: -90, name: 'ASN-71', color: '#ef5350' }, 
    ];

    const CW = 600, CH = 600;
    const children = [];

    const ramaNode = SYS.makeNode('ramachandran-chart', {});
    children.push(ramaNode);

    const ramaFly = SYS.makeNode('flyweight-array', {
      count: residues.length,
      data: residues,
      originalNode: ramaNode
    }, [ SYS.makeNode('ramachandran-point', {}) ]);
    ramaFly.inst = { getValue: ramachandranPointValueFn };
    children.push(ramaFly);

    this.sceneRoot = makeZoomableFrame(
      { x: 0, y: 0, cw: CW, ch: CH, resizeMode: 'corners' },
      children
      );
    app?.arenaNode.subtree.push(this.sceneRoot._frameNode);
  }
}

SYS.MODELS.push( new RamachandranModel() )
