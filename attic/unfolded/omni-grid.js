/* ============================================
   OmniGrid - Grid/Matrix Viewer Engine
   ============================================
   
   Classes:
   - GridScene: Main rendering engine
*/

import { OmniApp } from '../../../deep-explorer/js/omni-support/omni-app.js'
import { CanvasScene } from '../omni-support/canvas-scene.js';
import { AppUtils } from '../omni-support/app-utils.js'
import { GridData, CSVData, MiscData, FunctionData, DataAdapter} from '../../../deep-explorer/js/data/csv-data.js'
import { registerFunctionSources} from '../../../deep-explorer/js/data/demo-fns.js'
import { ColorEngine, TextUtils } from '../../../deep-explorer/js/utilities/color-engine.js';
import { OmniControlPanel } from '../../../deep-explorer/js/omni-support/omni-control-panel.js'


// ============================================================
// GRID RENDERER
// ============================================================

class GridScene extends CanvasScene {
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


// ============================================================
// OmniGridApp — full application controller
// ============================================================

class OmniGridApp {
  // ── Static configuration ─────────────────────────────────────

  static SAMPLE_OPTIONS = [
    { value: '', label: '-- Select sample --' },
    { value: 'pam250', label: 'PAM250 Matrix' },
    { value: 'cities', label: 'City Distances' },
    { value: 'sales', label: 'Product Sales' },
    { value: 'footfall', label: 'Location Footfall' },
/*    { value: 'random', label: 'Random Matrix' },
    { value: 'wave', label: 'Wave Pattern' },
    { value: 'multiplication', label: 'Multiplication Table' },
    { value: 'gradient', label: 'Diagonal Gradient' }*/
    ];

  static SIZED_SAMPLES = ['cities'];


  static COLOR_SCHEMES = [
    { value: 'red-green', label: 'Red ↔ Green' },
    { value: 'blue-red', label: 'Blue ↔ Red' },
    { value: 'purple-orange', label: 'Purple ↔ Orange' },
    { value: 'cyan-magenta', label: 'Cyan ↔ Magenta' }
  ];


  static getSampleData(sampleId, size) {
    if (!MiscData[sampleId]) return null;
    const needsSize = OmniGridApp.SIZED_SAMPLES.includes(sampleId);
    return needsSize ? MiscData[sampleId](size) : MiscData[sampleId]();
  }

  static registerDataSource(sampleId, label, generator, needsSize = false) {
    if (!MiscData[sampleId]) {
      MiscData[sampleId] = generator;
      OmniGridApp.SAMPLE_OPTIONS.push({ value: sampleId, label: label });
      if (needsSize) {
        OmniGridApp.SIZED_SAMPLES.push(sampleId);
      }

      // Update DOM if select already exists
      if (typeof document !== 'undefined') {
        const sel = document.getElementById('sampleSelect');
        if (sel) {
          const opt = document.createElement('option');
          opt.value = sampleId;
          opt.textContent = label;
          sel.appendChild(opt);
        }
      }
    }
  }

  static EXTRA_CSS = `
    .chart-container { cursor: grab; }
    .chart-container:active { cursor: grabbing; }
    #canvas {
      display: block;
      width: 100%;
      height: 100%;
      background: #16213e;
    }
    .size-selector {
      display: flex; gap: 4px; margin-top: 8px;
    }
    .size-selector button {
      flex: 1; padding: 6px 8px; border: 1px solid #333; border-radius: 4px;
      background: #0f0f23; color: #888; font-size: 11px; cursor: pointer;
      transition: all 0.2s;
    }
    .size-selector button:hover { border-color: #4fc3f7; color: #eee; }
    .size-selector button.active {
      border-color: #4fc3f7; background: rgba(79, 195, 247, 0.15); color: #4fc3f7;
    }
    .grid-info {
      display: flex; justify-content: space-between;
      font-size: 11px; color: #888; margin-top: 8px;
    }
    .grid-info .value { color: #ccc; }
  `;

  // ── Constructor ──────────────────────────────────────────────

  /**
   * @param {Object} [options]
   * @param {string}  [options.title='OmniGrid']
   * @param {string}  [options.subtitle]
   * @param {string}  [options.extraCSS]
   * @param {string}  [options.hintHtml]
   * @param {string}  [options.defaultSample='cities'] - null to skip auto-load
   * @param {string}  [options.defaultSize='medium']
   * @param {string}  [options.defaultPreset='Standard']
   * @param {boolean} [options.createShell=true]
   * @param {Function} [options.onCellSelect] - (row, col, value, app) => {}
   */
  constructor(options = {}) {
    const {
      title = 'OmniGrid',
      subtitle = 'Matrix and heatmap viewer. Drag to pan, scroll to zoom.',
      extraCSS = OmniGridApp.EXTRA_CSS,
      hintHtml = '<b>Drag</b> to pan. <b>Scroll</b> to zoom.<br>'
               + '<b>distanceMatrix</b>: fades mirrored cells<br>'
               + '<b>colorTarget</b>: 0=background, 1=foreground',
      defaultSample = 'cities',
      defaultSize = 'medium',
      defaultPreset = 'Standard',
      onCellSelect = null,
      maxAspectRatio = 10,
    } = options;

    // ── State ──────────────────────────────────────────────────
    this.currentSize = defaultSize;
    this.originalCSVData = null;
    this.currentDedupLevel = 0;
    this.onCellSelect = onCellSelect;

    // ── DOM ────────────────────────────────────────────────────
    const shell = new OmniApp({
      title,
      subtitle,
      extraCSS,
      displayElement: 'canvas',
      displayId: 'canvas'
    });
    this.container = shell.container;
    this.canvas = shell.display;
    this.controlsEl = shell.controls;
    this.multiscrollerEl = shell.multiscroller;
    // ── Renderer ───────────────────────────────────────────────
    this.renderer = new GridScene(this.canvas);

    // ── OmniControlPanel ───────────────────────────────────────────────
    this.base = new OmniControlPanel({
      elements: {
        container: this.container,
        controls: this.controlsEl,
        multiscroller: this.multiscrollerEl
      },
      sliderConfig: this._buildSliderConfig(),
      presets: OMNIGRID_PRESETS,
      defaultPreset,
      enablePanZoom: false,
      aspectRatio: 1,
      hintHtml,
      maxAspectRatio,

      onRender: (params) => {
        const { focusAlign, dedupLevel, ...displayParams } = params;
        Object.assign(this.renderer.options, displayParams);
        this.renderer.options.decimalPlaces = Math.round(params.decimalPlaces);
        this.render();
      },

      onParamChange: (id, value) => {
        if (id === 'zoom') {
          this.renderer.setZoom(value);
          this.render();
        }
        if (id === 'decimalPlaces') {
          this.renderer.calculateBaseDimensions();
        }
        if (id === 'focusAlign' && this.renderer.focus) {
          this.renderer.scrollToFocusAlign(value);
        }
        if (id === 'dedupLevel') {
          this.currentDedupLevel = value;
          this._applyDedupFilter();
        }
      },

      onResize: () => this._resizeCanvas()
    });

    // ── Interaction ────────────────────────────────────────────
    this._setupFocusInteraction();
    AppUtils.makeMouseWatchers(this.base, this.canvas, this.renderer, () => this.render());

    // ── Initial data ───────────────────────────────────────────
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());

    if (defaultSample) {
      this.loadSample(defaultSample, defaultSize);
      const sel = document.getElementById('sampleSelect');
      if (sel) sel.value = defaultSample;
    }

    requestAnimationFrame(() => this._resizeCanvas());
  }

  // ── Slider config: composable sections ─────────────────────────
  //
  // Each _section*() returns an array of config entries.
  // Subclasses override _buildSliderConfig() to assemble
  // whichever sections they need.

  _buildSliderConfig() {
    return [
      ...this._sectionLoadData(),
      ...this._sectionSampleData(),
      ...this._sectionSampleSize(),
      ...this._sectionPresets(),
      ...this._sectionDataOptions(),
      ...this._sectionDisplay(),
      ...this._sectionView(),
      ...this._sectionFocus(),
      ...this._sectionDedup(),
    ];
  }

  _sectionLoadData() {
    return AppUtils.createLoadDataSection({
      label: 'Drop CSV file or click',
      accept: '.csv,.txt',
      onDrop: (files) => { if (files[0]) this.loadFile(files[0]); }
    });
  }

  _sectionSampleData() {
    return AppUtils.createSampleDataSection({
      options: OmniGridApp.SAMPLE_OPTIONS,
      onChange: (value) => { if (value) this.loadSample(value, this.currentSize); }
    });
  }

  _sectionSampleSize() {
    return AppUtils.createSampleSizeSection({
      currentSize: this.currentSize,
      onChange: (size) => {
        this.currentSize = size;
        const sel = document.getElementById('sampleSelect');
        if (sel?.value) this.loadSample(sel.value, size);
      }
    });
  }


  _sectionPresets() {
    return [
      { group: 'Presets', id: 'presets', abbrev: 'Pre', type: 'presets' }
    ];
  }

  _sectionDataOptions() {
    return [{
      group: 'Data Options', id: 'dataOpts', abbrev: 'Dat',
      sliders: [
        { id: 'distanceMatrix', label: 'Distance matrix', min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'reverseRows', label: 'Reverse Rows', min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'reverseCols', label: 'Reverse Cols', min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'headersAffectWidth', label: 'Headers affect width', min: 0, max: 1, step: 0.01, default: 0 }
      ]
    }];
  }

  _sectionDisplay() {
    return [
      {
        group: 'Display', id: 'display', abbrev: 'Dis',
        sliders: [
          { id: 'colorTarget', label: 'Color target (bg↔fg)', min: 0, max: 1, step: 0.01, default: 0 },
          { id: 'smoothGradient', label: 'Smooth gradient', min: 0, max: 1, step: 0.01, default: 1 },
          { id: 'blobMode', label: 'Blob mode', min: 0, max: 1, step: 0.01, default: 0 },
          { id: 'decimalPlaces', label: 'Decimal places', min: 0, max: 6, step: 1, default: 2, format: 'int' },
          { id: 'textAlign', label: 'Text align (L↔R)', min: 0, max: 1, step: 0.01, default: 0.5 },
          { id: 'indexOverlay', label: 'Index overlay', min: 0, max: 1, step: 0.01, default: 0 }
        ]
      },
      {
        group: 'Display', id: 'colorScheme',
        type: 'select',
        selectId: 'colorScheme',
        label: 'Color scheme',
        options: OmniGridApp.COLOR_SCHEMES,
        onChange: (value) => {
          this.renderer.options.colorScheme = value;
          this.render();
        }
      }
    ];
  }

  _sectionView() {
    return [
      {
        group: 'View', id: 'view', abbrev: 'View',
        sliders: [
          { id: 'zoom', label: 'Zoom', min: 0.01, max: 2, step: 0.01, default: 1 }
        ]
      },
      {
        group: 'View', id: 'viewActions',
        type: 'custom',
        build: (groupEl) => {
          groupEl.appendChild( AppUtils.createButton({
            text: 'Reset View',
            onClick: () => {
              this.renderer.resetView();
              this.base.updateSlider('zoom', 1, false);
              this.render();
            }
          }));

          groupEl.appendChild( AppUtils.createInfoRow({
            items: [
              { label: 'Visible', id: 'infoVisible', value: '0×0' },
              { label: 'Data', id: 'infoTotal', value: '0×0' }
            ],
            className: 'grid-info',
            style: { marginTop: '8px' }
          }));
        }
      }
    ];
  }

  _sectionFocus() {
    return [{
      group: 'Focus', id: 'focus', abbrev: 'Foc',
      sliders: [
        { id: 'focusAlign', label: 'Focus align (top↔bot)', min: 0, max: 1, step: 0.001, default: 0.5 }
      ]
    }];
  }

  _sectionDedup() {
    return [
      {
        group: 'Dedup Filter', id: 'dedupSlider', abbrev: 'Dup',
        sliders: [
          { id: 'dedupLevel', label: 'Dedup (none↔aggressive)', min: 0, max: 1, step: 0.01, default: 0 }
        ]
      },
      {
        group: 'Dedup Filter', id: 'dedupCol',
        type: 'custom',
        build: (groupEl) => {
          groupEl.appendChild( AppUtils.createSelectRow({
            id: 'dedupColSelect',
            label: 'Column',
            options: [{ value: '1', label: 'Column 2 (default)' }],
            onChange: () => this._applyDedupFilter()
          }));
          groupEl.appendChild( AppUtils.createInfoLine({ id: 'dedupInfo', text: 'No CSV loaded' }));
        }
      },
      {
        group: 'Dedup Filter', id: 'dedupActions',
        type: 'custom',
        build: (groupEl) => {
          groupEl.appendChild( AppUtils.createButton({
            text: 'Save CSV',
            style: { marginTop: '6px' },
            onClick: () => this._saveFilteredCSV()
          }));
        }
      }
    ];
  }

  // ── Focus interaction ──────────────────────────────────────────

  _setupFocusInteraction() {
    let indexDrag = null;

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.renderer.gridData) return;
      const rect = this.canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const hit = this.renderer.hitTest(cx, cy);

      if (!hit) {
        this.renderer.focus = null;
        indexDrag = null;
        this.render();
        return;
      }

      const focus = hit.type === 'index'
        ? this.renderer.computeFocusFromIndex(hit.row)
        : this.renderer.computeFocusFromDataCell(hit.row, hit.col);
      this.renderer.focus = focus;

      if (hit.type === 'index') {
        const { offsetY } = this.renderer.lastLayout;
        const viewportScreenH = this.renderer.canvas.height - offsetY;
        const t = Math.max(0, Math.min(1, (cy - offsetY) / viewportScreenH));

        this.renderer.scrollToFocusAlign(t);
        this.base.updateSlider('focusAlign', t, false);
        this.render();

        indexDrag = { startT: t, startScreenY: e.clientY, viewportScreenH };
        e.stopImmediatePropagation();
      } else {
        const t = this.renderer.getFocusAlignValue();
        this.base.updateSlider('focusAlign', Math.max(0, Math.min(1, t)), false);
        this.render();

        // Fire cell-select callback with data-space coordinates
        if (this.onCellSelect && e.ctrlKey) {
          const dataRow = this.renderer.gridData.permutedRow(hit.row, this.renderer.options.reverseRows);
          const dataCol = this.renderer.gridData.permutedCol(hit.col, this.renderer.options.reverseCols);
          const value = this.renderer.gridData.getValue([dataRow, dataCol]);
          this.onCellSelect(dataRow, dataCol, value, this);
        }
      }
    }, true);

    window.addEventListener('mousemove', (e) => {
      if (!indexDrag) return;
      const dy = e.clientY - indexDrag.startScreenY;
      const newT = Math.max(0, Math.min(1, indexDrag.startT + dy / indexDrag.viewportScreenH));
      this.renderer.scrollToFocusAlign(newT);
      this.base.updateSlider('focusAlign', newT, false);
      this.render();
    });

    window.addEventListener('mouseup', () => { indexDrag = null; });
  }

  // ── Data loading ───────────────────────────────────────────────

  loadFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new CSVData(e.target.result);
        this.originalCSVData = data;
        this._updateDedupColSelector(data);

        const sel = document.getElementById('sampleSelect');
        if (sel) sel.value = '';

        this.currentDedupLevel = 0;
        this.base.updateSlider('dedupLevel', 0, false);
        this._updateDedupInfo(data.rows.length, data.rows.length, Infinity);

        this._setDataAndRender(data);
      } catch (err) {
        alert('Error parsing CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  loadSample(sampleId, size) {
    const data = OmniGridApp.getSampleData(sampleId, size);
    if (!data) return;

    this.originalCSVData = null;
    this.currentDedupLevel = 0;
    this.base.updateSlider('dedupLevel', 0, false);
    this._updateDedupInfo(0, 0, Infinity);

    this._setDataAndRender(data);
    this.render();
  }

  _setDataAndRender(data) {
    this.renderer.setData(new DataAdapter(data));
    const isDistance = OmniGridApp._detectDistanceMatrix(data);
    const dm = isDistance ? 0.7 : 0.5;
    this.base.updateSlider('distanceMatrix', dm, false);
    this.renderer.options.distanceMatrix = dm;
    const rr = isDistance ? 1.0 : 0.0;
    this.base.updateSlider('reverseRows', rr, false);
    this.renderer.options.reverseRows = rr;
    this.render();
  }

  static _detectDistanceMatrix(data) {
    if (data.rowCount !== data.colCount) return false;
    for (let i = 0; i < data.rowCount; i++) {
      if (data.getRowName(i) !== data.getColName(i)) return false;
    }
    return true;
  }

  // ── Rendering ──────────────────────────────────────────────────

  render() {
    this.renderer.render();
    this._updateInfo();
    if (this.renderer.focus) {
      const t = this.renderer.getFocusAlignValue();
      this.base.updateSlider('focusAlign', Math.max(0, Math.min(1, t)), false);
    }
  }

  _updateInfo() {
    const visEl = document.getElementById('infoVisible');
    const totEl = document.getElementById('infoTotal');
    if (!visEl || !totEl) return;

    if (this.renderer.gridData) {
      const { startRow, endRow, startCol, endCol } = this.renderer.getVisibleRange();
      visEl.textContent = `${endRow - startRow + 1}×${endCol - startCol + 1}`;
      totEl.textContent =
        `${this.renderer.gridData.rowCount}×${this.renderer.gridData.colCount}`;
    } else {
      visEl.textContent = '0×0';
      totEl.textContent = '0×0';
    }
  }

  _resizeCanvas() {
    this.canvas.width = this.container.clientWidth;
    this.canvas.height = this.container.clientHeight;
    TextUtils.clearCache();
    this.render();
  }

  // ── Dedup filter ───────────────────────────────────────────────

  /** Non-linear mapping: slider 0→∞, 0.5→12 chars, 1→1 char. */
  static _dedupPrefixLen(s) {
    if (s <= 0) return Infinity;
    if (s >= 1) return 1;
    return Math.round(1 / Math.pow(s, Math.log2(12)));
  }

  _updateDedupColSelector(csvData) {
    const sel = document.getElementById('dedupColSelect');
    if (!sel) return;
    sel.innerHTML = '';
    if (!csvData) return;
    csvData.headers.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = h || `Col ${i + 1}`;
      sel.appendChild(opt);
    });
    if (csvData.headers.length > 1) sel.value = '1';
  }

  _applyDedupFilter() {
    if (!this.originalCSVData) {
      this._updateDedupInfo(0, 0, Infinity);
      return;
    }

    const prefixLen = OmniGridApp._dedupPrefixLen(this.currentDedupLevel);
    const total = this.originalCSVData.rows.length;

    if (prefixLen === Infinity) {
      this._setDataAndRender(this.originalCSVData);
      this._updateDedupInfo(total, total, prefixLen);
      return;
    }

    const colIdx = parseInt(document.getElementById('dedupColSelect')?.value || '1', 10);
    const seenPrefixes = new Set();
    const keptIndices = [];

    for (let i = 0; i < total; i++) {
      const val = (this.originalCSVData.rows[i][colIdx] || '').toLowerCase().substring(0, prefixLen);
      if (!seenPrefixes.has(val)) {
        seenPrefixes.add(val);
        keptIndices.push(i);
      }
    }

    const filtered = keptIndices.length === total
      ? this.originalCSVData
      : new FilteredGridData(this.originalCSVData, keptIndices);

    this._setDataAndRender(filtered);
    this._updateDedupInfo(keptIndices.length, total, prefixLen);
  }

  _updateDedupInfo(shown, total, prefixLen) {
    const el = document.getElementById('dedupInfo');
    if (!el) return;
    if (total === 0) {
      el.textContent = 'No CSV loaded';
    } else if (prefixLen === Infinity) {
      el.textContent = `${total} rows (no filter)`;
    } else {
      el.textContent = `${shown}/${total} rows (prefix ${prefixLen} char${prefixLen !== 1 ? 's' : ''})`;
    }
  }

  // ── CSV export ─────────────────────────────────────────────────

  static _csvQuote(value, delim) {
    const s = value == null ? '' : String(value);
    if (s.indexOf(delim) === -1 && s.indexOf('"') === -1 && s.indexOf('\n') === -1) return s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  _saveFilteredCSV() {
    const data = this.renderer.gridData;
    // Access raw grid for CSV-specific internals (_colNames, delimiter, _hasRowNames)
    const raw = data.grid || data;
    if (!raw || !raw._colNames) { alert('No CSV data loaded'); return; }

    const delim = raw.delimiter || ',';
    const q = (v) => OmniGridApp._csvQuote(v, delim);
    const lines = [];

    const headerCells = raw._hasRowNames
      ? ['', ...raw._colNames]
      : [...raw._colNames];
    lines.push(headerCells.map(q).join(delim));

    for (let r = 0; r < data.rowCount; r++) {
      const row = [];
      if (raw._hasRowNames) row.push(q(data.getRowName(r)));
      for (let c = 0; c < data.colCount; c++) {
        row.push(q(data.getValue([r, c])));
      }
      lines.push(row.join(delim));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'filtered.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}

if (typeof registerFunctionSources !== 'undefined') {
  registerFunctionSources?.( OmniGridApp.registerDataSource );
}

export {OmniGridApp };
// Auto-generated exports
if (typeof window !== 'undefined') window.FilteredGridData = FilteredGridData;
export { FilteredGridData };
if (typeof window !== 'undefined') window.GridScene = GridScene;
export { GridScene };
if (typeof window !== 'undefined') window.OMNIGRID_PRESETS = OMNIGRID_PRESETS;
export { OMNIGRID_PRESETS };
