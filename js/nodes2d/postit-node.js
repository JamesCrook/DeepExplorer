/**
 * postit-node.js
 *
 * Container node for post-it notes. Sits inside a handle-frame
 * and acts as a proper container for child layers (jatex, chart,
 * ribbon, etc.) — similar to stamp-frame's container pattern.
 *
 *   handle-frame  (draggable: true, stretchContent: true)
 *     drag-point  ⌜
 *     drag-point  ⌟
 *     postit-node              ← this node
 *       jatex-layer            ← built-in content
 *       [chart-layer]          ← added via addables
 *       [ribbon-layer]         ← added via addables
 *
 * Draws: fill, shadow, grid lines, corner fold, pin.
 *
 * Container contract (matching stamp-frame):
 *   draw2d:    Draws decoration at top-left, then translates to
 *              center so children get a centered coordinate space.
 *              Restores W/H to canvas dimensions so uncenter/ribbon
 *              centering cancels correctly.
 *   hit_test:  Restores hitPoint to screen coordinates (undoing
 *              handle-frame's frame-local transform) and pushes
 *              the frame center position into params.panX/panY
 *              (stamp-frame pattern) so ribbon-point hit_test works.
 *   T:         Pushed for the center offset in both phases.
 */

import { sceneRegistry } from '../omni-support/scene.js';
import { Box } from '../2d-support/box.js';
// ── helpers ─────────────────────────────────────────────────

function hexToRgb(hex) {
  hex = (hex || '#888888').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length === 8) hex = hex.slice(0, 6);
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function shiftColor({ r, g, b }, amt) {
  const f = v => Math.round(Math.min(255, Math.max(0,
    amt > 0 ? v + (255 - v) * amt : v + v * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** CSS-pixel dimensions of the canvas (matches ribbon-node.js). */
function canvasCSSSize(ctx) {
  const dpr = window.devicePixelRatio || 1;
  return {
    w: ctx.canvas.width  / dpr,
    h: ctx.canvas.height / dpr,
  };
}

// ── defaults ────────────────────────────────────────────────

const POSTIT_DEFAULTS = Object.freeze({
  noteColor:      '#ffeaa7',
  noteShadowBlur: 8,
  noteShadowOffX: 2,
  noteShadowOffY: 3,

  foldSize:       15,      // 0 = no fold
  pinSize:        0,       // 0 = no pin
  pinColor:       '#e74c3c',

  lineSpacingX:   0,       // 0 = no vertical lines
  lineSpacingY:   25,      // horizontal ruled lines
  lineWidthX:     0,
  lineWidthY:     0.4,
  lineColor:      '#00000018',

  noteSize:       200,     // natural size (square)
});

// ── PostitNode ──────────────────────────────────────────────

class PostitNode {

  // ── Measure: initial natural size ────────────────────
  // Children (jatex) measure during recursion between
  // before/after. We set our own box afterward.
  // In stretchContent mode, layout will resize to match
  // the actual handle-frame pixel dimensions.

  static before_measure() { /* let children measure */ }

  static after_measure(ctxMix, node, params) {
    const size = params.noteSize || 200;
    node.box = new Box( size, size  );
  }

  // ── Layout: adopt actual frame dimensions ──────────────
  // When inside a stretchContent handle-frame, the frame
  // stores pixel dimensions on ctxMix._contentFrame.
  // Resizing our box means handle-frame computes scale = 1.

  static before_layout(ctxMix, node, params) {
    if (ctxMix._contentFrame && node.box) {
      node.box._w = ctxMix._contentFrame.width;
      node.box._h = ctxMix._contentFrame.height;
    }
  }

  static after_layout() {}

  // ── Draw ───────────────────────────────────────────────

  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const p = { ...POSTIT_DEFAULTS, ...params };

    // Prefer ctxMix.W/H (set by handle-frame in stretchContent mode)
    const w = ctxMix.W || node.box?.width()  || p.noteSize;
    const h = ctxMix.H || node.box?.height() || p.noteSize;

    const fillHex  = node.value?.color || p.noteColor;
    const base     = hexToRgb(fillHex);
    const foldSize = p.foldSize || 0;

    ctx.save();

    // ── Shadow ───────────────────────────────────────
    if (p.noteShadowBlur > 0) {
      ctx.save();
      ctx.shadowColor   = 'rgba(0,0,0,0.25)';
      ctx.shadowOffsetX = p.noteShadowOffX || 0;
      ctx.shadowOffsetY = p.noteShadowOffY || 0;
      ctx.shadowBlur    = p.noteShadowBlur || 0;
      ctx.fillStyle     = fillHex;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // ── Main fill ────────────────────────────────────
    ctx.fillStyle = fillHex;
    ctx.fillRect(0, 0, w, h);

    // ── Grid lines ───────────────────────────────────

    // Horizontal lines (ruled by Y spacing)
    if (p.lineWidthY > 0 && p.lineSpacingY > 1) {
      ctx.strokeStyle = p.lineColor;
      ctx.lineWidth   = p.lineWidthY;
      ctx.beginPath();
      for (let y = p.lineSpacingY; y < h; y += p.lineSpacingY) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }

    // Vertical lines (ruled by X spacing)
    if (p.lineWidthX > 0 && p.lineSpacingX > 1) {
      ctx.strokeStyle = p.lineColor;
      ctx.lineWidth   = p.lineWidthX;
      ctx.beginPath();
      for (let x = p.lineSpacingX; x < w; x += p.lineSpacingX) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      ctx.stroke();
    }

    // ── Corner fold ──────────────────────────────────
    if (foldSize > 0) {
      const fs = Math.min(foldSize, w / 3, h / 3);

      // "Revealed paper" behind the fold (lighter)
      ctx.beginPath();
      ctx.moveTo(w - fs, h);
      ctx.lineTo(w,      h - fs);
      ctx.lineTo(w,      h);
      ctx.closePath();
      ctx.fillStyle = shiftColor(base, 0.15);
      ctx.fill();

      // Fold face (slightly darker = shadow side)
      ctx.beginPath();
      ctx.moveTo(w - fs, h);
      ctx.lineTo(w,      h - fs);
      ctx.lineTo(w - fs, h - fs);
      ctx.closePath();
      ctx.fillStyle = shiftColor(base, -0.08);
      ctx.fill();

      // Crease line
      ctx.beginPath();
      ctx.moveTo(w - fs, h);
      ctx.lineTo(w,      h - fs);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth   = 0.8;
      ctx.stroke();
    }

    // ── Pin ──────────────────────────────────────────
    if (p.pinSize > 0) {
      const ps  = p.pinSize;
      const px  = w / 2;
      const py  = ps + 2;
      const col = hexToRgb(p.pinColor || '#e74c3c');

      // Pin shadow
      ctx.beginPath();
      ctx.arc(px + 1, py + 1.5, ps, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fill();

      // Pin body
      ctx.beginPath();
      ctx.arc(px, py, ps, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
      ctx.fill();

      // Highlight
      ctx.beginPath();
      ctx.arc(px - ps * 0.25, py - ps * 0.25,
              ps * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fill();
    }

    // ── Container: center origin for children ──────────
    // Translate so (0,0) is the frame center, matching
    // stamp-frame's convention. Children (ribbons, charts,
    // jatex) draw relative to center.
    ctx.translate(w / 2, h / 2);

    // Restore W/H to canvas dimensions so that uncenter's
    // -W/2 cancels ribbon's +canvasW/2. Without this,
    // uncenter uses frameW and ribbon uses canvasW → mismatch.
    const canvas = canvasCSSSize(ctx);
    node._savedPostW = ctxMix.W;
    node._savedPostH = ctxMix.H;
    ctxMix.W = canvas.w;
    ctxMix.H = canvas.h;

    // Push T: screen-space shift (w/2 is in zoomed pixels,
    // same coordinate space as T.origin, so use shift).
    node._savedT = ctxMix.T;
    if (ctxMix.T) {
      ctxMix.T = ctxMix.T.shift({ x: w / 2, y: h / 2 });
    }

    // Context stays saved — children render between before/after
  }

  static after_draw2d(ctxMix, node) {
    // Restore W/H
    if (node._savedPostW !== undefined) {
      ctxMix.W = node._savedPostW;
      ctxMix.H = node._savedPostH;
      node._savedPostW = undefined;
    }
    // Pop T
    if (node._savedT) {
      ctxMix.T = node._savedT;
      node._savedT = null;
    }
    ctxMix.ctx?.restore();
  }

  // ── Hit test: container pattern (matching stamp-frame) ──
  //
  // T now carries zoom (pushed by LayerNode) and the frame's
  // position (pushed by handle-frame via T.child). So T.origin
  // is the correct screen-space top-left of the frame at any
  // zoom level. We read it directly — no hitPoint reconstruction.
  //
  // We restore hitPoint to screen coords and push frame center
  // into params.panX/panY — the stamp-frame pattern that ribbon-
  // point's hit_test expects via panZoom.

  static before_hit_test(ctxMix, node, params) {
    const w = ctxMix.W || 200;
    const h = ctxMix.H || 200;

    const T = ctxMix.T;
    if (T) {
      // T.origin is the frame's top-left in screen space
      // (accumulated through scene centering + zoom + handle-frame offset).
      // w is the zoomed frame width (screen pixels), so +w/2 gives center.
      const frameCenterX = T.origin.x + w / 2;
      const frameCenterY = T.origin.y + h / 2;

      // Restore hitPoint to screen coordinates
      node._savedHitPoint = ctxMix.hitPoint ? { ...ctxMix.hitPoint } : null;
      if (ctxMix.screenHitPoint) {
        ctxMix.hitPoint = { ...ctxMix.screenHitPoint };
      }

      // Push frame center into params (stamp-frame pattern).
      // Ribbon worldToScreen: wx*zoom + panX + canvasW/2
      // For wx=0 to map to frameCenterX:  panX = frameCenterX - canvasW/2
      node._savedPanX = params.panX;
      node._savedPanY = params.panY;
      const canvasW = ctxMix.canvasW || w;
      const canvasH = ctxMix.canvasH || h;
      params.panX = frameCenterX - canvasW / 2;
      params.panY = frameCenterY - canvasH / 2;
    }

    // Restore W/H to canvas dimensions (matching draw2d)
    node._savedPostW = ctxMix.W;
    node._savedPostH = ctxMix.H;
    ctxMix.W = ctxMix.canvasW || ctxMix.W;
    ctxMix.H = ctxMix.canvasH || ctxMix.H;

    // Push T: screen-space shift (matching draw2d)
    node._savedT = ctxMix.T;
    if (ctxMix.T) {
      ctxMix.T = ctxMix.T.shift({ x: w / 2, y: h / 2 });
    }
  }

  static after_hit_test(ctxMix, node, params) {
    // Restore hitPoint
    if (node._savedHitPoint) {
      ctxMix.hitPoint = node._savedHitPoint;
      node._savedHitPoint = null;
    }
    // Restore panX/panY
    if (node._savedPanX !== undefined) {
      params.panX = node._savedPanX;
      params.panY = node._savedPanY;
      node._savedPanX = undefined;
    }
    // Restore W/H
    if (node._savedPostW !== undefined) {
      ctxMix.W = node._savedPostW;
      ctxMix.H = node._savedPostH;
      node._savedPostW = undefined;
    }
    // Pop T
    if (node._savedT) {
      ctxMix.T = node._savedT;
      node._savedT = null;
    }
  }
}

sceneRegistry.registerNodeClass('postit-node', PostitNode);

export { PostitNode };