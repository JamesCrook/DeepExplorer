// `grid-viewport` — OmniGrid's pane: camera, semantic zoom, bands; the table is chart machinery
/**
 * OmniGrid on the chart's machinery (docs/general-t-and-grid-unwrap.md 4).
 * A table is OmniChart with a straight path: each table column is a chart
 * column (a vstack of table-cells) whose rows scroll by the multiscroller, and
 * equal row heights make proportional sync move them as one.  This node is the
 * pane round it; it draws nothing but the background.
 *
 *   grid-viewport
 *     sticky band=body                       warpable-grid (the table) > vstack > table-cell
 *     sticky band=header pin=y               warpable-grid (one row: column names)
 *     sticky band=rows   pin=x               warpable-grid (one column: row names), synced
 *     sticky band=corner                     (fill only)
 *     sticky band=index  pin=x               warpable-grid (one cyclic column: A–Z), synced
 *
 * Built by setData, which makes fresh grids over views of the data:
 *   TableView      transposed (chart column = table column) and permuted
 *                  (reverseRows / reverseCols), values formatted to decimalPlaces
 *   HeaderView     one item per column: its name
 *   RowNamesView   one column: the row names
 *   IndexView      one column of 26 letters, cyclic
 *
 * Camera and T: the camera has x and zoom only.  The body's T is
 * translate(pane + header inset − x·zoom) · scale(zoom); rows scroll inside
 * the columns (anchor item + offset), never in T (4.1).  The viewport owns its
 * zoom: it takes only its origin from the parent's T.
 *
 * Semantic zoom (GridScene's): between zoom 0.12 and 0.5 cell heights and
 * column widths blend from a 4 px heatmap to measured table sizes; headers and
 * row names fade in from 0.12 to 0.4; cells fade their own text as they get
 * too small to read (table-cell fitText).
 *
 * Focus (GridScene's focus ranges, as the multiscroller's focal block):
 * pressing a cell focuses the run of rows around it whose values in that
 * column share a first letter, and its letter in the A–Z index; pressing a
 * letter focuses the first run starting with it.  The run is the focal block
 * of every data column and the row names, the letter that of the index, so
 * the SyncOrchestrator's proportional sync is focusAlign: at ratio 0 the
 * run's top and the letter sit at the top, at 1 at the bottom, and the index
 * scrolls at its own speed between.
 *
 * Pointer: press on a cell focuses; drag scrolls the rows (the column's own
 * drag, synced) and pans x.  Press on the index focuses a letter; drag slides
 * focusAlign.  Press elsewhere clears the focus; drag pans both ways.  Wheel
 * zooms about the cursor, pinned to a table edge that is in view.  Zoom and
 * focusAlign changed by the pointer are read back by the model (readBack), as
 * a node cannot write params during a walk.
 */

import { SYS } from '../omni-support/sys.js';
import { MiniAstNode } from '../omni-support/scene.js';
import { Transform } from '../omni-support/transform.js';
import { DataAdapter } from '../data/csv-data.js';
import { TextUtils } from '../2d-support/text-utils.js';
import { SyncOrchestrator, ScrollSync } from './multiscroller-nodes.js';
import './warpable-grid-node.js';
import './table-cell-node.js';
import './sticky-node.js';

const LAYOUT = {
  baseFontSize: 14, cellPadding: 6, headerHeight: 30, minCellSize: 4,
  indexColWidth: 28, textZoom: 0.5, heatmapZoom: 0.12,
};

const smoothstep = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** Split-point reversal, as DataAdapter.permutedRow: k = 0 natural, 1 reversed.
 *  k is clamped: a preset morph overshoots its target (k = −0.02 made index n,
 *  past the end, and a NaN width that stuck in the camera). */
function permute(i, n, k) {
  const split = Math.floor(Math.max(0, Math.min(1, k ?? 0)) * n);
  return i < split ? (n - 1) - i : i - split;
}

function formatValue(value, dp) {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(dp);
  return String(value ?? '');
}

// ============================================================
// Views — GridData-shaped, for DataAdapter
// ============================================================
// DataAdapter calls view.getValue(a, b) with a = the chart column and b = the
// item: a is a table column, b a table row (both in display order).

class TableView {
  constructor(src, opts) { this.src = src; this.opts = opts; }
  get rowCount() { return this.src.colCount; }
  get colCount() { return this.src.rowCount; }
  _r(b) { return permute(b, this.src.rowCount, this.opts.reverseRows); }
  _c(a) { return permute(a, this.src.colCount, this.opts.reverseCols); }
  getValue(a, b)  { return this.src.getValue(this._r(b), this._c(a)); }
  isNumeric(a, b) { return this.src.isNumeric(this._r(b), this._c(a)); }
  getRowName(a)   { return this.src.getColName(this._c(a)); }
  getColName(b)   { return this.src.getRowName(this._r(b)); }
  getLabel(cursor) { return formatValue(this.getValue(cursor[0], cursor[cursor.length - 1]), this.opts.decimalPlaces); }
  getString(cursor) { return this.getLabel(cursor); }
  hasRowNames() { return true; }
  get globalRange() { return this.src.globalRange; }
  getColMeta() { return null; }
  getRowMeta() { return null; }
  /** [table row, table col] of a cursor, for the distance-matrix fade. */
  cellRowCol(cursor) { return [this._r(cursor[cursor.length - 1]), this._c(cursor[0])]; }
}

class HeaderView {
  constructor(src, opts) { this.src = src; this.opts = opts; }
  get rowCount() { return this.src.colCount; }
  get colCount() { return 1; }
  getValue(a) { return this.src.getColName(permute(a, this.src.colCount, this.opts.reverseCols)); }
  isNumeric() { return false; }
  getLabel(cursor) { return this.getValue(cursor[0]); }
  getString(cursor) { return this.getLabel(cursor); }
  getRowName(a) { return this.getValue(a); }
  getColName() { return ''; }
  hasRowNames() { return false; }
  get globalRange() { return { min: 0, max: 1 }; }
  getColMeta() { return null; }
  getRowMeta() { return null; }
}

class RowNamesView {
  constructor(src, opts) { this.src = src; this.opts = opts; }
  get rowCount() { return 1; }
  get colCount() { return this.src.rowCount; }
  getValue(a, b) { return this.src.getRowName(permute(b, this.src.rowCount, this.opts.reverseRows)); }
  isNumeric() { return false; }
  getLabel(cursor) { return this.getValue(0, cursor[cursor.length - 1]); }
  getString(cursor) { return this.getLabel(cursor); }
  getRowName() { return ''; }
  getColName(b) { return this.getValue(0, b); }
  hasRowNames() { return false; }
  get globalRange() { return { min: 0, max: 1 }; }
  getColMeta() { return null; }
  getRowMeta() { return null; }
}

class IndexView {
  get rowCount() { return 1; }
  get colCount() { return 26; }
  getValue(a, b) { return String.fromCharCode(65 + (b % 26)); }
  isNumeric() { return false; }
  getLabel(cursor) { return this.getValue(0, cursor[cursor.length - 1]); }
  getString(cursor) { return this.getLabel(cursor); }
  getRowName() { return ''; }
  getColName(b) { return this.getValue(0, b); }
  hasRowNames() { return false; }
  get globalRange() { return { min: 0, max: 1 }; }
  getColMeta() { return null; }
  getRowMeta() { return null; }
  getCellColor() { return 'rgba(79, 195, 247, 0.12)'; }
}

// ============================================================
// GridFocusNavigator — the focused run as every column's focal block
// ============================================================
// Levels: a number for a data column, 'rows' for the row names, 'index' for
// the A–Z index.  focus = { run: { start, end } | null, letter: 0..25 | null }.

class GridFocusNavigator {
  constructor() { this.focus = null; }

  /** null when this column has no focal block (a letter with no run): the
   *  orchestrator then leaves the column where it is. */
  translateCursor(cursor, level) {
    const f = this.focus;
    if (level === 'index') return f?.letter != null ? [0, f.letter] : null;
    if (!f?.run) return null;
    return [level === 'rows' ? 0 : level, f.run.start];
  }

  focalCount(cursor, level) {
    const run = this.focus?.run;
    return level === 'index' || !run ? 1 : run.end - run.start + 1;
  }

  lastFocalCursor(cursor, level) {
    const f = this.focus;
    if (level === 'index') return [0, f?.letter ?? 0];
    return [level === 'rows' ? 0 : level, f?.run ? f.run.end : cursor[cursor.length - 1]];
  }

  /** For the cells' 'focus' highlight. */
  relation(cursor, syncLevel) {
    const f = this.focus;
    if (!f) return 'other';
    const i = cursor[cursor.length - 1];
    if (syncLevel === 'index') return f.letter != null && i % 26 === f.letter ? 'path' : 'other';
    return f.run && i >= f.run.start && i <= f.run.end ? 'path' : 'other';
  }
}

// ============================================================
// The tree
// ============================================================

const GRID_SHAPE = {     // the chart params that make a chart a table
  bend: 0, bendStack: 0, gridiness: 0, rotateChart: 0, rotateStack: Math.PI,
  segmentWidth: 1, segmentGap: 0, baseline: 0.5, alignment: 0, selfLevel: 0,
  stack: 1, normalize: 0, neighborliness: 0, curviness: 0, useValue: 0,
  showValue: 1, flash: 0, tiltText: 0, fillOpacity: 1, strokeWidth: 0,
  topWidth: 0, roundedCorners: 0, fitText: 1, fontFamily: 'sans-serif',
};

const BAND_STYLE = {
  body:   { valueColor: 1, fontSize: LAYOUT.baseFontSize, textPad: LAYOUT.cellPadding, borderColor: 'rgba(0,0,0,0.2)',
            focusTint: 'rgba(79, 195, 247, 0.15)' },
  header: { valueColor: 0, fillOpacity: 0, textColor: '#ccc', fontSize: 12, textAlign: 0.5, textPad: 4,
            blobMode: 0, borderColor: null, focusTint: null },
  rows:   { valueColor: 0, fillOpacity: 0, textColor: '#ccc', fontSize: 12, textAlign: 1, textPad: 8,
            blobMode: 0, borderColor: null, focusTint: 'rgba(79, 195, 247, 0.15)' },
  index:  { valueColor: 0, fillOpacity: 1, textColor: '#4fc3f7', fontSize: 12, textAlign: 0.5,
            blobMode: 0, roundedCorners: 6, borderColor: null, focusTint: 'rgba(79, 195, 247, 0.35)' },
};

/** A grid over a view.  A table cell's text is its view's label: the
 *  formatted value, or the name (not the chart's "value: label"). */
function gridOver(view) {
  const data = new DataAdapter(view);
  data.getDisplayText = (cursor) => view.getLabel(cursor);
  return new MiniAstNode('warpable-grid', [new MiniAstNode('vstack', [new MiniAstNode('table-cell')])], data);
}

// ============================================================
// GridViewportNode
// ============================================================

class GridViewportNode {

  static _state(node) {
    return node.inst ??= {
      raw: null, opts: { reverseRows: 0, reverseCols: 0, decimalPlaces: 2 },
      camera: { x: 0, zoom: 1 }, rowTop: 0, dims: null, grids: null, orch: null, nav: null,
      seen: {}, layout: null, focusDrag: null,
    };
  }

  /** New data (raw GridData, or null): fresh grids and views; the view resets. */
  static setData(node, raw) {
    const st = GridViewportNode._state(node);
    st.raw = raw;
    st.dims = null;
    st.camera = { x: 0, zoom: 1 };
    st.rowTop = 0;
    st.nav = new GridFocusNavigator();
    st.orch = new SyncOrchestrator(st.nav);
    if (!raw) { node.subtree = []; st.grids = null; return; }

    const body = gridOver(new TableView(raw, st.opts));
    const header = gridOver(new HeaderView(raw, st.opts));
    const rows = gridOver(new RowNamesView(raw, st.opts));
    const index = gridOver(new IndexView());
    const bodyAdapter = body.value;
    bodyAdapter.cellRowCol = (cursor) => bodyAdapter.grid.cellRowCol(cursor);
    body.sharedOrch = rows.sharedOrch = index.sharedOrch = st.orch;
    rows.syncLevel = 'rows';
    index.syncLevel = 'index';
    index.cyclic = true;
    for (const g of [body, rows, index]) g.highlightMode = 'focus';
    st.grids = { body, header, rows, index };

    const sticky = (band, child, extra) => new MiniAstNode('sticky', child ? [child] : [],
      { band, params: BAND_STYLE[band], ...extra });
    node.subtree = [
      sticky('body', body),
      sticky('header', header, { pin: 'y', fill: '#1a1a2e', interactive: false }),
      sticky('rows', rows, { pin: 'x', fill: '#1a1a2e', interactive: false }),
      sticky('corner', null, { fill: '#1a1a2e', interactive: false }),
      sticky('index', index, { pin: 'x', fill: '#1a1a2e' }),
    ];
  }

  /** The data as shown, wrapped as the old renderer had it (for saving a CSV). */
  static data(node) {
    const raw = node.inst?.raw;
    return raw ? new DataAdapter(raw) : null;
  }

  // ── Dimensions (GridScene's measuring) ─────────────────────

  static _measure(st, ctx) {
    const key = `${st.opts.decimalPlaces}`;
    if (st.dims?.key === key && st.dims.raw === st.raw) return st.dims;
    const raw = st.raw, font = `${LAYOUT.baseFontSize}px sans-serif`, pad = LAYOUT.cellPadding;
    ctx.save(); ctx.font = font;
    const base = [], withHeaders = [];
    const sampleRows = Math.min(100, raw.rowCount);
    const range = raw.globalRange;
    for (let c = 0; c < raw.colCount; c++) {
      let w = 40, wh = Math.max(40, TextUtils.measure(ctx, raw.getColName(c), font) + pad * 2), hasText = false;
      for (let r = 0; r < sampleRows; r++) {
        const row = Math.floor(r * raw.rowCount / sampleRows);
        const isNum = raw.isNumeric(row, c);
        let text;
        if (isNum) {
          const maxAbs = Math.max(Math.abs(range.min), Math.abs(range.max)).toFixed(st.opts.decimalPlaces);
          text = range.min < 0 ? '-' + maxAbs : maxAbs;
        } else { hasText = true; text = formatValue(raw.getValue(row, c), st.opts.decimalPlaces); }
        const cw = TextUtils.measure(ctx, text, font) + pad * 2;
        w = Math.max(w, cw); wh = Math.max(wh, cw);
      }
      const limit = hasText ? 1200 : 150;
      base[c] = Math.min(w, limit);
      withHeaders[c] = Math.min(wh, limit);
    }
    let rowNameWidth = 50;
    for (let r = 0; r < sampleRows; r++) {
      const row = Math.floor(r * raw.rowCount / sampleRows);
      rowNameWidth = Math.max(rowNameWidth, TextUtils.measure(ctx, raw.getRowName(row), font) + pad * 2);
    }
    ctx.restore();
    st.dims = { key, raw, base, withHeaders, rowNameWidth: Math.min(rowNameWidth, 120),
                cellHeight: LAYOUT.baseFontSize + pad * 2, zoomRange: null };
    return st.dims;
  }

  /** Cell height and column widths (table order) at a zoom. */
  static _sizesAt(st, params, zoom) {
    const d = st.dims, t = smoothstep(zoom, LAYOUT.heatmapZoom, LAYOUT.textZoom), h = params.headersAffectWidth ?? 0;
    return {
      t,
      cellHeight: lerp(LAYOUT.minCellSize, d.cellHeight, t),
      colWidths: d.base.map((w, c) => lerp(LAYOUT.minCellSize, lerp(w, d.withHeaders[c], h), t)),
    };
  }

  /** Header and row-name insets, in screen px, at a zoom. */
  static _insets(st, zoom) {
    const op = smoothstep(zoom, LAYOUT.heatmapZoom, LAYOUT.textZoom * 0.8);
    return op > 0.01 ? { x: st.dims.rowNameWidth * zoom, y: LAYOUT.headerHeight * zoom, op } : { x: 0, y: 0, op };
  }

  static _zoomRange(st, params, W, H) {
    const d = st.dims;
    if (d.zoomRange && d.zoomRange.W === W && d.zoomRange.H === H) return d.zoomRange;
    let lo = 0.001, hi = 2.0;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2, s = GridViewportNode._sizesAt(st, params, mid);
      const totalW = s.colWidths.reduce((a, b) => a + b, 0) * mid;
      const totalH = st.raw.rowCount * s.cellHeight * mid;
      if (totalW <= W - d.rowNameWidth && totalH <= H - LAYOUT.headerHeight) lo = mid; else hi = mid;
    }
    return d.zoomRange = { min: lo / 2, max: 2.0, W, H };
  }

  // ── Rows: every data column and the row names share one row position ──

  static _rowPanels(st) {
    return st.orch.panels.filter(p => p.level !== 'index').map(p => p.state);
  }

  /** The table's top edge relative to the body's top, local px (≤ 0 when
   *  scrolled), as a row panel has it: the given one (a column just dragged),
   *  else the first. */
  static _readRowTop(st, ch, panel) {
    const s = panel ?? GridViewportNode._rowPanels(st)[0];
    if (!s) return st.rowTop;
    return s.scrollOffset - s.anchorCursor[s.anchorCursor.length - 1] * ch;
  }

  /** Put every row panel at the same table top, clamped to the table's ends. */
  static _setRowTop(st, y0, ch, viewH) {
    const n = st.raw.rowCount;
    y0 = Math.max(Math.min(0, viewH - n * ch), Math.min(0, y0));
    st.rowTop = y0;
    for (const s of GridViewportNode._rowPanels(st)) {
      s.scrollOffset = y0 + s.anchorCursor[s.anchorCursor.length - 1] * ch;
    }
    return y0;
  }

  // ── Camera ─────────────────────────────────────────────────

  static _clampX(st, L) {
    const maxX = Math.max(0, L.totalW - L.viewW);
    // Never keep a non-finite camera: NaN survives every clamp and every later frame.
    const x = Number.isFinite(st.camera.x) ? st.camera.x : 0;
    st.camera.x = Number.isFinite(maxX) ? Math.max(0, Math.min(maxX, x)) : 0;
    if (!Number.isFinite(st.camera.zoom) || st.camera.zoom <= 0) st.camera.zoom = 1;
  }

  /** Zoom by factor about screen point (px, py), pinned to a table edge in view. */
  static zoomAt(node, params, factor, px, py) {
    const st = node.inst, L = st.layout;
    if (!L) return;
    const old = st.camera.zoom, range = GridViewportNode._zoomRange(st, params, L.W, L.H);
    const z = Math.max(range.min, Math.min(range.max, old * factor));
    const o0 = GridViewportNode._insets(st, old), o1 = GridViewportNode._insets(st, z);
    const s0 = GridViewportNode._sizesAt(st, params, old), s1 = GridViewportNode._sizesAt(st, params, z);
    const pinX = st.camera.x < 0.5;
    const y0 = GridViewportNode._readRowTop(st, s0.cellHeight), pinY = y0 > -0.5;

    // x: keep the data under the cursor (in column-width units, which also rescale)
    const lx = (px - L.ox - o0.x) / old + st.camera.x;
    const colFrac = GridViewportNode._xToColumnUnits(s0.colWidths, lx, st);
    const lx1 = GridViewportNode._columnUnitsToX(s1.colWidths, colFrac, st);
    st.camera.x = pinX ? 0 : lx1 - (px - L.ox - o1.x) / z;
    // rows: keep the row under the cursor
    const ly0 = (py - L.oy - o0.y) / old, rowF = (ly0 - y0) / s0.cellHeight;
    const ly1 = (py - L.oy - o1.y) / z;
    st.camera.zoom = z;
    const viewH = (L.H - o1.y) / z;
    GridViewportNode._setRowTop(st, pinY ? 0 : ly1 - rowF * s1.cellHeight, s1.cellHeight, viewH);
    // index: keep its rows in row units
    const idx = st.orch.panels.find(p => p.level === 'index')?.state;
    if (idx) idx.scrollOffset *= s1.cellHeight / s0.cellHeight;
    const totalW = s1.colWidths.reduce((a, b) => a + b, 0);
    GridViewportNode._clampX(st, { totalW, viewW: (L.W - o1.x) / z });
  }

  static _xToColumnUnits(widths, x, st) {
    let acc = 0;
    const n = widths.length;
    for (let d = 0; d < n; d++) {
      const w = widths[permute(d, n, st.opts.reverseCols)];
      if (x < acc + w) return d + (x - acc) / w;
      acc += w;
    }
    return n;
  }

  static _columnUnitsToX(widths, u, st) {
    let acc = 0;
    const n = widths.length;
    for (let d = 0; d < n; d++) {
      const w = widths[permute(d, n, st.opts.reverseCols)];
      if (u < d + 1) return acc + (u - d) * w;
      acc += w;
    }
    return acc;
  }

  static resetView(node) {
    const st = node.inst;
    if (!st?.raw) return;
    st.camera = { x: 0, zoom: 1 };
    st.nav.focus = null;
    st.orch.activeCursor = null;
    for (const p of st.orch.panels) { p.state.anchorCursor = [p.state.anchorCursor[0], 0]; p.state.scrollOffset = 0; }
    st.rowTop = 0;
  }

  // ── Focus ──────────────────────────────────────────────────

  static _firstChar(st, row, col) {
    const s = String(st.raw.getValue(permute(row, st.raw.rowCount, st.opts.reverseRows),
                                     permute(col, st.raw.colCount, st.opts.reverseCols)) ?? '');
    return s ? s[0].toUpperCase() : '';
  }

  /** GridScene's computeFocusFromDataCell: the run of same-initial rows round (row, col). */
  static focusFromCell(st, row, col) {
    const letter = GridViewportNode._firstChar(st, row, col);
    if (!letter) return { run: { start: row, end: row }, letter: null };
    let start = row, end = row;
    while (start > 0 && GridViewportNode._firstChar(st, start - 1, col) === letter) start--;
    while (end < st.raw.rowCount - 1 && GridViewportNode._firstChar(st, end + 1, col) === letter) end++;
    const li = letter.charCodeAt(0) - 65;
    return { run: { start, end }, letter: li >= 0 && li < 26 ? li : null };
  }

  /** First letter of a row's name (display order). */
  static _nameChar(st, row) {
    const s = String(st.raw.getRowName(permute(row, st.raw.rowCount, st.opts.reverseRows)) ?? '');
    return s ? s[0].toUpperCase() : '';
  }

  /** GridScene's computeFocusFromIndex: the first run starting with the letter,
   *  in the first data column; failing that, in the row names (a CSV's text
   *  first column becomes its row names, so a names table has its names there). */
  static focusFromIndex(st, letter) {
    const ch = String.fromCharCode(65 + letter);
    const find = (charOf) => {
      let start = -1, end = -1;
      for (let r = 0; r < st.raw.rowCount; r++) {
        if (charOf(r) === ch) { if (start < 0) start = r; end = r; }
        else if (start >= 0) break;
      }
      return start >= 0 ? { start, end } : null;
    };
    const run = find(r => GridViewportNode._firstChar(st, r, 0))
             ?? (st.raw.hasRowNames?.() ? find(r => GridViewportNode._nameChar(st, r)) : null);
    return { run, letter };
  }

  /** Make focus the navigator's, re-anchoring every panel on its focal block where it now is. */
  static _applyFocus(st, focus) {
    const L = st.layout, ch = L.cellHeight;
    st.nav.focus = focus;
    st.orch.activeCursor = focus ? ['focus'] : null;
    if (!focus) return;
    const y0 = GridViewportNode._readRowTop(st, ch);
    for (const p of st.orch.panels) {
      const s = p.state;
      if (p.level === 'index') {
        if (focus.letter == null) continue;
        // the copy of the letter nearest where the index is now: the column
        // repeats every 26 rows, so anchor on the letter at that copy's place
        const a = s.anchorCursor[1];
        const k = Math.round((a - focus.letter) / 26);
        s.scrollOffset += (focus.letter + 26 * k - a) * ch;
        s.anchorCursor = [0, focus.letter];
      } else if (focus.run) {
        s.anchorCursor = [s.anchorCursor[0], focus.run.start];
        s.scrollOffset = y0 + focus.run.start * ch;
      }
    }
  }

  /** The source panel for focusAlign: a data column with the run, else the index. */
  static _alignSource(st) {
    const f = st.nav.focus;
    if (!f) return -1;
    return st.orch.panels.findIndex(p => f.run ? typeof p.level === 'number' : p.level === 'index');
  }

  static setFocusAlign(node, t) {
    const st = node.inst, L = st?.layout;
    if (!L || !st.nav.focus) return;
    const i = GridViewportNode._alignSource(st);
    if (i < 0) return;
    const s = st.orch.panels[i].state, f = st.nav.focus;
    const size = f.run && st.orch.panels[i].level !== 'index' ? (f.run.end - f.run.start + 1) * L.cellHeight : L.cellHeight;
    s.scrollOffset = ScrollSync.position(Math.max(0, Math.min(1, t)), size, L.viewH);
    st.orch.syncFrom(i);
    if (f.run) GridViewportNode._setRowTop(st, GridViewportNode._readRowTop(st, L.cellHeight), L.cellHeight, L.viewH);
  }

  static getFocusAlign(st) {
    const L = st.layout, f = st.nav?.focus;
    if (!L || !f) return null;
    const i = GridViewportNode._alignSource(st);
    if (i < 0) return null;
    const s = st.orch.panels[i].state;
    const size = f.run && st.orch.panels[i].level !== 'index' ? (f.run.end - f.run.start + 1) * L.cellHeight : L.cellHeight;
    return ScrollSync.ratio(s.scrollOffset, size, L.viewH);
  }

  // ── Model hooks (as grid-view had) ─────────────────────────

  /** What the pointer changed since params were last applied: { zoom, focusAlign }. */
  static readBack(node, params) {
    const st = node.inst;
    if (!st?.layout) return {};
    const moved = {};
    if (params.zoom === st.seen.zoom && st.camera.zoom !== st.seen.zoom) moved.zoom = st.seen.zoom = st.camera.zoom;
    const fa = GridViewportNode.getFocusAlign(st);
    if (fa != null && params.focusAlign === st.seen.focusAlign && Math.abs(fa - (st.seen.focusAlign ?? -1)) > 1e-6) {
      moved.focusAlign = st.seen.focusAlign = fa;
    }
    return moved;
  }

  static markZoom(node, zoom) { GridViewportNode._state(node).seen.zoom = zoom; }

  /** The body cell under a screen point: { row, col } in display order, or null. */
  static cellAt(node, x, y) {
    const st = node.inst, L = st?.layout;
    if (!L || !st.raw) return null;
    const z = st.camera.zoom;
    if (x < L.ox + L.ins.x || y < L.oy + L.ins.y || x > L.ox + L.W || y > L.oy + L.H) return null;
    const lx = (x - L.ox - L.ins.x) / z + st.camera.x, ly = (y - L.oy - L.ins.y) / z;
    const row = Math.floor((ly - L.rowTop) / L.cellHeight);
    const u = GridViewportNode._xToColumnUnits(GridViewportNode._sizesAt(st, { headersAffectWidth: st.lastHAW }, z).colWidths, lx, st);
    const col = Math.floor(u);
    if (row < 0 || row >= st.raw.rowCount || col < 0 || col >= st.raw.colCount) return null;
    return { row, col };
  }

  /** Visible rows and columns, and the totals, for the info line. */
  static visibleRange(node) {
    const st = node.inst, L = st?.layout;
    if (!L || !st.raw) return null;
    const first = Math.max(0, Math.floor(-L.rowTop / L.cellHeight));
    const last = Math.min(st.raw.rowCount - 1, Math.ceil((L.viewH - L.rowTop) / L.cellHeight) - 1);
    const b = st.grids.body.inst;
    return { startRow: first, endRow: last, startCol: b?.firstCol ?? 0, endCol: b?.lastCol ?? 0,
             rowCount: st.raw.rowCount, colCount: st.raw.colCount };
  }

  // ── Per frame: params in, layout out, grids stamped ────────

  static _frame(ctxMix, node, params) {
    const st = GridViewportNode._state(node);
    if (!st.raw || !ctxMix.ctx) return null;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const W = ctxMix.W ?? ctxMix.ctx.canvas.width / dpr, H = ctxMix.H ?? ctxMix.ctx.canvas.height / dpr;
    const o = ctxMix.T?.affine?.origin ?? { x: 0, y: 0 };

    // options; a change of decimal places re-measures
    const dp = Math.max(0, Math.min(20, Math.round(params.decimalPlaces ?? 2)));   // a morph overshoots
    if (dp !== st.opts.decimalPlaces) st.opts.decimalPlaces = dp;
    st.opts.reverseRows = params.reverseRows ?? 0;
    st.opts.reverseCols = params.reverseCols ?? 0;
    GridViewportNode._measure(st, ctxMix.ctx);
    if (!st.layout) st.layout = { W, H, ox: o.x, oy: o.y, cellHeight: st.dims.cellHeight, viewH: H, rowTop: 0 };

    // zoom and focusAlign from the sliders (seen.* = last applied or read back)
    if (params.zoom !== undefined && params.zoom !== st.seen.zoom) {
      st.layout.W = W; st.layout.H = H;
      GridViewportNode.zoomAt(node, params, params.zoom / st.camera.zoom, o.x + W / 2, o.y + H / 2);
      st.seen.zoom = params.zoom;
    }

    const z = st.camera.zoom;
    st.lastHAW = params.headersAffectWidth ?? 0;
    const sizes = GridViewportNode._sizesAt(st, params, z);
    const ins = GridViewportNode._insets(st, z);
    const n = st.raw.colCount;
    const colW = Array.from({ length: n }, (_, d) => sizes.colWidths[permute(d, n, st.opts.reverseCols)]);
    const totalW = colW.reduce((a, b) => a + b, 0);
    const viewH = (H - ins.y) / z, viewW = (W - ins.x) / z;
    GridViewportNode._clampX(st, { totalW, viewW });
    const L = st.layout = { W, H, ox: o.x, oy: o.y, cellHeight: sizes.cellHeight, viewH, viewW, totalW,
                            ins, rowTop: st.rowTop };

    if (params.focusAlign !== undefined && params.focusAlign !== st.seen.focusAlign && st.nav.focus) {
      GridViewportNode.setFocusAlign(node, params.focusAlign);
      st.seen.focusAlign = params.focusAlign;
    }
    L.rowTop = GridViewportNode._setRowTop(st, GridViewportNode._readRowTop(st, sizes.cellHeight), sizes.cellHeight, viewH);

    // stamp the grids: their sizes, in each band's local units
    const g = st.grids, rnW = st.dims.rowNameWidth, idxW = (params.indexOverlay ?? 0) * LAYOUT.indexColWidth;
    Object.assign(g.body,   { width: totalW, height: viewH, xOffset: totalW / 2, yOffset: viewH / 2, colWeights: colW, itemSize: sizes.cellHeight });
    Object.assign(g.header, { width: totalW, height: LAYOUT.headerHeight, xOffset: totalW / 2, yOffset: LAYOUT.headerHeight / 2, colWeights: colW, itemSize: LAYOUT.headerHeight });
    Object.assign(g.rows,   { width: rnW, height: viewH, xOffset: rnW / 2, yOffset: viewH / 2, itemSize: sizes.cellHeight });
    Object.assign(g.index,  { width: idxW, height: viewH, xOffset: idxW / 2, yOffset: viewH / 2, itemSize: sizes.cellHeight });

    // bands, screen px
    const op = ins.op;
    ctxMix.bands = {
      body:   { x: o.x + ins.x, y: o.y + ins.y, w: W - ins.x, h: H - ins.y, alpha: 1 },
      header: { x: o.x + ins.x, y: o.y, w: W - ins.x, h: ins.y, alpha: op },
      rows:   { x: o.x, y: o.y + ins.y, w: ins.x, h: H - ins.y, alpha: op },
      corner: { x: o.x, y: o.y, w: ins.x, h: ins.y, alpha: op },
      index:  { x: o.x, y: o.y + ins.y, w: idxW * z > 2 ? idxW * z : 0, h: H - ins.y, alpha: op },
    };
    return new Transform({ x: o.x + ins.x - st.camera.x * z, y: o.y + ins.y }, z, z);
  }

  static _push(ctxMix, node, params) {
    node._saved = { T: ctxMix.T, bands: ctxMix.bands, clipRect: ctxMix.clipRect, params: {} };
    const T = GridViewportNode._frame(ctxMix, node, params);
    if (!T) return false;
    ctxMix.T = T;
    for (const [k, v] of Object.entries(GRID_SHAPE)) { node._saved.params[k] = params[k]; params[k] = v; }
    return true;
  }

  static _pop(ctxMix, node, params) {
    const s = node._saved;
    if (!s) return;
    ctxMix.T = s.T; ctxMix.bands = s.bands; ctxMix.clipRect = s.clipRect;
    for (const [k, v] of Object.entries(s.params)) { if (v === undefined) delete params[k]; else params[k] = v; }
    node._saved = null;
  }

  static before_draw2d(ctxMix, node, params) {
    const ok = GridViewportNode._push(ctxMix, node, params);
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const L = node.inst?.layout;
    const c = ctxMix.directCtx ? ctxMix.directCtx() : (ctx.save(), ctx);
    c.fillStyle = '#16213e';
    if (L) c.fillRect(L.ox, L.oy, L.W, L.H);
    if (!ok) {
      c.fillStyle = '#666'; c.font = '16px sans-serif'; c.textAlign = 'center';
      if (L) c.fillText('Load data to begin', L.ox + L.W / 2, L.oy + L.H / 2);
    }
    c.restore();
  }

  static after_draw2d(ctxMix, node, params) { GridViewportNode._pop(ctxMix, node, params); }

  static before_hit_test(ctxMix, node, params) {
    node._hitBefore = ctxMix.hitResult;
    GridViewportNode._push(ctxMix, node, params);
  }

  /**
   * What a press in the pane does, by what it landed on (see the header).
   * Every result gets the wheel.  Hit testing changes nothing: the press
   * happens in applySelect / the first applyDrag, which the pane calls at
   * pointer-down.
   */
  static after_hit_test(ctxMix, node, params) {
    GridViewportNode._pop(ctxMix, node, params);
    const st = node.inst;
    const p = ctxMix.screenHitPoint ?? ctxMix.hitPoint;
    const L = st?.layout;
    if (!L || !p || p.x < L.ox || p.y < L.oy || p.x > L.ox + L.W || p.y > L.oy + L.H) return;
    const hit = ctxMix.hitResult !== node._hitBefore ? ctxMix.hitResult : null;
    const wheel = (x, y, dy) => GridViewportNode.zoomAt(node, params, dy > 0 ? 0.9 : 1.1, x, y);
    const panRows = (dy) => GridViewportNode._setRowTop(st, GridViewportNode._readRowTop(st, L.cellHeight) + dy / st.camera.zoom, L.cellHeight, L.viewH);
    const panX = (dx) => { st.camera.x -= dx / st.camera.zoom; GridViewportNode._clampX(st, L); };

    if (hit?.band === 'body' && hit.cursor) {
      const cursor = hit.cursor, orig = hit.interactions || {};
      const column = st.grids.body._overlays?.[cursor[0]];     // the pressed column's scroll state
      let last = null;
      hit.interactions = {
        applySelect: (c) => {
          GridViewportNode._applyFocus(st, GridViewportNode.focusFromCell(st, c[c.length - 1], c[0]));
          orig.applySelect?.(c);
          GridViewportNode._setRowTop(st, GridViewportNode._readRowTop(st, L.cellHeight), L.cellHeight, L.viewH);
        },
        applyDrag: (x, y) => {
          orig.applyDrag?.(x, y);                    // the column's own drag: rows, synced
          if (last) panX(x - last.x);
          last = { x, y };
          GridViewportNode._setRowTop(st, GridViewportNode._readRowTop(st, L.cellHeight, column), L.cellHeight, L.viewH);
          if (st.nav.focus) {                        // keep the index in step after a clamp
            const i = GridViewportNode._alignSource(st);
            if (i >= 0) st.orch.syncFrom(i);
          }
        },
        applyWheel: wheel,
      };
      return;
    }

    if (hit?.band === 'index' && hit.cursor) {
      const letter = hit.cursor[hit.cursor.length - 1] % 26;
      let start = null;
      ctxMix.hitResult = {
        node, cursor: hit.cursor,
        interactions: {
          applySelect: () => {
            GridViewportNode._applyFocus(st, GridViewportNode.focusFromIndex(st, letter));
            const t = Math.max(0, Math.min(1, (p.y - L.oy - L.ins.y) / (L.H - L.ins.y)));
            GridViewportNode.setFocusAlign(node, t);
            start = { t, y: p.y };
          },
          applyDrag: (x, y) => {
            if (!start) return;
            GridViewportNode.setFocusAlign(node, start.t + (y - start.y) / (L.H - L.ins.y));
          },
          applyWheel: wheel,
        },
      };
      return;
    }

    // Anywhere else: clear the focus on press; drag pans both ways.
    let last = null;
    ctxMix.hitResult = {
      node,
      interactions: {
        applyDrag: (x, y) => {
          if (!last) { GridViewportNode._applyFocus(st, null); last = { x, y }; return; }
          panX(x - last.x);
          panRows(y - last.y);
          last = { x, y };
        },
        applyWheel: wheel,
      },
    };
  }
}

SYS.NODE_CLASSES.push({ name: 'grid-viewport', cls: GridViewportNode });

export { GridViewportNode, GridFocusNavigator, TableView, HeaderView, RowNamesView, IndexView, LAYOUT as GRID_LAYOUT_OMNIGRID };
