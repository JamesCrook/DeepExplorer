import { sceneRegistry } from '../omni-support/sys.js';
export { LineChartNode };
import { LINE_DEFAULTS } from './line-dot-node.js';
class LineChartNode {
  static _points(v, ctxMix) {
    const data = v.data || [], n = data.length, tMin = v.tempMin ?? 0, tMax = v.tempMax ?? 30;
    const { W:cw, H:ch } = ctxMix.getWH();
    const left = -cw / 2, bottom = ch / 2, colW = cw / n, pts = [];
    for (let i = 0; i < n; i++) pts.push({ x: left + (i + 0.5) * colW, y: bottom - ((data[i] - tMin) / (tMax - tMin)) * ch });
      return pts;
  }

  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const p = { ...LINE_DEFAULTS, ...params }, pts = LineChartNode._points(v, ctxMix);
    if (!pts.length) return;

    const hi = !!(v.selected || v.hovered), sm = p.smooth || 0;
    const ctx = ctxMix.ctx;
    ctx.save(); ctx.strokeStyle = hi ? (p.lineColorHi || p.lineColor) : p.lineColor;
    ctx.lineWidth = p.lineWidth || 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();

    if (sm > 0 && pts.length > 2) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
        const cp1x = p1.x + (p2.x - p0.x) * sm, cp1y = p1.y + (p2.y - p0.y) * sm;
        const cp2x = p2.x - (p3.x - p1.x) * sm, cp2y = p2.y - (p3.y - p1.y) * sm;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
    } else {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    }
  ctx.stroke();
  ctx.restore();
}
}
sceneRegistry.registerNodeClass('line-chart-node', LineChartNode);
