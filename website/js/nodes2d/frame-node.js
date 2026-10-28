/**
 * frame-node.js  — v5 (stamp-frame)
 *
 * A decorative movable card with a bumpy perimeter; a container (before/after
 * pattern), so its children draw and hit-test inside it.
 *
 * v5 (FR4 in docs/twin-merge-plan.md): T only.  The frame draws in screen
 * space (directCtx) at T.toScreen(value), sizes by T.uniformScale, and pushes
 * T.child(value) for its children.  The legacy branch is gone: no
 * ctx.translate for children, no params.panX/panY shift in hit_test, and no
 * params.zoom, so zoom is no longer recorded twice.  No child it can hold
 * (button grids, charts, ribbons, nested frames) needed the legacy branch.
 *
 * v4: hit_test → before_hit_test / after_hit_test (container pattern).
 */

import { SYS } from '../omni-support/sys.js';
import { Values } from '../omni-support/values.js';

// ── Seeded PRNG ─────────────────────────────────────────────

function mulberry32(seed) {
  seed = seed | 0;
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededValues(seed, n) {
  const rng = mulberry32(seed * 2654435761);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng() * 2 - 1;
  return out;
}


// ═══════════════════════════════════════════════════════
//  BUMP PROFILE — polygon inscribed in semicircle
// ═══════════════════════════════════════════════════════

function buildBumpPoly(sections) {
  sections = Math.max(1, Math.round(sections));
  const verts = [{ t: 0, depth: 0 }];
  let maxD = 0;

  for (let k = 1; k <= sections; k++) {
    const angle = k * Math.PI / (sections + 1);
    const d = Math.sin(angle);
    verts.push({ t: (1 - Math.cos(angle)) / 2, depth: d });
    if (d > maxD) maxD = d;
  }

  if (maxD > 1e-6) {
    for (let i = 1; i < verts.length; i++) verts[i].depth /= maxD;
  }

  verts.push({ t: 1, depth: 0 });
  return verts;
}

function evalBumpPoly(t, verts, curviness) {
  if (t <= 0 || t >= 1) return 0;

  let i = 0;
  while (i < verts.length - 2 && verts[i + 1].t < t) i++;

  const v0 = verts[Math.max(0, i - 1)];
  const v1 = verts[i];
  const v2 = verts[i + 1];
  const v3 = verts[Math.min(verts.length - 1, i + 2)];

  const segLen = v2.t - v1.t;
  const st = segLen > 1e-9 ? (t - v1.t) / segLen : 0;

  const linear = v1.depth + (v2.depth - v1.depth) * st;
  if (curviness < 0.01) return Math.max(0, linear);

  const st2 = st * st, st3 = st2 * st;
  const cr = 0.5 * (
      2 * v1.depth
    + (-v0.depth + v2.depth) * st
    + (2 * v0.depth - 5 * v1.depth + 4 * v2.depth - v3.depth) * st2
    + (-v0.depth + 3 * v1.depth - 3 * v2.depth + v3.depth) * st3
  );

  return Math.max(0, linear * (1 - curviness) + cr * curviness);
}

function bumpProfile(t, flats, poly, curviness) {
  const bumpWidth = Math.max(0.08, 1 - flats * 0.92);
  const bumpStart = (1 - bumpWidth) / 2;
  const bumpEnd   = bumpStart + bumpWidth;
  if (t <= bumpStart || t >= bumpEnd) return 0;
  const bt = (t - bumpStart) / bumpWidth;
  return evalBumpPoly(bt, poly, curviness);
}


// ═══════════════════════════════════════════════════════
//  PERIMETER GEOMETRY
// ═══════════════════════════════════════════════════════

function buildPerimeter(x, y, w, h, cr) {
  cr = Math.max(0, Math.min(cr, w / 2, h / 2));
  const segs = [];

  const addLine = (x0, y0, x1, y1, nx, ny) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.01) return;
    segs.push({
      length: len,
      posAt:    t => ({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t }),
      normalAt: _ => ({ x: nx, y: ny }),
    });
  };

  const addArc = (cx, cy, r, a0, a1) => {
    const len = r * Math.abs(a1 - a0);
    if (len < 0.01) return;
    const span = a1 - a0;
    segs.push({
      length: len,
      posAt:    t => ({ x: cx + r * Math.cos(a0 + span * t),
                        y: cy + r * Math.sin(a0 + span * t) }),
      normalAt: t => ({ x: Math.cos(a0 + span * t),
                        y: Math.sin(a0 + span * t) }),
    });
  };

  const HP = Math.PI / 2;
  addLine(x + cr,     y,          x + w - cr, y,          0, -1);
  if (cr > 0) addArc(x + w - cr,  y + cr,     cr, -HP,  0);
  addLine(x + w,      y + cr,     x + w,      y + h - cr, 1,  0);
  if (cr > 0) addArc(x + w - cr,  y + h - cr, cr,  0,   HP);
  addLine(x + w - cr, y + h,      x + cr,     y + h,      0,  1);
  if (cr > 0) addArc(x + cr,      y + h - cr, cr,  HP,  Math.PI);
  addLine(x,          y + h - cr, x,          y + cr,     -1,  0);
  if (cr > 0) addArc(x + cr,      y + cr,     cr,  Math.PI, Math.PI + HP);

  return segs;
}

function samplePerimeter(segs, dist, totalLen) {
  dist = ((dist % totalLen) + totalLen) % totalLen;
  let rem = dist;
  for (const seg of segs) {
    if (rem <= seg.length + 1e-6) {
      const t = seg.length > 0 ? rem / seg.length : 0;
      return { pos: seg.posAt(t), normal: seg.normalAt(t) };
    }
    rem -= seg.length;
  }
  const last = segs[segs.length - 1];
  return { pos: last.posAt(1), normal: last.normalAt(1) };
}


// ═══════════════════════════════════════════════════════
//  EDGE PATH GENERATION
// ═══════════════════════════════════════════════════════

function generateEdgePoints(x, y, w, h, cr, count, depth,
                            reg, seed, flats, sections, curviness) {
  count = Math.max(3, Math.round(count));

  const segs     = buildPerimeter(x, y, w, h, cr);
  const totalLen = segs.reduce((s, seg) => s + seg.length, 0);
  if (totalLen < 1) return [{ x, y }];

  const poly = buildBumpPoly(sections);
  const rv   = seededValues(Math.round(seed), count * 2 + 4);

  const samplesPerBump = 14;
  const totalSamples   = count * samplesPerBump;
  const points         = [];

  for (let i = 0; i < totalSamples; i++) {
    const globalT = i / totalSamples;
    const dist    = globalT * totalLen;
    const { pos, normal } = samplePerimeter(segs, dist, totalLen);

    const bumpFloat = globalT * count;
    const bumpIdx   = Math.floor(bumpFloat);
    const bumpT     = bumpFloat - bumpIdx;

    const effFlats = flats * (0.3 + 0.7 * reg);
    const regDisp  = bumpProfile(bumpT, effFlats, poly, curviness);

    const r0 = rv[bumpIdx % rv.length];
    const r1 = rv[(bumpIdx + 1) % rv.length];
    const st = bumpT * bumpT * (3 - 2 * bumpT);
    const randAmp  = 0.25 + 0.75 * Math.abs(r0 + (r1 - r0) * st);
    const randDisp = bumpProfile(bumpT, effFlats * 0.3, poly,
                                  curviness * 0.6) * randAmp;

    const wave = reg * regDisp + (1 - reg) * randDisp;
    const disp = -wave * depth;

    points.push({
      x: pos.x + normal.x * disp,
      y: pos.y + normal.y * disp,
    });
  }

  return points;
}


// ═══════════════════════════════════════════════════════
//  PATH TRACING
// ═══════════════════════════════════════════════════════

function traceEdgePath(ctx, pts, curviness) {
  const n = pts.length;
  if (n < 3) return;
  ctx.beginPath();

  if (curviness < 0.15) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  } else {
    const mx = (pts[n - 1].x + pts[0].x) / 2;
    const my = (pts[n - 1].y + pts[0].y) / 2;
    ctx.moveTo(mx, my);
    for (let i = 0; i < n; i++) {
      const c = pts[i];
      const nx = pts[(i + 1) % n];
      ctx.quadraticCurveTo(c.x, c.y, (c.x + nx.x) / 2, (c.y + nx.y) / 2);
    }
  }
  ctx.closePath();
}


// ═══════════════════════════════════════════════════════
//  DEFAULTS
// ═══════════════════════════════════════════════════════

const FRAME_DEFAULTS = Object.freeze({
  edgeRegularity:   1.0,
  edgeCount:        24,
  edgeDepth:        6,
  edgeSeed:         0,
  edgeFlats:        0.0,
  edgeSections:     4,
  edgeCurviness:    0.8,
  edgeCornerRadius: 0,

  frameFill:        '#faf8f2',
  frameStroke:      '#b8b4a8',
  frameStrokeWidth: 1.5,
  framePadding:     12,

  frameShadowBlur:    8,
  frameShadowOffsetX: 2,
  frameShadowOffsetY: 3,
  frameShadowColor:   'rgba(0,0,0,0.22)',

  zoom: 1,
});




// ═══════════════════════════════════════════════════════
//  FRAME NODE — container: before/after pattern
// ═══════════════════════════════════════════════════════

/** The frame's screen rectangle: centre T.toScreen(value), size scaled by T. */
function stampRect(ctxMix, node, params, p) {
  const T    = ctxMix.T;
  const v    = ctxMix.getValue?.(ctxMix, node, params) || node.value || {};
  const zoom = T.uniformScale;
  const pad  = (p.framePadding || 0) * zoom;
  const w    = (v.width  || 200) * zoom + pad * 2;
  const h    = (v.height || 100) * zoom + pad * 2;
  const c    = T.toScreen({ x: v.x || 0, y: v.y || 0 });
  return { cx: c.x, cy: c.y, w, h, left: c.x - w / 2, top: c.y - h / 2, zoom, v };
}

class StampFrameNode {

  // ── Draw ───────────────────────────────────────────────

  static before_draw2d(ctxMix, node, params) {
    node._savedT = null;
    if (!ctxMix.ctx || !ctxMix.T) return;

    const p  = { ...FRAME_DEFAULTS, ...params };

    const { left, top, w, h, zoom, v } = stampRect(ctxMix, node, params, p);

    const depth    = (p.edgeDepth || 0) * zoom;
    const cr       = Math.min((p.edgeCornerRadius || 0) * zoom, w / 2, h / 2);
    const count    = Math.max(3, Math.round(p.edgeCount || 24));
    const reg      = p.edgeRegularity ?? 1;
    const seed     = Math.round(p.edgeSeed || 0);
    const flats    = p.edgeFlats ?? 0;
    const sections = Math.max(1, Math.min(8, Math.round(p.edgeSections || 4)));
    const curvy    = p.edgeCurviness ?? 0.8;

    const pts = generateEdgePoints(
      left, top, w, h,
      cr, count, depth, reg, seed, flats, sections, curvy
    );

    // Screen space; stays saved while the children draw (after_draw2d restores).
    const ctx = ctxMix.directCtx ? ctxMix.directCtx() : (ctxMix.ctx.save(), ctxMix.ctx);
    node._drawSaved = true;

    // ── drop shadow ──
    if (p.frameShadowBlur > 0) {
      ctx.save();
      ctx.shadowColor   = p.frameShadowColor;
      ctx.shadowOffsetX = (p.frameShadowOffsetX || 0) * zoom;
      ctx.shadowOffsetY = (p.frameShadowOffsetY || 0) * zoom;
      ctx.shadowBlur    = (p.frameShadowBlur    || 0) * zoom;
      traceEdgePath(ctx, pts, curvy);
      ctx.fillStyle = v.color || p.frameFill;
      ctx.fill();
      ctx.restore();
    }

    // ── fill ──
    traceEdgePath(ctx, pts, curvy);
    ctx.fillStyle = v.color || p.frameFill;
    ctx.fill();

    // ── stroke ──
    if ((p.frameStrokeWidth || 0) > 0) {
      traceEdgePath(ctx, pts, curvy);
      ctx.strokeStyle = p.frameStroke;
      ctx.lineWidth   = (p.frameStrokeWidth || 1) * zoom;
      ctx.lineJoin    = curvy > 0.3 ? 'round' : 'miter';
      ctx.stroke();
    }

    // ── selection highlight ──
    if (ctxMix.highlighted?.has(node)) {
      traceEdgePath(ctx, pts, curvy);
      ctx.setLineDash([5 * zoom, 5 * zoom]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 2 * zoom;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Children are placed relative to the frame centre ──
    node._savedT = ctxMix.T;
    ctxMix.T = ctxMix.T.child({ x: v.x || 0, y: v.y || 0 });
  }

  static after_draw2d(ctxMix, node) {
    if (node._savedT) { ctxMix.T = node._savedT; node._savedT = null; }
    if (node._drawSaved) { ctxMix.ctx.restore(); node._drawSaved = false; }
  }

  // ── Hit test — container pattern ───────────────────────
  //
  // Uses T.toScreen for screen position (correct at any zoom).
  // Frame AABB check in before_hit_test; child hit_tests
  // during recursion can overwrite hitResult.

  static before_hit_test(ctxMix, node, params) {
    node._savedT = null;
    // Compared with T.toScreen, so it must be the screen point.  An enclosing
    // container may have rewritten ctxMix.hitPoint into its own local space
    // (handle-frame does, for its content); SceneRootNode keeps the original.
    const pt = ctxMix.screenHitPoint ?? ctxMix.hitPoint;
    const T  = ctxMix.T;
    if (!pt || !T) return;

    const p = { ...FRAME_DEFAULTS, ...params };
    const { cx: sx, cy: sy, w, h, v, zoom } = stampRect(ctxMix, node, params, p);
    const depth = (p.edgeDepth || 0) * zoom;
    const hitW  = w + depth * 2;
    const hitH  = h + depth * 2;
    const left  = sx - hitW / 2;
    const top   = sy - hitH / 2;

    // Frame background hit; children hit-tested after this may overwrite it.
    if (pt.x >= left && pt.x <= left + hitW &&
        pt.y >= top  && pt.y <= top  + hitH) {
      const dxHit = pt.x - sx;
      const dyHit = pt.y - sy;
      const Ts = T.clone();
      ctxMix.hitResult = {
        node,
        interactions: {
          applyDrag(screenX, screenY) {
            const local = Ts.toLocal({ x: screenX - dxHit, y: screenY - dyHit });
            Values.setValue(Values, node, params, { x: local.x, y: local.y });
          },
        },
      };
    }

    // ── Children are placed relative to the frame centre ──
    node._savedT = T;
    ctxMix.T = T.child({ x: v.x || 0, y: v.y || 0 });
  }

  static after_hit_test(ctxMix, node) {
    if (node._savedT) { ctxMix.T = node._savedT; node._savedT = null; }
  }
}

SYS.NODE_CLASSES.push({ name: 'stamp-frame', cls: StampFrameNode });

export { StampFrameNode, generateEdgePoints, traceEdgePath,
         buildBumpPoly, evalBumpPoly, bumpProfile };