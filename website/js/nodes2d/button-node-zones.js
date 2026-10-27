import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { hexToRgb, roundRectPath, shiftColor } from '../2d-support/paint.js';
import { PipKinds } from '../2d-support/pip-kind.js';
import { Values } from '../omni-support/values.js';
export { ButtonNode };

const BUTTON_DEFAULTS = Object.freeze({
  fill:           '#e0ddd4',
  color:          '#2a2a2a',
  cornerRadius:   12,
  borderWidth:    2.5,
  bevel:          1,
  bevelStrength:  0.38,
  lightAngle:     315,
  lightIntensity: 0.55,
  shadowColor:    'rgba(0,0,0,0.28)',
  shadowOffsetX:  2,
  shadowOffsetY:  3,
  shadowBlur:     6,
  fontSize:       32,
  subOffset:      0,
  badgeFill:      '#e74c3c',
  badgeColor:     '#ffffff',
  scale:          1.0,
  liftY:          0.0,
  brightness:     1.0,
  hoverScale:     1.08,
  hoverLift:      -2,
  pressScale:     0.96,
  pressDepth:     1,
});

class ButtonNode {
  static meta = {
    zOrder: 1,
    pipKind: PipKinds.JUNCTION,
    spawnOverrides: (wp) => ({ x: wp.x, y: wp.y, label: 'Btn', sub: '' }),
    editableFields: (node) => [
      { key: 'label', label: 'Label', type: 'text', value: node.value.label || '' },
      { key: 'sub', label: 'Subtext', type: 'text', value: node.value.sub || '' },
      { key: 'badge', label: 'Badge', type: 'number', value: node.value.badge || 0 },
      { key: 'color', label: 'Fill Color', type: 'color', value: node.value.color || BUTTON_DEFAULTS.fill },
      { key: 'fontSize', label: 'Font Size', type: 'number', value: node.value.fontSize || BUTTON_DEFAULTS.fontSize },
      { key: 'cornerRadius', label: 'Corner Radius', type: 'number', value: node.value.cornerRadius || BUTTON_DEFAULTS.cornerRadius },
      { key: 'borderWidth', label: 'Border Width', type: 'number', value: node.value.borderWidth || BUTTON_DEFAULTS.borderWidth },
      { key: 'bevel', label: 'Bevel', type: 'number', value: node.value.bevel ?? BUTTON_DEFAULTS.bevel },
      { key: 'bevelStrength', label: 'Bevel Strength', type: 'number', value: node.value.bevelStrength ?? BUTTON_DEFAULTS.bevelStrength },
      { key: 'scale', label: 'Scale', type: 'number', value: node.value.scale || BUTTON_DEFAULTS.scale },
      { key: 'brightness', label: 'Brightness', type: 'number', value: node.value.brightness ?? BUTTON_DEFAULTS.brightness },
    ],
  };

  static getCentreXY(res, node, params) {
    const v = res.getValue(res, node, params) || {};
    return { x: v.x || 0, y: v.y || 0 };
  }

  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const p = { ...BUTTON_DEFAULTS, ...params };
    const zoom = 1;

    const rawW   = v.width  || 64;
    const rawH   = v.height || 64;
    const sc     = v.scale ?? p.scale ?? 1;
    const w      = rawW * zoom * sc;
    const h      = rawH * zoom * sc;
    const screen = ButtonNode.getCentreXY(ctxMix, node, params);
    const cx     = screen.x;
    const cy     = screen.y + (v.liftY ?? p.liftY ?? 0) * zoom;
    const left   = cx - w / 2;
    const top    = cy - h / 2;
    const r      = (v.cornerRadius ?? p.cornerRadius ?? 0) * zoom * sc;
    const bw     = (v.borderWidth  ?? p.borderWidth  ?? 0) * zoom * sc;

    const fillHex = v.color || p.fill;

    const ctx = ctxMix.ctx;

    if (v.disabled) ctx.globalAlpha *= 0.42;

    if (p.shadowBlur > 0) {
      ctx.save();
      ctx.shadowColor   = p.shadowColor;
      ctx.shadowOffsetX = (p.shadowOffsetX || 0) * zoom;
      ctx.shadowOffsetY = (p.shadowOffsetY || 0) * zoom;
      ctx.shadowBlur    = (p.shadowBlur    || 0) * zoom;
      roundRectPath(ctx, left, top, w, h, r);
      ctx.fillStyle = fillHex;
      ctx.fill();
      ctx.restore();
    }

    const base    = hexToRgb(fillHex);
    const bevel   = p.bevel || 0;
    const bStr    = p.bevelStrength || 0;
    const lInt    = p.lightIntensity || 0;
    const angle   = p.lightAngle || 315;
    const rad     = angle * Math.PI / 180;
    const dx      = Math.sin(rad);
    const dy      = -Math.cos(rad);

    const faceLit = shiftColor(base,  lInt * 0.14 * bevel);
    const faceSh  = shiftColor(base, -lInt * 0.10 * bevel);

    const gx0 = cx + dx * w / 2;
    const gy0 = cy + dy * h / 2;
    const gx1 = cx - dx * w / 2;
    const gy1 = cy - dy * h / 2;

    const faceGrad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    faceGrad.addColorStop(0, faceLit);
    faceGrad.addColorStop(1, faceSh);

    roundRectPath(ctx, left, top, w, h, r);
    ctx.fillStyle = faceGrad;
    ctx.fill();

    if (bevel !== 0 && bStr > 0) {
      const litAmt = bStr * lInt * bevel;
      const hi     = shiftColor(base,  litAmt);
      const lo     = shiftColor(base, -litAmt);
      const edgeW  = bw * 1.4;

      ctx.save();
      roundRectPath(ctx, left, top, w, h, r);
      ctx.clip();

      ctx.strokeStyle = hi;
      ctx.lineWidth   = edgeW;
      roundRectPath(ctx, left + dx * bw * 0.5,
       top  + dy * bw * 0.5, w, h, r);
      ctx.stroke();

      ctx.strokeStyle = lo;
      ctx.lineWidth   = edgeW;
      roundRectPath(ctx, left - dx * bw * 0.5,
       top  - dy * bw * 0.5, w, h, r);
      ctx.stroke();

      ctx.restore();
    }

    if ((p.brightness || 1) < 1.0) {
      roundRectPath(ctx, left, top, w, h, r);
      ctx.fillStyle = `rgba(0,0,0,${(1 - p.brightness).toFixed(3)})`;
      ctx.fill();
    }

    const label = v.label ?? v.emoji ?? v.symbol
    ?? v.name?.substring(0, 2) ?? '';

    if (label) {
      const fSize = (p.fontSize || 32) * zoom * sc;
      ctx.fillStyle    = p.color;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font         = `600 ${fSize.toFixed(1)}px "Hiragino Kaku Gothic Pro", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif`;

      const labelY = v.sub ? cy - h * 0.06 : cy;
      ctx.fillText(label, cx, labelY);
    }

    if (v.sub) {
      const subSize = (p.fontSize || 32) * 0.36 * zoom * sc;
      ctx.fillStyle    = p.color;
      ctx.globalAlpha  = (v.disabled ? 0.42 : 1.0) * 0.65;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font         = `400 ${subSize.toFixed(1)}px "Hiragino Kaku Gothic Pro", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif`;

      const subY = cy + h * 0.22 + (p.subOffset || 0) * zoom;
      ctx.fillText(v.sub, cx, subY);
    }

    if (v.badge != null && v.badge !== '') {
      const badgeR = 10 * zoom;
      const badgeX = left + w - badgeR * 0.4;
      const badgeY = top  - badgeR * 0.4;

      ctx.globalAlpha = v.disabled ? 0.42 : 1.0;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = p.badgeFill || '#e74c3c';
      ctx.fill();

      ctx.fillStyle    = p.badgeColor || '#fff';
      ctx.font         = `700 ${(11 * zoom).toFixed(1)}px system-ui, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(v.badge), badgeX, badgeY + 0.5);
    }

    if (v.selected || v.hovered) {
      ctx.setLineDash([4 * zoom, 4 * zoom]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 2 * zoom;
      roundRectPath(ctx, left - 4 * zoom, top - 4 * zoom,
        w + 8 * zoom, h + 8 * zoom,
        r + 4 * zoom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;

    const v = ctxMix.getValue(ctxMix, node, params) || {};
    if (v.disabled) return;

    const p    = { ...BUTTON_DEFAULTS, ...params };
    const zoom = 1;

    const sc   = p.scale || 1;
    const rawW = v.width  || 64;
    const rawH = v.height || 64;
    const w    = rawW * zoom * sc;
    const h    = rawH * zoom * sc;
    const r    = Math.min((p.cornerRadius || 0) * zoom * sc, w / 2, h / 2);

    const screen = ButtonNode.getCentreXY(ctxMix, node, params);
    const sx   = screen.x;
    const sy   = screen.y + (p.liftY || 0) * zoom;
    const left = sx - w / 2;
    const top  = sy - h / 2;

    if (pt.x < left || pt.x > left + w ||
      pt.y < top  || pt.y > top  + h) return;

      const lx = pt.x - left;
    const ly = pt.y - top;
    if (lx < r && ly < r && (lx - r) ** 2 + (ly - r) ** 2 > r * r) return;
    if (lx > w - r && ly < r && (lx - (w - r)) ** 2 + (ly - r) ** 2 > r * r) return;
    if (lx < r && ly > h - r && (lx - r) ** 2 + (ly - (h - r)) ** 2 > r * r) return;
    if (lx > w - r && ly > h - r && (lx - (w - r)) ** 2 + (ly - (h - r)) ** 2 > r * r) return;

    const dxHit = pt.x - sx;
    const dyHit = pt.y - sy;

    ctxMix.hitResult = {
      node,
      interactions: {
        applyDrag(wx, wy) {
          Values.setValue(Values, node, params, { x: wx - dxHit, y: wy - dyHit });
          return node;
        },
      },
    };
  }
}

SYS.NODE_CLASSES.push({ name: 'button-node', cls: ButtonNode });;
