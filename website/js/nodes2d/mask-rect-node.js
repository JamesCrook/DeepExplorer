import { SYS } from '../omni-support/sys.js';
import { nm2screen } from '../2d-support/nm-coords.js';
export { RectNode };

/* ─────────────────────────────────────────────────────────────────────────────
`rect` — a white filled rectangle in nm coordinates, for the mask editor.
node.value = { x, y, w, h } in nm. Under a chip-layer it draws into the
offscreen buffer and is moved by the layer's tile offset; the chip-layer
composites it with edge detection.
──────────────────────────────────────────────────────────────────────────── */

class RectNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const { x, y, w, h } = node.value;
    const W = ctxMix.W || ctx.canvas.width;
    const H = ctxMix.H || ctx.canvas.height;
    const sc = (params.zoom || 1) / (params.nmPx || 10);

    // Apply tile offset (set by chip-layer's TileIterator)
    const off = ctxMix.tileOffset || { dx: 0, dy: 0 };
    const nx = x + off.dx;
    const ny = y + off.dy;

    // nm to screen: y-axis is inverted (nm y-up, screen y-down)
    const s = nm2screen(nx, ny + h, params, W, H);

    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x, s.y, w * sc, h * sc);
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const { x, y, w, h } = node.value;
    const W = ctxMix.W || ctx.canvas.width;
    const H = ctxMix.H || ctx.canvas.height;

    const sc = (params.zoom || 1) / (params.nmPx || 10);
    const s = nm2screen(x, y + h, params, W, H);

    if (pt.x >= s.x && pt.x <= s.x + w * sc &&
        pt.y >= s.y && pt.y <= s.y + h * sc) {
      ctxMix.hitResult = {
        cursor:       node.value,
        nodeRef:      node,
        interactions: ctxMix.flyweight?.interactions
                        ? { ...ctxMix.flyweight.interactions } : {},
      };
    }
  }
}

SYS.NODE_CLASSES.push({ name: 'rect', cls: RectNode });
