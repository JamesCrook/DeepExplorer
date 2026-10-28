import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { hexToRgba } from '../colour/colour.js';
import { PipKinds } from '../2d-support/pip-kind.js';
import { Values } from '../omni-support/values.js';
export { WordNode };
function measureWord(ctx, text, font) {
  ctx.font = font;
  ctx.textBaseline = 'alphabetic'; // <-- Add this line to fix the offset

  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent  || m.emHeightAscent  || 0;
  const dsc = m.actualBoundingBoxDescent || m.emHeightDescent || 0;

  return { width: m.width, ascent: asc, descent: dsc, height: asc + dsc };
}

const WORD_DEFAULTS = Object.freeze({
  fontFamily:     '"Inter", "Helvetica Neue", system-ui, sans-serif',
  fontSize:       28,
  fontWeight:     700,
  color:          '#e4dac6',
  opacity:        1.0,
  rotation:       0,
  haloColor:      '#000000',
  haloWidth:      0,
  haloOpacity:    0.35,
  highlightFill:  'rgba(255,255,255,0.06)',
  highlightPad:   6,
  highlightRadius: 4,
  scale:          1.0,
});

class WordNode {
// New Style: Metadata tells the system how to interact with this node
  static meta = {
    pipKind: PipKinds.JUNCTION,
    zOrder: 1,
    spawnOverrides: (wp) => ({ x: wp.x, y: wp.y, text: 'word' }),
    editableFields: (node) => [
      { key: 'text', label: 'Text', type: 'text', value: node.value.text || '' },
      { key: 'fontSize', label: 'Size', type: 'number', value: node.value.fontSize || WORD_DEFAULTS.fontSize },
      { key: 'rotation', label: 'Rotation', type: 'number', value: node.value.rotation || WORD_DEFAULTS.rotation },
      { key: 'color', label: 'Color', type: 'color', value: node.value.color || WORD_DEFAULTS.color },
    ],
  };

  static getCentreXY(res, node, params) {
    const v = res.getValue(res, node, params) || {};
    return { x: v.x || 0, y: v.y || 0 };
  }

  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const p = { ...WORD_DEFAULTS, ...params };
    const text = v.text || '';
    if (!text) return;

// New Style: Zoom is handled naturally by the Camera context scale. 
// We no longer multiply fSize by zoom.
    const sc      = (p.scale || 1) * (v.scale || 1);
    const fSize   = (v.fontSize || p.fontSize) * sc;
    const weight  = v.fontWeight || p.fontWeight;
    const family  = v.fontFamily || p.fontFamily;
    const font    = `${weight} ${fSize.toFixed(1)}px ${family}`;
    const rot     = (v.rotation != null ? v.rotation : p.rotation) * Math.PI / 180;
    const opacity = (v.opacity != null ? v.opacity : p.opacity);

// Position is one field of the value like any other, read through the channel.
    const { x: cx, y: cy } = WordNode.getCentreXY(ctxMix, node, params);
    const ctx = ctxMix.ctx;

    ctx.save();
    ctx.globalAlpha *= opacity;
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);

    const meas = measureWord(ctx, text, font);

// ── highlight box behind selected words ──
    if (v.selected || v.hovered) {
    const pad = (p.highlightPad || 0); // No zoom multiplier needed
    const hr  = (p.highlightRadius || 0);
    const hx  = -meas.width / 2 - pad;
    const hy  = -meas.ascent - pad;
    const hw  = meas.width + pad * 2;
    const hh  = meas.height + pad * 2;
    
    ctx.fillStyle = p.highlightFill;
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh, hr); ctx.fill();
    } else {
      ctx.fillRect(hx, hy, hw, hh);
    }

    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = 1.5;
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh, hr); ctx.stroke();
    } else {
      ctx.strokeRect(hx, hy, hw, hh);
    }
    ctx.setLineDash([]);
  }

  // ── halo / outline ──
  const haloW = (v.haloWidth != null ? v.haloWidth : p.haloWidth) * sc;
  if (haloW > 0) {
    ctx.strokeStyle = hexToRgba(
      v.haloColor || p.haloColor,
      v.haloOpacity != null ? v.haloOpacity : p.haloOpacity
      );
    ctx.lineWidth   = haloW;
    ctx.lineJoin    = 'round';
    ctx.font        = font;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.strokeText(text, 0, 0);
  }

  // ── text fill ──
  ctx.fillStyle    = v.color || p.color;
  ctx.font         = font;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 0, 0);

  ctx.restore();
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;

    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const text = v.text || '';
    if (!text) return;

    const p = { ...WORD_DEFAULTS, ...params };
    const sc = (p.scale || 1) * (v.scale || 1);
    const fSize = (v.fontSize || p.fontSize) * sc;
    const weight = v.fontWeight || p.fontWeight;
    const family = v.fontFamily || p.fontFamily;
    const font = `${weight} ${fSize.toFixed(1)}px ${family}`;
    const rot = (v.rotation != null ? v.rotation : p.rotation) * Math.PI / 180;

  // No screen conversion needed: pt is already in world space.
    const { x: cx, y: cy } = WordNode.getCentreXY(ctxMix, node, params);

  // Transform hit point into the word's local frame
    let lx = pt.x - cx;
    let ly = pt.y - cy;
    if (rot) {
      const cos = Math.cos(-rot), sin = Math.sin(-rot);
      const rx = lx * cos - ly * sin;
      const ry = lx * sin + ly * cos;
      lx = rx; ly = ry;
    }

    const ctx = ctxMix.ctx;
    const meas = measureWord(ctx, text, font);
    const pad = 4;
    const halfW = meas.width / 2 + pad;
    const top = -meas.ascent - pad;
    const bot = meas.descent + pad;

    if (lx < -halfW || lx > halfW || ly < top || ly > bot) return;

    const dxHit = pt.x - cx;
    const dyHit = pt.y - cy;

  // New Style: Pass world coordinates directly in applyDrag
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

SYS.NODE_CLASSES.push({ name: 'word-node', cls: WordNode });;
