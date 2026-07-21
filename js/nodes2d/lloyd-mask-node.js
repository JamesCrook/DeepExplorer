/**
 * lloyd-mask-node.js
 *
 * Lloyd mirror interference pattern renderer.
 * Writes per-pixel ImageData based on multi-exposure
 * interference with configurable angles, duty cycles,
 * phases, and etch rules.
 *
 * AST shape:
 *   lloyd  { value: layer }
 *     lloyd-directions  (angle controller overlay — child)
 *
 * node.value = layer object with:
 *   .lld.exp[]   — exposures [{a, d, ph}, ...]
 *   .lld.etch    — etch rule id ('3of3', '2of3', etc.)
 *   .color       — layer color (hex)
 *   .old.on      — whether chip-layer mask is active
 *
 * Reads ctxMix.currentLayer._chipMask for old-process masking
 * (set by chip-layer-node's after_draw2d).
 */

import { sceneRegistry } from '../omni-support/scene.js';
import { nm2screen, hexToRgb } from './mask-scene-nodes.js';


// ── Etch rules ───────────────────────────────────────────

const ETCH_RULES = [
  { id: '1of1', label: '1 of 1', cnt: 1, thr: 1 },
  { id: '1of2', label: '1+ of 2', cnt: 2, thr: 1 },
  { id: '2of2', label: '2 of 2',  cnt: 2, thr: 2 },
  { id: '1of3', label: '1+ of 3', cnt: 3, thr: 1 },
  { id: '2of3', label: '2+ of 3', cnt: 3, thr: 2 },
  { id: '3of3', label: '3 of 3',  cnt: 3, thr: 3 },
];

function getEtchRule(id) {
  return ETCH_RULES.find(r => r.id === id) || ETCH_RULES[5];
}


// ═══════════════════════════════════════════════════════
//  LLOYD MASK NODE — per-pixel interference
// ═══════════════════════════════════════════════════════

class LloydMaskNode {

  // Renders as before_draw2d so the pixel shader runs before
  // the lloyd-directions child is drawn on top.
  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const layer = node.value || ctxMix.currentLayer;
    if (!layer || !layer.lld) return;

    const W = ctxMix.W || ctx.canvas.width;
    const H = ctxMix.H || ctx.canvas.height;

    const pitch = params.wavelength || layer.wavelength || 193;
    const exps = layer.lld.exp;
    const rule = getEtchRule(layer.lld.etch);
    const inv = (params.nmPx || 10) / (params.zoom || 1);

    const activeCount = rule.cnt;
    const threshold = rule.thr;

    // Precompute exposure directions
    const ed = [];
    for (let i = 0; i < activeCount; i++) {
      const e = exps[i];
      const r = e.a * Math.PI / 180;
      ed.push({ c: Math.cos(r), s: Math.sin(r), d: e.d, p: e.ph || 0 });
    }

    // Old-process mask (from sibling chip-layer-node)
    let oldMask = null;
    if (layer.old?.on && ctxMix.currentLayer?._chipMask) {
      oldMask = ctxMix.currentLayer._chipMask;
    }

    // Folder clip mask (if provided)
    const folderClipMask = layer._folderClipMask || null;

    // Determine if this is the "show" mode (expanded with lloyd slot active)
    const show = (params.activeSlot === 'lloyd' &&
                  params.expandedLayerId === layer.id);

    // Create ImageData buffer
    if (!node._lloydCanvas) {
      node._lloydCanvas = document.createElement('canvas');
    }
    if (node._lloydCanvas.width !== W || node._lloydCanvas.height !== H) {
      node._lloydCanvas.width = W;
      node._lloydCanvas.height = H;
    }
    const lCtx = node._lloydCanvas.getContext('2d', { willReadFrequently: true })
    lCtx.clearRect(0, 0, W, H);
    const img = lCtx.createImageData(W, H);
    const D = img.data;

    const vx = params.vx || 0;
    const vy = params.vy || 0;

    for (let sy = 0; sy < H; sy++) {
      const nmY = vy - (sy - H / 2) * inv;
      const nmX0 = vx - (W / 2) * inv;

      for (let sx = 0; sx < W; sx++) {
        const pi0 = sy * W + sx;

        // Mask checks
        if (oldMask && !oldMask[pi0]) continue;
        if (folderClipMask && !folderClipMask[pi0]) continue;

        const nmX = nmX0 + sx * inv;

        // Count exposures that hit this pixel
        let hits = 0;
        for (let e = 0; e < activeCount; e++) {
          const proj = nmX * ed[e].c + nmY * ed[e].s + ed[e].p;
          const pos = ((proj % pitch) + pitch) % pitch;
          if (pos < pitch * ed[e].d) hits++;
        }

        if (!hits) continue;

        const pi = pi0 * 4;
        const etched = hits >= threshold;

        if (show) {
          // Diagnostic view: grey tones
          if (etched) {
            D[pi] = 160; D[pi + 1] = 160; D[pi + 2] = 160; D[pi + 3] = 220;
          } else {
            D[pi] = 80; D[pi + 1] = 80; D[pi + 2] = 80; D[pi + 3] = 80;
          }
        } else {
          // Normal view: layer color
          if (etched) {
            const rgb = hexToRgb(layer.color || '#4ecdc4');
            D[pi] = rgb[0]; D[pi + 1] = rgb[1]; D[pi + 2] = rgb[2]; D[pi + 3] = 180;
          }
        }
      }
    }

    lCtx.putImageData(img, 0, 0);
    ctx.drawImage(node._lloydCanvas, 0, 0);
  }
}

sceneRegistry.registerNodeClass('lloyd', LloydMaskNode);


// ═══════════════════════════════════════════════════════
//  LLOYD DIRECTIONS NODE — angle controller overlay
// ═══════════════════════════════════════════════════════
//
// The circular widget at the center of the viewport.
// Shows exposure direction lines with draggable handles.
// Only visible when the Lloyd slot is active/expanded.
//
// Child of lloyd-node in the AST, but renders as an overlay
// on the main canvas (not into any offscreen buffer).

const ARC_RADIUS    = 80;
const HANDLE_RADIUS = 10;
const CENTER_RADIUS = 14;

class LloydDirectionsNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const layer = node.value || ctxMix.currentLayer;
    if (!layer || !layer.lld?.on) return;

    // Only show when lloyd slot is active
    if (params.activeSlot !== 'lloyd') return;
    if (params.expandedLayerId !== layer.id) return;

    const W = ctxMix.W || ctx.canvas.width;
    const H = ctxMix.H || ctx.canvas.height;

    // Centre position with optional drag offset
    const mx = W / 2 + (layer.lld.ox || 0);
    const my = H / 2 + (layer.lld.oy || 0);
    const rule = getEtchRule(layer.lld.etch);

    // Background disc
    ctx.beginPath();
    ctx.arc(mx, my, ARC_RADIUS + 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();

    // Reference circle
    ctx.beginPath();
    ctx.arc(mx, my, ARC_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff20';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Tick marks
    for (let a = 0; a < 360; a += 15) {
      const r = a * Math.PI / 180;
      const inn = a % 45 === 0 ? ARC_RADIUS - 10 : ARC_RADIUS - 5;
      ctx.beginPath();
      ctx.moveTo(mx + Math.cos(r) * inn, my - Math.sin(r) * inn);
      ctx.lineTo(mx + Math.cos(r) * ARC_RADIUS, my - Math.sin(r) * ARC_RADIUS);
      ctx.strokeStyle = a % 45 === 0 ? '#ffffff30' : '#ffffff15';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Exposure lines + handles
    for (let e = 0; e < rule.cnt; e++) {
      const exp = layer.lld.exp[e];
      const r = exp.a * Math.PI / 180;

      // Direction line (full diameter)
      ctx.beginPath();
      ctx.moveTo(mx - Math.cos(r) * ARC_RADIUS, my + Math.sin(r) * ARC_RADIUS);
      ctx.lineTo(mx + Math.cos(r) * ARC_RADIUS, my - Math.sin(r) * ARC_RADIUS);
      ctx.strokeStyle = '#ffffff30';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Handle
      const hx = mx + Math.cos(r) * ARC_RADIUS;
      const hy = my - Math.sin(r) * ARC_RADIUS;
      const dragging = params._draggingHandle === e;

      ctx.beginPath();
      ctx.arc(hx, hy, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = dragging ? '#ffffff' : '#ffffffbb';
      ctx.fill();
      ctx.strokeStyle = '#ffffff60';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Handle label
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('' + (e + 1), hx, hy + 0.5);
    }

    // ── Centre drag circle ──────────────────────────
    const draggingCenter = params._draggingHandle === 'center';
    ctx.beginPath();
    ctx.arc(mx, my, CENTER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = draggingCenter ? '#ffffff30' : '#ffffff10';
    ctx.fill();
    ctx.strokeStyle = '#ffffff30';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Crosshair inside centre circle
    ctx.strokeStyle = '#ffffff40';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx - 6, my); ctx.lineTo(mx + 6, my);
    ctx.moveTo(mx, my - 6); ctx.lineTo(mx, my + 6);
    ctx.stroke();
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;

    const layer = node.value || ctxMix.currentLayer;
    if (!layer || !layer.lld?.on) return;
    if (params.activeSlot !== 'lloyd') return;
    if (params.expandedLayerId !== layer.id) return;

    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const W = ctxMix.W || ctx.canvas.width;
    const H = ctxMix.H || ctx.canvas.height;

    const mx = W / 2 + (layer.lld.ox || 0);
    const my = H / 2 + (layer.lld.oy || 0);
    const rule = getEtchRule(layer.lld.etch);

    // Check centre circle first (highest priority)
    if (Math.hypot(pt.x - mx, pt.y - my) < CENTER_RADIUS + 3) {
      const startOx = layer.lld.ox || 0;
      const startOy = layer.lld.oy || 0;
      const grabX = pt.x, grabY = pt.y;

      ctxMix.hitResult = {
        cursor: { type: 'lloyd-center', layerId: layer.id },
        interactions: {
          applySelect: () => { params._draggingHandle = 'center'; },
          applyDrag: (screenX, screenY) => {
            layer.lld.ox = startOx + (screenX - grabX);
            layer.lld.oy = startOy + (screenY - grabY);
          },
          applyRelease: () => { params._draggingHandle = -1; },
        },
      };
      return;
    }

    // Check exposure handles
    for (let e = 0; e < rule.cnt; e++) {
      const exp = layer.lld.exp[e];
      const r = exp.a * Math.PI / 180;
      const hx = mx + Math.cos(r) * ARC_RADIUS;
      const hy = my - Math.sin(r) * ARC_RADIUS;

      if (Math.hypot(pt.x - hx, pt.y - hy) < HANDLE_RADIUS + 5) {
        const gang = layer.lld.gang;
        const startAngle = exp.a;
        const otherAngle = (e === 0 || e === 1)
          ? layer.lld.exp[e === 0 ? 1 : 0].a : 0;

        ctxMix.hitResult = {
          cursor: { type: 'lloyd-handle', exposureIdx: e, layerId: layer.id },
          interactions: {
            applySelect: () => { params._draggingHandle = e; },
            applyDrag: (screenX, screenY) => {
              const ang = Math.atan2(-(screenY - my), screenX - mx) * 180 / Math.PI;
              layer.lld.exp[e].a = ang;
              if (gang && (e === 0 || e === 1)) {
                const delta = ang - startAngle;
                layer.lld.exp[e === 0 ? 1 : 0].a = otherAngle - delta;
              }
            },
            applyRelease: () => { params._draggingHandle = -1; },
          },
        };
        return;
      }
    }
  }
}

sceneRegistry.registerNodeClass('lloyd-directions', LloydDirectionsNode);

export { LloydMaskNode, LloydDirectionsNode, ETCH_RULES, getEtchRule };