/**
 * `tensor-block` — one block of a GGUF model's layout: a framed box of tensor bars
 *
 * One block of a model's layout (embedding, a transformer block, the output
 * head): a framed box with a title, a few tensors drawn as coloured bars, a
 * "+N more" note and the block's total element count.  Used by
 * apps/scenes-gguf.js; a leaf with no logic, the model writes its value.
 *
 *   value = { x, y, w, h,                 local units, top-left corner
 *             name, total,                title and element-count text
 *             tensors: [{ name, color }], the bars, at most three
 *             more }                      how many tensors were not drawn
 *
 * params.showLabels: 'all' (titles and tensor names), 'blocks' (titles only)
 * or 'none'.  Everything, text included, scales with T, as the old canvas
 * view did.
 */

import { SYS } from '../omni-support/sys.js';

class TensorBlockNode {
  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const T = ctxMix.T;
    const s = T.uniformScale;
    const o = T.toScreen({ x: v.x ?? 0, y: v.y ?? 0 });
    const w = (v.w ?? 180) * s, h = (v.h ?? 120) * s;
    const labels = params.showLabels ?? 'all';
    const ctx = ctxMix.directCtx ? ctxMix.directCtx() : (ctxMix.ctx.save(), ctxMix.ctx);

    ctx.fillStyle = '#16213e';
    ctx.fillRect(o.x, o.y, w, h);
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 2 * s;
    ctx.strokeRect(o.x, o.y, w, h);

    const pad = 8 * s;
    const labelH = labels !== 'none' ? 20 * s : 0;
    if (labels !== 'none') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#4fc3f7';
      ctx.font = `bold ${11 * s}px system-ui`;
      ctx.fillText(v.name ?? '', o.x + w / 2, o.y + 14 * s);
      if (v.total) {
        ctx.fillStyle = '#888';
        ctx.font = `${9 * s}px monospace`;
        ctx.fillText(v.total, o.x + w / 2, o.y + h - 6 * s);
      }
    }

    // Up to three tensors as bars, as the old view drew them.
    const area = { x: o.x + pad, y: o.y + labelH + pad, w: w - 2 * pad, h: h - labelH - 2 * pad - 15 * s };
    const tensors = v.tensors || [];
    const barH = (area.h - 2 * 2 * s) / 3;
    tensors.slice(0, 3).forEach((t, i) => {
      const ty = area.y + i * (barH + 2 * s);
      ctx.fillStyle = t.color;
      ctx.fillRect(area.x, ty, area.w, barH);
      if (labels === 'all' && barH > 12 * s) {
        ctx.fillStyle = '#fff';
        ctx.font = `${8 * s}px monospace`;
        ctx.textAlign = 'left';
        const label = t.name.length > 20 ? t.name.substring(0, 20) + '...' : t.name;
        ctx.fillText(label, area.x + 3 * s, ty + barH / 2 + 3 * s);
      }
    });
    // Bottom right, on the count's line (the old view put it just above the
    // centred count, where the two overlapped).
    if (v.more > 0) {
      ctx.fillStyle = '#777';
      ctx.font = `${8 * s}px system-ui`;
      ctx.textAlign = 'right';
      ctx.fillText(`+${v.more} more`, o.x + w - pad, o.y + h - 6 * s);
    }
    ctx.restore();
  }
}

SYS.NODE_CLASSES.push({ name: 'tensor-block', cls: TensorBlockNode });

export { TensorBlockNode };
