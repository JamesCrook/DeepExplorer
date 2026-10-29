import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { fillPoly, strokePoly, scalePts } from '../2d-support/poly-draw.js';
export { BODY, BODY_REGIONS, ORGAN_LABELS, OrganRegionNode, organGeometry };

/*
`organ-region` — one organ of the body heatmap, and the body template's geometry (Zones heatmap)

Geometry for the heatmap's body template, asked for by the model when it
   makes an item's value. */
function organGeometry(ctxMix, node, params) {
  const { W, H } = ctxMix.getWH(ctxMix, node, params);
  
  if (W <= 0 || H <= 0) return { cw: 1, ch: 1, ox: 0, oy: 0, scale: 1 };
  
  let cw = Math.max(1, Math.round(Math.min(W, 500)));
  let ch = Math.max(1, Math.round(cw / HEATMAP_ASPECT_RATIO));
  
  if (ch > H) {
    ch = Math.max(1, Math.round(Math.min(H, 700)));
    cw = Math.max(1, Math.round(ch * HEATMAP_ASPECT_RATIO));
  }
  
  return { cw, ch, ox: (W - cw) / 2, oy: (H - ch) / 2, scale: ch / 700 };
}


const BODY_REGIONS = [
  { name: 'Brain', val: 0.9, hue: '#e06080' },
  { name: 'Left Lung', val: 0.5, hue: '#60a0e0' },
  { name: 'Right Lung', val: 0.5, hue: '#60a0e0' },
  { name: 'Heart', val: 0.85, hue: '#e04050' },
  { name: 'Liver', val: 0.7, hue: '#c07040' },
  { name: 'Stomach', val: 0.4, hue: '#a0c060' },
  { name: 'L. Kidney', val: 0.3, hue: '#c08060' },
  { name: 'R. Kidney', val: 0.3, hue: '#c08060' },
  { name: 'Intestines', val: 0.35, hue: '#80a070' }
];

const BODY = {
  silhouette: [
    [0.5,0.03], [0.55,0.035], [0.58,0.05], [0.59,0.08], [0.585,0.11], [0.57,0.135], [0.55,0.15], [0.54,0.16], [0.545,0.19], [0.614,0.2114],
    [0.68,0.21], [0.72,0.23], [0.74,0.28], [0.745,0.35], [0.74,0.42], [0.735,0.5], [0.73,0.55], [0.72,0.58], [0.725,0.6], [0.744,0.6257],
    [0.702,0.6343], [0.682,0.5986], [0.669,0.4714], [0.646,0.29], [0.62,0.3471], [0.6,0.4543], [0.628,0.5486], [0.616,0.63], [0.6,0.7], [0.59,0.73],
    [0.58,0.78], [0.583,0.8414], [0.572,0.9043], [0.565,0.94], [0.575,0.96], [0.585,0.97], [0.575,0.98], [0.555,0.975], [0.54,0.96], [0.535,0.9],
    [0.524,0.7929], [0.513,0.7386], [0.51,0.62], [0.49,0.62], [0.479,0.7314], [0.466,0.7886], [0.465,0.9], [0.46,0.96], [0.445,0.975], [0.425,0.98],
    [0.415,0.97], [0.425,0.96], [0.435,0.94], [0.42,0.9043], [0.415,0.8443], [0.42,0.78], [0.41,0.73], [0.4,0.7], [0.362,0.63], [0.35,0.5386],
    [0.374,0.45], [0.369,0.3514], [0.344,0.2914], [0.321,0.4614], [0.308,0.6029], [0.294,0.6343], [0.256,0.6214], [0.275,0.6], [0.28,0.58], [0.27,0.55],
    [0.265,0.5], [0.26,0.42], [0.255,0.35], [0.26,0.28], [0.28,0.23], [0.32,0.21], [0.384,0.21], [0.455,0.19], [0.46,0.16], [0.45,0.15],
    [0.43,0.135], [0.415,0.11], [0.41,0.08], [0.42,0.05], [0.45,0.035]
  ],
  organs: [
    [.50,.082,.055,.038], [.44,.32,.045,.07], [.56,.32,.045,.07], [.505,.35,.025,.028], [.56,.43,.045,.032],
    [.46,.44,.030,.030], [.455,.49,.016,.022], [.545,.49,.016,.022], [.50,.55,.045,.040]
  ]
};

const ORGAN_LABELS = ['Brain', 'L.Lung', 'R.Lung', 'Heart', 'Liver', 'Stomach', 'L.Kid', 'R.Kid', 'Intestines'];
const HEATMAP_ASPECT_RATIO = 500 / 700;




const hmTempCanvas1 = document.createElement('canvas');
const hmTempCanvas2 = document.createElement('canvas');

const COLORMAPS = {
  inferno: [
    [0, .001, .001, .016], [.14, .157, .043, .329], [.32, .396, 0, .659], [.50, .624, .165, .388],
    [.68, .831, .283, .259], [.82, .961, .490, .082], [.92, .980, .757, .153], [1, .988, 1, .643]
  ]
};

function sampleCmap(name, t) {
  const stops = COLORMAPS[name] || COLORMAPS.inferno;
  t = Math.max(0, Math.min(1, t));
  if (t <= stops[0][0]) return [stops[0][1] * 255, stops[0][2] * 255, stops[0][3] * 255];
  const last = stops[stops.length - 1];
  if (t >= last[0]) return [last[1] * 255, last[2] * 255, last[3] * 255];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i], f = (t - a[0]) / (b[0] - a[0]);
      return [(a[1] + (b[1] - a[1]) * f) * 255, (a[2] + (b[2] - a[2]) * f) * 255, (a[3] + (b[3] - a[3]) * f) * 255];
    }
  }
  return [0, 0, 0];
}

function buildRegionLookup(mc, w, h) {
  const d = mc.getImageData(0, 0, w, h).data;
  const l = new Uint8Array(w * h);
  for (let i = 0, n = w * h; i < n; i++) {
    const r = d[i * 4];
    if (r >= 10) l[i] = Math.round(r / 20);
  }
  return l;
}

function buildValueField(lookup, rv, w, h, br) {
  hmTempCanvas1.width = w;
  hmTempCanvas1.height = h;
  const c1 = hmTempCanvas1.getContext('2d');
  const img = c1.createImageData(w, h);
  const d = img.data;
  for (let i = 0, n = w * h; i < n; i++) {
    const rid = lookup[i];
    if (rid > 0 && rv[rid - 1] !== undefined) {
      const v = Math.round(rv[rid - 1] * 255);
      d[i * 4] = v;
      d[i * 4 + 1] = v;
      d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    } else {
      d[i * 4 + 3] = 255;
    }
  }
  c1.putImageData(img, 0, 0);
  hmTempCanvas2.width = w;
  hmTempCanvas2.height = h;
  const c2 = hmTempCanvas2.getContext('2d');
  c2.clearRect(0, 0, w, h);
  if (br > 0) c2.filter = `blur(${br}px)`;
  c2.drawImage(hmTempCanvas1, 0, 0);
  c2.filter = 'none';
  const blurred = c2.getImageData(0, 0, w, h).data;
  const field = new Float32Array(w * h);
  let max = 0;
  for (let i = 0, n = w * h; i < n; i++) {
    field[i] = blurred[i * 4];
    if (field[i] > max) max = field[i];
  }
  if (max > 0) {
    for (let i = 0, n = w * h; i < n; i++) field[i] /= max;
  }
  return field;
}

function colormapField(field, w, h, cn) {
  const img = new ImageData(w, h);
  const d = img.data;
  for (let i = 0, n = w * h; i < n; i++) {
    const v = field[i];
    if (v < 0.005) {
      d[i * 4 + 3] = 0;
      continue;
    }
    const [r, g, b] = sampleCmap(cn, v);
    d[i * 4] = r;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = b;
    d[i * 4 + 3] = Math.min(255, v * 320);
  }
  return img;
}

function sampleRandom(field, w, h, count) {
  const pts = [];
  let att = 0;
  while (pts.length < count && att < count * 40) {
    att++;
    const x = Math.random() * w, y = Math.random() * h;
    const ix = ~~x, iy = ~~y;
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) continue;
    const v = field[iy * w + ix];
    if (v > 0.03 && Math.random() < v) pts.push({ x, y, v });
  }
  return pts;
}

function drawSparkles(ctx, pts, size, cn, ga) {
  ctx.save();
  ctx.globalAlpha = ga;
  for (const p of pts) {
    const [r, g, b] = sampleCmap(cn, Math.min(1, p.v * 1.2 + 0.15));
    const a = 0.4 + p.v * 0.6;
    const sz = size * (0.7 + p.v * 0.6);
    ctx.globalAlpha = ga * a;
    ctx.fillStyle = `rgba(${~~r},${~~g},${~~b},0.2)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, sz * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.6 + p.v * 0.4})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.5 + p.v * 0.5})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, sz * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBodyMask(ctx, w, h) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < BODY.organs.length; i++) {
    const [cx, cy, rx, ry] = BODY.organs[i];
    ctx.fillStyle = `rgb(${(i + 1) * 20},0,0)`;
    ctx.beginPath();
    ctx.ellipse(cx * w, cy * h, rx * w, ry * h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

class OrganRegionNode {
  static getCount(data) {
    return BODY_REGIONS.length;
  }

  static _ensureCache(node, cw, ch) {
    let c = node._hm;
    if (c && c.w === cw && c.h === ch) return c;
    const scale = ch / 700;
    if (!c) {
      c = node._hm = {
        maskCanvas: document.createElement('canvas'),
        baseCanvas: document.createElement('canvas'),
        overlayCanvas: document.createElement('canvas'),
        snap: {}
      };
      c.maskCtx = c.maskCanvas.getContext('2d', { willReadFrequently: true });
      c.baseCtx = c.baseCanvas.getContext('2d');
      c.overlayCtx = c.overlayCanvas.getContext('2d');
    }
    c.w = cw;
    c.h = ch;
    c.maskCanvas.width = cw;
    c.maskCanvas.height = ch;
    c.baseCanvas.width = cw;
    c.baseCanvas.height = ch;
    c.overlayCanvas.width = cw;
    c.overlayCanvas.height = ch;
    drawBodyMask(c.maskCtx, cw, ch);
    c.regionLookup = buildRegionLookup(c.maskCtx, cw, ch);
    c.baseCtx.fillStyle = '#10131a';
    c.baseCtx.fillRect(0, 0, cw, ch);
    const pts = scalePts(BODY.silhouette, cw, ch);
    c.baseCtx.shadowColor = 'rgba(0,0,0,0.8)';
    c.baseCtx.shadowBlur = 20 / scale;
    c.baseCtx.shadowOffsetY = 10 / scale;
    c.baseCtx.fillStyle = '#1c2028';
    fillPoly(c.baseCtx, pts);
    c.baseCtx.shadowBlur = 0;
    c.baseCtx.shadowOffsetY = 0;
    c.baseCtx.strokeStyle = '#3a4050';
    c.baseCtx.lineWidth = 1.3;
    strokePoly(c.baseCtx, pts);
    c.field = null;
    return c;
  }

  static drawBackground(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const { W, H } = ctxMix.getWH(ctxMix, node, params);
    if (W <= 0 || H <= 0) return;
    let cw = Math.max(1, Math.round(Math.min(W, 500)));
    let ch = Math.max(1, Math.round(cw / HEATMAP_ASPECT_RATIO));
    if (ch > H) {
      ch = Math.max(1, Math.round(Math.min(H, 700)));
      cw = Math.max(1, Math.round(ch * HEATMAP_ASPECT_RATIO));
    }
    const ox = (W - cw) / 2;
    const oy = (H - ch) / 2;
    const scale = ch / 700;
    const c = OrganRegionNode._ensureCache(node, cw, ch);
    const snap = c.snap;
    const rv = node.value.data.map(d => d.val);
    const blur = 18 * scale;
    const cmap = 'inferno';
    const sc = 500;
    const rm = snap.regionVals && rv.every((v, i) => v === snap.regionVals[i]);

    if (!c.field || blur !== snap.blur || !rm) {
      c.field = buildValueField(c.regionLookup, rv, cw, ch, blur);
      c.heatmapImg = colormapField(c.field, cw, ch, cmap);
      c.overlayCtx.clearRect(0, 0, cw, ch);
      c.overlayCtx.putImageData(c.heatmapImg, 0, 0);
      c.sparkles = sampleRandom(c.field, cw, ch, sc);
      snap.blur = blur;
      snap.regionVals = rv;
    }

    ctx.save();
    ctx.translate(ox, oy);
    ctx.drawImage(c.baseCanvas, 0, 0);
    ctx.globalAlpha = 0.7;
    ctx.drawImage(c.overlayCanvas, 0, 0);
    if (c.sparkles) drawSparkles(ctx, c.sparkles, 1.5 * scale, cmap, 1.0);
    ctx.restore();
  }

  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const ctx = ctxMix.ctx;
    const lo = v;

    ctx.save();
    ctx.translate(lo.ox, lo.oy);
    const organ = v.organ;
    const data = v;
    const [cx, cy, rx, ry] = organ;
    let fill = 'transparent';
    let stroke = '#2a3545';
    let textCol = '#3a4050';

    if (v.selected) {
      fill = data.hue + '80';
      stroke = '#fff';
      textCol = '#fff';
    } else if (v.hovered) {
      fill = data.hue + '40';
      stroke = '#888';
      textCol = '#ddd';
    }

    ctx.beginPath();
    ctx.ellipse(cx * lo.cw, cy * lo.ch, rx * lo.cw, ry * lo.ch, 0, 0, Math.PI * 2);
    if (v.selected || v.hovered) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5 * v.scale;
    ctx.stroke();
    ctx.font = `500 ${Math.max(8, lo.cw * 0.025)}px monospace`;
    ctx.fillStyle = textCol;
    ctx.textAlign = 'center';
    ctx.fillText(v.label, cx * lo.cw, cy * lo.ch + 4);
    ctx.restore();
  }

  static hit_test(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const pt = ctxMix.hitPoint;
    const lo = v;
    if (!pt) return;
    const organ = v.organ;
    const [cx, cy, rx, ry] = organ;
    const dx = (pt.x - lo.ox) - cx * lo.cw;
    const dy = (pt.y - lo.oy) - cy * lo.ch;
    const nx = dx / (rx * lo.cw);
    const ny = dy / (ry * lo.ch);
    if (nx * nx + ny * ny <= 1.2) ctxMix.hitResult = { node };
  }
}

SYS.NODE_CLASSES.push({ name: 'organ-region', cls: OrganRegionNode });;
