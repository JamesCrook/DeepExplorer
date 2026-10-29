// `shape` — a rounded rectangle with an optional label; a circle when the radius is half the size
/**
 * A general leaf for diagram parts.  cornerRadius at or above half the
 * smaller side makes a stadium, or a circle when w = h.  No logic: a model
 * writes the value, draw2d draws it.
 *
 *   value = {
 *     x, y, w, h,              centre and size, local units
 *     cornerRadius,            default 6
 *     rotation,                degrees, clockwise, about the centre
 *     fill, stroke, strokeWidth,
 *     glow, glowColor,         a radial halo of radius glow (local units)
 *     opacity, visible,
 *     label, labelColor, fontSize, labelDx, labelDy, font
 *   }
 *
 * Everything scales with T, strokes and text included, and turns with T's
 * rotation (so a shape inside a rotated composite turns with it).
 */

import { SYS } from '../omni-support/sys.js';

const DEFAULT_FONT = 'Menlo, monospace';

class ShapeNode {
  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    if (v.visible === false) return;
    const T = ctxMix.T;
    const c = T.toScreen({ x: v.x ?? 0, y: v.y ?? 0 });
    const s = T.uniformScale;
    const w = (v.w ?? 20) * s, h = (v.h ?? 20) * s;
    const ctx = ctxMix.directCtx ? ctxMix.directCtx() : (ctxMix.ctx.save(), ctxMix.ctx);
    ctx.translate(c.x, c.y);
    ctx.rotate((T.rot || 0) + (v.rotation ?? 0) * Math.PI / 180);
    if (v.opacity !== undefined) ctx.globalAlpha *= v.opacity;

    if (v.glow > 0 && v.glowColor) {
      const g = v.glow * s;
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, g);
      grd.addColorStop(0, v.glowColor);
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, g, 0, Math.PI * 2); ctx.fill();
    }

    const r = Math.min((v.cornerRadius ?? 6) * s, w / 2, h / 2);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    if (v.fill)   { ctx.fillStyle = v.fill; ctx.fill(); }
    if (v.stroke) { ctx.strokeStyle = v.stroke; ctx.lineWidth = (v.strokeWidth ?? 1.5) * s; ctx.stroke(); }

    if (v.label) {
      ctx.font = `${(v.fontSize ?? 10) * s}px ${v.font ?? DEFAULT_FONT}`;
      ctx.fillStyle = v.labelColor ?? '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.label, (v.labelDx ?? 0) * s, (v.labelDy ?? 0) * s);
    }
    ctx.restore();
  }
}

SYS.NODE_CLASSES.push({ name: 'shape', cls: ShapeNode });

export { ShapeNode };
