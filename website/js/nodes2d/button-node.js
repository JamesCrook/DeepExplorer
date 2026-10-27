/**
 * button-node.js
 *
 * Canvas scene-graph node: flexible bevelled button.
 * Follows the DragPointNode pattern from omni-scene-nodes.js.
 *
 * node.value — instance data: x, y, width, height, label, sub, badge, disabled, color
 * ctxMix     — context bag:   ctx, hitPoint, W, H, highlighted, …
 * params     — style/anim:    all visual knobs (layer-level); zoom, panX, panY
 */

import { SYS } from '../omni-support/sys.js';
import { hexToRgb, roundRectPath, shiftColor } from '../2d-support/paint.js';

// ── helpers ─────────────────────────────────────────────────

function scaleFontString(fontStr, factor) {
  return fontStr.replace(/(\d+(?:\.\d+)?)(px|pt|em|rem)/,
    (_, size, unit) => `${(parseFloat(size) * factor).toFixed(1)}${unit}`);
}

// ── Defaults (merged under layer params) ────────────────────

const DEFAULTS = Object.freeze({
  // surface
  fill:           '#e0ddd4',
  color:          '#2a2a2a',
  cornerRadius:   12,
  borderWidth:    2.5,

  // bevel: 1 = raised, -1 = inset, 0 = flat
  bevel:          1,
  bevelStrength:  0.38,

  // directional light (degrees, 0 = top, clockwise)
  lightAngle:     315,
  lightIntensity: 0.55,

  // drop shadow
  shadowColor:    'rgba(0,0,0,0.28)',
  shadowOffsetX:  2,
  shadowOffsetY:  3,
  shadowBlur:     6,

  // typography
  fontSize:       32,
  subOffset:      0,

  // badge
  badgeFill:      '#e74c3c',
  badgeColor:     '#ffffff',

  // interaction targets (animated by scene tween system)
  scale:          1.0,
  liftY:          0.0,
  brightness:     1.0,

  // hover/press reference values (for external tween targets)
  hoverScale:     1.08,
  hoverLift:      -2,
  pressScale:     0.96,
  pressDepth:     1,
});

// ── ButtonNode ──────────────────────────────────────────────

class ButtonNode {

  static draw2d(ctxMix, node, params) {
    const T = ctxMix.T;
    if (!T) return;

    const v = node.value || {};
    const p = { ...DEFAULTS, ...params };
    const zoom = T.sx;              // ← zoom from T, not params

    // ── geometry (centre-based) ──────────────────────────
    const rawW   = v.width  || 64;
    const rawH   = v.height || 64;
    const sc     = (p.scale || 1);
    const w      = rawW * zoom * sc;
    const h      = rawH * zoom * sc;
    const screen = T.toScreen({ x: v.x || 0, y: v.y || 0 });
    const cx     = screen.x;
    const cy     = screen.y + (p.liftY || 0) * zoom;
    const left   = cx - w / 2;
    const top    = cy - h / 2;
    const r      = (p.cornerRadius || 0) * zoom * sc;
    const bw     = (p.borderWidth  || 0) * zoom * sc;

    const fillHex = v.color || p.fill;

    const ctx = ctxMix.directCtx(); // ← screen-space drawing

    // ── disabled opacity ─────────────────────────────────
    if (v.disabled) ctx.globalAlpha *= 0.42;

    // ── drop shadow ──────────────────────────────────────
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

    // ── face gradient (directional light) ────────────────
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

    // ── bevel edges ──────────────────────────────────────
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

    // ── brightness overlay (press darkening) ─────────────
    if ((p.brightness || 1) < 1.0) {
      roundRectPath(ctx, left, top, w, h, r);
      ctx.fillStyle = `rgba(0,0,0,${(1 - p.brightness).toFixed(3)})`;
      ctx.fill();
    }

    // ── main label ───────────────────────────────────────
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

    // ── sub-label (reading / furigana) ───────────────────
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

    // ── badge ────────────────────────────────────────────
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

    // ── selection highlight ──────────────────────────────
    if (ctxMix.highlighted?.has(node)) {
      ctx.setLineDash([4 * zoom, 4 * zoom]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 2 * zoom;
      roundRectPath(ctx, left - 4 * zoom, top - 4 * zoom,
                    w + 8 * zoom, h + 8 * zoom,
                    r + 4 * zoom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();                  // ← balances directCtx()
  }

  // ── hit test + drag — uses T ──────────────────────────────

  static hit_test(ctxMix, node, params) {
    // Compared with T.toScreen, so it must be the screen point.  An enclosing
    // container may have rewritten ctxMix.hitPoint into its own local space
    // (handle-frame does, for its content); SceneRootNode keeps the original.
    const pt = ctxMix.screenHitPoint ?? ctxMix.hitPoint;
    const T  = ctxMix.T;
    if (!pt || !T) return;

    const v = node.value || {};
    if (v.disabled) return;

    const p    = { ...DEFAULTS, ...params };
    const zoom = T.sx;

    const sc   = p.scale || 1;
    const rawW = v.width  || 64;
    const rawH = v.height || 64;
    const w    = rawW * zoom * sc;
    const h    = rawH * zoom * sc;
    const r    = Math.min((p.cornerRadius || 0) * zoom * sc, w / 2, h / 2);

    const screen = T.toScreen({ x: v.x || 0, y: v.y || 0 });
    const sx   = screen.x;
    const sy   = screen.y + (p.liftY || 0) * zoom;
    const left = sx - w / 2;
    const top  = sy - h / 2;

    // AABB reject
    if (pt.x < left || pt.x > left + w ||
        pt.y < top  || pt.y > top  + h) return;

    // corner-radius precision
    const lx = pt.x - left;
    const ly = pt.y - top;
    if (lx < r && ly < r && (lx - r) ** 2 + (ly - r) ** 2 > r * r) return;
    if (lx > w - r && ly < r && (lx - (w - r)) ** 2 + (ly - r) ** 2 > r * r) return;
    if (lx < r && ly > h - r && (lx - r) ** 2 + (ly - (h - r)) ** 2 > r * r) return;
    if (lx > w - r && ly > h - r && (lx - (w - r)) ** 2 + (ly - (h - r)) ** 2 > r * r) return;

    const dxHit = pt.x - sx;
    const dyHit = pt.y - sy;
    const Ts = T.clone();

    ctxMix.hitResult = {
      node,
      interactions: {
        applyDrag(screenX, screenY) {
          const local = Ts.toLocal({ x: screenX - dxHit, y: screenY - dyHit });
          node.value.x = local.x;
          node.value.y = local.y;
        },
      },
    };
  }
}

SYS.NODE_CLASSES.push({ name: 'button-node', cls: ButtonNode });

export { ButtonNode };