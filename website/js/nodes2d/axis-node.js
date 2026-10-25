import { sceneRegistry } from '../omni-support/sys.js';
export { AxisNode };

/* ─────────────────────────────────────────────────────────────────────────────
Chart-specific nodes — each reads dimensions from ctxMix.getWH()
──────────────────────────────────────────────────────────────────────────── */
const AXIS_DEFAULTS = Object.freeze({
  axisColor: '#504838', axisWidth: 1.5, tickLength: 5, tickWidth: 1,
  gridColor: 'rgba(255,255,255,0.04)', gridWidth: 0.5, showGrid: true,
});

class AxisNode {
  static draw2d(ctxMix, node, params) {
    const v = node.value || {}, p = { ...AXIS_DEFAULTS, ...params };
    const { W:cw, H:ch } = ctxMix.getWH();
    const left = -cw / 2, right = cw / 2, top = -ch / 2, bottom = ch / 2;
    const ctx = ctxMix.ctx, tL = p.tickLength || 5;

    ctx.save();
    const tempMin = v.tempMin ?? 0, tempMax = v.tempMax ?? 30, tempStep = v.tempStep ?? 5;
    for (let t = tempMin; t <= tempMax; t += tempStep) {
      const y = bottom - ((t - tempMin) / (tempMax - tempMin)) * ch;
      if (p.showGrid && t > tempMin) {
        ctx.strokeStyle = p.gridColor; ctx.lineWidth = p.gridWidth || 0.5;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      }
      ctx.strokeStyle = p.axisColor; ctx.lineWidth = p.tickWidth || 1;
      ctx.beginPath(); ctx.moveTo(left - tL, y); ctx.lineTo(left, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(right, y); ctx.lineTo(right + tL, y); ctx.stroke();
    }

    const months = v.months || 12, colW = cw / months;
    for (let i = 0; i <= months; i++) {
      const x = left + i * colW;
      ctx.strokeStyle = p.axisColor; ctx.lineWidth = p.tickWidth || 1;
      ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, bottom + tL); ctx.stroke();
      if (i > 0 && i < months && p.showGrid) {
        ctx.strokeStyle = p.gridColor; ctx.lineWidth = p.gridWidth || 0.5;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      }
    }

    ctx.strokeStyle = p.axisColor; ctx.lineWidth = p.axisWidth || 1.5;
    ctx.beginPath();
    ctx.moveTo(left, top); ctx.lineTo(left, bottom);
    ctx.moveTo(left, bottom); ctx.lineTo(right, bottom);
    ctx.moveTo(right, top); ctx.lineTo(right, bottom);
    ctx.stroke();
    ctx.restore();
  }
}
sceneRegistry.registerNodeClass('axis-node', AxisNode);
