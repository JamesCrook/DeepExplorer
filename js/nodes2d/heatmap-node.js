/**
 * heatmap-node.js
 *
 * 2D scene node for rendering region-based heatmaps with
 * colormapped overlays and sparkle particles.
 *
 * Maintains offscreen canvas caches with dirty-flag tracking
 * so expensive pixel operations (field blur, colormap, sparkle
 * sampling) are only recomputed when the relevant params change.
 *
 * Reads all configuration from `params` (pushed by the parent
 * layer node).  Template data (body silhouette, organ polygons)
 * lives here; additional templates can be added later.
 *
 * Place in: nodes2d/heatmap-node.js
 */

import { sceneRegistry } from '../omni-support/scene.js';
// #heat/node/code

// ═══════════════════════════════════════════════════════
//  COLORMAPS
// ═══════════════════════════════════════════════════════

const COLORMAPS = {
  inferno:  [[0,.001,.001,.016],[.14,.157,.043,.329],[.32,.396,0,.659],[.50,.624,.165,.388],[.68,.831,.283,.259],[.82,.961,.490,.082],[.92,.980,.757,.153],[1,.988,1,.643]],
  viridis:  [[0,.267,.004,.329],[.25,.231,.322,.545],[.50,.129,.569,.549],[.75,.369,.789,.384],[1,.992,.906,.145]],
  thermal:  [[0,0,0,0],[.18,0,0,.706],[.38,0,.706,1],[.55,0,1,.47],[.72,1,1,0],[.88,1,.314,0],[1,1,1,1]],
  magma:    [[0,0,0,.016],[.2,.157,.078,.353],[.4,.471,.11,.427],[.6,.733,.216,.329],[.8,.941,.455,.204],[.92,.988,.761,.267],[1,.988,.992,.749]],
  ember:    [[0,.039,.008,0],[.25,.314,.031,0],[.50,.706,.157,.02],[.75,.902,.471,.059],[1,1,.824,.235]],
  ice:      [[0,.004,.012,.055],[.25,.039,.118,.314],[.50,.078,.314,.627],[.75,.392,.627,.784],[1,.941,.961,1]],
};

function sampleCmap(name, t) {
  const stops = COLORMAPS[name] || COLORMAPS.inferno;
  t = Math.max(0, Math.min(1, t));
  if (t <= stops[0][0]) return [stops[0][1] * 255, stops[0][2] * 255, stops[0][3] * 255];
  const last = stops[stops.length - 1];
  if (t >= last[0]) return [last[1] * 255, last[2] * 255, last[3] * 255];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const f = (t - a[0]) / (b[0] - a[0]);
      return [
        (a[1] + (b[1] - a[1]) * f) * 255,
        (a[2] + (b[2] - a[2]) * f) * 255,
        (a[3] + (b[3] - a[3]) * f) * 255,
      ];
    }
  }
  return [0, 0, 0];
}


// ═══════════════════════════════════════════════════════
//  BODY TEMPLATE
// ═══════════════════════════════════════════════════════

const BODY_REGIONS = [
  { name: 'Brain',      val: 0.9,  hue: '#e06080' },
  { name: 'Left Lung',  val: 0.5,  hue: '#60a0e0' },
  { name: 'Right Lung', val: 0.5,  hue: '#60a0e0' },
  { name: 'Heart',      val: 0.85, hue: '#e04050' },
  { name: 'Liver',      val: 0.7,  hue: '#c07040' },
  { name: 'Stomach',    val: 0.4,  hue: '#a0c060' },
  { name: 'L. Kidney',  val: 0.3,  hue: '#c08060' },
  { name: 'R. Kidney',  val: 0.3,  hue: '#c08060' },
  { name: 'Intestines', val: 0.35, hue: '#80a070' },
];

// All coordinates normalised 0–1; scaled to canvas at draw time
const BODY = {
  silhouette: [
    // Head
    [.50,.03],[.55,.035],[.58,.05],[.59,.08],[.585,.11],[.57,.135],[.55,.15],
    // Neck right
    [.54,.16],[.545,.19],
    // Right shoulder + arm
    [.62,.20],[.68,.21],[.72,.23],[.74,.28],[.745,.35],[.74,.42],[.735,.50],
    [.73,.55],[.72,.58],
    // Right hand
    [.725,.60],[.73,.62],[.72,.63],[.70,.62],[.695,.59],
    // Back up to armpit
    [.64,.26],
    // Right torso
    [.63,.52],[.63,.56],[.62,.62],[.61,.66],[.60,.70],
    // Right hip + leg
    [.59,.73],[.58,.78],[.575,.84],[.57,.90],[.565,.94],[.575,.96],[.585,.97],
    [.575,.98],[.555,.975],[.54,.96],
    // Inner right leg
    [.535,.90],[.53,.82],[.525,.76],[.51,.62],
    // Inner left leg
    [.49,.62],[.475,.76],[.47,.82],[.465,.90],
    // Left foot
    [.46,.96],[.445,.975],[.425,.98],[.415,.97],[.425,.96],[.435,.94],
    // Left leg outer
    [.43,.90],[.425,.84],[.42,.78],[.41,.73],
    // Left hip + torso
    [.40,.70],[.39,.66],[.38,.62],[.37,.56],[.375,.52],
    // Back up to armpit
    [.35,.26],
    // Left hand
    [.305,.59],[.30,.62],[.28,.63],[.27,.62],[.275,.60],
    // Left arm
    [.28,.58],[.27,.55],[.265,.50],[.26,.42],[.255,.35],[.26,.28],
    [.28,.23],[.32,.21],[.38,.20],
    // Left shoulder + neck
    [.455,.19],[.46,.16],
    // Head left
    [.45,.15],[.43,.135],[.415,.11],[.41,.08],[.42,.05],[.45,.035],
  ],

  // Organ shapes: [cx, cy, rx, ry] for ellipses
  organs: [
    /* 0 brain   */ [.50,  .082, .055, .038],
    /* 1 l.lung  */ [.44,  .32,  .045, .07 ],
    /* 2 r.lung  */ [.56,  .32,  .045, .07 ],
    /* 3 heart   */ [.505, .35,  .025, .028],
    /* 4 liver   */ [.56,  .43,  .045, .032],
    /* 5 stomach */ [.46,  .44,  .030, .030],
    /* 6 l.kid   */ [.455, .49,  .016, .022],
    /* 7 r.kid   */ [.545, .49,  .016, .022],
    /* 8 intest  */ [.50,  .55,  .045, .040],
  ],
};

const TEMPLATE_ASPECT = 500 / 700;   // w / h
const NATURAL_W       = 500;
const NATURAL_H       = 700;
const REGION_COUNT    = BODY_REGIONS.length;

const ORGAN_LABELS = [
  'Brain', 'L.Lung', 'R.Lung', 'Heart',
  'Liver', 'Stomach', 'L.Kid', 'R.Kid', 'Intestines',
];


// ═══════════════════════════════════════════════════════
//  DRAWING HELPERS
// ═══════════════════════════════════════════════════════

function regionColor(id) { return `rgb(${(id + 1) * 20},0,0)`; }

function fillEllipse(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function fillPoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

function strokePoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.stroke();
}

function scalePts(pts, w, h) {
  return pts.map(p => [p[0] * w, p[1] * h]);
}


// ═══════════════════════════════════════════════════════
//  BASE & MASK RENDERING (once per resize)
// ═══════════════════════════════════════════════════════

function drawBodyBase(ctx, w, h) {
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, w, h);

  // Body silhouette
  const pts = scalePts(BODY.silhouette, w, h);
  ctx.fillStyle = '#1c2028';
  fillPoly(ctx, pts);
  ctx.strokeStyle = '#2a3040';
  ctx.lineWidth = 1;
  strokePoly(ctx, pts);

  // Organ outlines
  ctx.strokeStyle = '#2a3545';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < BODY.organs.length; i++) {
    const [cx, cy, rx, ry] = BODY.organs[i];
    ctx.beginPath();
    ctx.ellipse(cx * w, cy * h, rx * w, ry * h, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Organ labels
  ctx.font = `500 ${Math.max(8, w * 0.02)}px monospace`;
  ctx.fillStyle = '#3a4050';
  ctx.textAlign = 'center';
  for (let i = 0; i < BODY.organs.length; i++) {
    const [cx, cy] = BODY.organs[i];
    ctx.fillText(ORGAN_LABELS[i], cx * w, cy * h + 4);
  }
}

function drawBodyMask(ctx, w, h) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < BODY.organs.length; i++) {
    const [cx, cy, rx, ry] = BODY.organs[i];
    ctx.fillStyle = regionColor(i);
    fillEllipse(ctx, cx * w, cy * h, rx * w, ry * h);
  }
}


// ═══════════════════════════════════════════════════════
//  FIELD COMPUTATION
// ═══════════════════════════════════════════════════════

function buildRegionLookup(maskCtx, w, h) {
  const data = maskCtx.getImageData(0, 0, w, h).data;
  const lookup = new Uint8Array(w * h);
  for (let i = 0, n = w * h; i < n; i++) {
    const r = data[i * 4];
    if (r >= 10) lookup[i] = Math.round(r / 20);
  }
  return lookup;
}

function buildValueField(lookup, regionValues, w, h, blurRadius) {
  // Paint region values into grayscale image
  const off1 = document.createElement('canvas');
  off1.width = w; off1.height = h;
  const c1 = off1.getContext('2d');
  const img = c1.createImageData(w, h);
  const d = img.data;

  for (let i = 0, n = w * h; i < n; i++) {
    const rid = lookup[i];
    if (rid > 0 && regionValues[rid - 1] !== undefined) {
      const v = Math.round(regionValues[rid - 1] * 255);
      d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    } else {
      d[i * 4 + 3] = 255;
    }
  }
  c1.putImageData(img, 0, 0);

  // Apply CSS blur
  const off2 = document.createElement('canvas');
  off2.width = w; off2.height = h;
  const c2 = off2.getContext('2d');
  if (blurRadius > 0) c2.filter = `blur(${blurRadius}px)`;
  c2.drawImage(off1, 0, 0);

  // Read back and normalise
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

function colormapField(field, w, h, cmapName) {
  const img = new ImageData(w, h);
  const d = img.data;
  for (let i = 0, n = w * h; i < n; i++) {
    const v = field[i];
    if (v < 0.005) { d[i * 4 + 3] = 0; continue; }
    const [r, g, b] = sampleCmap(cmapName, v);
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b;
    d[i * 4 + 3] = Math.min(255, v * 320);
  }
  return img;
}


// ═══════════════════════════════════════════════════════
//  SPARKLE GENERATION
// ═══════════════════════════════════════════════════════

function sampleRandom(field, w, h, count) {
  const pts = [];
  let attempts = 0;
  while (pts.length < count && attempts < count * 40) {
    attempts++;
    const x = Math.random() * w, y = Math.random() * h;
    const ix = ~~x, iy = ~~y;
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) continue;
    const v = field[iy * w + ix];
    if (v > 0.03 && Math.random() < v) pts.push({ x, y, v });
  }
  return pts;
}

function samplePoisson(field, w, h, count, baseMinDist) {
  const pts = [];
  let attempts = 0;
  const maxAttempts = count * 50;
  while (pts.length < count && attempts < maxAttempts) {
    attempts++;
    const x = Math.random() * w, y = Math.random() * h;
    const ix = ~~x, iy = ~~y;
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) continue;
    const v = field[iy * w + ix];
    if (v < 0.03) continue;
    const d = baseMinDist / (0.2 + v * 1.8);
    const d2 = d * d;
    let ok = true;
    for (let i = pts.length - 1; i >= 0; i--) {
      const dx = pts[i].x - x, dy = pts[i].y - y;
      if (dx * dx + dy * dy < d2) { ok = false; break; }
    }
    if (ok) pts.push({ x, y, v });
  }
  return pts;
}

function sampleFibonacci(field, w, h, count) {
  const a1 = 0.7548776662466927, a2 = 0.5698402909980532;
  const pts = [];
  const n = count * 8;
  for (let i = 0; i < n && pts.length < count; i++) {
    const x = ((0.5 + i * a1) % 1) * w;
    const y = ((0.5 + i * a2) % 1) * h;
    const ix = ~~x, iy = ~~y;
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) continue;
    const v = field[iy * w + ix];
    if (v > 0.03 && Math.random() < v * 1.5) pts.push({ x, y, v });
  }
  return pts;
}


// ═══════════════════════════════════════════════════════
//  SPARKLE RENDERING
// ═══════════════════════════════════════════════════════

function drawSparkles(ctx, pts, style, size, cmapName, globalAlpha) {
  ctx.save();
  ctx.globalAlpha = globalAlpha;

  for (const p of pts) {
    const [r, g, b] = sampleCmap(cmapName, Math.min(1, p.v * 1.2 + 0.15));
    const alpha = 0.4 + p.v * 0.6;
    const sz = size * (0.7 + p.v * 0.6);
    ctx.globalAlpha = globalAlpha * alpha;

    // Subtle glow
    ctx.fillStyle = `rgba(${~~r},${~~g},${~~b},0.2)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, sz * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Sparkle shape
    ctx.strokeStyle = ctx.fillStyle = `rgba(255,255,255,${0.6 + p.v * 0.4})`;
    ctx.lineWidth = Math.max(0.5, sz * 0.35);
    ctx.lineCap = 'round';

    switch (style) {
      case 'dot':
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.5 + p.v * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz * 0.4, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'plus': {
        const arm = sz * 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x - arm, p.y); ctx.lineTo(p.x + arm, p.y);
        ctx.moveTo(p.x, p.y - arm); ctx.lineTo(p.x, p.y + arm);
        ctx.stroke();
        break;
      }

      case 'cross': {
        const arm = sz * 1.4;
        ctx.beginPath();
        ctx.moveTo(p.x - arm, p.y - arm); ctx.lineTo(p.x + arm, p.y + arm);
        ctx.moveTo(p.x + arm, p.y - arm); ctx.lineTo(p.x - arm, p.y + arm);
        ctx.stroke();
        break;
      }

      case 'ring':
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        break;
    }
  }
  ctx.restore();
}


// ═══════════════════════════════════════════════════════
//  HEATMAP NODE
// ═══════════════════════════════════════════════════════

class HeatmapNode {

  /**
   * Initialise or resize offscreen caches stored on the AST node.
   * Returns the cache object (`node._hm`).
   */
  static _ensureCache(node, cw, ch) {
    let c = node._hm;
    if (c && c.w === cw && c.h === ch) return c;

    c = node._hm = {
      w: cw, h: ch,
      maskCanvas:    document.createElement('canvas'),
      baseCanvas:    document.createElement('canvas'),
      overlayCanvas: document.createElement('canvas'),
      maskCtx: null, baseCtx: null, overlayCtx: null,
      regionLookup: null,
      field:        null,
      heatmapImg:   null,
      sparkles:     null,
      // Snapshot of param values that produced each cache layer
      snap: {},
    };

    c.maskCanvas.width  = cw; c.maskCanvas.height  = ch;
    c.baseCanvas.width  = cw; c.baseCanvas.height  = ch;
    c.overlayCanvas.width = cw; c.overlayCanvas.height = ch;

    c.maskCtx    = c.maskCanvas.getContext('2d', { willReadFrequently: true });
    c.baseCtx    = c.baseCanvas.getContext('2d');
    c.overlayCtx = c.overlayCanvas.getContext('2d');

    // Size-dependent work — done once per resize
    drawBodyMask(c.maskCtx, cw, ch);
    c.regionLookup = buildRegionLookup(c.maskCtx, cw, ch);
    drawBodyBase(c.baseCtx, cw, ch);

    return c;
  }

  /** Collect region_0…region_N from params into an array. */
  static _regionValues(params) {
    const vals = new Array(REGION_COUNT);
    for (let i = 0; i < REGION_COUNT; i++) {
      vals[i] = params['region_' + i] ?? 0;
    }
    return vals;
  }

  /** Shallow-compare two region value arrays. */
  static _regionsMatch(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // ── Measure (for addable / handle-frame mode) ───────

  static measure(ctxMix, node, params) {
    // Provide a box so handle-frame can read natural dimensions
    node.box = {
      width()  { return NATURAL_W; },
      height() { return NATURAL_H; },
      clone()  { return { width: this.width, height: this.height, clone: this.clone }; },
    };
  }

  // ── Main draw ──────────────────────────────────────────

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    let cw, ch, ox, oy;

    if (node.box) {
      // Addable mode — handle-frame applies translate + scale;
      // draw at origin with fixed natural resolution
      cw = NATURAL_W;
      ch = NATURAL_H;
      ox = 0;
      oy = 0;
    } else {
      // Standalone-scene mode — fit to canvas and centre
      const W = ctxMix.W || 800;
      const H = ctxMix.H || 600;
      if (W / H > TEMPLATE_ASPECT) {
        ch = Math.round(Math.min(H, 700));
        cw = Math.round(ch * TEMPLATE_ASPECT);
      } else {
        cw = Math.round(Math.min(W, 500));
        ch = Math.round(cw / TEMPLATE_ASPECT);
      }
      let z = params.zoom || 1;
      ox = Math.round((W/z - cw) / 2);
      oy = Math.round((H/z - ch) / 2);
    }
    if (cw < 10 || ch < 10) return;

    const c    = HeatmapNode._ensureCache(node, cw, ch);
    const snap = c.snap;
    const regionVals = HeatmapNode._regionValues(params);

    // ── Read params ──────────────────────────────────

    const blur         = params.blur         ?? 18;
    const cmap         = params.cmap         ?? 'inferno';
    const opacity      = params.opacity      ?? 70;
    const sparkleCount = params.sparkleCount ?? 500;
    const sparkleSize  = params.sparkleSize  ?? 1.5;
    const sparkleStyle = params.sparkleStyle ?? 'dot';
    const sampling     = params.sampling     ?? 'random';

    // ── Dirty detection ──────────────────────────────

    const fieldDirty = !c.field
      || blur !== snap.blur
      || !HeatmapNode._regionsMatch(regionVals, snap.regionVals);

    const cmapDirty = fieldDirty || cmap !== snap.cmap;

    const sparkleDirty = fieldDirty
      || sparkleCount !== snap.sparkleCount
      || sampling !== snap.sampling;

    // ── Recompute as needed ──────────────────────────

    if (fieldDirty) {
      c.field = buildValueField(c.regionLookup, regionVals, cw, ch, blur);
    }

    if (cmapDirty) {
      c.heatmapImg = colormapField(c.field, cw, ch, cmap);
      c.overlayCtx.clearRect(0, 0, cw, ch);
      c.overlayCtx.putImageData(c.heatmapImg, 0, 0);
    }

    if (sparkleDirty) {
      switch (sampling) {
        case 'poisson': {
          const minDist = Math.max(3,
            Math.sqrt(cw * ch / Math.max(1, sparkleCount)) * 0.6);
          c.sparkles = samplePoisson(c.field, cw, ch, sparkleCount, minDist);
          break;
        }
        case 'fibonacci':
          c.sparkles = sampleFibonacci(c.field, cw, ch, sparkleCount);
          break;
        default:
          c.sparkles = sampleRandom(c.field, cw, ch, sparkleCount);
      }
    }

    // Update snapshot
    snap.blur         = blur;
    snap.cmap         = cmap;
    snap.sparkleCount = sparkleCount;
    snap.sampling     = sampling;
    snap.regionVals   = regionVals.slice();

    // ── Composite to main canvas ─────────────────────

    // 1 — Base image (body silhouette + organ outlines)
    ctx.drawImage(c.baseCanvas, ox, oy);

    // 2 — Heatmap overlay
    if (opacity > 0) {
      ctx.save();
      ctx.globalAlpha = opacity / 100;
      ctx.drawImage(c.overlayCanvas, ox, oy);
      ctx.restore();
    }

    // 3 — Sparkles
    if (c.sparkles && c.sparkles.length > 0) {
      ctx.save();
      ctx.translate(ox, oy);
      drawSparkles(ctx, c.sparkles, sparkleStyle, sparkleSize, cmap, 1.0);
      ctx.restore();
    }
  }
}

sceneRegistry.registerNodeClass('heatmap', HeatmapNode);

export { HeatmapNode, BODY_REGIONS, COLORMAPS, REGION_COUNT };