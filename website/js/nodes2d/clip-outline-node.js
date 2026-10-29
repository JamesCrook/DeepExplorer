import { SYS } from '../omni-support/sys.js';
import { nm2screen } from '../2d-support/nm-coords.js';
export { ClipOutlineNode };

// `clip-outline` — dashed amber outlines of the mask editor's clip regions
/* ─────────────────────────────────────────────────────────────────────────────
node.value = [{ x, y, w, h }, …] in nm.
──────────────────────────────────────────────────────────────────────────── */

class ClipOutlineNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const shapes = node.value;
    if (!ctx || !shapes || !shapes.length) return;

    const W = ctxMix.W || ctx.canvas.width;
    const H = ctxMix.H || ctx.canvas.height;

    const sc = (params.zoom || 1) / (params.nmPx || 10);

    ctx.save();
    ctx.strokeStyle = 'rgba(251,191,36,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);

    for (const s of shapes) {
      const tl = nm2screen(s.x, s.y + s.h, params, W, H);
      ctx.strokeRect(tl.x, tl.y, s.w * sc, s.h * sc);
    }

    ctx.restore();
  }
}

SYS.NODE_CLASSES.push({ name: 'clip-outline', cls: ClipOutlineNode });
