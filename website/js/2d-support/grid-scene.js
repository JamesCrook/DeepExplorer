// grid-scene.js — the OmniGrid matrix/heatmap renderer, kept whole
/**
 * GridScene is the old omni-grid renderer, unchanged: zoom-dependent cell
 * sizes that blend from heatmap to table, sticky row and column headers, the
 * cyclic A-Z index, focus ranges, blob mode and distance-matrix fading.  The
 * grid-view node (nodes2d/grid-view-node.js) wraps it as one opaque node; it
 * is meant to be unwrapped into scene-graph nodes later (sticky headers
 * reusing the table's own cell drawing).
 *
 * GridCamera stands in for the old CanvasScene base class, which is not in
 * this repository.  It supplies exactly what GridScene used from it:
 * camera {x, y, zoom}, canvas, resetView, zoomAt, setZoom, pan, clampCamera,
 * and default getViewOffset / getZoomRange hooks.  canvas is whatever the
 * owner hands in: an object with width and height in CSS pixels, and a
 * getContext('2d') used for text measurement between draws.
 */

import { ColorEngine } from '../colour/colour.js';
import { TextUtils } from './text-utils.js';
import { GridData } from '../data/csv-data.js';

class GridCamera {
  constructor(canvas) {
    this.canvas = canvas;
    this.camera = { x: 0, y: 0, zoom: 1 };
  }

  resetView() {
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.clampCamera();
  }

  /** Pixels at the top-left taken by fixed furniture (headers) at a zoom. */
  getViewOffset(zoom) { return { x: 0, y: 0 }; }

  getZoomRange() { return { min: 0.01, max: 100 }; }

  /** Scale by factor about screen point (px, py), keeping it fixed on the data. */
  zoomAt(factor, px, py) {
    const old = this.camera.zoom;
    const { min, max } = this.getZoomRange();
    const zoom = Math.max(min, Math.min(max, old * factor));
    const o0 = this.getViewOffset(old), o1 = this.getViewOffset(zoom);
    const wx = (px - o0.x) / old + this.camera.x;
    const wy = (py - o0.y) / old + this.camera.y;
    this.camera.zoom = zoom;
    this.camera.x = wx - (px - o1.x) / zoom;
    this.camera.y = wy - (py - o1.y) / zoom;
    this.clampCamera();
  }

  /** Absolute zoom, about the middle of the canvas. */
  setZoom(zoom) {
    if (zoom > 0) this.zoomAt(zoom / this.camera.zoom, this.canvas.width / 2, this.canvas.height / 2);
  }

  /** Move by a screen-pixel delta (a drag). */
  pan(dx, dy) {
    this.camera.x -= dx / this.camera.zoom;
    this.camera.y -= dy / this.camera.zoom;
    this.clampCamera();
  }

  clampCamera() {
    this.camera.x = Math.max(0, this.camera.x);
    this.camera.y = Math.max(0, this.camera.y);
  }
}

// ============================================================
// GRID RENDERER
// ============================================================

class GridScene extends GridCamera {
  constructor(canvas) {
    super(canvas);
    this.ctx = canvas.getContext('2d');
    this.gridData = null;
    
    this.options = {
      distanceMatrix: 0,      // 0-1: opacity of reflected cells (1 = fully hidden)
      headersAffectWidth: 0,  // 0-1: blend between ignoring/using header widths
      colorTarget: 0,         // 0 = background, 1 = foreground
      colorScheme: 'red-green',
      smoothGradient: 1,      // 0-1
      decimalPlaces: 2,
      blobMode: 0,            // 0-1
      textAlign: 0.5,         // 0=left, 0.5=center, 1=right
      indexOverlay: 0,        // 0-1: width of A-Z index column
      constrainZoomOut: false,
      anchorEdgeOnZoom: true  // When a table edge is visible, zoom anchors to it
    };

    // Layout constants
    this.baseFontSize = 14;
    this.cellPadding = 6;
    this.headerHeight = 30;
    this.rowNameWidth = 80;
    this.minCellSize = 4;
    this.INDEX_COL_WIDTH = 28; // data-space width at full overlay
    
    // Zoom thresholds
    this.TEXT_ZOOM = 0.5;
    this.HEATMAP_ZOOM = 0.12;
    
    // Cached calculations
    this.baseColWidths = [];
    this.baseColWidthsWithHeaders = [];
    this.baseCellHeight = 0;
    
    // Focus state: { ranges: [{ target:'index'|'data', startRow, endRow }] }
    this.focus = null;
    this.indexCameraY = 0;   // independent scroll for the A-Z index
    this.lastLayout = null;  // cached layout for hit testing
  }

  setData(gridData) {
    this.gridData = gridData;
    this.calculateBaseDimensions();
    this.resetView();
  }

  calculateBaseDimensions() {
    if (!this.gridData) return;
    this._cachedZoomRange = null;
    
    const ctx = this.ctx;
    const font = `${this.baseFontSize}px sans-serif`;
    ctx.font = font;
    
    this.baseCellHeight = this.baseFontSize + this.cellPadding * 2;
    
    // Calculate column widths (both with and without headers)
    this.baseColWidths = [];
    this.baseColWidthsWithHeaders = [];
    
    for (let c = 0; c < this.gridData.colCount; c++) {
      let maxWidth = 40;
      let maxWidthWithHeader = 40;
      let hasText = false;
      
      const headerWidth = TextUtils.measure(ctx, this.gridData.getColName(c), font) + this.cellPadding * 2;
      maxWidthWithHeader = Math.max(maxWidthWithHeader, headerWidth);
      
      const sampleRows = Math.min(100, this.gridData.rowCount);
      for (let r = 0; r < sampleRows; r++) {
        const row = Math.floor(r * this.gridData.rowCount / sampleRows);
        const value = this.gridData.getValue([row, c]);
        const isNum = this.gridData.isNumeric([row, c]);
        
        if (!isNum) hasText = true;
        
        let text;
        if (isNum) {
          const range = this.gridData.globalRange;
          const needsSign = range.min < 0;
          const maxAbs = Math.max(Math.abs(range.min), Math.abs(range.max));
          const formatted = maxAbs.toFixed(this.options.decimalPlaces);
          text = needsSign ? '-' + formatted : formatted;
        } else {
          text = this.formatValue(value);
        }
        const cellWidth = TextUtils.measure(ctx, text, font) + this.cellPadding * 2;
        maxWidth = Math.max(maxWidth, cellWidth);
        maxWidthWithHeader = Math.max(maxWidthWithHeader, cellWidth);
      }
      
      const maxLimit = hasText ? 1200 : 150;
      this.baseColWidths[c] = Math.min(maxWidth, maxLimit);
      this.baseColWidthsWithHeaders[c] = Math.min(maxWidthWithHeader, maxLimit);
    }
    
    // Calculate row name width
    this.rowNameWidth = 50;
    const sampleRows = Math.min(100, this.gridData.rowCount);
    for (let r = 0; r < sampleRows; r++) {
      const row = Math.floor(r * this.gridData.rowCount / sampleRows);
      const name = this.gridData.getRowName(row);
      this.rowNameWidth = Math.max(this.rowNameWidth, TextUtils.measure(ctx, name, font) + this.cellPadding * 2);
    }
    this.rowNameWidth = Math.min(this.rowNameWidth, 120);
  }

  resetView() {
    super.resetView();
    this.calculateBaseDimensions();
  }

  formatValue(value) {
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return String(value);
      return value.toFixed(this.options.decimalPlaces);
    }
    return String(value ?? '');
  }

  /**
   * Draw cell text with continuous horizontal alignment.
   * textAlign 0 = left, 0.5 = center, 1 = right.
   */
  drawAlignedCellText(ctx, value, x, y, w, cellHeight, fontSize, fgColor) {
    const text = this.formatValue(value);
    const font = `${fontSize}px sans-serif`;
    const pad = this.cellPadding;
    const displayText = TextUtils.truncate(ctx, text, w - pad, font);
    if (!displayText) return;

    const textW = TextUtils.measure(ctx, displayText, font);
    const available = w - pad - textW;           // spare space after text + padding
    const tx = x + pad / 2 + this.options.textAlign * available;

    ctx.fillStyle = ColorEngine.toCSS(fgColor);
    ctx.textAlign = 'left';
    ctx.fillText(displayText, tx, y + cellHeight / 2);
  }

  // ── Focus & index helpers ────────────────────────────────────

  /** Screen-space width of the index column at current settings. */
  getIndexScreenWidth() {
    return this.options.indexOverlay * this.INDEX_COL_WIDTH * this.camera.zoom;
  }

  /**
   * Hit-test a canvas-space click. Returns
   *   { type:'index', row }  or  { type:'cell', row, col }
   * Index row is in index-space (0-25). Cell row/col are visual grid indices.
   */
  // Note: could potentially consolidate coordinate transformation logic for hitTest with other CanvasScene subclasses
  hitTest(canvasX, canvasY) {
    if (!this.gridData || !this.lastLayout) return null;
    const { cellHeight, colWidths, colX, offsetX, offsetY } = this.lastLayout;
    const zoom = this.camera.zoom;
    if (canvasY <= offsetY) return null;

    // Index column has its own cyclic scroll (A-Z wrapping)
    const indexScreenW = this.getIndexScreenWidth();
    if (indexScreenW > 2 && canvasX < indexScreenW) {
      const indexDataY = (canvasY - offsetY) / zoom + this.indexCameraY;
      const row = Math.floor(indexDataY / cellHeight);
      const letterIndex = ((row % 26) + 26) % 26;
      return { type: 'index', row: letterIndex };
    }

    // Data cells use main camera scroll
    const dataY = (canvasY - offsetY) / zoom + this.camera.y;
    const row = Math.floor(dataY / cellHeight);
    if (row < 0 || row >= this.gridData.rowCount) return null;

    if (canvasX > offsetX) {
      const dataX = (canvasX - offsetX) / zoom + this.camera.x;
      for (let c = 0; c < this.gridData.colCount; c++) {
        if (dataX < colX[c + 1]) return { type: 'cell', row, col: c };
      }
    }
    return null;
  }

  /** First uppercase character of the cell at (visualRow, dataCol). */
  _cellFirstChar(visualRow, dataCol) {
    const dataRow = this.gridData.permutedRow(visualRow, this.options.reverseRows);
    const s = String(this.gridData.getValue([dataRow, dataCol]) ?? '');
    return s ? s[0].toUpperCase() : '';
  }

  /**
   * Compute focus from an index letter click (index row 0-25).
   * Searches the first visual data column for the first contiguous
   * block of cells starting with that letter.
   */
  computeFocusFromIndex(indexRow) {
    const letter = String.fromCharCode(65 + indexRow);
    const dataCol = this.gridData.permutedCol(0, this.options.reverseCols); // first visual data column
    const ranges = [{ target: 'index', startRow: indexRow, endRow: indexRow }];

    // Scan visual rows for first contiguous block of this letter
    let first = -1, last = -1;
    for (let r = 0; r < this.gridData.rowCount; r++) {
      if (this._cellFirstChar(r, dataCol) === letter) {
        if (first < 0) first = r;
        last = r;
      } else if (first >= 0) {
        break; // end of contiguous block
      }
    }

    if (first >= 0) {
      ranges.push({ target: 'data', startRow: first, endRow: last });
    }
    return { ranges };
  }

  /**
   * Compute focus from a data cell click (visual coordinates).
   * Finds contiguous rows sharing the same first character in the
   * clicked column, plus the matching letter in the A-Z index.
   */
  computeFocusFromDataCell(visualRow, visualCol) {
    const dataCol = this.gridData.permutedCol(visualCol, this.options.reverseCols);
    const letter = this._cellFirstChar(visualRow, dataCol);
    if (!letter) {
      return { ranges: [{ target: 'data', startRow: visualRow, endRow: visualRow }] };
    }

    let startRow = visualRow, endRow = visualRow;
    while (startRow > 0 && this._cellFirstChar(startRow - 1, dataCol) === letter) startRow--;
    while (endRow < this.gridData.rowCount - 1 && this._cellFirstChar(endRow + 1, dataCol) === letter) endRow++;

    const ranges = [{ target: 'data', startRow, endRow }];
    const indexRow = letter.charCodeAt(0) - 65;
    if (indexRow >= 0 && indexRow < 26) {
      ranges.push({ target: 'index', startRow: indexRow, endRow: indexRow });
    }
    return { ranges };
  }

  /** Helper: find a range by target type in the current focus. */
  _focusRange(target) {
    return this.focus && this.focus.ranges.find(r => r.target === target);
  }

  /**
   * Set focus and return the current focusAlign value.
   */
  setFocus(focus) {
    this.focus = focus;
    return this.getFocusAlignValue();
  }

  /**
   * Read the current focusAlign from scroll positions.
   * Uses the data range as primary, falls back to index.
   */
  getFocusAlignValue() {
    if (!this.focus || !this.lastLayout) return 0.5;
    const { cellHeight } = this.lastLayout;
    const viewH = this._viewportDataHeight();

    const range = this._focusRange('data') || this.focus.ranges[0];
    const scrollY = range.target === 'data' ? this.camera.y : this.indexCameraY;

    const focusTop = range.startRow * cellHeight;
    const focusBot = (range.endRow + 1) * cellHeight;
    const denom = focusBot - viewH - focusTop;
    if (Math.abs(denom) < 0.5) return 0.5;
    return Math.max(0, Math.min(1, (scrollY - focusTop) / denom));
  }

  /**
   * Scroll all focus targets so that focusAlign = t.
   */
  scrollToFocusAlign(t) {
    if (!this.focus || !this.lastLayout) return;
    const { cellHeight } = this.lastLayout;
    const viewH = this._viewportDataHeight();

    for (const range of this.focus.ranges) {
      const focusTop = range.startRow * cellHeight;
      const focusBot = (range.endRow + 1) * cellHeight;
      const scrollY = focusTop + t * (focusBot - viewH - focusTop);

      if (range.target === 'data') {
        this.camera.y = scrollY;
      } else if (range.target === 'index') {
        this.indexCameraY = scrollY;
      }
    }

    if (typeof this.clampCamera === 'function') this.clampCamera();
    this._wrapIndexCamera(cellHeight);
  }

  /** Wrap index scroll for cyclic A-Z. */
  _wrapIndexCamera(cellHeight) {
    const period = 26 * cellHeight;
    this.indexCameraY = ((this.indexCameraY % period) + period) % period;
  }

  /** Height of the data viewport in data-space units. */
  _viewportDataHeight() {
    const headerOp = this.smoothstep(this.camera.zoom, this.HEATMAP_ZOOM, this.TEXT_ZOOM * 0.8);
    const offsetY = headerOp > 0.01 ? this.headerHeight * this.camera.zoom : 0;
    return (this.canvas.height - offsetY) / this.camera.zoom;
  }

  /** Width of the data viewport in data-space units. */
  _viewportDataWidth() {
    const headerOp = this.smoothstep(this.camera.zoom, this.HEATMAP_ZOOM, this.TEXT_ZOOM * 0.8);
    const offsetX = headerOp > 0.01 ? this.rowNameWidth * this.camera.zoom : 0;
    return (this.canvas.width - offsetX) / this.camera.zoom;
  }

  smoothstep(x, edge0, edge1) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  lerp(a, b, t) {
    return a + (b - a) * t;
  }

  getEffectiveColWidths() {
    // Blend between widths without headers and with headers
    const t = this.options.headersAffectWidth;
    return this.baseColWidths.map((w, i) => 
      this.lerp(w, this.baseColWidthsWithHeaders[i], t)
    );
  }

  getCellDimensions() {
    const t = this.smoothstep(this.camera.zoom, this.HEATMAP_ZOOM, this.TEXT_ZOOM);
    const heatmapSize = this.minCellSize;
    
    const cellHeight = this.lerp(heatmapSize, this.baseCellHeight, t);
    const effectiveWidths = this.getEffectiveColWidths();
    const colWidths = effectiveWidths.map(w => this.lerp(heatmapSize, w, t));
    
    return { cellHeight, colWidths, t };
  }

  getVisibleRange() {
    if (!this.gridData) return { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    
    const { cellHeight, colWidths } = this.getCellDimensions();
    const headerOpacity = this.smoothstep(this.camera.zoom, this.HEATMAP_ZOOM, this.TEXT_ZOOM * 0.8);
    
    const offsetX = headerOpacity > 0.01 ? this.rowNameWidth * this.camera.zoom : 0;
    const offsetY = headerOpacity > 0.01 ? this.headerHeight * this.camera.zoom : 0;
    
    const startRow = Math.max(0, Math.floor(this.camera.y / cellHeight));
    const visibleHeight = (this.canvas.height - offsetY) / this.camera.zoom;
    const endRow = Math.min(this.gridData.rowCount - 1, Math.ceil((this.camera.y + visibleHeight) / cellHeight));
    
    let cumWidth = 0;
    let startCol = 0;
    for (let c = 0; c < colWidths.length; c++) {
      if (cumWidth + colWidths[c] > this.camera.x) {
        startCol = c;
        break;
      }
      cumWidth += colWidths[c];
    }
    
    cumWidth = 0;
    for (let c = 0; c < startCol; c++) cumWidth += colWidths[c];
    
    const visibleWidth = (this.canvas.width - offsetX) / this.camera.zoom;
    let endCol = startCol;
    let widthSoFar = 0;
    for (let c = startCol; c < colWidths.length; c++) {
      widthSoFar += colWidths[c];
      endCol = c;
      if (cumWidth + widthSoFar - this.camera.x > visibleWidth) break;
    }
    endCol = Math.min(endCol, this.gridData.colCount - 1);
    
    return { startRow, endRow, startCol, endCol };
  }

  // permutedRow/permutedCol have moved to DataAdapter.
  // Use this.gridData.permutedRow(r, this.options.reverseRows) etc.

  render() {
    // Note: could consolidate clearing and background rendering with other CanvasScene subclasses
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, width, height);
    
    if (!this.gridData) {
      ctx.fillStyle = '#666';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Load data to begin', width / 2, height / 2);
      return;
    }
    
    const { cellHeight, colWidths, t } = this.getCellDimensions();
    const textOpacity = this.smoothstep(this.camera.zoom, this.HEATMAP_ZOOM, this.TEXT_ZOOM * 0.7);
    const headerOpacity = this.smoothstep(this.camera.zoom, this.HEATMAP_ZOOM, this.TEXT_ZOOM * 0.8);
    
    const offsetX = headerOpacity > 0.01 ? this.rowNameWidth * this.camera.zoom : 0;
    const offsetY = headerOpacity > 0.01 ? this.headerHeight * this.camera.zoom : 0;
    
    const fontSize = Math.max(8, this.baseFontSize * t);
    const effectiveFontSize = fontSize * this.camera.zoom;
    const showText = effectiveFontSize >= 5 && textOpacity > 0.01;
    
    const { startRow, endRow, startCol, endCol } = this.getVisibleRange();

    const isVisible = (row, col) => {
      return (startRow <= row) && (row <= endRow) && (startCol <= col) && (col <= endCol);
    };

    const range = this.gridData.globalRange;
    const distanceMode = this.gridData.rowCount === this.gridData.colCount;
    const reverseCols = this.options.reverseCols > 0.5;
    
    // Calculate column X positions
    const colX = [0];
    for (let c = 0; c < colWidths.length; c++) {
      const displayCol = this.gridData.permutedCol(c, this.options.reverseCols);
      colX[c + 1] = colX[c] + colWidths[displayCol];
    }
    
    // Cache for hit testing
    this.lastLayout = { cellHeight, colWidths, colX, offsetX, offsetY };
    
    ctx.save();
    
    ctx.beginPath();
    ctx.rect(offsetX, offsetY, width - offsetX, height - offsetY);
    ctx.clip();
    
    // Note: could consolidate camera transform logic with other CanvasScene subclasses
    ctx.translate(offsetX, offsetY);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
    
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Effective smooth gradient (blend between stepped and smooth)
    const useSmooth = this.options.smoothGradient > 0.5;
    
    for (let r = startRow; r <= endRow; r++) {
      const displayRow = this.gridData.permutedRow(r, this.options.reverseRows);
      const y = r * cellHeight;
      
      for (let c = startCol; c <= endCol; c++) {
        const displayCol = this.gridData.permutedCol(c, this.options.reverseCols);
        const x = colX[c];
        const w = colWidths[displayCol];
        const value = this.gridData.getValue([displayRow, displayCol]);
        const isNum = this.gridData.isNumeric([displayRow, displayCol]);
        
        // Calculate cell opacity for distance matrix mode
        let cellOpacity = 1;
        if (distanceMode && isNum ) {
          if( displayRow < displayCol ){
            // This is an upper triangle cell with matching mirror
            // Fade based on distanceMatrix slider value
            cellOpacity = ( 1 - this.options.distanceMatrix );
          } else if( displayRow > displayCol ){
            cellOpacity = this.options.distanceMatrix;
          }
          cellOpacity = Math.min( 1, 2*cellOpacity )
          if (cellOpacity < 0.01) continue; // Skip if fully transparent
        }
        
        // Background color
        let bgColor = [30, 40, 60];
        let fgColor = [255, 255, 255];
        
        const mode = true;
        if (isNum && mode) {
          const valueColor = ColorEngine.getColor(value, range, this.options.colorScheme, useSmooth);
          // Blend between background and foreground coloring
          const colorTarget = this.options.colorTarget;
          const brightness = (valueColor[0] * 299 + valueColor[1] * 587 + valueColor[2] * 114) / 1000;
          const contrastColor = brightness > 128 ? [0, 0, 0] : [255, 255, 255];
          bgColor = ColorEngine.lerp( valueColor, bgColor, colorTarget )
          fgColor = ColorEngine.lerp( contrastColor, valueColor, colorTarget )
        }

        if( isNum && !mode ){
          const valueColor = ColorEngine.getColor(value, range, this.options.colorScheme, useSmooth);
          // Blend between background and foreground coloring
          const colorTarget = this.options.colorTarget;
          if (colorTarget < 0.5) {
            bgColor = valueColor;
            const brightness = (bgColor[0] * 299 + bgColor[1] * 587 + bgColor[2] * 114) / 1000;
            fgColor = brightness > 128 ? [0, 0, 0] : [255, 255, 255];
          } else {
            fgColor = valueColor;
          }
        }
        
        ctx.globalAlpha = cellOpacity;
        ctx.fillStyle = ColorEngine.toCSS(bgColor);
        ctx.fillRect(x, y, w, cellHeight);

        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1 / this.camera.zoom;
        ctx.strokeRect(x, y, w, cellHeight);
        
        if (showText) {
          ctx.globalAlpha = textOpacity * cellOpacity;
          
          // Blend between text and blob mode
          const blobAmount = this.options.blobMode;
          
          if (blobAmount > 0.01 && isNum) {
            const maxRadius = Math.min(w, cellHeight) / 2 * 0.8;
            const maxAbs = Math.max(Math.abs(range.min), Math.abs(range.max));
            const radius = maxRadius * (Math.abs(value) / (maxAbs || 1));
            
            if (radius > 0.5) {
              // Draw blob with opacity based on blobMode slider
              ctx.globalAlpha = textOpacity * cellOpacity * blobAmount;
              ctx.fillStyle = ColorEngine.toCSS(fgColor);
              ctx.beginPath();
              ctx.arc(x + w / 2, y + cellHeight / 2, radius, 0, Math.PI * 2);
              ctx.fill();
            }
            
            // Draw text with inverse opacity if not fully blob
            if (blobAmount < 0.99) {
              ctx.globalAlpha = textOpacity * cellOpacity * (1 - blobAmount);
              this.drawAlignedCellText(ctx, value, x, y, w, cellHeight, fontSize, fgColor);
            }
          } else {
            // Text only mode
            this.drawAlignedCellText(ctx, value, x, y, w, cellHeight, fontSize, fgColor);
          }
        }
        
        ctx.globalAlpha = 1;
      }
    }
    
    // Focus region highlight (drawn in data-space transform)
    if (this.focus) {
      for (const range of this.focus.ranges) {
        if (range.target !== 'data') continue;
        const { startRow: fs, endRow: fe } = range;
        if (fe >= startRow && fs <= endRow) {
          const fy = Math.max(fs, startRow) * cellHeight;
          const fh = (Math.min(fe, endRow) + 1) * cellHeight - fy;
          const fx = colX[startCol];
          const fw = colX[Math.min(endCol + 1, colX.length - 1)] - fx;
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(79, 195, 247, 0.08)';
          ctx.fillRect(fx, fy, fw, fh);
          ctx.strokeStyle = 'rgba(79, 195, 247, 0.35)';
          ctx.lineWidth = 2 / this.camera.zoom;
          ctx.beginPath();
          ctx.moveTo(fx, fs * cellHeight); ctx.lineTo(fx + fw, fs * cellHeight);
          ctx.moveTo(fx, (fe + 1) * cellHeight); ctx.lineTo(fx + fw, (fe + 1) * cellHeight);
          ctx.stroke();
        }
      }
    }
    
    ctx.restore();
    
    // Draw sticky headers
    if (headerOpacity > 0.01) {
      ctx.globalAlpha = headerOpacity;
      
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(offsetX, 0, width - offsetX, offsetY);
      ctx.fillRect(0, offsetY, offsetX, height - offsetY);
      ctx.fillRect(0, 0, offsetX, offsetY);
      
      // Column headers
      ctx.save();
      ctx.beginPath();
      ctx.rect(offsetX, 0, width - offsetX, offsetY);
      ctx.clip();
      
      ctx.translate(offsetX, 0);
      ctx.scale(this.camera.zoom, this.camera.zoom);
      ctx.translate(-this.camera.x, 0);
      
      const headerFontSize = Math.max(8, 12 * t);
      ctx.font = `${headerFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ccc';
      
      for (let c = startCol; c <= endCol; c++) {
        const displayCol = this.gridData.permutedCol(c, this.options.reverseCols);
        const x = colX[c];
        const w = colWidths[displayCol];
        const name = this.gridData.getColName(displayCol);
        const font = `${headerFontSize}px sans-serif`;
        const displayText = TextUtils.truncate(ctx, name, w - 4, font);
        if (displayText) {
          ctx.fillText(displayText, x + w / 2, this.headerHeight / 2);
        }
      }
      ctx.restore();
      
      // Row names
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, offsetY, offsetX, height - offsetY);
      ctx.clip();
      
      ctx.translate(0, offsetY);
      ctx.scale(this.camera.zoom, this.camera.zoom);
      ctx.translate(0, -this.camera.y);
      
      ctx.font = `${headerFontSize}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ccc';
      
      for (let r = startRow; r <= endRow; r++) {
        const y = r * cellHeight;
        const displayRow = this.gridData.permutedRow(r, this.options.reverseRows);
        const name = this.gridData.getRowName(displayRow);
        const font = `${headerFontSize}px sans-serif`;
        const displayText = TextUtils.truncate(ctx, name, this.rowNameWidth - 8, font);
        if (displayText) {
          ctx.fillText(displayText, this.rowNameWidth - 4, y + cellHeight / 2);
        }
      }
      ctx.restore();
      
      ctx.globalAlpha = 1;
    }
    
    // ── Index column overlay (cyclic A-Z) ──────────────────────────
    const indexDataW = this.options.indexOverlay * this.INDEX_COL_WIDTH;
    const indexScreenW = indexDataW * this.camera.zoom;
    
    if (indexScreenW > 2 && headerOpacity > 0.01) {
      ctx.globalAlpha = headerOpacity;
      
      // Opaque background strip
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, offsetY, indexScreenW, height - offsetY);
      ctx.fillRect(0, 0, indexScreenW, offsetY); // corner
      
      // Compute visible index rows (wrapping)
      const indexVisH = (height - offsetY) / this.camera.zoom;
      const idxStart = Math.floor(this.indexCameraY / cellHeight);
      const visibleCount = Math.ceil(indexVisH / cellHeight) + 1;
      
      // Focused index letter (if any)
      const idxFocus = this._focusRange('index');
      
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, offsetY, indexScreenW, height - offsetY);
      ctx.clip();
      
      ctx.translate(0, offsetY);
      ctx.scale(this.camera.zoom, this.camera.zoom);
      ctx.translate(0, -this.indexCameraY);
      
      const circleR = Math.min(cellHeight, indexDataW) * 0.36;
      const cx = indexDataW / 2;
      
      for (let i = 0; i < visibleCount; i++) {
        const r = idxStart + i;
        const letterIdx = ((r % 26) + 26) % 26;
        const letter = String.fromCharCode(65 + letterIdx);
        const cy = r * cellHeight + cellHeight / 2;
        const isFocused = idxFocus && letterIdx >= idxFocus.startRow && letterIdx <= idxFocus.endRow;
        
        // Circle
        ctx.beginPath();
        ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
        ctx.fillStyle = isFocused ? 'rgba(79, 195, 247, 0.3)' : 'rgba(79, 195, 247, 0.12)';
        ctx.fill();
        ctx.strokeStyle = isFocused ? 'rgba(79, 195, 247, 0.7)' : 'rgba(79, 195, 247, 0.3)';
        ctx.lineWidth = 1 / this.camera.zoom;
        ctx.stroke();
        
        // Letter (only if circle large enough)
        if (circleR * this.camera.zoom > 4) {
          const lSize = Math.max(6, circleR * 1.2);
          ctx.font = `bold ${lSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isFocused ? '#fff' : '#4fc3f7';
          ctx.fillText(letter, cx, cy);
        }
      }
      
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // ── CanvasScene hook overrides ────────────────────────────────

  /**
   * Zoom around a screen-space point, but pin the camera to the table
   * edge on any axis where that edge is currently visible.  This keeps
   * the top/left anchored during zoom (the common case) while still
   * allowing free cursor-anchored zoom after panning away from the edge.
   */
  zoomAt(factor, px, py) {
    if (this.options.anchorEdgeOnZoom) {
      const pinX = this.camera.x < 0.5;
      const pinY = this.camera.y < 0.5;
      super.zoomAt(factor, px, py);
      if (pinX) this.camera.x = 0;
      if (pinY) this.camera.y = 0;
    } else {
      super.zoomAt(factor, px, py);
    }
  }

  /**
   * Returns the pixel inset occupied by sticky row/column headers at the
   * given zoom level. Headers fade out at low zoom, so the offset shrinks
   * to zero when the grid is displayed as a pure heatmap.
   */
  getViewOffset(zoom) {
    const headerOpacity = this.smoothstep(zoom, this.HEATMAP_ZOOM, this.TEXT_ZOOM * 0.8);
    if (headerOpacity <= 0.01) return { x: 0, y: 0 };
    return {
      x: this.rowNameWidth * zoom,
      y: this.headerHeight * zoom
    };
  }

  /**
   * Returns the allowed zoom range based on the current data dimensions.
   * The minimum is half the zoom-to-fit value so the user can zoom out
   * slightly beyond the full-data view.
   */
  getZoomRange() {
    const w = this.canvas.width, h = this.canvas.height;
    if (!this._cachedZoomRange || this._cachedZoomRange._w !== w || this._cachedZoomRange._h !== h) {
      const zoomToFit = this.getZoomToFit();
      this._cachedZoomRange = { min: zoomToFit / 2, max: 2.0, _w: w, _h: h };
    }
    return this._cachedZoomRange;
  }

  /**
   * Clamp the camera so it cannot scroll past the content edges.
   * The base class only enforces >= 0; we add an upper bound based
   * on the actual data dimensions at the current zoom.
   */
  clampCamera() {
    if (!this.gridData) {
      super.clampCamera();
      return;
    }
    const { cellHeight, colWidths } = this.getCellDimensions();

    const totalH = this.gridData.rowCount * cellHeight;
    const viewH = this._viewportDataHeight();
    // When content fits in viewport, pin to 0; otherwise allow panning
    const maxY = totalH > viewH ? totalH - viewH : 0;
    this.camera.y = Math.max(0, Math.min(maxY, this.camera.y));

    const totalW = colWidths.reduce((a, b) => a + b, 0);
    const viewW = this._viewportDataWidth();
    const maxX = totalW > viewW ? totalW - viewW : 0;
    this.camera.x = Math.max(0, Math.min(maxX, this.camera.x));
  }

  // ── End CanvasScene overrides ─────────────────────────────────

  getCellDimensionsAtZoom(zoom) {
    const t = this.smoothstep(zoom, this.HEATMAP_ZOOM, this.TEXT_ZOOM);
    const heatmapSize = this.minCellSize;
    
    const cellHeight = this.lerp(heatmapSize, this.baseCellHeight, t);
    const effectiveWidths = this.getEffectiveColWidths();
    const colWidths = effectiveWidths.map(w => this.lerp(heatmapSize, w, t));
    
    return { cellHeight, colWidths, t };
  }

  getZoomToFit() {
    if (!this.gridData || this.baseColWidths.length === 0) return 1.0;
    
    const availableWidth = this.canvas.width - this.rowNameWidth;
    const availableHeight = this.canvas.height - this.headerHeight;
    
    let lo = 0.001, hi = 2.0;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const dims = this.getCellDimensionsAtZoom(mid);
      const totalWidth = dims.colWidths.reduce((a, b) => a + b, 0);
      const totalHeight = this.gridData.rowCount * dims.cellHeight;
      const renderedWidth = totalWidth * mid;
      const renderedHeight = totalHeight * mid;
      
      if (renderedWidth <= availableWidth && renderedHeight <= availableHeight) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  // setZoom and getZoomRange are inherited from CanvasScene.
  // getZoomRange() above provides the grid-aware min/max.
}

// ============================================================
// PRESETS
// ============================================================

const OMNIGRID_PRESETS = {
  'Standard': {
    distanceMatrix: 0.5,
    reverseRows: 0.0,
    reverseCols: 0.0,
    headersAffectWidth: 0,
    colorTarget: 0,
    smoothGradient: 1,
    blobMode: 0,
    textAlign: 0.5,
    indexOverlay: 0,
    decimalPlaces: 2
  },
  'Heatmap': {
    distanceMatrix: 0.5,
    reverseRows: 0.0,
    reverseCols: 0.0,
    headersAffectWidth: 0,
    colorTarget: 0,
    smoothGradient: 1,
    blobMode: 0,
    textAlign: 0.5,
    indexOverlay: 0,
    decimalPlaces: 0
  },
  'Inverse': {
    distanceMatrix: 0.5,
    reverseRows: 0.0,
    reverseCols: 0.0,
    headersAffectWidth: 0,
    colorTarget: 1,
    smoothGradient: 1,
    blobMode: 0,
    textAlign: 0.5,
    indexOverlay: 0,
    decimalPlaces: 2
  },
  'Bubble': {
    distanceMatrix: 0.5,
    reverseRows: 0.0,
    reverseCols: 0.0,
    headersAffectWidth: 0,
    colorTarget: 0,
    smoothGradient: 1,
    blobMode: 1,
    textAlign: 0.5,
    indexOverlay: 0,
    decimalPlaces: 2
  },
  'Distance': {
    distanceMatrix: 0.7,
    reverseRows: 1.0,
    reverseCols: 0.0,
    headersAffectWidth: 0,
    colorTarget: 0,
    smoothGradient: 1,
    blobMode: 0,
    textAlign: 0.5,
    indexOverlay: 0,
    decimalPlaces: 0
  },
  'Distance BR': {
    distanceMatrix: 0.7,
    reverseRows: 0.0,
    reverseCols: 1.0,
    headersAffectWidth: 0,
    colorTarget: 0,
    smoothGradient: 1,
    blobMode: 0,
    textAlign: 0.5,
    indexOverlay: 0,
    decimalPlaces: 0
  },
  'Indexed': {
    distanceMatrix: 0.5,
    reverseRows: 0.0,
    reverseCols: 0.0,
    headersAffectWidth: 0,
    colorTarget: 0,
    smoothGradient: 1,
    blobMode: 0,
    textAlign: 0.0,
    indexOverlay: 1,
    decimalPlaces: 0
  }
};

// ============================================================
// FilteredGridData — thin view over a source, showing only
// the rows at the given indices.  Delegates everything else.
// ============================================================

class FilteredGridData extends GridData {
  constructor(source, keptRowIndices) {
    super(keptRowIndices.length, source.colCount);
    this._source = source;
    this._kept = keptRowIndices;
    // Carry forward CSVData properties the rest of the app uses
    this.delimiter = source.delimiter;
    this._colNames = source._colNames;
    this._hasRowNames = source._hasRowNames;
    this.headers = source.headers;
    this.rows = keptRowIndices.map(i => source.rows[i]);
  }
  getValue(row, col)   { return this._source.getValue(this._kept[row], col); }
  getRowName(row)      { return this._source.getRowName(this._kept[row]); }
  getColName(col)      { return this._source.getColName(col); }
  isNumeric(row, col)  { return this._source.isNumeric(this._kept[row], col); }
  hasRowNames()        { return this._source.hasRowNames(); }
}

export { GridCamera, GridScene, FilteredGridData, OMNIGRID_PRESETS };
