// `table-cell` — the one cell of tables and charts, drawn under any T
/**
 * `table-cell` — one cell for OmniChart's bars, segments, rings and pies and
 * for OmniGrid's table and heatmap.  It draws a quad it is given in local
 * units; T says where that lands (docs/general-t-and-grid-unwrap.md 3.2):
 *
 *   value = { quad, color, text, cursor, dataCursor }      (from the parent's flyFn)
 *   const { corners, bends } = T.mapQuad(...value.quad)
 *
 * A straight T gives a sheet cell, a bent one a radial bar or a donut segment,
 * and the cell cannot tell the difference.  D3 contract: the value comes
 * through the resolver, geometry from T, drawing on directCtx (screen px);
 * hit testing is against the mapped outline at the screen hit point.
 *
 * Text is rigid: placed at the cell's centre and, with tiltText, turned to the
 * band's direction.  Its size follows the zoom (T.affine), not the local
 * stretch of a bend.  Bent text (glyphs along an arc) is for later.
 *
 * Params (chart ones as before, with these for tables):
 *   curviness, roundedCorners, flash, blobMode, showValue, tiltText, textAlign,
 *   fillOpacity, strokeWidth, topWidth      the chart's look
 *   valueColor  0..1   fill and text from the value (CellConfig.resolveVisuals:
 *                      colour scheme, colorTarget, distance-matrix fade) instead
 *                      of the segment colour; above 0.5 it is the table look
 *   fitText     0|1    text no taller than the cell, truncated to its width,
 *                      and faded out as the cell, and so its font, gets too
 *                      small to read
 *   textPad            horizontal padding round the text, px (default 10)
 *   fontFamily         default sans-serif
 *   fontSize           base size at zoom 1 (default by depth: 10–13)
 *   textColor          CSS colour for the text, over the default (white, or
 *                      the value's contrast colour)
 *   borderColor        CSS colour of a 1 px outline round each cell
 *   focusTint          CSS colour laid over cells in the 'path' state
 *
 * CellConfig is the style policy: highlight state from the active cursor,
 * hue, and resolveVisuals (the value-to-look mapping GridScene had).
 */

import { ColorEngine } from '../colour/colour.js';
import { TextUtils } from '../2d-support/text-utils.js';
import { WarpedPolygon } from './warped-polygon.js';
import { RoundedWarpedPolygon } from './rounded-warped-polygon.js';
import { lerp } from '../2d-support/vector2d.js';
import { SYS } from '../omni-support/sys.js';

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

  if (levelA === levelB && idxA === idxB) return 'path';
  if (data.isAncestor(levelA, idxA, levelB, idxB)) return 'path';

  const treeA = data.getTreeCursor?.(levelA, idxA);
  const treeB = data.getTreeCursor?.(levelB, idxB);
  if (treeA && treeB && treeA[0] === treeB[0]) return 'category';

  return 'other';
}

/**
 * Focus relation (OmniGrid): 'path' for the rows of the focused run, asked of
 * the grid's navigator, which knows the run; the grid's sync level says which
 * column kind this is (data, row names, index).
 */
function focusCursorRelation(cursor, active, ctxMix) {
  const coord = ctxMix?.coordinator;
  return coord?.orch?.nav?.relation?.(cursor, coord.syncLevel) ?? 'other';
}

/** Mode lookup — extensible with 'column', 'cross', etc. */
const HIGHLIGHT_MODES = {
  tree:      treeCursorRelation,
  row:       gridCursorRelation,
  treeChart: treeChartCursorRelation,
  focus:     focusCursorRelation,
};

const STATE_STYLES = {
  path:     { sat: 60, lit: 32, bLit: 48, tLit: 90, lineWidth: 1.5, accent: true },
  category: { sat: 40, lit: 20, bLit: 28, tLit: 68, lineWidth: 0.5, accent: false },
  other:    { sat: 20, lit: 13, bLit: 18, tLit: 45, lineWidth: 0.5, accent: false },
};


/**
 * CellConfig — the style policy: text, hue, highlight state, and
 * resolveVisuals(), the shared value-to-visual mapping for colour, opacity
 * and blob size.
 */
class CellConfig {
  constructor({ categoryHues = null } = {}) {
    this.categoryHues = categoryHues;
  }

  getText(ctxMix, cursor) {
    return ctxMix.coordinator?.data?.getString(cursor) ?? null;
  }

  getHue(ctxMix, cursor) {
    const hues = ctxMix.categoryHues || this.categoryHues || DEFAULT_HUES;
    return hues[cursor[0] % hues.length];
  }

  /** 'path' | 'category' | 'other', by ctxMix.highlightMode. */
  getState(ctxMix, cursor, activeCursor) {
    const mode = ctxMix?.highlightMode ?? 'tree';
    const fn = HIGHLIGHT_MODES[mode] ?? treeCursorRelation;
    return fn(cursor, activeCursor, ctxMix);
  }

  /** Font size in px at zoom 1. */
  getBaseFontSize(cursor) {
    return Math.max(10, 14 - cursor.length);
  }

  /**
   * Visual properties from data: { bg, fg, opacity, blobRadius, value, isNum }.
   *   bg/fg       [r,g,b]
   *   opacity     0–1, the distance-matrix triangle fade
   *   blobRadius  0–1, normalised
   * The cursor is a data cursor, [data row, data col] at its ends.
   */
  resolveVisuals(ctxMix, cursor, params) {
    const data  = ctxMix.coordinator?.data;
    const value = data?.getValue(cursor);
    const isNum = data?.isNumeric(cursor) ?? false;
    const range = data?.globalRange ?? { min: 0, max: 1 };

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

    // Distance-matrix triangle fade, on the data's own row and column.
    let opacity = 1;
    const rc = data?.cellRowCol?.(cursor)
      ?? (data?._remapCursor ? data._remapCursor(cursor) : [cursor[0], cursor[cursor.length - 1]]);
    const shape = data?.grid ?? data;
    if (data && isNum && shape.rowCount === shape.colCount) {
      const dm = params.distanceMatrix ?? 0.5;
      const [r, c] = rc;
      if (r < c)      opacity = 1 - dm;
      else if (r > c) opacity = dm;
      opacity = Math.min(1, 2 * opacity);
    }

    let blobRadius = 0;
    if ((params.blobMode ?? 0) > 0.01) {
      if (isNum) {
        const maxAbs = Math.max(Math.abs(range.min), Math.abs(range.max));
        blobRadius = maxAbs > 0 ? Math.abs(value) / maxAbs : 0.5;
      } else {
        blobRadius = 0.5;
      }
    }

    return { bg, fg, opacity, blobRadius, value, isNum };
  }
}


/** Draw a filled circle at (cx, cy) with given pixel radius and color [r,g,b]. */
function drawBlob(ctx, cx, cy, radius, color) {
  if (radius < 0.5) return;
  ctx.fillStyle = ColorEngine.toCSS(color);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

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

/**
 * Cell text with continuous horizontal alignment (textAlign 0 left, 0.5
 * centre, 1 right) within a box w wide, vertically centred.  With truncate,
 * the text is cut to fit, as a table cell does.
 */
function drawAlignedCellText(ctx, text, x, y, w, h, fontSize, fgColor, params, font = 'sans-serif', truncate = false) {
  if (!text) return;
  const pad = params.textPad ?? 10;
  const f = `${fontSize}px ${font}`;
  ctx.font = f;
  const shown = truncate ? TextUtils.truncate(ctx, text, w - pad, f) : text;
  if (!shown) return;
  ctx.fillStyle = typeof fgColor === 'string' ? fgColor : ColorEngine.toCSS(fgColor);
  ctx.textAlign = 'left';
  const textW = ctx.measureText(shown).width;
  const tx = x + pad / 2 + (params.textAlign ?? 0) * (w - pad - textW);
  ctx.fillText(shown, tx, y + h / 2);
}

function smoothstep(x, a, b) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}


// ============================================================
// TableCellNode
// ============================================================

class TableCellNode {
  static config = new CellConfig();

  /** The cell's screen outline under T, or null if degenerate. */
  static _mapped(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    if (!v?.quad || !ctxMix.T?.mapQuad) return null;
    const { corners, bends } = ctxMix.T.mapQuad(...v.quad);
    if (corners[0].distanceTo(corners[1]) < 0.5 && corners[2].distanceTo(corners[3]) < 0.5) return null;
    return { v, corners, bends };
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.screenHitPoint ?? ctxMix.hitPoint;
    if (!pt || !ctxMix.ctx) return;
    const m = TableCellNode._mapped(ctxMix, node, params);
    if (!m) return;

    const path2D = new Path2D(WarpedPolygon.path(m.corners, m.bends.map(b => b * (params.curviness ?? 0))));
    const ctx = ctxMix.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const inside = ctx.isPointInPath(path2D, pt.x, pt.y);
    ctx.restore();

    if (inside) {
      ctxMix.hitResult = {
        cursor:       ctxMix.flyweight.cursor ? [...ctxMix.flyweight.cursor] : null,
        interactions: ctxMix.flyweight.interactions ? { ...ctxMix.flyweight.interactions } : {},
      };
      ctxMix.flyweight.interactions = {};       // protect returned values from future mutation
    }
  }

  static draw2d(ctxMix, node, params) {
    const m = TableCellNode._mapped(ctxMix, node, params);
    if (!m) return;
    const { v, corners } = m;
    const cfg = this.config;
    const cursor = v.cursor;
    const active = normCursor(ctxMix.activeCursor);
    const state  = cfg.getState(ctxMix, cursor, active);
    const curviness  = params.curviness ?? 0;
    const scaledBends = m.bends.map(b => b * curviness);
    const valueColor = params.valueColor ?? 0;
    const zoom = ctxMix.T.affine?.uniformScale ?? 1;   // text and blobs follow the zoom, not a bend's stretch

    // ── Colours: the segment's, or the value's (table look) ──
    let fill = v.color, textRGB = [255, 255, 255], alpha = 1, vis = null;
    if (valueColor > 0.5 || (params.blobMode ?? 0) > 0.01) vis = cfg.resolveVisuals(ctxMix, v.dataCursor ?? cursor, params);
    if (valueColor > 0.5) {
      fill = ColorEngine.toCSS(vis.bg);
      textRGB = vis.fg;
      alpha = vis.opacity;
      if (alpha < 0.01) return;               // distance-matrix culling
    }

    const ctx = ctxMix.directCtx ? ctxMix.directCtx() : (ctxMix.ctx.save(), ctxMix.ctx);
    ctx.globalAlpha *= alpha;

    // The renderer sets globalAlpha from the polygon's opacity, so a fade goes there.
    const geoms = [{ type: 'warpedpoly', corners, bends: scaledBends, color: fill,
                     ...(alpha < 1 ? { opacity: (params.fillOpacity ?? 1) * alpha } : {}) }];
    if (params?.roundedCorners > 0.5) RoundedWarpedPolygon.renderCtx(ctx, geoms, params);
    else WarpedPolygon.renderCtx(ctx, geoms, params);
    if (params.borderColor || (params.focusTint && state === 'path')) {
      const outline = new Path2D(WarpedPolygon.path(corners, scaledBends));
      if (params.focusTint && state === 'path') { ctx.fillStyle = params.focusTint; ctx.fill(outline); }
      if (params.borderColor) { ctx.strokeStyle = params.borderColor; ctx.lineWidth = 1; ctx.stroke(outline); }
    }
    if (params.textColor) textRGB = params.textColor;

    const hue = cfg.getHue(ctxMix, cursor);
    const centroid = corners[0].add(corners[1]).add(corners[2]).add(corners[3]).scale(0.25);

    // ── Accent flash on the selected path ──
    const flash = params.flash ?? 0.5;
    const flashW = 6;
    if (flash > 0.01 && state === 'path') {
      const p0 = corners[1], p1 = corners[2], bend = scaledBends[1];
      const nudge = 3;
      ctx.save();
      ctx.strokeStyle = valueColor > 0.5 ? `hsl(${hue}, 70%, 55%)` : v.color;
      ctx.lineWidth = flash * flashW;
      ctx.lineCap = 'round';
      const arcP = bend && Math.abs(bend) > 0.01 ? WarpedPolygon._getArcParams(p0, p1, bend) : null;
      if (arcP) {
        let span = arcP.endAngle - arcP.startAngle;
        if (arcP.counterclockwise && span < 0) span += 2 * Math.PI;
        if (!arcP.counterclockwise && span > 0) span -= 2 * Math.PI;
        const inR = arcP.radius + nudge, trim = 6 / inR;
        ctx.beginPath();
        ctx.arc(arcP.center.x, arcP.center.y, inR, arcP.startAngle + trim, arcP.startAngle + span - trim, arcP.counterclockwise);
        ctx.stroke();
      } else {
        const dir = p1.sub(p0).normalize();
        const perp = dir.perpendicular();
        const sign = perp.dot(centroid.sub(p0.lerp(p1, 0.5))) > 0 ? 1 : -1;
        const offset = perp.scale(sign * nudge);
        const pa = p0.add(dir.scale(3)).add(offset), pb = p1.sub(dir.scale(3)).add(offset);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Blob at the centroid ──
    const blobAmount = params.blobMode ?? 0;
    if (blobAmount > 0.01) {
      const cellW = corners[0].distanceTo(corners[1]);
      const cellH = corners[0].distanceTo(corners[3]);
      const radius = Math.min(cellW, cellH) / 2 * 0.8 * (vis.blobRadius || 0.5);
      ctx.save();
      ctx.globalAlpha *= blobAmount;
      drawBlob(ctx, centroid.x, centroid.y, radius, valueColor > 0.5 ? vis.fg : [255, 255, 255]);
      ctx.restore();
    }

    // ── Text, rigid, at the centre ──
    const showValue = params.showValue ?? 1.0;
    let textOpacity = blobAmount < 0.99 ? 1 - blobAmount : 0;
    const mid03 = corners[0].lerp(corners[3], 0.5);
    const mid12 = corners[1].lerp(corners[2], 0.5);
    const textH = corners[0].distanceTo(corners[3]);
    const fit = (params.fitText ?? 0) > 0.5;
    if (fit) textOpacity *= smoothstep(textH, 5, 11);
    if (showValue >= 0.5 && v.text && textOpacity > 0.01) {
      const lx = Math.min(mid03.x, mid12.x) + 1 + flash * flashW / 2;
      const rx = Math.max(mid03.x, mid12.x) - 1;
      const cy = (mid03.y + mid12.y) / 2;
      const tiltText = params.tiltText ?? 0;
      const textW = lerp(rx - lx, mid03.distanceTo(mid12), tiltText);
      let fontSize = (params.fontSize ?? cfg.getBaseFontSize(cursor)) * zoom;
      if (fit) fontSize = Math.min(fontSize, textH * 0.6);
      const fontFade = fit ? smoothstep(fontSize, 5, 7) : 1;
      const font = params.fontFamily ?? 'sans-serif';

      let textAngle = 0;
      if (tiltText > 0.01) {
        const avgCross = corners[1].sub(corners[0]).add(corners[2].sub(corners[3])).scale(0.5);
        let angle = Math.atan2(avgCross.y, avgCross.x);
        if (angle >  Math.PI / 2) angle -= Math.PI;       // keep it readable
        if (angle < -Math.PI / 2) angle += Math.PI;
        textAngle = angle * tiltText;
      }
      ctx.save();
      ctx.globalAlpha *= textOpacity * fontFade;
      ctx.textBaseline = 'middle';
      if (Math.abs(textAngle) > 0.001) {
        const tcx = (lx + rx) / 2, dFlash = (flash * flashW / 2) / 2;
        ctx.translate(tcx - dFlash, cy);
        ctx.rotate(textAngle);
        ctx.translate(dFlash, 0);
        drawAlignedCellText(ctx, v.text, -textW / 2, -textH / 2, textW, textH, fontSize, textRGB, params, font, fit);
      } else {
        drawAlignedCellText(ctx, v.text, lx, cy - textH / 2, textW, textH, fontSize, textRGB, params, font, fit);
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

SYS.NODE_CLASSES.push({ name: 'table-cell', cls: TableCellNode });

export {
  TableCellNode, CellConfig, DEFAULT_HUES, HIGHLIGHT_MODES, STATE_STYLES, focusCursorRelation,
  drawBlob, drawAlignedCellText, roundRect, normCursor,
  gridCursorRelation, treeChartCursorRelation, treeCursorRelation,
};
