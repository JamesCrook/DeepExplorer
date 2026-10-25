import { sceneRegistry } from '../omni-support/sys.js';
export { LineDotNode, LINE_DEFAULTS };

const LINE_DEFAULTS = Object.freeze({
  lineColor: '#e05040', lineColorHi: '#ff7860', lineWidth: 2.5, dotRadius: 4.5,
  dotFill: '#e05040', dotFillHi: '#ff7860', dotStroke: '#1a1a16', dotStrokeWidth: 2,
  hitRadius: 12, smooth: 0.22,
});

class LineDotNode {
  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    if (!v) return;

    const p = { ...LINE_DEFAULTS, ...params };
    const ctx = ctxMix.ctx;

    ctx.beginPath(); ctx.arc(v.x, v.y, p.dotRadius || 4.5, 0, Math.PI * 2);
    ctx.fillStyle = v.isHi ? (p.dotFillHi || p.dotFill) : p.dotFill; 
    ctx.fill();

    ctx.strokeStyle = p.dotStroke; ctx.lineWidth = p.dotStrokeWidth || 2; 
    ctx.stroke();
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const v = ctxMix.getValue(ctxMix, node, params);
    if (!v) return;

    const p = { ...LINE_DEFAULTS, ...params };
    const hr = p.hitRadius || 12;
    const dx = pt.x - v.x, dy = pt.y - v.y;

    if (dx * dx + dy * dy <= hr * hr) { 
      ctxMix.hitResult = { node: v.originalNode, interactions: {} }; 
    }
  }
}
sceneRegistry.registerNodeClass('line-dot-element', LineDotNode);
