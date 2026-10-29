import { SYS } from '../omni-support/sys.js';
import { nm2screen, viewBounds } from '../2d-support/nm-coords.js';
export { GridBgNode };

// `grid-bg` — the mask editor's background: a dark fill, an nm grid whose spacing adapts to the zoom, a finer snap grid, and the origin crosshair

class GridBgNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const W = ctxMix.W || ctx.canvas.width;
    const H = ctxMix.H || ctx.canvas.height;
    const sc = (params.zoom || 1) / (params.nmPx || 10);

    // Clear
    ctx.fillStyle = '#080c16';
    ctx.fillRect(0, 0, W, H);

    // Skip if too zoomed out
    const nmPx = (params.nmPx || 10) / (params.zoom || 1);
    if (nmPx > 50) return;

    // Adaptive grid spacing
    let g = 100;
    for (const c of [10, 20, 50, 100, 200, 500, 1000]) {
      if (c * sc > 30) { g = c; break; }
    }

    const vb = viewBounds(params, W, H);
    const x0 = Math.floor(vb.xMin / g) * g;
    const x1 = Math.ceil(vb.xMax / g) * g;
    const y0 = Math.floor(vb.yMin / g) * g;
    const y1 = Math.ceil(vb.yMax / g) * g;

    // Major grid
    ctx.strokeStyle = '#ffffff08';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += g) {
      const p = nm2screen(x, 0, params, W, H);
      ctx.moveTo(p.x, 0); ctx.lineTo(p.x, H);
    }
    for (let y = y0; y <= y1; y += g) {
      const p = nm2screen(0, y, params, W, H);
      ctx.moveTo(0, p.y); ctx.lineTo(W, p.y);
    }
    ctx.stroke();

    // Snap grid (finer)
    const snap = params.snap || 1000;
    if (snap * sc > 8) {
      ctx.strokeStyle = '#ffffff06';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const sx0 = Math.floor(vb.xMin / snap) * snap;
      const sx1 = Math.ceil(vb.xMax / snap) * snap;
      const sy0 = Math.floor(vb.yMin / snap) * snap;
      const sy1 = Math.ceil(vb.yMax / snap) * snap;
      for (let x = sx0; x <= sx1; x += snap) {
        const p = nm2screen(x, 0, params, W, H);
        ctx.moveTo(p.x, 0); ctx.lineTo(p.x, H);
      }
      for (let y = sy0; y <= sy1; y += snap) {
        const p = nm2screen(0, y, params, W, H);
        ctx.moveTo(0, p.y); ctx.lineTo(W, p.y);
      }
      ctx.stroke();
    }

    // Origin crosshair
    const o = nm2screen(0, 0, params, W, H);
    ctx.strokeStyle = '#ffffff18';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(o.x, 0); ctx.lineTo(o.x, H);
    ctx.moveTo(0, o.y); ctx.lineTo(W, o.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffffff50';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o.x - 6, o.y); ctx.lineTo(o.x + 6, o.y);
    ctx.moveTo(o.x, o.y - 6); ctx.lineTo(o.x, o.y + 6);
    ctx.stroke();
  }
}

SYS.NODE_CLASSES.push({ name: 'grid-bg', cls: GridBgNode });
