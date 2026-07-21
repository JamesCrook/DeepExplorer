/**
 * scroll-cell.js
 *
 * Unified cell renderer for both grid and tree multiscrollers.
 * Internally uses tree-path cursors (arrays) in all modes.
 *
 * CellConfig encapsulates the behavioural differences between
 * grid and tree layouts. A configured instance is passed to the
 * ScrollCellNode constructor; the node is then registered with
 * the scene registry under whatever name(s) you need.
 *
 * Usage:
 *   sceneRegistry.registerNodeClass('ms-cell',
 *     createCellClass(new CellConfig()));
 *   sceneRegistry.registerNodeClass('grid-scroll-cell',
 *     createCellClass(new CellConfig({ grid: true })));
 */

import { sceneRegistry } from '../omni-support/scene.js';
import { ColorEngine, TextUtils } from '../utilities/color-engine.js';
import { WarpedPolygon } from './warped-polygon.js';
import { RoundedWarpedPolygon } from './rounded-warped-polygon.js';
import { Vector2D, lerp } from '../2d-support/vector2d.js';

function roundRect(ctx, x, y, w, h, r) {
  if (w <= 0 || h <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── helpers ────────────────────────────────────────────────────

/** Default hue palette — spread across the wheel for visual distinction. */
const DEFAULT_HUES = [160, 30, 340, 120, 40, 270, 180];

/** Ensure cursor is always an array path. */
function normCursor(c) {
  if (c == null) return null;
  if (Array.isArray(c)) return c;
  return [c];
}

/** Tree relation: shared prefix = 'path', same root = 'category'. */
function treeCursorRelation(cursor, active) {
  if (!active || !cursor) return 'other';
  const minLen = Math.min(cursor.length, active.length);
  for (let i = 0; i < minLen; i++) {
    if (cursor[i] !== active[i])
      return cursor[0] === active[0] ? 'category' : 'other';
  }
  return 'path';
}

/**
 * Grid relation: same row (last element) = 'path',
 * same column (first element) = 'category'.
 */
function gridCursorRelation(cursor, active) {
  if (!active || !cursor) return 'other';
  const row = cursor.length - 1;
  const aRow = active.length - 1;
  if (cursor[row] === active[aRow]) return 'path';
  if (cursor[0] === active[0]) return 'category';
  return 'other';
}

/**
 * Tree-chart relation: uses ancestor/descendant check via
 * the coordinator's data (TreeChartData through DataAdapter).
 * Falls back to root-index color grouping.
 */
function treeChartCursorRelation(cursor, active, ctxMix) {
  if (!active || !cursor) return 'other';
  const data = ctxMix?.coordinator?.data;
  if (!data?.isAncestor) return gridCursorRelation(cursor, active);

  const levelA = cursor[0], idxA = cursor[cursor.length - 1];
  const levelB = active[0], idxB = active[active.length - 1];

  // Same cell
  if (levelA === levelB && idxA === idxB) return 'path';

  // Ancestor–descendant relationship
  if (data.isAncestor(levelA, idxA, levelB, idxB)) return 'path';

  // Same root-level ancestor → category
  const treeA = data.getTreeCursor?.(levelA, idxA);
  const treeB = data.getTreeCursor?.(levelB, idxB);
  if (treeA && treeB && treeA[0] === treeB[0]) return 'category';

  return 'other';
}

/** Mode lookup — extensible with 'column', 'cross', etc. */
const HIGHLIGHT_MODES = {
  tree:      treeCursorRelation,
  row:       gridCursorRelation,
  treeChart: treeChartCursorRelation,
};

const STATE_STYLES = {
  path:     { sat: 60, lit: 32, bLit: 48, tLit: 90, lineWidth: 1.5, accent: true },
  category: { sat: 40, lit: 20, bLit: 28, tLit: 68, lineWidth: 0.5, accent: false },
  other:    { sat: 20, lit: 13, bLit: 18, tLit: 45, lineWidth: 0.5, accent: false },
};


/**
 * CellConfig 
 * 
 * Used to customise color, text display of values, font size.
 * Also provides resolveVisuals() — the shared value-to-visual
 * mapping used by all cell types for color, opacity, and blob.
 */
class CellConfig {
  /**
   * @param {Object}  opts
   * @param {number[]} opts.categoryHues — fallback hue palette (tree mode)
   */
  constructor({ categoryHues = null } = {}) {
    this.categoryHues = categoryHues;
  }

  /** Resolve display text for a cell. */
  getText(ctxMix, cursor) {
    return ctxMix.coordinator?.data?.getString( cursor ) ?? null;
  }

  /** Resolve hue for the cell background/border/text. */
  getHue(ctxMix, cursor) {
    const hues = ctxMix.categoryHues || this.categoryHues || DEFAULT_HUES;
    return hues[cursor[0] % hues.length];
  }

  /**
   * Return 'path' | 'category' | 'other'.
   * Uses ctxMix.highlightMode to select the relation function.
   * Modes: 'tree' (prefix match), 'row' (last-element match),
   *        'column' (first-element match), 'cross' (row + column).
   */
  getState(ctxMix, cursor, activeCursor) {
    const mode = ctxMix?.highlightMode ?? 'tree';
    const fn = HIGHLIGHT_MODES[mode] ?? treeCursorRelation;
    return fn(cursor, activeCursor, ctxMix);
  }

  /** Font size in px (before zoom multiplication). */
  getBaseFontSize(cursor) {
    const depth = cursor.length;
    return Math.max(10, 14 - depth);
  }

  /** Horizontal text inset (before zoom). */
  getTextInset(state) {
    return state === 'path' ? 16 : 12;
  }

  /**
   * Resolve visual properties from data for a cell.
   *
   * Returns { bg, fg, opacity, blobRadius, value, isNum }.
   *   bg/fg         — [r,g,b] arrays
   *   opacity       — 0–1, accounts for distance-matrix triangle fade
   *   blobRadius    — 0–1 normalised (caller scales to pixel size)
   *   value/isNum   — raw value and type flag
   *
   * Works for both numeric (value-mapped color) and text cells
   * (default background, default blob size).
   */
  resolveVisuals(ctxMix, cursor, params) {
    const data  = ctxMix.coordinator?.data;
    const value = data?.getValue(cursor);
    const isNum = data?.isNumeric(cursor) ?? false;
    const range = data?.globalRange ?? { min: 0, max: 1 };

    // ── Color ─────────────────────────────────────────────
    let bg = [30, 40, 60];
    let fg = [255, 255, 255];

    if (isNum) {
      const useSmooth  = (params.smoothGradient ?? 1) > 0.5;
      const valueColor = ColorEngine.getColor(value, range,
                           params.colorScheme ?? 'red-green', useSmooth);
      const colorTarget = params.colorTarget ?? 0;
      const brightness  = (valueColor[0]*299 + valueColor[1]*587
                         + valueColor[2]*114) / 1000;
      const contrast    = brightness > 128 ? [0,0,0] : [255,255,255];
      bg = ColorEngine.lerp(valueColor, [30, 40, 60], colorTarget);
      fg = ColorEngine.lerp(contrast, valueColor, colorTarget);
    }

    // ── Distance-matrix triangle fade ─────────────────────
    let opacity = 1;
    if (data && isNum && data.rowCount === data.colCount) {
      const dm = params.distanceMatrix ?? 0.5;
      // cursor[0] maps to grid row, cursor[last] to grid col
      const r = cursor[0];
      const c = cursor[cursor.length - 1];
      if (r < c)      opacity = 1 - dm;
      else if (r > c) opacity = dm;
      opacity = Math.min(1, 2 * opacity);
    }

    // ── Blob radius (normalised 0–1) ──────────────────────
    let blobRadius = 0;
    const blobMode = params.blobMode ?? 0;
    if (blobMode > 0.01) {
      if (isNum) {
        const maxAbs = Math.max(Math.abs(range.min), Math.abs(range.max));
        blobRadius = maxAbs > 0 ? Math.abs(value) / maxAbs : 0.5;
      } else {
        blobRadius = 0.5;   // default for non-numeric items
      }
    }

    return { bg, fg, opacity, blobRadius, value, isNum };
  }
}


// ── Blob helper ─────────────────────────────────────────────

/** Draw a filled circle at (cx, cy) with given pixel radius and color [r,g,b]. */
function drawBlob(ctx, cx, cy, radius, color) {
  if (radius < 0.5) return;
  ctx.fillStyle = ColorEngine.toCSS(color);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}


/**
 * ScrollCellNode
 * 
 * A round-rect cell that displays a text string.
 * 
 */
class ScrollCellNode {

  /** @type {CellConfig} — set by createCellClass() */
  static config = null;

  static _bounds(node, zoom) {
    return {
      x: (node.xOffset || 0) * zoom,
      y: (node.yOffset || 0) * zoom,
      w: (node.width   || 0) * zoom,
      h: (node.height  || 0) * zoom,
    };
  }

  /**
   * Draw cell text with continuous horizontal alignment.
   * textAlign 0 = left, 0.5 = center, 1 = right.
   */
  static drawAlignedCellText(ctx, value, x, y, w, h, fontSize, fgColor, params) {
    const text = value;
    const font = `${fontSize}px sans-serif`;
    const pad = 10;
    const displayText = text;
    if (!displayText) return;

    ctx.fillStyle = ColorEngine.toCSS(fgColor);
    ctx.textAlign = 'left';

    ctx.font = font;
    const textW = ctx.measureText(text).width;
    const available = w - pad - textW;
    const align = params.textAlign ?? 0;
    const tx = x + pad / 2 + align * available;

    ctx.fillText(displayText, tx, y + h / 2);
  }

  static draw2d(ctxMix, node, params) {
    const ctx    = ctxMix.ctx;
    const cursor = normCursor(ctxMix.flyweight?.cursor);
    if (!ctx || !cursor) return;

    const zoom = params.zoom || 1;
    const { x, y, w, h } = this._bounds(node, zoom);
    const cfg = this.config;

    const active = normCursor(ctxMix.activeCursor);
    const text   = cfg.getText(ctxMix, cursor);
    if (text == null) return;

    const pad = 3 * zoom;
    const gap = 2 * zoom;

    const state = cfg.getState(ctxMix, cursor, active);
    const hue   = cfg.getHue(ctxMix, cursor);
    const style = STATE_STYLES[state];

    // Background
    ctx.fillStyle   = `hsl(${hue}, ${style.sat}%, ${style.lit}%)`;
    ctx.strokeStyle = `hsl(${hue}, ${style.sat}%, ${style.bLit}%)`;
    ctx.lineWidth   = style.lineWidth;

    roundRect(ctx, x + pad, y + gap, w - pad * 2, h - gap * 2, 5 * zoom);
    ctx.fill();
    ctx.stroke();

    // Accent bar
    if (style.accent) {
      ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
      roundRect(ctx,
        x + pad + 2 * zoom,
        y + gap + 3 * zoom,
        3 * zoom,
        h - gap * 2 - 6 * zoom,
        1.5 * zoom);
      ctx.fill();
    }

    // ── Blob / Text ─────────────────────────────────────
    const blobAmount = params.blobMode ?? 0;
    const textColor  = [
      Math.max(0, (style.sat - 10)) * 2.55,
      style.tLit * 2.55,
      style.tLit * 2.55,
    ];
    // Use hue-derived text color
    const fgCSS = `hsl(${hue}, ${Math.max(0, style.sat - 10)}%, ${style.tLit}%)`;
    const fgRGB = ColorEngine.fromCSS?.(fgCSS) ?? [255, 255, 255];

    const cx = x + w / 2;
    const cy = y + h / 2;
    const fontSize = cfg.getBaseFontSize(cursor) * zoom;

    if (blobAmount > 0.01) {
      const maxRadius = Math.min(w - pad * 2, h - gap * 2) / 2 * 0.8;
      // For tree cells, use default 0.5 normalised radius
      const vis = cfg.resolveVisuals(ctxMix, cursor, params);
      const radius = maxRadius * (vis.blobRadius || 0.5);

      ctx.globalAlpha = blobAmount;
      drawBlob(ctx, cx, cy, radius, fgRGB);
      ctx.globalAlpha = 1;

      if (blobAmount < 0.99) {
        ctx.globalAlpha = 1 - blobAmount;
        ctx.fillStyle    = fgCSS;
        ctx.font         = `${fontSize}px monospace`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        const textX = x + cfg.getTextInset(state) * zoom;
        ctx.fillText(text, textX, cy, w - 28 * zoom);
        ctx.globalAlpha = 1;
      }
    } else {
      // Text only
      ctx.fillStyle    = fgCSS;
      ctx.font         = `${fontSize}px monospace`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      const textX = x + cfg.getTextInset(state) * zoom;
      ctx.fillText(text, textX, cy, w - 28 * zoom);
    }
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;

    const zoom = params.zoom || 1;
    const { x, y, w, h } = this._bounds(node, zoom);

    if (pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h) {
      const cursor = ctxMix.flyweight?.cursor;
      ctxMix.hitResult = {
        cursor:       cursor ? [...cursor] : cursor,
        position:     node.yOffset || 0,
        size:         node.height  || 0,
        interactions: ctxMix.flyweight.interactions
                        ? { ...ctxMix.flyweight.interactions } : {},
      };
      ctxMix.flyweight.interactions = {};
    }
  }
}

/**
 * SheetCellNode — rectangular cell with value-based coloring.
 *
 * Uses CellConfig.resolveVisuals for all color, opacity, and blob
 * decisions.  Draws an unrounded rectangle with optional blob and
 * distance-matrix triangle fade.
 */
class SheetCellNode extends ScrollCellNode {
  static config = new CellConfig();

  static draw2d(ctxMix, node, params) {
    const ctx    = ctxMix.ctx;
    const cursor = normCursor(ctxMix.flyweight?.cursor);
    if (!ctx || !cursor) return;

    const zoom = params.zoom || 1;
    const { x, y, w, h } = this._bounds(node, zoom);
    const cfg = this.config;

    const active = normCursor(ctxMix.activeCursor);
    const text   = cfg.getText(ctxMix, cursor);
    if (text == null) return;

    const state = cfg.getState(ctxMix, cursor, active);
    const hue   = cfg.getHue(ctxMix, cursor);
    const style = STATE_STYLES[state];

    const pad = 3 * zoom;
    const gap = 2 * zoom;
    const fontSize = cfg.getBaseFontSize(cursor) * zoom;

    // ── Resolve colors, opacity, blob from real data ─────
    const vis = cfg.resolveVisuals(ctxMix, cursor, params);

    if (vis.opacity < 0.01) return;   // distance-matrix culling

    let { bg, fg } = vis;

    // Highlight override: brighten background for selected cell
    if (state === 'path') bg = [70, 80, 120];

    // ── Background ───────────────────────────────────────
    ctx.globalAlpha = vis.opacity;
    ctx.fillStyle = ColorEngine.toCSS(bg);
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // ── Blob / Text ──────────────────────────────────────
    const blobAmount = params.blobMode ?? 0;

    if (blobAmount > 0.01) {
      const maxRadius = Math.min(w, h) / 2 * 0.8;
      const radius = maxRadius * vis.blobRadius;

      ctx.globalAlpha = vis.opacity * blobAmount;
      drawBlob(ctx, x + w / 2, y + h / 2, radius, fg);

      if (blobAmount < 0.99) {
        ctx.globalAlpha = vis.opacity * (1 - blobAmount);
        this.drawAlignedCellText(ctx, text, x, y, w, h, fontSize, fg, params);
      }
    } else {
      this.drawAlignedCellText(ctx, text, x, y, w, h, fontSize, fg, params);
    }

    ctx.globalAlpha = 1;

    // ── Selection outline (hue-based, as in base class) ──
    ctx.beginPath();
    roundRect(ctx, x + pad, y + gap, w - pad * 2, h - gap * 2, 5 * zoom);
    ctx.strokeStyle = `hsl(${hue}, ${style.sat}%, ${style.bLit}%)`;
    ctx.lineWidth   = style.lineWidth;
    ctx.stroke();
  }
}

sceneRegistry.registerNodeClass('sheet-cell', SheetCellNode );


// ============================================================
// WarpableCellNode — warped polygon cell (path-aware)
// ============================================================
// Renders via WarpedPolygon. Reads pre-computed segments from
// the grid node to apply neighborliness (cross-column blending) and
// curviness (edge bend scaling). Handles corner reversal so
// topPath draws the visual top/outer edge.

class WarpableCellNode extends ScrollCellNode {
  static config = new CellConfig();

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt || !ctxMix.ctx) return;

    const corners = ctxMix.flyweight?.corners;
    if (!corners) return;

    const bends = ctxMix.flyweight?.bends || [0, 0, 0, 0];
    const pathD = WarpedPolygon.path(corners, bends);
    const path2D = new Path2D(pathD);

    const ctx = ctxMix.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const inside = ctx.isPointInPath(path2D, pt.x, pt.y);
    ctx.restore();
 
//    console.log('hit_test cell', ctxMix.flyweight.cursor, 'inside:', inside,
//      'pt:', pt.x.toFixed(0), pt.y.toFixed(0),
//      'c0:', corners[0].x.toFixed(0), corners[0].y.toFixed(0),
//      'c2:', corners[2].x.toFixed(0), corners[2].y.toFixed(0));
    if (inside) {
      ctxMix.hitResult = {
        cursor:       ctxMix.flyweight.cursor
                        ? [...ctxMix.flyweight.cursor] : null,
        interactions: ctxMix.flyweight.interactions
                        ? { ...ctxMix.flyweight.interactions } : {},
      };
      // protect returned values from future mutation
      ctxMix.flyweight.interactions = {};
    }
  }


  static draw2d(ctxMix, node, params) {
    const coordinator = ctxMix.coordinator;
    const data = coordinator?.data;
    if (!data) return;

    let corners, bends, color,text;
    const curviness = params.curviness ?? 0;
    const showValue = params.showValue ?? 1.0;
    const stack     = params.stack ?? 1;
    const innerPath = ctxMix.innerPath;
    const cursor    = ctxMix.flyweight?.cursor;
    const active    = normCursor(ctxMix.activeCursor);
    let state = 'none';

    if( innerPath ){
      if (!cursor || !Array.isArray(cursor)) return;
      const col = cursor[0];
      const row = cursor[cursor.length - 1];

      // ── Look up segment from adapter ───────────────────────
      const innerPath = ctxMix.innerPath;
      const neighborliness  = params.neighborliness ?? 0;
      const bendStack = params.bendStack ?? 0;

      const seg = data.getSegment(cursor, params);
      if (!seg) return;

      color = seg.color;

      const ft0 = ctxMix.flyweight.t0;
      const ft1 = ctxMix.flyweight.t1;
      const t0 = lerp(seg.y0, ft0, stack);
      const t1 = lerp(seg.y1, ft1, stack);


//      if (col === 0) {
//        console.log('draw [0,' + row + '] t:', t0?.toFixed(3), t1?.toFixed(3));
//      }
//
//      if (col === 0 && row === 0) {
//        console.log('cell [0,0] flyweight t:', t0?.toFixed(3), t1?.toFixed(3),
//          'seg t:', seg.y0?.toFixed(3), seg.y1?.toFixed(3));
//      }

      // Neighbor blending: for grid data, same draw-order position
      // in adjacent column. For tree data, skip naive index matching
      // — parent weights already ensure proportional alignment.
      const nextCol = (col + 1) % data.rowCount;
      let t0A = t0, t1A = t1;
      if (!data.isTreeChart) {
        const nextSeg = data.getSegment([nextCol, row], params);
        if (nextSeg) {
          t0A = lerp(nextSeg.y0, t0, 1 - neighborliness);
          t1A = lerp(nextSeg.y1, t1, 1 - neighborliness);
          t0A = lerp(t0A, t0, bendStack);
          t1A = lerp(t1A, t1, bendStack);
        }
      }

      corners = innerPath.cornersAt(t0, t1, t0A, t1A);
      bends   = innerPath.edgeBends(t0, t1);

      // ── Compute corners from inner path ──────────────────
      //text    = String(data.getValue([col, seg.origIdx??0]));
      text = data.getDisplayText([col, seg.origIdx ?? 0], params);

      //corners = innerPath.cornersAt(t0, t1, t0A, t1A);
      //bends   = innerPath.edgeBends(t0, t1);
      state   = this.config.getState(ctxMix, cursor, active);
    } else {
      const cfg = this.config;

      const fwCorners = ctxMix.flyweight?.corners;
      const fwBends   = ctxMix.flyweight?.bends;
      state = cfg.getState(ctxMix, cursor, active);
      const hue   = cfg.getHue(ctxMix, cursor);
      const style = STATE_STYLES[state];

      color   = `hsl(${hue}, ${style.sat}%, ${style.lit}%)`;
      text   = cfg.getText(ctxMix, cursor);

      //ctx.fillStyle   = `hsl(${hue}, ${style.sat}%, ${style.lit}%)`;
      //ctx.strokeStyle = `hsl(${hue}, ${style.sat}%, ${style.bLit}%)`;
      //ctx.lineWidth   = style.lineWidth;

      corners = fwCorners;
      bends   = fwBends || [0, 0, 0, 0];
    }

    // Skip degenerate
    if (corners[0].distanceTo(corners[1]) < 0.5
     && corners[2].distanceTo(corners[3]) < 0.5) return;

    // No reversal needed: inner path goes upward/outward,
    // cornersAt puts t1 (top/outer) at indices [2,3],
    // which is where topPath draws edge 2→3.
    const scaledBends = bends.map(b => b * curviness);

    const geoms = [{ type: 'warpedpoly', corners, bends: scaledBends, color: color}];

    if( params?.roundedCorners > 0.5)
      RoundedWarpedPolygon.render(ctxMix, geoms, params);
    else
      WarpedPolygon.render(ctxMix, geoms, params);
    // ── Text & Accent ───────────────────────────────────
    const ctx = ctxMix.ctx;
    const hue = this.config.getHue(ctxMix, cursor);

    // Centroid — used by accent flash and blob
    const centroid = corners[0].add(corners[1]).add(corners[2]).add(corners[3]).scale(0.25);

    // ── Accent flash ────────────────────────────────────
    const flash = params.flash ?? 0.5;
    const flashW = 6;
    if (flash > 0.01 && state === 'path' && ctx) {
      const mid03 = corners[0].lerp(corners[3], 0.5);
      const mid12 = corners[1].lerp(corners[2], 0.5);
      const leftIs03 = false;
      const p0   = leftIs03 ? corners[0] : corners[1];
      const p1   = leftIs03 ? corners[3] : corners[2];
      const bend = leftIs03 ? scaledBends[3] : scaledBends[1];

      const nudge = 3;

      ctx.save();
      ctx.strokeStyle = innerPath ? color : `hsl(${hue}, 70%, 55%)`;
      ctx.lineWidth = flash * flashW;
      ctx.lineCap = 'round';

      const arcP = bend && Math.abs(bend) > 0.01
        ? WarpedPolygon._getArcParams(p0, p1, bend) : null;

      if (arcP) {
        let span = arcP.endAngle - arcP.startAngle;
        if (arcP.counterclockwise && span < 0) span += 2 * Math.PI;
        if (!arcP.counterclockwise && span > 0) span -= 2 * Math.PI;

        const inR = arcP.radius + nudge;
        const trim = 6/inR;
        const aA = arcP.startAngle + trim;
        const aB = arcP.startAngle + span - trim;
        ctx.beginPath();
        ctx.arc(arcP.center.x, arcP.center.y, inR, aA, aB, arcP.counterclockwise);
        ctx.stroke();
      } else {
        const dir = p1.sub(p0).normalize();
        const perp = dir.perpendicular();
        const sign = perp.dot(centroid.sub(p0.lerp(p1, 0.5))) > 0 ? 1 : -1;
        const offset = perp.scale(sign * nudge);
        const pa = p0.add( dir.scale(3)).add(offset);
        const pb = p1.sub( dir.scale(3)).add(offset);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Blob (at centroid) ──────────────────────────────
    const blobAmount = params.blobMode ?? 0;
    if (blobAmount > 0.01 && ctx) {
      // Approximate cell size from corner distances
      const cellW = corners[0].distanceTo(corners[1]);
      const cellH = corners[0].distanceTo(corners[3]);
      const maxRadius = Math.min(cellW, cellH) / 2 * 0.8;

      const vis = this.config.resolveVisuals(ctxMix, cursor, params);
      const radius = maxRadius * (vis.blobRadius || 0.5);

      const blobColor = innerPath
        ? ColorEngine.fromCSS?.(color) ?? [255, 255, 255]
        : (ColorEngine.fromCSS?.(`hsl(${hue}, 60%, 55%)`) ?? [255, 255, 255]);

      ctx.save();
      ctx.globalAlpha = blobAmount;
      drawBlob(ctx, centroid.x, centroid.y, radius, blobColor);
      ctx.restore();
    }

    // ── Text ─────────────────────────────────────────────
    const textOpacity = blobAmount < 0.99 ? 1 - blobAmount : 0;
    if (showValue >= 0.5 && text && ctx && textOpacity > 0.01) {
      const mid03 = corners[0].lerp(corners[3], 0.5);
      const mid12 = corners[1].lerp(corners[2], 0.5);
      const lx = Math.min(mid03.x, mid12.x)+ 1 + flash * flashW/2;
      const rx = Math.max(mid03.x, mid12.x)-1;
      const cy = (mid03.y + mid12.y) / 2;
      //const textW = rx - lx;

      const tiltText = params.tiltText ?? 0;
      const screenW = rx - lx;
      const crossW  = mid03.distanceTo(mid12);
      const textW   = lerp(screenW, crossW, tiltText);

      const textH = corners[0].distanceTo(corners[3]);
      const fontSize = this.config.getBaseFontSize(cursor) * (params.zoom || 1);
      const tColor = innerPath ? [255, 255, 255]
        : ColorEngine.fromCSS?.(`hsl(${hue}, ${Math.max(0, style.sat-10)}%, ${style.tLit}%)`)
          ?? [255, 255, 255];

      let textAngle = 0;
      if (tiltText > 0.01) {
        const startCross = corners[1].sub(corners[0]);
        const endCross   = corners[2].sub(corners[3]);
        const avgCross   = startCross.add(endCross).scale(0.5);
        let angle = Math.atan2(avgCross.y, avgCross.x);
        // Keep readable — flip if upside-down
        if (angle >  Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        textAngle = angle * tiltText;
      }
      ctx.save();
      ctx.globalAlpha = textOpacity;
      ctx.font = `${fontSize}px monospace`;
      ctx.textBaseline = 'middle';

      if (Math.abs(textAngle) > 0.001) {
        const tcx = (lx + rx) / 2;
        const dFlash = (flash * flashW/2)/2
        ctx.translate(tcx-dFlash, cy);
        ctx.rotate(textAngle);
        ctx.translate(dFlash, 0);
        ScrollCellNode.drawAlignedCellText(
          ctx, text, -textW / 2, -textH / 2, textW, textH, fontSize, tColor, params
        );
      } else {
        ScrollCellNode.drawAlignedCellText(
          ctx, text, lx, cy - textH / 2, textW, textH, fontSize, tColor, params
        );
      }
      ctx.restore();
    }
  }
}

sceneRegistry.registerNodeClass('warpable-cell', WarpableCellNode);

// ── Factory ────────────────────────────────────────────────────

/** Returns a class (not an instance) with the given config baked in. */
function createCellClass(config) {
  return class extends ScrollCellNode {
    static config = config;
  };
}


// ── Registration ───────────────────────────────────────────────

sceneRegistry.registerNodeClass('ms-cell',
  createCellClass(new CellConfig()));

export { CellConfig, ScrollCellNode, createCellClass };
// Auto-generated exports
if (typeof window !== 'undefined') window.DEFAULT_HUES = DEFAULT_HUES;
export { DEFAULT_HUES };
if (typeof window !== 'undefined') window.HIGHLIGHT_MODES = HIGHLIGHT_MODES;
export { HIGHLIGHT_MODES };
if (typeof window !== 'undefined') window.STATE_STYLES = STATE_STYLES;
export { STATE_STYLES };
if (typeof window !== 'undefined') window.SheetCellNode = SheetCellNode;
export { SheetCellNode };
if (typeof window !== 'undefined') window.WarpableCellNode = WarpableCellNode;
export { WarpableCellNode };
if (typeof window !== 'undefined') window.drawBlob = drawBlob;
export { drawBlob };
if (typeof window !== 'undefined') window.gridCursorRelation = gridCursorRelation;
export { gridCursorRelation };
if (typeof window !== 'undefined') window.normCursor = normCursor;
export { normCursor };
if (typeof window !== 'undefined') window.roundRect = roundRect;
export { roundRect };
if (typeof window !== 'undefined') window.treeChartCursorRelation = treeChartCursorRelation;
export { treeChartCursorRelation };
if (typeof window !== 'undefined') window.treeCursorRelation = treeCursorRelation;
export { treeCursorRelation };
