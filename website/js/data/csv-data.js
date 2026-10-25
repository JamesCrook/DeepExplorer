// ============================================================
// GRID DATA CLASSES
// ============================================================

class GridData {
  constructor(rowCount, colCount) {
    this.rowCount = rowCount;
    this.colCount = colCount;
    this._globalRange = null;
  }

  getValue(row, col) { throw new Error('Abstract method'); }
  getRowName(row) { return String(row + 1); }
  getColName(col) { return String(col + 1); }
  getString(cursor) {
    const row = cursor[1];
    const col = cursor[0]
    const rowName = this.getRowName(row);
    const value   = this.getValue(row, col);
    return `${rowName}: ${value}`;
  }
  isNumeric(row, col) { return typeof this.getValue(row, col) === 'number'; }
  hasRowNames() { return false; }

  get globalRange() {
    if (!this._globalRange) {
      this._globalRange = this.computeGlobalRange();
    }
    return this._globalRange;
  }

  computeGlobalRange() {
    let min = Infinity, max = -Infinity;
    const sampleSize = Math.min(10000, this.rowCount * this.colCount);
    const step = Math.max(1, Math.floor((this.rowCount * this.colCount) / sampleSize));
    
    for (let i = 0; i < sampleSize; i++) {
      const idx = i * step;
      const r = Math.floor(idx / this.colCount);
      const c = idx % this.colCount;
      if (r < this.rowCount && this.isNumeric(r, c)) {
        const v = this.getValue(r, c);
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
  }

  // These should probably move to DataAdapter
  getColumnOrder(focusCol, count) {
    const order = [];
    for (let i = 0; i < count; i++) {
      order.push((focusCol - 1 + i) % this.colCount);
    }
    return order;
  }
  getRowOrder(focusRow, count) {
    const order = [];
    for (let i = 0; i < count; i++) {
      order.push((focusRow - 1 + i) % this.rowCount);
    }
    return order;
  }

}

/**
 * CSV Data Parser - Reusable CSV parsing utilities
 * Supports both comma-delimited and tab-delimited files.
 */

class CSVData extends GridData {
  constructor(rawText) {
    const lines = rawText.trim().split(/\r?\n/);

    // Auto-detect delimiter: tab if the first line contains tabs, otherwise comma.
    // Heuristic: if tabs are present and outnumber commas, treat as TSV.
    const tabCount = (lines[0].match(/\t/g) || []).length;
    const commaCount = (lines[0].match(/,/g) || []).length;
    const delimiter = tabCount > 0 && tabCount >= commaCount ? '\t' : ',';

    const parsed = lines.map(line => CSVData.parseCSVLine(line, delimiter));
    
    if (parsed.length === 0) throw new Error('Empty CSV');
    
    const colNames = parsed[0];
    const dataRows = parsed.slice(1);
    
    // Auto-detect row names (non-numeric first column)
    let hasRowNames = false;
    if (dataRows.length > 0 && dataRows[0].length > 0) {
      hasRowNames = dataRows.every(row => row[0] && isNaN(parseFloat(row[0])));
    }
    
    const rowNames = hasRowNames ? dataRows.map(row => row[0]) : dataRows.map((_, i) => String(i + 1));
    const dataStartCol = hasRowNames ? 1 : 0;
    const actualColNames = hasRowNames ? colNames.slice(1) : colNames;
    
    const data = dataRows.map(row => {
      return row.slice(dataStartCol).map(cell => {
        const trimmed = cell.trim();
        const num = trimmed === '' ? NaN : Number(trimmed);
        return isNaN(num) ? cell : num;
      });
    });
    
    const rowCount = data.length;
    const colCount = data[0]?.length || 0;
    
    super(rowCount, colCount);
    
    // Store all properties for OmniGrid compatibility
    this.rowCount = rowCount;
    this.colCount = colCount;
    this.delimiter = delimiter;
    this._data = data;
    this._rowNames = rowNames;
    this._colNames = actualColNames;
    this._hasRowNames = hasRowNames;
    this._isNumeric = data.map(row => row.map(cell => typeof cell === 'number'));
    this._globalRange = null;
    
    // Also store simple accessors for OmniCard
    this.headers = colNames;
    this.rows = dataRows;

    // Metadata
    this.rowMeta = new Array(rowCount).fill(null);
    this.colMeta = new Array(colCount).fill(null);
    this.cellMeta = new Map();
  }

  static parseCSVLine(line, delimiter = ',') {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  // OmniGrid methods
  getValue(row, col) { return this._data[row]?.[col]; }
  getRowName(row) { return this._rowNames[row] || String(row + 1); }
  getColName(col) { return this._colNames[col] || String(col + 1); }
  isNumeric(row, col) { return this._isNumeric[row]?.[col] ?? false; }
  hasRowNames() { return this._hasRowNames; }

  get globalRange() {
    if (!this._globalRange) {
      this._globalRange = this.computeGlobalRange();
    }
    return this._globalRange;
  }

  computeGlobalRange() {
    let min = Infinity, max = -Infinity;
    for (let r = 0; r < this.rowCount; r++) {
      for (let c = 0; c < this.colCount; c++) {
        if (this._isNumeric[r][c]) {
          const v = this._data[r][c];
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
  }

  // OmniCard methods
  getRow(index) {
    return this.rows[index];
  }

  getCell(row, col) {
    return this.rows[row]?.[col] || '';
  }

  // Metadata methods
  setRowMeta(index, obj) {
    this.rowMeta[index] = obj;
  }

  setColMeta(index, obj) {
    this.colMeta[index] = obj;
  }

  getRowMeta(index) {
    return this.rowMeta[index];
  }

  getColMeta(index) {
    return this.colMeta[index];
  }

  setCellMeta(row, col, obj) {
    this.cellMeta.set(`${row},${col}`, obj);
  }

  getCellMeta(row, col) {
    return this.cellMeta.get(`${row},${col}`);
  }
}

// Export for global scope
if (typeof window !== 'undefined') {
  window.CSVData = CSVData;
}

class MiscData  {
  static cities(size = 'large') {
      const cityNames = [
        'Tokyo','Delhi','Shanghai','São Paulo','Mexico City','Cairo','Mumbai',
        'Beijing','Dhaka','Osaka','New York','Karachi','Buenos Aires','Chongqing',
        'Istanbul','Kolkata','Manila','Lagos','Rio de Janeiro','Tianjin',
        'Kinshasa','Guangzhou','Los Angeles','Moscow','Shenzhen','Lahore',
        'Bangalore','Paris','Jakarta','Chennai','Dublin','London','Seoul','Sydney',
        'Bangkok','Miami','Vienna','Houston','Philadelphia'
      ];
      const sizes = { small: 10, medium: 15, large: cityNames.length };
      const n = sizes[size];
      
      const coords = [
        [35.6,139.7],[28.6,77.2],[31.2,121.5],[-23.5,-46.6],[19.4,-99.1],
        [30.0,31.2],[19.0,72.8],[39.9,116.4],[23.8,90.4],[34.7,135.5],
        [40.7,-74.0],[24.9,67.0],[-34.6,-58.4],[29.4,106.9],[41.0,29.0],
        [22.6,88.4],[14.6,121.0],[6.5,3.4],[-22.9,-43.2],[39.3,117.4],
        [-4.4,15.3],[23.1,113.3],[34.1,-118.2],[55.8,37.6],[22.5,114.1],
        [31.5,74.3],[13.0,77.6],[48.9,2.3],[-6.2,106.8],[13.1,80.3],
        [53.3,-6.2],[51.5,-0.1],[37.5,126.9],[-33.8,151.2],[13.7,100.5],
        [25.7,-80.2],[48.2,16.4],[29.7,-95.3],[39.9,-75.1]
      ];
  
    const toRad = d => d * Math.PI / 180;
    const dist = (i, j) => {
      const [lat1, lon1] = coords[i];
      const [lat2, lon2] = coords[j];
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
      return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    };
    
    let csv = ',' + cityNames.slice(0, n).join(',') + '\n';
    for (let i = 0; i < n; i++) {
      const row = [cityNames[i]];
      for (let j = 0; j < n; j++) {
        row.push(i === j ? 0 : dist(i, j));
      }
      csv += row.join(',') + '\n';
    }
    const data = new CSVData(csv);
    for (let i = 0; i < n; i++) {
      data.setRowMeta(i, { lat: coords[i][0], lon: coords[i][1] });
      data.setColMeta(i, { lat: coords[i][0], lon: coords[i][1] });
    }
    return data;
  }


  static productSales( catCount = 5 ){
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const PRODUCTS = ['Product A', 'Product B', 'Product C', 'Product D', 'Product E'];
    const NUM_PRODUCTS = 5;
    
    const seededRandom = (seed) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    let csv = ',' + PRODUCTS.slice(0, catCount).join(',') + '\n';
    for (let s = 0; s < MONTHS.length; s++) {
      const row = [MONTHS[s]];
      for (let c = 0; c < catCount; c++) {
        row.push(15 + Math.floor(seededRandom(s * 100 + c * 7 + 42) * 40));
      }
      csv += row.join(',') + '\n';
    }
    const data = new CSVData(csv);
    return data;
  }

  static locationFootfall( catCount = 5 ){
    const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const LOCATIONS = ['Mall', 'Park', 'Office', 'Hospital', 'Church'];
    const NUM_LOCATIONS = 5;
    
    const seededRandom = (seed) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    let csv = ',' + LOCATIONS.slice(0, catCount).join(',') + '\n';
    for (let s = 0; s < DAYS.length; s++) {
      const row = [DAYS[s]];
      for (let c = 0; c < catCount; c++) {
        row.push(15 + Math.floor(seededRandom(s * 100 + c * 7 + 47) * 40));
      }
      csv += row.join(',') + '\n';
    }
    const data = new CSVData(csv);
    return data;
  }

  static pam250() {
    const aa = 'ARNDCQEGHILKMFPSTWYV'.split('');
    const matrix = [
      [ 2,-2, 0, 0,-2, 0, 0, 1,-1,-1,-2,-1,-1,-4, 1, 1, 1,-6,-3, 0],
      [-2, 6, 0,-1,-4, 1,-1,-3, 2,-2,-3, 3, 0,-4, 0, 0,-1, 2,-4,-2],
      [ 0, 0, 2, 2,-4, 1, 1, 0, 2,-2,-3, 1,-2,-4,-1, 1, 0,-4,-2,-2],
      [ 0,-1, 2, 4,-5, 2, 3, 1, 1,-2,-4, 0,-3,-6,-1, 0, 0,-7,-4,-2],
      [-2,-4,-4,-6,12,-5,-5,-3,-3,-2,-6,-5,-5,-4,-3, 0,-2,-8, 0,-2],
      [ 0, 1, 1, 2,-5, 4, 2,-1, 3,-2,-2, 1,-1,-5, 0,-1,-1,-5,-4,-2],
      [ 0,-1, 1, 3,-5, 2, 4, 0, 1,-2,-3, 0,-2,-5,-1, 0, 0,-7,-4,-2],
      [ 1,-3, 0, 1,-3,-1, 0, 5,-2,-3,-4,-2,-3,-5,-1, 1, 0,-7,-5,-1],
      [-1, 2, 2, 1,-3, 3, 1,-2, 6,-2,-2, 0,-2,-2, 0,-1,-1,-3, 0,-2],
      [-1,-2,-2,-2,-2,-2,-2,-3,-2, 5, 2,-2, 2, 1,-2,-1, 0,-5,-1, 4],
      [-2,-3,-3,-4,-6,-2,-3,-4,-2, 2, 6,-3, 4, 2,-3,-3,-2,-2,-1, 2],
      [-1, 3, 1, 0,-5, 1, 0,-2, 0,-2,-3, 5, 0,-5,-1, 0, 0,-3,-4,-2],
      [-1, 0,-2,-3,-5,-1,-2,-3,-2, 2, 4, 0, 6, 0,-2,-2,-1,-4,-2, 2],
      [-4,-4,-4,-6,-4,-5,-5,-5,-2, 1, 2,-5, 0, 9,-5,-3,-3, 0, 7,-1],
      [ 1, 0,-1,-1,-3, 0,-1,-1, 0,-2,-3,-1,-2,-5, 6, 1, 0,-6,-5,-1],
      [ 1, 0, 1, 0, 0,-1, 0, 1,-1,-1,-3, 0,-2,-3, 1, 2, 1,-2,-3,-1],
      [ 1,-1, 0, 0,-2,-1, 0, 0,-1, 0,-2, 0,-1,-3, 0, 1, 3,-5,-3, 0],
      [-6, 2,-4,-7,-8,-5,-7,-7,-3,-5,-2,-3,-4, 0,-6,-2,-5,17, 0,-6],
      [-3,-4,-2,-4, 0,-4,-4,-5, 0,-1,-1,-4,-2, 7,-5,-3,-3, 0,10,-2],
      [ 0,-2,-2,-2,-2,-2,-2,-1,-2, 4, 2,-2, 2,-1,-1,-1, 0,-6,-2, 4]
    ];
    
    let csv = ',' + aa.join(',') + '\n';
    for (let i = 0; i < aa.length; i++) {
      csv += aa[i] + ',' + matrix[i].join(',') + '\n';
    }
    return new CSVData(csv);
  }
};  


class FunctionData extends GridData {
  constructor(rowCount, colCount, valueFn, options = {}) {
    super(rowCount, colCount);
    this._valueFn = valueFn;
    this._rowNameFn = options.rowNameFn || (r => String(r + 1));
    this._colNameFn = options.colNameFn || (c => String(c + 1));
    this._knownRange = options.range || null;
  }

  getValue(row, col) { return this._valueFn(row, col); }
  getRowName(row) { return this._rowNameFn(row); }
  getColName(col) { return this._colNameFn(col); }
  isNumeric() { return true; }
  hasRowNames() { return true; }

  computeGlobalRange() {
    return this._knownRange || super.computeGlobalRange();
  }
}

// ============================================================
// DataAdapter — transformation layer between raw data and consumers
// ============================================================
//
// Wraps a GridData (or tree) and provides:
//   - Coordinate remapping (_remapCursor): translates client-side
//     cursors to raw grid (row, col). Currently identity; will
//     handle transpose and permutation in future.
//   - Cumulative value cache: prefix sums built in grid-native
//     space, rebuilt only when data-shaping params change
//   - On-demand segment derivation (getSegment): y0/y1/color etc.
//     computed from cached cumulatives + per-frame params (stack,
//     normalize) via cheap lerps
//   - Draw-order mapping (drawOrderIdx): maps a position in the
//     product draw order to the original grid column index
//   - Permutation (permutedRow/permutedCol): continuous split-point
//     reordering for visual row/col reversal
//
// Cursor convention:
//   Cursors are arrays. For 2D grids: [col, row] where
//     col = cursor[0]               (outer dimension)
//     row = cursor[cursor.length-1] (inner dimension)
//
//   _remapCursor translates this to grid.getValue(firstArg, secondArg).
//   Currently cursor[0] → grid row, cursor[last] → grid col.
//   This works for the chart where cursor[0] = category = grid row.
//
//   When transpose is enabled (future), _remapCursor will swap so
//   that cursor[0] (the caller's "col") maps to what was the grid's
//   column dimension, now presented as the outer dimension. This is
//   the single boundary between client space and data space.
//
// Cumulative cache:
//   _cumulative[gridRow][0..numProducts] — prefix sums of
//   transformed values along the draw order, built using
//   grid.getValue directly (grid-native space). The stack
//   and normalize params are NOT baked in — they're applied
//   as on-demand lerps in getSegment, so dragging those sliders
//   costs nothing.
//
//   Future: prefix-sum structure (e.g. Fenwick tree) for
//   efficient partial updates over large datasets or trees.

function _lerp(a, b, t) { return a + (b - a) * t; }

class DataAdapter {
  constructor(gridData) {
    this.grid = gridData;

    // ── Transpose (future) ───────────────────────────────
    // When enabled, swaps the row/col axes of the underlying
    // grid. _remapCursor will swap cursor[0] and cursor[last],
    // and rowCount/colCount will reflect the transposed shape.
    // Navigation layers above the adapter see the transposed
    // shape without knowing.
    this._transpose = false;

    // ── Cumulative cache ─────────────────────────────────
    this._cumulative = null;   // [gridRow][0..numProducts] prefix sums
    this._maxCumulative = 0;   // max column total across all grid rows
    this._maxSingle = 0;       // max individual segment value
    this._numProducts = 0;     // cached product count
    this._dirty = true;

    // Params that were used to build the current cache.
    // Any change → full rebuild.
    this._cachedUseValue = null;
    this._cachedFocusProduct = null;
    this._cachedNumProducts = null;

    // ── Tree interface proxy ─────────────────────────────
    // Attached as own properties so that feature detection
    // (e.g. !!adapter.first) reflects the wrapped object's
    // capabilities, not the adapter's class shape.
    const treeMethods = [
      'first', 'levelOf', 'getNode', 'getSubtreeCount',
      'getSiblingCount', 'getNumericValue', 'next', 'prev',
      'translateCursor', 'isADescendantOf',
    ];
    for (const m of treeMethods) {
      if (typeof gridData[m] === 'function') {
        this[m] = gridData[m].bind(gridData);
      }
    }

    // ── TreeChartData proxy ──────────────────────────────
    // Exposes parent/child index maps and ancestry checks
    // when the underlying data is a TreeChartData.
    const treeChartMethods = [
      'getParentIndex', 'getChildRange', 'getTreeCursor', 'isAncestor',
    ];
    for (const m of treeChartMethods) {
      if (typeof gridData[m] === 'function') {
        this[m] = gridData[m].bind(gridData);
      }
    }
  }

  get isTreeChart() { return !!this.grid.isTreeChart; }

  // ── Shape (client-side) ────────────────────────────────

  get rowCount()    { return this._transpose ? this.grid.colCount : this.grid.rowCount; }
  set rowCount(v)   {
    if (this._transpose) this.grid.colCount = v; else this.grid.rowCount = v;
    this._dirty = true;
  }
  get colCount()    { return this._transpose ? this.grid.rowCount : this.grid.colCount; }

  // ── Internal coordinate remapping ──────────────────────
  // Translates a client-side cursor to [gridRow, gridCol] for
  // use with grid.getValue(row, col).
  //
  // Currently identity: cursor[0] → gridRow, cursor[last] → gridCol.
  // This works when callers put grid rows in cursor[0] (e.g. the
  // chart puts categories = grid rows in cursor[0]).
  //
  // When transpose is enabled (future), this will swap so that
  // cursor[0] maps to gridCol and cursor[last] to gridRow,
  // reflecting the transposed presentation.
  //
  // Permutation may also be applied here in future, making it
  // invisible to all callers.
  _remapCursor(cursor) {
    const a = cursor[0];
    const b = cursor[cursor.length - 1];
    if (this._transpose) return [b, a];
    return [a, b];
  }

  // ── Proxied GridData methods (cursor-based) ────────────

  getValue(cursor) {
    const [r, c] = this._remapCursor(cursor);
    return this.grid.getValue(r, c);
  }

  isNumeric(cursor) {
    const [r, c] = this._remapCursor(cursor);
    return this.grid.isNumeric(r, c);
  }

  // getString delegates to the wrapped data's own getString,
  // which already understands its native cursor convention.
  // For GridData: cursor[0] = col, cursor[1] = row.
  // For trees: cursor = path.
  getString(cursor) {
    return this.grid.getString(cursor);
  }

  getRowName(row) {
    return this._transpose
      ? this.grid.getColName(row)
      : this.grid.getRowName(row);
  }

  getColName(col) {
    return this._transpose
      ? this.grid.getRowName(col)
      : this.grid.getColName(col);
  }

  hasRowNames() { return this.grid.hasRowNames(); }
  get globalRange() { return this.grid.globalRange; }

  getColMeta(col)       { return this.grid.getColMeta(col); }
  setColMeta(col, obj)  { this.grid.setColMeta(col, obj); }
  getRowMeta(row)       { return this.grid.getRowMeta(row); }
  setRowMeta(row, obj)  { this.grid.setRowMeta(row, obj); }

  getLabel(cursor) {
    const [r, c] = this._remapCursor(cursor);
    const colLabel = this.grid.getColName(c);
    const rowLabel = this.grid.getRowName(r);
    // grid.getLabel exists on trees; fall back to row name for grids
    return this.grid.getLabel?.(cursor) ?? rowLabel;
  }

  getDisplayText(cursor, params) {
    const showValue = params?.showValue ?? 0;
    const showText  = params?.showText  ?? 1;
    const value     = this.isNumeric(cursor) ? this.getValue(cursor) : null;
    const label     = this.getLabel(cursor);

    if (showValue > 0.5 && showText > 0.5 && value != null && label)
      return `${value}: ${label}`;
    if (showValue > 0.5 && value != null)
      return String(value);
    if (showText > 0.5 && label)
      return label;
    return '';
  }

  getColCount(col) {
    return this.grid.getColCount?.(col) ?? this.colCount;
  }


  // ── Permutation ────────────────────────────────────────
  // Continuous split-point reordering: k=0 → natural order,
  // k=1 → fully reversed. Smooth transition between the two.
  // Generalises to any axis of a cursor; for now, row and col.

  permutedRow(r, k) {
    const n = this.rowCount;
    const split = Math.floor(k * n);
    return r < split ? (n - 1) - r : r - split;
  }

  permutedCol(c, k) {
    const n = this.colCount;
    const split = Math.floor(k * n);
    return c < split ? (n - 1) - c : c - split;
  }

  // ── Draw-order mapping ─────────────────────────────────
  // Maps a position in the product draw order (0..numProducts-1)
  // to the original grid column index. Replaces the need to
  // materialise a drawOrder array.

  drawOrderIdx(position, params) {
    const focusProduct = params.focusProduct ?? 1;
    return (focusProduct - 1 + position) % this.grid.colCount;
  }

  // ── Cumulative cache ───────────────────────────────────

  markDirty() { this._dirty = true; }

  _ensureCumulative(params) {
    const uv = params.useValue ?? 0;
    const fp = params.focusProduct ?? 1;
    const np = params.numProducts ?? this.grid.colCount;

    if (!this._dirty
        && uv === this._cachedUseValue
        && fp === this._cachedFocusProduct
        && np === this._cachedNumProducts) {
      return;
    }

    this._rebuildCumulative(uv, fp, np);
    this._cachedUseValue = uv;
    this._cachedFocusProduct = fp;
    this._cachedNumProducts = np;
    this._dirty = false;
  }

  // Built in grid-native space using grid.getValue directly.
  // cursor[0] (the outer dimension) maps to grid rows;
  // draw-order positions map to grid columns via drawOrderIdx.
_rebuildCumulative(useValue, focusProduct, numProducts) {
    const gridRows = this.grid.rowCount;
    const gridCols = this.grid.colCount;
    const perRow   = !!this.grid.getColCount;

    this._numProducts = numProducts;
    this._cumulative = new Array(gridRows);

    let maxCum = 0;
    let maxSingle = 0;

    for (let r = 0; r < gridRows; r++) {
      const np  = perRow ? this.grid.getColCount(r) : numProducts;
      const cum = new Float64Array(np + 1);

      for (let j = 0; j < np; j++) {
        const origIdx = perRow ? j : (focusProduct - 1 + j) % gridCols;
        const rawValue = this.grid.getValue(r, origIdx);
        const transformed = 1 + (rawValue - 1) * useValue;
        cum[j + 1] = cum[j] + transformed;
        if (transformed > maxSingle) maxSingle = transformed;
      }

      if (cum[np] > maxCum) maxCum = cum[np];
      this._cumulative[r] = cum;
    }

    this._maxCumulative = maxCum || 1;
    this._maxSingle     = maxSingle || 1;
  }

  // ── Segment access (on-demand, cursor-based) ───────────
  // Returns { y0, y1, color, origIdx, stackedH } for the
  // segment at the given cursor.
  //   cursor[0]    = outer index (category / grid row)
  //   cursor[last] = draw-order position (0..numProducts-1)
  //
  // The stack and normalize lerps happen here — two lerps
  // per cell, trivial cost.



  getSegment(cursor, params) {
    this._ensureCumulative(params);

    const outerIdx = cursor[0];
    const drawPos  = cursor[cursor.length - 1];
    //const np  = this._numProducts;
    
    const cum = this._cumulative[outerIdx];
    const np  = cum ? cum.length - 1 : 0;
    if (!cum || drawPos < 0 || drawPos >= np) return null;

    const cumJ     = cum[drawPos];
    const cumJ1    = cum[drawPos + 1];
    const segValue = cumJ1 - cumJ;
    const colTotal = cum[np] || 1;   // guard division by zero

    const normalize = params.normalize ?? 0;
    const stack     = params.stack ?? 1;
    const maxCum    = this._maxCumulative;
    const maxSingle = this._maxSingle;

    // Stacked positions: blend absolute vs normalised scaling
    const stackedY0 = _lerp(cumJ    / maxCum, cumJ    / colTotal, normalize);
    const stackedY1 = _lerp(cumJ1   / maxCum, cumJ1   / colTotal, normalize);

    // Unstacked height: each segment scaled independently
    const overlayH  = _lerp(segValue / maxSingle, segValue / colTotal, normalize);

    // Blend stacked ↔ unstacked
    const y0 = _lerp(0,        stackedY0, stack);
    const y1 = _lerp(overlayH, stackedY1, stack);

    // origIdx, color — derived inline, never stored
    const origIdx = this.drawOrderIdx(drawPos, params);
    const color = this.grid.getCellColor?.(outerIdx, drawPos)
     ?? this.grid.getColMeta(origIdx)?.color
     ?? '#888';
    return {
      y0, y1, color, origIdx,
      stackedH: _lerp(segValue / maxCum, segValue / colTotal, normalize),
    };
  }
}

export {GridData, CSVData, MiscData,FunctionData,DataAdapter}
// Auto-generated exports
if (typeof window !== 'undefined') window._lerp = _lerp;
export { _lerp };
