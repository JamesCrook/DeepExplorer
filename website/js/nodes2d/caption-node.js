/**
 * `caption` — a line of text placed in local coordinates
 *
 * For labels that stand apart from any shape (a part's name beside it, a
 * status word).  A shape carries its own label; use caption for the rest.
 *
 *   value = { x, y, text, color, fontSize, font, align, rotation, opacity, visible }
 *
 * align is 'center' (default), 'left' or 'right'.  Text scales with T and
 * turns with T's rotation plus its own (degrees).
 */

import { SYS } from '../omni-support/sys.js';

class CaptionNode {
  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    if (v.visible === false || !v.text) return;
    const T = ctxMix.T;
    const c = T.toScreen({ x: v.x ?? 0, y: v.y ?? 0 });
    const s = T.uniformScale;
    const ctx = ctxMix.directCtx ? ctxMix.directCtx() : (ctxMix.ctx.save(), ctxMix.ctx);
    ctx.translate(c.x, c.y);
    ctx.rotate((T.rot || 0) + (v.rotation ?? 0) * Math.PI / 180);
    if (v.opacity !== undefined) ctx.globalAlpha *= v.opacity;
    ctx.font = `${(v.fontSize ?? 10) * s}px ${v.font ?? 'Menlo, monospace'}`;
    ctx.fillStyle = v.color ?? '#8b949e';
    ctx.textAlign = v.align ?? 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(v.text, 0, 0);
    ctx.restore();
  }
}

SYS.NODE_CLASSES.push({ name: 'caption', cls: CaptionNode });

export { CaptionNode };
