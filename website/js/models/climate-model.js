import { SYS } from '../omni-support/sys.js';
import { makeZoomableFrame } from '../2d-support/make-frame.js';
import '../nodes2d/axis-node.js';   // 'axis-node'
import '../nodes2d/bar-element-node.js';   // 'bar-element'
import '../nodes2d/flyweight-array-node.js';   // 'flyweight-array'
import '../nodes2d/line-chart-node.js';   // 'line-chart-node'
import '../nodes2d/line-dot-node.js';   // 'line-dot-element'
import '../nodes2d/word-node.js';   // 'word-node'
export { ClimateModel };
import { BAR_DEFAULTS } from '../nodes2d/bar-element-node.js';

/* ─────────────────────────────────────────────────────────────────────────────
Value functions — read frame dimensions from ctxMix.getWH()
──────────────────────────────────────────────────────────────────────────── */

const barValueFn = (ctxMix, fwParent, params, index) => {
  const v = fwParent.value;
  const data = v.data || [];
  const val = data[index] || 0;
  const p = { ...BAR_DEFAULTS, ...params };

  const { W:cw, H:ch } = ctxMix.getWH();
  const left = -cw / 2;
  const bottom = ch / 2;

  const rMax = v.rainMax || 120;
  const n = data.length;
  const colW = cw / n;
  const gap = colW * (p.barGap || 0);

  const bw = colW - gap;
  const bh = (val / rMax) * ch;
  const bx = left + index * colW + gap / 2;
  const by = bottom - bh;

  /* A bar redirects its hit to the series node, so it is the series that
     carries the affordance and every bar reads it from there. */
  const series = v.originalNode || fwParent;
  const sv = ctxMix.getValue(ctxMix, series, params) || {};
  const isHi = !!(sv.selected || sv.hovered);

  return { bx, by, bw, bh, bottom, isHi, originalNode: series };
};

const lineDotValueFn = (ctxMix, fwParent, params, index) => {
  const v = fwParent.value;
  const data = v.data || [];
  const val = data[index] || 0;

  const { W:cw, H:ch } = ctxMix.getWH();
  const left = -cw / 2;
  const bottom = ch / 2;

  const tMin = v.tempMin ?? 0;
  const tMax = v.tempMax ?? 30;
  const n = data.length;
  const colW = cw / n;

  const x = left + (index + 0.5) * colW;
  const y = bottom - ((val - tMin) / (tMax - tMin)) * ch;

  /* A dot redirects its hit to the line it belongs to; the array itself may
     also be selected, and either indicates the whole series. */
  const series = v.originalNode || fwParent;
  const sv  = ctxMix.getValue(ctxMix, series, params) || {};
  const own = ctxMix.getValue(ctxMix, fwParent, params) || {};
  const isHi = !!(sv.selected || sv.hovered || own.selected || own.hovered);

  return { x, y, isHi, originalNode: series };
};

/* ─────────────────────────────────────────────────────────────────────────────
Model — assembles the scene graph using frame-node
──────────────────────────────────────────────────────────────────────────── */

class ClimateModel {
  get name() { return 'Climate'; }
  get displayType() { return '2d'; }
  constructor() {
    this.visible = true;
    this.load();
    this.controls = [
      { type: 'separator', label: 'Framework' },
      { type: 'checkbox', id: 'showChartBounds', label: 'Show Frame', value: SYS.P.showChartBounds },
      { type: 'checkbox', id: 'screenMode', label: 'Screen Auto-Fit', value: SYS.P.screenMode },
    ];
  }

  load(app) {
    app?.clearAll();
    const CHART = { tempMin: 0, tempMax: 30, tempStep: 5, rainMax: 120, rainStep: 20, months: 12 };
    const CW = 700, CH = 400;
    const TEMPS = [7.5, 8.2, 10.8, 13.8, 18.0, 22.2, 25.0, 25.0, 21.5, 17.0, 12.2, 8.6];
    const RAIN  = [67,  70,  57,   55,   42,   21,   15,   21,   63,  105,  115,  81 ];
    const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D'];

    const children = [];

    children.push(SYS.makeNode('axis-node', { ...CHART }));

    const barFly = SYS.makeNode('flyweight-array', {
      count: RAIN.length,
      ...CHART,
      data: RAIN
    }, [ SYS.makeNode('bar-element', {}) ]);
    barFly.inst = { getValue: barValueFn };
    children.push(barFly);

    const lineNode = SYS.makeNode('line-chart-node', { ...CHART, data: TEMPS });
    children.push(lineNode);

    const dotFly = SYS.makeNode('flyweight-array', {
      count: TEMPS.length,
      ...CHART,
      data: TEMPS,
      originalNode: lineNode 
    }, [ SYS.makeNode('line-dot-element', {}) ]);
    dotFly.inst = { getValue: lineDotValueFn };
    children.push(dotFly);

    const left = -CW / 2, right = CW / 2, top = -CH / 2, bottom = CH / 2, colW = CW / 12;

    children.push(SYS.makeNode('word-node', { x: 0, y: top - 38, text: 'Rome', fontSize: 24, fontWeight: 800, color: '#e4dac6' }));
    children.push(SYS.makeNode('word-node', { x: 0, y: top - 18, text: 'Climate Chart', fontSize: 13, fontWeight: 500, color: '#807868', opacity: 0.8 }));

    MONTHS.forEach((m, i) => {
      children.push(SYS.makeNode('word-node', { x: left + (i + 0.5) * colW, y: bottom + 18, text: m, fontSize: 11, fontWeight: 600, color: '#908878' }));
    });

    for (let t = CHART.tempMin; t <= CHART.tempMax; t += CHART.tempStep) {
      children.push(SYS.makeNode('word-node', { x: left - 22, y: bottom - ((t - CHART.tempMin) / (CHART.tempMax - CHART.tempMin)) * CH, text: String(t), fontSize: 10, fontWeight: 500, color: '#c06048' }));
    }

    for (let r = 0; r <= CHART.rainMax; r += CHART.rainStep) {
      children.push(SYS.makeNode('word-node', { x: right + 22, y: bottom - (r / CHART.rainMax) * CH, text: String(r), fontSize: 10, fontWeight: 500, color: '#5a98c8' }));
    }

    children.push(SYS.makeNode('word-node', { x: left - 50, y: 0, text: '°C', fontSize: 12, fontWeight: 700, color: '#c06048', rotation: -90 }));
    children.push(SYS.makeNode('word-node', { x: right + 48, y: 0, text: 'mm', fontSize: 12, fontWeight: 700, color: '#5a98c8', rotation: 90 }));

    this.sceneRoot = makeZoomableFrame(
      { x: 0, y: 0, cw: CW, ch: CH, resizeMode: 'corners' },
      children
      );
    app?.arenaNode.subtree.push(this.sceneRoot._frameNode);
  }
}

SYS.MODELS.push( new ClimateModel() )
