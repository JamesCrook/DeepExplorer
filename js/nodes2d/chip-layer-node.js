/**
 * chip-layer-node.js
 *
 * Renders child shapes into an offscreen buffer, then composites
 * onto the main canvas with Sobel edge detection and the layer's
 * color.  Children can be any shape type (rect, warped-polygon,
 * circle, etc.) — they just draw white filled regions into the
 * buffer.
 *
 * AST shape:
 *   chip-layer  { value: layer }
 *     rect      { value: {x,y,w,h} }
 *     rect      ...
 *
 * Toggleable features (via params):
 *   sobelEnabled   — edge outline (default true)
 *   repeatEnabled  — folder-based tiling (default false)
 *
 * Repeat tiling:
 *   When enabled, node.value.repeat = { hp, vp } defines the
 *   tile pitch.  The walker replays children at each visible
 *   tile offset.  Clip shapes (node.value.clipShapes) mask
 *   the result.
 */

// #wsi/rectnode/code

import { sceneRegistry, SubtreeIterator } from '../omni-support/scene.js';
import { nm2screen, viewBounds, hexToRgb } from './mask-scene-nodes.js';


// ── Tiling iterator ──────────────────────────────────────
//
// Replays the subtree once per visible tile offset.
// Each iteration sets ctxMix.tileOffset = {dx, dy} (in nm).
// Children read this to shift their coordinates.

class TileIterator extends SubtreeIterator {
  constructor(offsets) {
    super();
    this._offsets = offsets;  // [{dx, dy}, ...]
    this._oIdx = 0;
    this._childIdx = 0;
    this._subtreeLen = 0;
  }

  next(subtree) {
    this._subtreeLen = subtree.length;

    // Advance through children, then next offset, then children again
    while (this._oIdx < this._offsets.length) {
      if (this._childIdx < this._subtreeLen) {
        return subtree[this._childIdx++];
      }
      this._oIdx++;
      this._childIdx = 0;
    }
    return null;
  }

  get currentOffset() {
    return this._offsets[this._oIdx] || { dx: 0, dy: 0 };
  }
}


// ═══════════════════════════════════════════════════════
//  CHIP LAYER NODE
// ═══════════════════════════════════════════════════════

class ChipLayerNode {

  // ── Phase: before_draw2d ─────────────────────────────
  // Set up offscreen buffer; optionally push a tile iterator.

  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const layer = node.value || ctxMix.currentLayer || {};

    // Create or resize offscreen buffer
    if (!node._offCanvas) {
      node._offCanvas = document.createElement('canvas');
    }
    if (node._offCanvas.width !== W || node._offCanvas.height !== H) {
      node._offCanvas.width = W;
      node._offCanvas.height = H;
    }
    const offCtx = node._offCanvas.getContext('2d');
    offCtx.clearRect(0, 0, W, H);

    // Stash main ctx, redirect children to offscreen
    node._mainCtx = ctx;
    ctxMix.ctx = offCtx;

    // Tile offset for children (default = no offset)
    ctxMix.tileOffset = { dx: 0, dy: 0 };

    // If repeat is enabled, replace the default iterator with
    // a TileIterator that replays children at each visible offset.
    const repeat = layer.repeat;
    const repeatEnabled = (params.repeatEnabled ?? false) && repeat?.on;

    if (repeatEnabled && repeat.hp > 0 && repeat.vp > 0) {
      const vb = viewBounds(params, W, H);

      // Compute bounding box of base shapes (from children values)
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const child of node.subtree) {
        if (child.value) {
          const v = child.value;
          bx0 = Math.min(bx0, v.x);
          by0 = Math.min(by0, v.y);
          bx1 = Math.max(bx1, (v.x || 0) + (v.w || 0));
          by1 = Math.max(by1, (v.y || 0) + (v.h || 0));
        }
      }
      if (!isFinite(bx0)) { bx0 = 0; by0 = 0; bx1 = 0; by1 = 0; }

      const si = Math.floor((vb.xMin - bx1) / repeat.hp);
      const ei = Math.ceil((vb.xMax - bx0) / repeat.hp);
      const sj = Math.floor((vb.yMin - by1) / repeat.vp);
      const ej = Math.ceil((vb.yMax - by0) / repeat.vp);

      const offsets = [];
      const maxStamps = 2000;
      for (let i = si; i <= ei && offsets.length < maxStamps; i++) {
        for (let j = sj; j <= ej && offsets.length < maxStamps; j++) {
          offsets.push({ dx: i * repeat.hp, dy: j * repeat.vp });
        }
      }

      // Replace the iterator the walker pushed
      ctxMix.iterators[ctxMix.iterators.length - 1] = new TileIterator(offsets);
      node._tileIterator = ctxMix.iterators[ctxMix.iterators.length - 1];
    } else {
      node._tileIterator = null;
    }
  }

  // ── Phase: before_child_draw2d ───────────────────────
  // Update tile offset for the current iteration.

  static before_child_draw2d(ctxMix, node, params, child) {
    if (node._tileIterator) {
      ctxMix.tileOffset = node._tileIterator.currentOffset;
    }
  }

  // ── Phase: after_draw2d ──────────────────────────────
  // Read offscreen buffer, Sobel edge detect, composite.

  static after_draw2d(ctxMix, node, params) {
    const offCtx = ctxMix.ctx;
    const mainCtx = node._mainCtx;
    if (!mainCtx) return;

    const W = offCtx.canvas.width;
    const H = offCtx.canvas.height;

    // Restore main ctx
    ctxMix.ctx = mainCtx;

    const layer = node.value || ctxMix.currentLayer || {};
    const color = hexToRgb(layer.color || '#4ecdc4');

    // Read offscreen mask
    const img = offCtx.getImageData(0, 0, W, H);
    const d = img.data;
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      mask[i] = d[i * 4] > 128 ? 1 : 0;
    }

    // Apply clip mask if present
    const clipShapes = layer.clipShapes;
    if (clipShapes && clipShapes.length) {
      const sc = (params.zoom || 1) / (params.nmPx || 10);
      // Render clip shapes into a second buffer
      offCtx.clearRect(0, 0, W, H);
      offCtx.fillStyle = '#fff';
      for (const s of clipShapes) {
        const tl = nm2screen(s.x, s.y + s.h, params, W, H);
        offCtx.fillRect(tl.x, tl.y, s.w * sc, s.h * sc);
      }
      const clipImg = offCtx.getImageData(0, 0, W, H);
      for (let i = 0; i < W * H; i++) {
        if (clipImg.data[i * 4] < 128) mask[i] = 0;
      }
    }

    // Sobel edge detection
    const sobelEnabled = params.sobelEnabled ?? true;
    const edge = new Uint8Array(W * H);

    if (sobelEnabled) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const idx = y * W + x;
          if (!mask[idx]) continue;
          if (x === 0 || x === W - 1 || y === 0 || y === H - 1 ||
              !mask[idx - 1] || !mask[idx + 1] ||
              !mask[idx - W] || !mask[idx + W]) {
            edge[idx] = 1;
          }
        }
      }
    }

    // Composite onto main canvas
    const mainImg = mainCtx.getImageData(0, 0, W, H);
    const od = mainImg.data;

    for (let i = 0; i < W * H; i++) {
      if (sobelEnabled && edge[i]) {
        // Edge pixels: full-intensity layer color, opaque
        od[i * 4]     = color[0];
        od[i * 4 + 1] = color[1];
        od[i * 4 + 2] = color[2];
        od[i * 4 + 3] = 255;
      } else if (mask[i]) {
        // Interior pixels: subtle tint with additive alpha.
        // On a transparent offscreen (addable mode) this keeps
        // interiors semi-transparent so multiple chip layers merge.
        // On an opaque background (scene mode) alpha stays 255.
        const a = 0.2;
        od[i * 4]     = Math.min(255, od[i * 4]     + color[0] * a);
        od[i * 4 + 1] = Math.min(255, od[i * 4 + 1] + color[1] * a);
        od[i * 4 + 2] = Math.min(255, od[i * 4 + 2] + color[2] * a);
        od[i * 4 + 3] = Math.min(255, od[i * 4 + 3] + 50);
      }
    }

    mainCtx.putImageData(mainImg, 0, 0);

    // Via hatching (clipped to mask)
    if (layer.via) {
      this._drawVia(mainCtx, mask, layer, params, W, H, node._offCanvas);
    }

    // Store mask for sibling nodes (lloyd-node reads it)
    node._mask = mask;
    if (ctxMix.currentLayer) {
      ctxMix.currentLayer._chipMask = mask;
    }
  }

  // ── Via hatching (cross-hatch over masked area) ──────

  static _drawVia(ctx, mask, layer, params, W, H, offCanvas) {
    const offCtx = offCanvas.getContext('2d');
    offCtx.clearRect(0, 0, W, H);

    // Draw cross-hatch into offscreen buffer
    offCtx.strokeStyle = layer.color || '#4ecdc4';
    offCtx.lineWidth = 0.5;
    offCtx.globalAlpha = 1.0;
    const sp = 32 * params.zoom;//Math.min(W,H)*0.125;
    const maxD = Math.max(W, H) * 2;
    for (let d = -maxD; d < maxD; d += sp) {
      offCtx.beginPath(); offCtx.moveTo(d, 0); offCtx.lineTo(d - H, H); offCtx.stroke();
      offCtx.beginPath(); offCtx.moveTo(d, 0); offCtx.lineTo(d + H, H); offCtx.stroke();
    }
    offCtx.globalAlpha = 1;

    // Erase pixels outside the mask
    const img = offCtx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < W * H; i++) {
      if (!mask[i]) d[i * 4 + 3] = 0;
    }
    offCtx.putImageData(img, 0, 0);

    // Composite onto main canvas
    ctx.drawImage(offCanvas, 0, 0);
  }
}

sceneRegistry.registerNodeClass('chip-layer', ChipLayerNode);

export { ChipLayerNode };