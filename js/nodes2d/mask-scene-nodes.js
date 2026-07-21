/**
 * mask-scene-nodes.js
 *
 * Supporting scene nodes for the mask editor:
 *   rect             — a filled rectangle (drawn into parent's ctx)
 *   grid-bg          — adaptive coordinate grid background
 *   layer            — grouping node with alpha/visibility
 *   clip-outline     — dashed outlines for clip boundaries
 *
 * Also exports coordinate-transform utilities shared by all mask nodes.
 */

import { sceneRegistry } from '../omni-support/scene.js';

// ── Coordinate transforms (nm ↔ screen) ──────────────────

function nm2screen(nx, ny, params, W, H) {
  const sc = (params.zoom || 1) / (params.nmPx || 10);
  return {
    x: W / 2 + (nx - (params.vx || 0)) * sc,
    y: H / 2 - (ny - (params.vy || 0)) * sc,
  };
}

function screen2nm(sx, sy, params, W, H) {
  const sc = (params.zoom || 1) / (params.nmPx || 10);
  return {
    x: (params.vx || 0) + (sx - W / 2) / sc,
    y: (params.vy || 0) - (sy - H / 2) / sc,
  };
}

function viewBounds(params, W, H) {
  const tl = screen2nm(0, 0, params, W, H);
  const br = screen2nm(W, H, params, W, H);
  return {
    xMin: Math.min(tl.x, br.x), xMax: Math.max(tl.x, br.x),
    yMin: Math.min(tl.y, br.y), yMax: Math.max(tl.y, br.y),
  };
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return [
    parseInt(hex.substr(0, 2), 16),
    parseInt(hex.substr(2, 2), 16),
    parseInt(hex.substr(4, 2), 16),
  ];
}


// ═══════════════════════════════════════════════════════
//  RECT NODE — filled rectangle in nm coordinates
// ═══════════════════════════════════════════════════════
//
// node.value = { x, y, w, h }  (in nm)
//
// Draws a white filled rect into the current ctx.  When
// parented under a chip-layer node, ctx is the offscreen
// buffer; the parent composites with edge detection.

class RectNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const { x, y, w, h } = node.value;
    const W = ctxMix.W || ctx.canvas.width;
    const H = ctxMix.H || ctx.canvas.height;
    const sc = (params.zoom || 1) / (params.nmPx || 10);

    // Apply tile offset (set by chip-layer's TileIterator)
    const off = ctxMix.tileOffset || { dx: 0, dy: 0 };
    const nx = x + off.dx;
    const ny = y + off.dy;

    // nm to screen: y-axis is inverted (nm y-up, screen y-down)
    const s = nm2screen(nx, ny + h, params, W, H);

    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x, s.y, w * sc, h * sc);
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const { x, y, w, h } = node.value;
    const W = ctxMix.W || ctx.canvas.width;
    const H = ctxMix.H || ctx.canvas.height;

    const sc = (params.zoom || 1) / (params.nmPx || 10);
    const s = nm2screen(x, y + h, params, W, H);

    if (pt.x >= s.x && pt.x <= s.x + w * sc &&
        pt.y >= s.y && pt.y <= s.y + h * sc) {
      ctxMix.hitResult = {
        cursor:       node.value,
        nodeRef:      node,
        interactions: ctxMix.flyweight?.interactions
                        ? { ...ctxMix.flyweight.interactions } : {},
      };
    }
  }
}

sceneRegistry.registerNodeClass('rect', RectNode);


// ═══════════════════════════════════════════════════════
//  GRID-BG NODE — adaptive coordinate grid
// ═══════════════════════════════════════════════════════

class GridBgNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const W = ctxMix.W || ctx.canvas.width;
    const H = ctxMix.H || ctx.canvas.height;
    const sc = (params.zoom || 1) / (params.nmPx || 10);

    // Clear
    ctx.fillStyle = '#080c16';
    ctx.fillRect(0, 0, W, H);

    // Skip if too zoomed out
    const nmPx = (params.nmPx || 10) / (params.zoom || 1);
    if (nmPx > 50) return;

    // Adaptive grid spacing
    let g = 100;
    for (const c of [10, 20, 50, 100, 200, 500, 1000]) {
      if (c * sc > 30) { g = c; break; }
    }

    const vb = viewBounds(params, W, H);
    const x0 = Math.floor(vb.xMin / g) * g;
    const x1 = Math.ceil(vb.xMax / g) * g;
    const y0 = Math.floor(vb.yMin / g) * g;
    const y1 = Math.ceil(vb.yMax / g) * g;

    // Major grid
    ctx.strokeStyle = '#ffffff08';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += g) {
      const p = nm2screen(x, 0, params, W, H);
      ctx.moveTo(p.x, 0); ctx.lineTo(p.x, H);
    }
    for (let y = y0; y <= y1; y += g) {
      const p = nm2screen(0, y, params, W, H);
      ctx.moveTo(0, p.y); ctx.lineTo(W, p.y);
    }
    ctx.stroke();

    // Snap grid (finer)
    const snap = params.snap || 1000;
    if (snap * sc > 8) {
      ctx.strokeStyle = '#ffffff06';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const sx0 = Math.floor(vb.xMin / snap) * snap;
      const sx1 = Math.ceil(vb.xMax / snap) * snap;
      const sy0 = Math.floor(vb.yMin / snap) * snap;
      const sy1 = Math.ceil(vb.yMax / snap) * snap;
      for (let x = sx0; x <= sx1; x += snap) {
        const p = nm2screen(x, 0, params, W, H);
        ctx.moveTo(p.x, 0); ctx.lineTo(p.x, H);
      }
      for (let y = sy0; y <= sy1; y += snap) {
        const p = nm2screen(0, y, params, W, H);
        ctx.moveTo(0, p.y); ctx.lineTo(W, p.y);
      }
      ctx.stroke();
    }

    // Origin crosshair
    const o = nm2screen(0, 0, params, W, H);
    ctx.strokeStyle = '#ffffff18';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(o.x, 0); ctx.lineTo(o.x, H);
    ctx.moveTo(0, o.y); ctx.lineTo(W, o.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffffff50';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o.x - 6, o.y); ctx.lineTo(o.x + 6, o.y);
    ctx.moveTo(o.x, o.y - 6); ctx.lineTo(o.x, o.y + 6);
    ctx.stroke();
  }
}

sceneRegistry.registerNodeClass('grid-bg', GridBgNode);


// ═══════════════════════════════════════════════════════
//  LAYER NODE — grouping with alpha/visibility
// ═══════════════════════════════════════════════════════
//
// node.value = { id, color, vis, alpha }
//
// Sets globalAlpha for all children.  The walker skips
// children when alpha <= 0.

class LayerNode {
  static before_draw2d(ctxMix, node, params) {
    const layer = node.value;
    if (!layer) return;
    const alpha = layer.alpha ?? 1;
    node._savedAlpha = ctxMix.ctx?.globalAlpha ?? 1;
    if (ctxMix.ctx) ctxMix.ctx.globalAlpha = alpha;

    // Make layer data available to children
    ctxMix.currentLayer = layer;
  }

  static after_draw2d(ctxMix, node, params) {
    if (ctxMix.ctx) ctxMix.ctx.globalAlpha = node._savedAlpha ?? 1;
    ctxMix.currentLayer = null;
  }
}

sceneRegistry.registerNodeClass('layer', LayerNode);


// ═══════════════════════════════════════════════════════
//  CLIP-OUTLINE NODE — dashed rectangles for clip regions
// ═══════════════════════════════════════════════════════
//
// node.value = [{ x, y, w, h }, ...]  (clip shapes in nm)

class ClipOutlineNode {
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const shapes = node.value;
    if (!ctx || !shapes || !shapes.length) return;

    const W = ctxMix.W || ctx.canvas.width;
    const H = ctxMix.H || ctx.canvas.height;

    const sc = (params.zoom || 1) / (params.nmPx || 10);

    ctx.save();
    ctx.strokeStyle = 'rgba(251,191,36,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);

    for (const s of shapes) {
      const tl = nm2screen(s.x, s.y + s.h, params, W, H);
      ctx.strokeRect(tl.x, tl.y, s.w * sc, s.h * sc);
    }

    ctx.restore();
  }
}

sceneRegistry.registerNodeClass('clip-outline', ClipOutlineNode);


export { nm2screen, screen2nm, viewBounds, hexToRgb };
