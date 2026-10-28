import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { roundRectPath } from '../2d-support/paint.js';
import { hexToRgb, shiftColor } from '../colour/colour.js';
import { PipKinds } from '../2d-support/pip-kind.js';
import { Values } from '../omni-support/values.js';
export { BTN_DEFAULTS, PippedButtonNode };

const BTN_DEFAULTS = Object.freeze({
  fill:          '#e0ddd4', textColor:     '#2a2a2a',
  cornerRadius:  6,         borderWidth:   1.5,
  bevel:         1,         bevelStrength: 0.38,
  lightAngle:    315,       lightIntensity:0.55,
  shadowColor:   'rgba(0,0,0,0.28)', shadowOffsetX: 1, shadowOffsetY: 1.5,
  shadowBlur:    3,         fontSize:      11,
});

class PippedButtonNode {
  static meta = {
    zOrder: 1,
    pipKind: PipKinds.TILE,
    coneParams: () => ({ n: 4, tilt: Math.PI / 4 }),
    spawnOverrides: (wp) => ({ x: wp.x, y: wp.y, width: 70, height: 42, label: 'Btn', sub: '', color: '#e0ddd4' }),
    editableFields: (node) => [
      { key: 'label', label: 'Label', type: 'text', value: node.value.label || '' },
      { key: 'sub',   label: 'Subtitle', type: 'text', value: node.value.sub || '' },
      { key: 'color', label: 'Color', type: 'color', value: node.value.color || BTN_DEFAULTS.fill },
    ],
  };
  static getCentreXY(res, node, params) {
    const v = res.getValue(res, node, params) || {};
    return { x: v.x || 0, y: v.y || 0 };
  }
  static getPips(res, node, params) {
    const v = res.getValue(res, node, params);
    const w = v.width || 70, h = v.height || 42, hw = w / 2, hh = h / 2;
    const x = v.x || 0, y = v.y || 0;
    return [
      { x, y: y - hh, out: -Math.PI/2 },
      { x: x + hw, y, out: 0 },
      { x, y: y + hh, out: Math.PI/2 },
      { x: x - hw, y, out: Math.PI }
    ];
  }
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx, v = ctxMix.getValue(ctxMix, node, params), p = BTN_DEFAULTS;
    const w = v.width || 70, h = v.height || 42;
    const {x: cx, y: cy} = PippedButtonNode.getCentreXY(ctxMix, node, params);
    const left = cx - w / 2, top = cy - h / 2, cr = p.cornerRadius;
    const bw = p.borderWidth, fillHex = v.color || p.fill, base = hexToRgb(fillHex);

    ctx.save(); ctx.shadowColor = p.shadowColor; ctx.shadowOffsetX = p.shadowOffsetX;
    ctx.shadowOffsetY = p.shadowOffsetY; ctx.shadowBlur = p.shadowBlur;
    roundRectPath(ctx, left, top, w, h, cr);
    ctx.fillStyle = fillHex; ctx.fill(); ctx.restore();

    const angle = p.lightAngle * Math.PI / 180, dx = Math.sin(angle), dy = -Math.cos(angle);
    const faceLit = shiftColor(base, p.lightIntensity * 0.14 * p.bevel), faceSh = shiftColor(base, -p.lightIntensity * 0.10 * p.bevel);
    const fGrad = ctx.createLinearGradient(cx + dx * w / 2, cy + dy * h / 2, cx - dx * w / 2, cy - dy * h / 2);
    fGrad.addColorStop(0, faceLit); fGrad.addColorStop(1, faceSh);
    roundRectPath(ctx, left, top, w, h, cr);
    ctx.fillStyle = fGrad; ctx.fill();

    if (p.bevel > 0 && p.bevelStrength > 0) {
      const litAmt = p.bevelStrength * p.lightIntensity * p.bevel;
      const hi = shiftColor(base, litAmt), lo = shiftColor(base, -litAmt), edgeW = bw * 1.4;
      ctx.save(); roundRectPath(ctx, left, top, w, h, cr); ctx.clip();
      ctx.strokeStyle = hi; ctx.lineWidth = edgeW; roundRectPath(ctx, left + dx * bw * 0.5, top + dy * bw * 0.5, w, h, cr); ctx.stroke();
      ctx.strokeStyle = lo; ctx.lineWidth = edgeW; roundRectPath(ctx, left - dx * bw * 0.5, top - dy * bw * 0.5, w, h, cr); ctx.stroke();
      ctx.restore();
    }

    const label = v.label ?? '';
    if (label) {
      ctx.fillStyle = p.textColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${p.fontSize}px system-ui, sans-serif`; ctx.fillText(label, cx, v.sub ? cy - h * 0.06 : cy);
    }
    if (v.sub) {
      ctx.fillStyle = p.textColor; ctx.globalAlpha = 0.6; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `400 ${p.fontSize * 0.4}px system-ui, sans-serif`; ctx.fillText(v.sub, cx, cy + h * 0.22); ctx.globalAlpha = 1;
    }

    if (v.selected || v.hovered) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      roundRectPath(ctx, left - 4, top - 4, w + 8, h + 8, cr + 4);
      ctx.stroke(); ctx.setLineDash([]);
    }
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const v = ctxMix.getValue(ctxMix, node, params), w = v.width || 70, h = v.height || 42;
    const {x, y} = PippedButtonNode.getCentreXY(ctxMix, node, params);
    const left = x - w / 2, top = y - h / 2;
    if (pt.x < left || pt.x > left + w || pt.y < top || pt.y > top + h) return;

    const cr = BTN_DEFAULTS.cornerRadius, lx = pt.x - left, ly = pt.y - top;
    if (lx < cr && ly < cr && (lx - cr) ** 2 + (ly - cr) ** 2 > cr * cr) return;
    if (lx > w - cr && ly < cr && (lx - (w - cr)) ** 2 + (ly - cr) ** 2 > cr * cr) return;
    if (lx < cr && ly > h - cr && (lx - cr) ** 2 + (ly - (h - cr)) ** 2 > cr * cr) return;
    if (lx > w - cr && ly > h - cr && (lx - (w - cr)) ** 2 + (ly - (h - cr)) ** 2 > cr * cr) return;

    const dx = pt.x - x, dy = pt.y - y;
    ctxMix.hitResult = { node, interactions: {
      applyDrag(wx, wy) { Values.setValue(Values, node, params, { x: wx - dx, y: wy - dy }); },
    } };
  }
}
SYS.STOCK?.push( SYS.makeNode('pipped-button-node',    { x: 0, y: 0, width: 40, height: 24, label: 'Button', sub: '', color: '#e0ddd4' }))

SYS.NODE_CLASSES.push({ name: 'pipped-button-node', cls: PippedButtonNode });;
