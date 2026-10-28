import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { hexToRgba } from '../colour/colour.js';
import { PipKinds } from '../2d-support/pip-kind.js';
import { Values } from '../omni-support/values.js';
import { SPECTRAL, STAR_DEFAULTS, StarRender, magWeight, mixWhite, rgbCss } from '../2d-support/sky-gl.js';
import { CollisionGrid, LabelLayouter, LabelSpriteFactory, TextMeasurer, TextStyle, annulusShape, circleShape, rectShape } from '../2d-support/annular-labels.js';
export { LabelLayerNode, RING_DEFAULTS, RingLabelNode };

/* ─────────────────────────────────────────────────────────────────────────────
ring-label — a labelled star whose name may wrap round it, as a scene node.

  value { x, y, text, mag?, cls?, color?, px?, ringRadius?, mode? }
  value { x, y, text, region: true, extent }      a seal round a whole region

The layout comes from annular-labels; this node decides the units.  With
screenConstant (the default) a label keeps its pixel size at any zoom, as in
the original, so its ring is drawn in layout units of one CSS pixel and the
star stays at the world position.  With it off, labels are world objects and
grow as you zoom in.

label-layer — a parent that provides collision avoidance as a service.  In its
before_draw2d it puts a fresh CollisionGrid on ctxMix; each ring-label child
then tries its slots against it, in subtree order, which is priority order.
This is the same shape as frame-node providing getWH: the parent offers, the
children ask, and a ring-label with no layer above it (on the stock strip, in
the arena) simply draws everything.
──────────────────────────────────────────────────────────────────────────── */

const RING_DEFAULTS = Object.freeze({
  pointMode: 'ring', longLabelPx: 90, maxWidth: 150, labelScale: 1, labelWeight: 300, labelOpacity: 0.85,
  ringRadius: 44, ringArcTop: 160, ringArcBottom: 200, ringBlob: true, ringBlobSize: 2.4, ringMeaning: true, ringInner: true,
  ringBand: 0.11, ringRim: 0.25,
  regionMode: 'ring', regionSize: 1.3, regionWeight: 300, regionOpacity: 0.4,
  screenConstant: true, collide: true, showStars: true, haloColor: '#05070d',
});

const LABEL_FAMILY = "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', system-ui, -apple-system, 'Segoe UI', sans-serif";
const REGION_FAMILY = "'Jost', 'Futura', 'Century Gothic', system-ui, sans-serif";
const labelMeasurer = new TextMeasurer();
const labelLayouter = new LabelLayouter(labelMeasurer);
const labelFactory = new LabelSpriteFactory({ capacity: 400, dpr: 1 });

/* Styles are made on demand per (kind, weight, halo).  Weights outside the
   font's own range are emulated: lighter by eroding, heavier by stroking. */
const STYLE_BASE = {
  point:  { family: LABEL_FAMILY, haloWidth: 3, haloA: 0.9, native: [200, 800] },
  region: { family: REGION_FAMILY, caps: true, tracking: 0.2, lineHeight: 1.12, haloA: 0.5, haloWidth: 4, native: [100, 900] },
};
const labelStyles = new Map();
function labelStyle(kind, weight, halo) {
  const id = kind + weight + halo;
  let s = labelStyles.get(id);
  if (!s) {
    const { native, haloA, ...base } = STYLE_BASE[kind];
    s = new TextStyle({ ...base, id, weight: Math.max(native[0], Math.min(native[1], weight)),
      halo: hexToRgba(halo, haloA),
      erodeEm: Math.max(0, native[0] - weight) / 100 * 0.028,
      emboldenEm: Math.max(0, weight - native[1]) / 100 * 0.04 });
    labelStyles.set(id, s);
  }
  return s;
}
const pxForMag = mag => Math.round(Math.max(11, Math.min(16, 11.5 + 1.6 * Math.log2(magWeight(mag) / 30))));

/** Smallest ring radius (up to Rmax) at which the whole label fits on the ring
 *  without inner continuation; null if it does not fit at Rmax. */
const ringFitMemo = new Map();
function fittedRingRadius(opts, Rmax) {
  const key = [opts.text, opts.style.id, opts.px, Math.round(opts.clearRadius * 4), Math.round(Rmax * 4),
               opts.maxArcTop, opts.maxArcBottom, opts.meaning, opts.blob].join('|');
  if (ringFitMemo.has(key)) return ringFitMemo.get(key);
  const full = opts.text.replace(/\s+/g, ' ').trim();
  const fitsAt = r => {
    const L = labelLayouter.ring({ ...opts, baseRadius: r, innerCont: false });
    return L.tracks.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim() === full;
  };
  let lo = labelLayouter.ring({ ...opts, baseRadius: 0, innerCont: false }).Rc, hi = Math.ceil(Rmax), R = null;
  if (lo > hi) R = fitsAt(lo) ? lo : null;
  else if (fitsAt(hi)) {
    while (lo < hi) { const mid = (lo + hi) >> 1; if (fitsAt(mid)) hi = mid; else lo = mid + 1; }
    R = hi;
  }
  if (ringFitMemo.size > 20000) ringFitMemo.clear();
  ringFitMemo.set(key, R);
  return R;
}

function labelColour(v) {
  if (v.color) return v.color;
  return SPECTRAL[v.cls] ? rgbCss(mixWhite(SPECTRAL[v.cls], 0.35)) : '#dde3f3';
}

function pointLayout(v, p, clear) {
  const text = v.text || '';
  if (!text) return null;
  const notable = (v.mag ?? 9) <= 2;
  const style = labelStyle('point', notable ? Math.min(1000, p.labelWeight + 200) : p.labelWeight, p.haloColor);
  const px = Math.max(5, Math.round((v.px ?? pxForMag(v.mag ?? 4)) * p.labelScale));
  const base = { text, style, px, color: labelColour(v) };
  const maxW = p.maxWidth, multi = text.indexOf(' ') > 0;
  const lines = n => labelLayouter.lines({ ...base, maxWidth: maxW, maxLines: n });
  const ring = () => {
    const opts = { ...base, clearRadius: clear,
      maxArcTop: p.ringArcTop * Math.PI / 180, maxArcBottom: p.ringArcBottom * Math.PI / 180, meaning: p.ringMeaning,
      blob: p.ringBlob ? p.ringBlobSize * px / 13 : 0, bandAlpha: p.ringBand, rimAlpha: p.ringRim };
    const Rmax = (v.ringRadius ?? p.ringRadius) * px / 13;
    const R = fittedRingRadius(opts, Rmax);
    if (R !== null) return labelLayouter.ring({ ...opts, baseRadius: R, innerCont: false });
    return labelLayouter.ring({ ...opts, baseRadius: Rmax, innerCont: !!p.ringInner });
  };
  const mode = v.mode || p.pointMode;
  if (mode === 'straight') return lines(1);
  if (mode === 'wrap') return lines(2);
  const fullW = labelMeasurer.width(text, style, px);
  if (mode === 'ring') return fullW > p.longLabelPx || v.ring ? ring() : lines(1);
  if (fullW <= maxW || !multi) return lines(1);
  if (fullW <= maxW * 1.8) return lines(2);
  return ring();
}

/** A region label: extentL is the region's radius in layout units. */
function regionLayout(v, p, extentL) {
  const text = v.text || '';
  if (!text) return null;
  const style = labelStyle('region', p.regionWeight, p.haloColor);
  const px = Math.max(6, Math.round((v.px ?? 18) * p.regionSize));
  const base = { text, style, px, color: v.color || '#bcc8ff' };
  const multi = text.indexOf(' ') > 0, maxW = Math.max(80, extentL * 2.2);
  if (p.regionMode === 'straight') return labelLayouter.lines({ ...base, maxWidth: maxW * 1.6, maxLines: 1 });
  if (p.regionMode === 'wrap' || !multi)
    return multi ? labelLayouter.lines({ ...base, maxWidth: maxW, maxLines: 2, forceSplit: true })
                 : labelLayouter.lines({ ...base, maxWidth: maxW * 1.8, maxLines: 1 });
  // A seal round the region: the hole stays free for the stars inside.
  const inner = extentL * 0.55;
  const L = labelLayouter.ring({ ...base, clearRadius: inner, baseRadius: inner,
    maxArcTop: p.ringArcTop * Math.PI / 180, maxArcBottom: p.ringArcBottom * Math.PI / 180,
    grow: true, maxRadius: Math.max(inner + px, extentL * 1.1),
    meaning: p.ringMeaning, blob: p.ringBlob ? Math.max(2, px * 0.16) : 0 });
  return { ...L, annulus: true };
}

const SLOT_ALIGN = { below: 'center', above: 'center', right: 'left', left: 'right', center: 'center' };
/** Top-left of the sprite relative to the anchor, in layout units. */
function slotBox(L, slot, r) {
  if (L.type === 'ring') return [-L.size / 2, -L.size / 2];
  const gap = 2, w = L.w, h = L.h, p = L.pad;
  switch (slot) {
    case 'below': return [-w / 2, r + gap - p * 0.6];
    case 'above': return [-w / 2, -r - gap - h + p * 0.6];
    case 'right': return [r + gap, -h / 2];
    case 'left': return [-r - gap - w, -h / 2];
    default: return [-w / 2, -h / 2];
  }
}
/** Collision shape in device pixels: layout units scaled by k about (cx, cy). */
function deviceShape(L, slot, r, k, cx, cy) {
  if (L.type === 'ring')
    return L.annulus ? annulusShape(cx, cy, L.inner * k, (L.outer - L.pad * 0.5) * k)
                     : circleShape(cx, cy, (L.outer - L.pad * 0.5) * k);
  const [x, y] = slotBox(L, slot, r), i = L.pad * 0.6;
  return rectShape(cx + (x + i) * k, cy + (y + i) * k, cx + (x + L.w - i) * k, cy + (y + L.h - i) * k);
}

class LabelLayerNode {
  static before_draw2d(ctxMix, node, params) {
    const c = ctxMix.ctx.canvas;
    const grid = (node.inst ||= {}).grid ||= new CollisionGrid(48);
    grid.reset(c.width, c.height);
    ctxMix.labelGrid = grid;
  }
  static after_draw2d(ctxMix, node, params) { ctxMix.labelGrid = null; }
}

class RingLabelNode {
  static meta = {
    zOrder: 1,
    pipKind: PipKinds.JUNCTION,
    spawnOverrides: (wp) => ({ x: wp.x, y: wp.y, px: undefined, ringRadius: undefined }),
    editableFields: (node) => [
      { key: 'text', label: 'Text', type: 'text', value: node.value.text || '' },
      { key: 'mag', label: 'Magnitude', type: 'number', value: node.value.mag ?? 3 },
      { key: 'cls', label: 'Class B/G/M/N', type: 'text', value: node.value.cls || '' },
      { key: 'color', label: 'Label colour', type: 'color', value: node.value.color || '#dde3f3' },
      { key: 'ringRadius', label: 'Ring radius', type: 'number', value: node.value.ringRadius ?? RING_DEFAULTS.ringRadius },
    ],
  };

  static getCentreXY(res, node, params) {
    const v = res.getValue(res, node, params) || {};
    return { x: v.x || 0, y: v.y || 0 };
  }

  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const p = { ...STAR_DEFAULTS, ...RING_DEFAULTS, ...params };
    const ctx = ctxMix.ctx, M = ctx.getTransform();
    const D = Math.hypot(M.a, M.b) || 1, dpr = window.devicePixelRatio || 1, z = D / dpr;
    const u = p.screenConstant ? 1 / z : 1;      // world units per layout unit
    const Dl = D * u;                             // device px per layout unit
    const x = v.x || 0, y = v.y || 0;
    const cx = M.a * x + M.c * y + M.e, cy = M.b * x + M.d * y + M.f;
    const st = (node.state ||= {});

    // The star itself, unless this is a region seal.
    let starCss = 0;
    if (!v.region && v.mag != null && p.showStars) {
      const s = StarRender.draw(ctx, x, y, { weight: magWeight(v.mag), mag: v.mag, cls: v.cls || 'G', nova: v.cls === 'N' }, p);
      starCss = s ? s.coreR : 0;
    }
    const starL = starCss * (p.screenConstant ? 1 : 1 / z);   // star radius in layout units
    const L = v.region ? regionLayout(v, p, (v.extent || 200) / u) : pointLayout(v, p, starL + 2);
    st.hit = { star: (Math.max(6, starCss) + 4) / z };
    if (!L) return;

    const hi = !!(v.selected || v.hovered);
    const grid = ctxMix.labelGrid;
    const slots = L.type === 'lines' && !v.region ? ['below', 'right', 'left', 'above'] : ['center'];
    let chosen = null, Lc = L, shape = null;
    for (const slot of slots) {
      const Ls = labelLayouter.withAlign(L, SLOT_ALIGN[slot]);
      shape = deviceShape(Ls, slot, starL, Dl, cx, cy);
      if (!grid || !p.collide || v.region || hi || !grid.hits(shape)) { chosen = slot; Lc = Ls; break; }
    }
    st.hidden = !chosen;
    if (!chosen) return;
    if (grid && !v.region && !hi) {
      grid.insert(shape);
      if (starCss) grid.insert(circleShape(cx, cy, starCss * dpr + 1.5));
    }

    // Sprite resolution: exact at screen-constant size, otherwise quantised so zooming reuses sprites.
    let Dq = Math.abs(Dl - dpr) < 1e-6 ? dpr : Math.pow(2, Math.round(Math.log2(Dl) * 4) / 4);
    const maxDim = Math.max(Lc.w, Lc.h);
    if (maxDim * Dq > 2048) Dq = 2048 / maxDim;
    labelFactory.dpr = Dq;
    const sprite = labelFactory.get({ ...Lc, key: Lc.key + '|' + Dq.toFixed(4) });

    const [bx, by] = slotBox(Lc, chosen, starL);
    const k = Dl / Dq, dx = cx + bx * Dl, dy = cy + by * Dl;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha *= v.region ? p.regionOpacity : (hi ? 1 : p.labelOpacity);
    if (Math.abs(k - 1) < 1e-6) ctx.drawImage(sprite.canvas, Math.round(dx), Math.round(dy));
    else ctx.drawImage(sprite.canvas, dx, dy, sprite.canvas.width * k, sprite.canvas.height * k);
    ctx.globalAlpha = 1;
    if (hi) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (Lc.type === 'ring') ctx.arc(cx, cy, Lc.outer * Dl, 0, Math.PI * 2);
      else ctx.rect(dx, dy, Lc.w * Dl, Lc.h * Dl);
      ctx.stroke();
    }
    ctx.restore();

    // Hit geometry in world units, relative to the anchor.
    if (Lc.type === 'ring') {
      st.hit.r1 = Lc.outer * u;
      st.hit.r0 = v.region ? Lc.inner * u : 0;
    } else st.hit.box = [bx * u, by * u, (bx + Lc.w) * u, (by + Lc.h) * u];
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const dx = pt.x - (v.x || 0), dy = pt.y - (v.y || 0), d = Math.hypot(dx, dy);
    const h = node.state?.hit;
    let hit;
    if (!h) hit = !v.region && d <= 14;
    else if (v.region) hit = h.r1 != null && d >= h.r0 && d <= h.r1;
    else hit = d <= h.star || (h.r1 != null && d <= h.r1) ||
               (h.box && dx >= h.box[0] && dx <= h.box[2] && dy >= h.box[1] && dy <= h.box[3]);
    if (!hit) return;
    ctxMix.hitResult = { node, interactions: {
      applyDrag(wx, wy) { Values.setValue(Values, node, params, { x: wx - dx, y: wy - dy }); return node; },
    } };
  }
}

//SYS.NODE_CLASSES.push({ name: 'label-layer', cls: LabelLayerNode });;
//SYS.NODE_CLASSES.push({ name: 'ring-label', cls: RingLabelNode });;
SYS.NODE_CLASSES.push({ name: 'label-layer', cls: LabelLayerNode });
SYS.NODE_CLASSES.push({ name: 'ring-label', cls: RingLabelNode });

SYS.STOCK.push(
  SYS.makeNode('ring-label', { x: 0, y: 0, text: 'Annular label & ring', mag: 3, cls: 'B', px: 8, ringRadius: 30, ring: true, label: 'Ring label' }),
);
SYS.CONTROLS.push(
  { type: 'separator', label: 'Ring labels' },
  { id: 'ringRadius', label: 'Ring radius', min: 20, max: 90, step: 1, value: 44 },
  { id: 'ringArcTop', label: 'Max arc, top', min: 60, max: 360, step: 5, value: 160 },
);
