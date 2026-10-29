/**
 * `polyline` — a stroked path through points: dashed, closed or filled, with arrowheads
 *
 * Covers bonds, dashed links, arrows and arcs: a model that wants a curve
 * writes sampled points.
 *
 *   value = {
 *     points: [{ x, y }, …],   local units
 *     color, width,            stroke colour and width (default 2)
 *     dash,                    e.g. [4, 5], local units
 *     arrow,                   'end' | 'start' | 'both'
 *     headLen, headAngle,      arrowhead length (local units, default 6), half-angle (rad, 0.4)
 *     closed, fill,            close the path; fill it with this colour
 *     opacity, visible
 *   }
 *
 * Widths, dashes and heads scale with T.
 */

import { SYS } from '../omni-support/sys.js';

function head(ctx, from, to, len, ang) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - len * Math.cos(a - ang), to.y - len * Math.sin(a - ang));
  ctx.lineTo(to.x - len * Math.cos(a + ang), to.y - len * Math.sin(a + ang));
  ctx.closePath();
  ctx.fill();
}

class PolylineNode {
  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const pts = v.points || [];
    if (v.visible === false || pts.length < 2) return;
    const T = ctxMix.T;
    const s = T.uniformScale;
    const p = pts.map(q => T.toScreen(q));
    const ctx = ctxMix.directCtx ? ctxMix.directCtx() : (ctxMix.ctx.save(), ctxMix.ctx);
    if (v.opacity !== undefined) ctx.globalAlpha *= v.opacity;
    const color = v.color ?? '#8b949e';

    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    if (v.closed) ctx.closePath();
    if (v.fill) { ctx.fillStyle = v.fill; ctx.fill(); }
    ctx.setLineDash((v.dash || []).map(d => d * s));
    ctx.strokeStyle = color;
    ctx.lineWidth = (v.width ?? 2) * s;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.setLineDash([]);

    if (v.arrow) {
      ctx.fillStyle = color;
      const len = (v.headLen ?? 6) * s, ang = v.headAngle ?? 0.4, n = p.length;
      if (v.arrow === 'end' || v.arrow === 'both') head(ctx, p[n - 2], p[n - 1], len, ang);
      if (v.arrow === 'start' || v.arrow === 'both') head(ctx, p[1], p[0], len, ang);
    }
    ctx.restore();
  }
}

SYS.NODE_CLASSES.push({ name: 'polyline', cls: PolylineNode });

export { PolylineNode };
