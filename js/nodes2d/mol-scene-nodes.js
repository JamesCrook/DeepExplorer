/**
 * mol-scene-nodes.js
 *
 * Scene nodes for molecular animation components.
 * Each biological component is a registered node type.
 *
 * All nodes read entity state from ctxMix.runtime.ents
 * (set by animate-scene's before_draw2d).
 *
 * Node types:
 *   animate-scene     — sets up translate + scale for children
 *   porphyrin-plane   — horizontal bar with gap for Fe
 *   fe-atom           — iron atom with radial glow
 *   o2-molecule       — dioxygen (two circles)
 *   his-lever         — His F8 lever arm
 *   salt-bridge       — Asp ↔ His146 with break detection
 *   chain-block       — tilting protein chain block
 *   binding-arrow     — Fe displacement indicator
 *   proton-channel    — F₀ ring with travelling protons
 *   gamma-shaft       — γ subunit with twist lines
 *   f1-barrel         — F₁ head with rotating coloured stripes
 *   rotation-arrow    — curved arrow indicator
 */

import { sceneRegistry } from '../omni-support/scene.js';
import { drawLabel, drawArrow, drawCircle, drawRoundRect, drawDashedLine }
  from '../2d-support/mol-primitives.js';


// ═══════════════════════════════════════════════════════
//  ANIMATE-SCENE — transform wrapper
// ═══════════════════════════════════════════════════════
//
// node.value = { originX, originY, refW, refH }
// Sets up ctx.translate + ctx.scale so children draw
// in a normalised coordinate space.

class AnimateSceneNode {
  static before_measure(ctxMix, node, params) {
    const cfg = node.value || {};
    const refW = cfg.refW || 620;
    const refH = cfg.refH || 500;
    node.box = {
      width()  { return refW; },
      height() { return refH; },
      clone()  { return { width: this.width, height: this.height, clone: this.clone }; },
    };
  }

  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const cfg = node.value || {};
    const refW = cfg.refW || 620;
    const refH = cfg.refH || 500;
    const dpr = window.devicePixelRatio || 1;
    const W = ctxMix.W ?? ctx.canvas.width / dpr;
    const H = ctxMix.H ?? ctx.canvas.height / dpr;
    const sc = Math.min(W / refW, H / refH);
    const ox = cfg.originX ?? 0.48;
    const oy = cfg.originY ?? 0.38;

    ctx.save();
    // Only clear when we own the full canvas (not inside handle-frame)
    if (!ctxMix.contentScale || ctxMix.contentScale === 1) {
      ctx.clearRect(0, 0, W, H);
    }
    ctx.translate(W * ox - (refW / 2) * sc * ox * 2,
                  H * oy - (refH / 2) * sc * oy * 2);
    ctx.scale(sc, sc);

    // Make runtime entities available to children
    ctxMix.runtime = params._runtime || null;
    ctxMix.ents = ctxMix.runtime?.ents || {};
  }

  static after_draw2d(ctxMix, node, params) {
    if (ctxMix.ctx) ctxMix.ctx.restore();
  }
}

sceneRegistry.registerNodeClass('animate-scene', AnimateSceneNode);


// ═══════════════════════════════════════════════════════
//  HAEMOGLOBIN COMPONENTS
// ═══════════════════════════════════════════════════════

// ── Porphyrin plane ──────────────────────────────────

class PorphyrinPlaneNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const cfg = node.value || {};
    const cx = cfg.cx ?? 300, y = cfg.y ?? 168;
    const length = cfg.length ?? 380, gapWidth = cfg.gapWidth ?? 60;
    const lw = cfg.lineWidth ?? 5;
    const color = cfg.color ?? '#3d6b80';
    const capColor = cfg.capColor ?? '#4a90a8';

    const halfLen = length / 2, halfGap = gapWidth / 2;
    const x0 = cx - halfLen, x1 = cx - halfGap;
    const x2 = cx + halfGap, x3 = cx + halfLen;

    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y);
    ctx.moveTo(x2, y); ctx.lineTo(x3, y); ctx.stroke();

    for (const px of [x0, x1, x2, x3]) {
      drawCircle(ctx, { x: px, y, r: 4, fill: capColor });
    }
    drawLabel(ctx, cx + halfLen * 0.55, y - 20, cfg.label ?? 'porphyrin plane', color, 10);
  }
}

sceneRegistry.registerNodeClass('porphyrin-plane', PorphyrinPlaneNode);


// ── Fe atom ──────────────────────────────────────────

class FeAtomNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const e = ctxMix.ents;
    if (!ctx || !e?.Fe) return;

    const { x, y, r } = e.Fe;
    const bound = !!e.O2?.bound;
    const glowColor = bound ? '#c07030' : '#a06020';
    drawCircle(ctx, { x, y, r, fill: '#c07830', stroke: '#e0a060', strokeWidth: 1.5,
                      glowRadius: r * 2.5, glowColor });
    drawLabel(ctx, x, y + 1, 'Fe²⁺', '#fff', 9);
  }
}

sceneRegistry.registerNodeClass('fe-atom', FeAtomNode);


// ── O₂ molecule ──────────────────────────────────────

class O2MoleculeNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const e = ctxMix.ents;
    if (!ctx || !e?.O2) return;

    const o2x = e.O2.bound ? e.Fe.x : e.O2.x;
    const o2y = e.O2.bound ? e.Fe.y - e.Fe.r - 14 : e.O2.y;
    const sep = 10, r = 7;

    drawCircle(ctx, { x: o2x, y: o2y, r, fill: '#e04040' });
    drawCircle(ctx, { x: o2x + sep / 2, y: o2y - 0.86 * sep, r, fill: '#cc3535' });
    drawLabel(ctx, o2x - 10, o2y - r - 7, 'O₂', '#ff6666', 10);
  }
}

sceneRegistry.registerNodeClass('o2-molecule', O2MoleculeNode);


// ── His F8 lever ─────────────────────────────────────

class HisLeverNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const e = ctxMix.ents;
    if (!ctx || !e?.Fe || !e?.His) return;

    const pivotX = e.Fe.x, pivotY = e.Fe.y;
    const angleDeg = e.His.ang;
    const length = 90, knobR = 7;
    const active = angleDeg > -39;
    const color = active ? '#e89040' : '#667788';

    const rad = angleDeg * Math.PI / 180;
    const tipX = pivotX + Math.sin(rad) * length;
    const tipY = pivotY + Math.cos(rad) * length;

    ctx.strokeStyle = color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(pivotX, pivotY); ctx.lineTo(tipX, tipY); ctx.stroke();

    drawCircle(ctx, { x: tipX, y: tipY, r: knobR, fill: active ? '#e89040' : '#556677' });
    drawLabel(ctx, tipX + (angleDeg < -10 ? -22 : 18), tipY,
             'His F8', active ? '#e8a050' : '#667788', 11);
  }
}

sceneRegistry.registerNodeClass('his-lever', HisLeverNode);


// ── Salt bridge ──────────────────────────────────────

class SaltBridgeNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const e = ctxMix.ents;
    if (!ctx || !e?.Asp || !e?.His146) return;

    const ax = e.Asp.x, ay = e.Asp.y;
    const bx = e.His146.x, by = e.His146.y;
    const r = 10, breakDist = 80;
    const dist = Math.abs(bx - ax);
    const broken = dist > breakDist;
    const bondColor = broken ? '#e06050' : '#5577aa';
    const labelColor = broken ? '#e06050' : '#6688aa';
    const midX = (ax + bx) / 2;

    if (!broken) {
      drawDashedLine(ctx, { x1: ax, y1: ay, x2: bx, y2: by, color: '#6688aa' });
      drawLabel(ctx, midX, ay - 16, 'salt bridge', '#5577aa', 9);
    } else {
      drawLabel(ctx, midX, ay - 16, 'broken!', '#e06050', 9);
    }

    drawCircle(ctx, { x: ax, y: ay, r, fill: bondColor });
    drawLabel(ctx, ax, ay + r + 12, 'Asp', labelColor, 10);
    drawCircle(ctx, { x: bx, y: by, r, fill: bondColor });
    drawLabel(ctx, bx, by + r + 12, 'His 146', labelColor, 10);
  }
}

sceneRegistry.registerNodeClass('salt-bridge', SaltBridgeNode);


// ── Chain block ──────────────────────────────────────

class ChainBlockNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const e = ctxMix.ents;
    if (!ctx || !e?.ChB) return;
    const cfg = node.value || {};
    const x = cfg.x ?? 530, y = cfg.y ?? 250;
    const tilt = e.ChB.tilt;
    const active = tilt > 3;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt * Math.PI / 180);
    drawRoundRect(ctx, { x: 0, y: 0, w: 40, h: 180,
      fill: active ? '#4a6a9a' : '#334466', stroke: '#4a6a9a' });
    drawLabel(ctx, 0, 0, cfg.label ?? 'Chain B', '#8baabe', 10);
    ctx.restore();
  }
}

sceneRegistry.registerNodeClass('chain-block', ChainBlockNode);


// ── Binding arrow (Fe displacement indicator) ────────

class BindingArrowNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const e = ctxMix.ents;
    if (!ctx || !e?.O2 || !e?.Fe) return;
    if (e.O2.bound && e.Fe.y > 170) {
      drawArrow(ctx, e.Fe.x + 15, e.Fe.y + 40, e.Fe.x + 15, e.Fe.y + 20, '#e8904088');
    }
  }
}

sceneRegistry.registerNodeClass('binding-arrow', BindingArrowNode);


// ═══════════════════════════════════════════════════════
//  ATP SYNTHASE COMPONENTS
// ═══════════════════════════════════════════════════════

const BETA_COLORS  = [[91,155,213], [232,184,74], [224,96,80]];
const ALPHA_COLOR  = [60, 75, 100];
const SEP_COLOR    = [25, 32, 48];
const STATE_NAMES  = ['open', 'loose', 'tight'];

// ── Proton channel (F₀ ring) ─────────────────────────

class ProtonChannelNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const e = ctxMix.ents;
    if (!ctx || !e?.F0) return;
    const cfg = node.value || {};
    const x = cfg.x ?? 0, y = cfg.y ?? 0;
    const w = cfg.w ?? 160, h = cfg.h ?? 45;
    const theta = e.F0.theta;

    ctx.save(); ctx.translate(x, y);
    drawRoundRect(ctx, { x: 0, y: 0, w, h, fill: '#2a3550', stroke: '#405070' });
    drawLabel(ctx, 0, 0, 'F₀ ring', '#6080a0', 10);

    for (let i = 0; i < 4; i++) {
      const px = -w / 2 + 15 + ((theta * 1.5 + i * 40) % w);
      const py = Math.sin(theta * 0.05 + i) * 5;
      drawCircle(ctx, { x: px, y: py, r: 3, fill: '#80c0e0' });
    }
    drawLabel(ctx, -w / 2 - 22, 0, 'H⁺', '#80c0e0', 9);
    ctx.restore();
  }
}

sceneRegistry.registerNodeClass('proton-channel', ProtonChannelNode);


// ── Gamma shaft ──────────────────────────────────────

class GammaShaftNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const e = ctxMix.ents;
    if (!ctx || !e?.F0) return;
    const cfg = node.value || {};
    const x = cfg.x ?? 0, y = cfg.y ?? 0;
    const w = cfg.w ?? 14, h = cfg.h ?? 110;
    const theta = e.F0.theta;
    const phase = (theta % 360) / 360;
    const twistCount = 5, twistSkew = 8;

    ctx.save(); ctx.translate(x, y);
    drawRoundRect(ctx, { x: 0, y: 0, w, h, radius: 3, fill: '#3a5060', stroke: '#507080', strokeWidth: 1 });

    ctx.strokeStyle = '#608090'; ctx.lineWidth = 1;
    const step = h / twistCount;
    for (let i = 0; i < twistCount; i++) {
      const ly = -h / 2 + i * step + (phase * step) % step;
      ctx.beginPath(); ctx.moveTo(-w / 2, ly); ctx.lineTo(w / 2, ly - twistSkew); ctx.stroke();
    }
    drawLabel(ctx, w / 2 + 16, 0, 'γ', '#7090a0', 12);
    ctx.restore();
  }
}

sceneRegistry.registerNodeClass('gamma-shaft', GammaShaftNode);


// ── F₁ barrel ────────────────────────────────────────

class F1BarrelNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const e = ctxMix.ents;
    if (!ctx || !e?.F0) return;
    const cfg = node.value || {};
    const x = cfg.x ?? 0, y = cfg.y ?? 0;
    const barrelR = cfg.barrelR ?? 75, barrelH = cfg.h ?? 140;
    const theta = e.F0.theta;
    const subunitStates = [e.b0?.state ?? 0, e.b1?.state ?? 1, e.b2?.state ?? 2];
    const numStripes = 12, panelW = 32, sepW = 8;

    ctx.save(); ctx.translate(x, y);

    // Build visible stripes
    const stripes = [];
    for (let i = 0; i < numStripes; i++) {
      const ang = ((i / numStripes) * 360 + theta) * Math.PI / 180;
      const cosA = Math.cos(ang), sinA = Math.sin(ang);
      if (cosA <= 0.02) continue;
      const isSep = i % 2 === 1;
      const subIdx = Math.floor(i / 2);
      const isBeta = subIdx % 2 === 0;
      const betaIdx = Math.floor(subIdx / 2);

      let rgb;
      if (isSep)       rgb = SEP_COLOR;
      else if (isBeta) rgb = BETA_COLORS[subunitStates[betaIdx]];
      else             rgb = ALPHA_COLOR;

      stripes.push({ x: sinA * barrelR, w: cosA * (isSep ? sepW : panelW),
                     cosA, isSep, isBeta, betaIdx, rgb });
    }
    stripes.sort((a, b) => a.cosA - b.cosA);

    // Background
    drawRoundRect(ctx, { x: 0, y: 0, w: (barrelR + 8) * 2, h: barrelH, radius: 8, fill: '#181e2a' });

    // Stripes
    for (const s of stripes) {
      const alpha = 0.3 + 0.7 * s.cosA;
      ctx.fillStyle = `rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},${alpha})`;
      ctx.fillRect(s.x - s.w / 2, -barrelH / 2 + 4, s.w, barrelH - 8);
      if (s.isBeta && !s.isSep && s.cosA > 0.7) {
        const st = subunitStates[s.betaIdx];
        drawLabel(ctx, s.x, -8, `β${s.betaIdx + 1}`, '#fff', 11);
        drawLabel(ctx, s.x,  8, STATE_NAMES[st], '#ddd', 9);
      }
    }

    // Outline + label
    drawRoundRect(ctx, { x: 0, y: 0, w: (barrelR + 8) * 2, h: barrelH, radius: 8, stroke: '#405070' });
    drawLabel(ctx, barrelR + 24, 0, 'F₁ head', '#6080a0', 10);

    // ADP/ATP annotations
    for (const s of stripes) {
      if (!s.isBeta || s.isSep || s.cosA < 0.6) continue;
      const st = subunitStates[s.betaIdx];
      if (st === 1) drawLabel(ctx, s.x, -barrelH / 2 - 10, 'ADP↓', '#e8b84a', 8);
      if (st === 2) drawLabel(ctx, s.x, -barrelH / 2 - 10, '→ATP', '#60e060', 8);
    }

    ctx.restore();
  }
}

sceneRegistry.registerNodeClass('f1-barrel', F1BarrelNode);


// ── Rotation arrow ───────────────────────────────────

class RotationArrowNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const cfg = node.value || {};
    const x = cfg.x ?? 0, y = cfg.y ?? 0;
    const radius = cfg.radius ?? 92;
    const color = cfg.color ?? '#80c0e088';

    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, Math.PI * -0.8, Math.PI * -0.2);
    ctx.stroke();
    const endAng = Math.PI * -0.2;
    drawArrow(ctx,
      x + Math.cos(endAng) * radius - 4, y + Math.sin(endAng) * radius,
      x + Math.cos(endAng) * radius + 3, y + Math.sin(endAng) * radius - 6,
      color);
  }
}

sceneRegistry.registerNodeClass('rotation-arrow', RotationArrowNode);