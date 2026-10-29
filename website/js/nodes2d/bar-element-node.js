import { SYS, sceneRegistry } from '../omni-support/sys.js';
export { BarElementNode, BAR_DEFAULTS };

// `bar-element` — one bar of a bar chart, hit-testable

const BAR_DEFAULTS = Object.freeze({
  barFill: '#4a90c4', barFillHi: '#6ab0e8', barOpacity: 0.72, barGap: 0.28,
  barRadius: 3, barStroke: 'rgba(90,160,220,0.25)', barStrokeW: 1,
});

class BarElementNode {
  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    if (!v) return;

    const p = { ...BAR_DEFAULTS, ...params };
    const ctx = ctxMix.ctx;
    const br = Math.min(p.barRadius || 0, v.bw / 2);

    ctx.save();
    ctx.globalAlpha *= (p.barOpacity || 0.72);
    ctx.fillStyle = v.isHi ? (p.barFillHi || p.barFill) : p.barFill;

    if (br > 0 && v.bh > br) {
      ctx.beginPath(); ctx.moveTo(v.bx, v.bottom); ctx.lineTo(v.bx, v.by + br);
      ctx.arcTo(v.bx, v.by, v.bx + br, v.by, br); ctx.lineTo(v.bx + v.bw - br, v.by);
      ctx.arcTo(v.bx + v.bw, v.by, v.bx + v.bw, v.by + br, br); ctx.lineTo(v.bx + v.bw, v.bottom);
      ctx.closePath(); ctx.fill();
    } else { 
      ctx.fillRect(v.bx, v.by, v.bw, v.bh); 
    }

    if (p.barStroke) {
      ctx.strokeStyle = p.barStroke; ctx.lineWidth = p.barStrokeW || 1;
      if (br > 0 && v.bh > br) ctx.stroke();
    }
    ctx.restore();
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const v = ctxMix.getValue(ctxMix, node, params);
    if (!v) return;

    if (pt.x >= v.bx && pt.x <= v.bx + v.bw && pt.y >= v.by && pt.y <= v.bottom) {
      ctxMix.hitResult = { node: v.originalNode, interactions: {} };
    }
  }
}
SYS.NODE_CLASSES.push({ name: 'bar-element', cls: BarElementNode });;
