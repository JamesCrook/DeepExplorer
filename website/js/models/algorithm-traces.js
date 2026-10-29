// Traces of FFT, Smith-Waterman and MultiGrid as pure functions of time, for omni-run
/**
 * Execution traces of three grid algorithms, as pure functions of time.
 * Each algorithm answers
 *
 *   size()                -> { rows, cols }
 *   getCell(row, col, t)  -> { isReady, connections: [{ row, col, state, bendHint }] }
 *
 * where t runs 0..100 through the computation.  isReady says whether the cell
 * has been computed by time t; each connection is an input the cell reads,
 * with state 1 once that input has been delivered.
 *
 * No drawing here: apps/scenes-run.js turns these answers into node values.
 * Came from attic/unfolded/omni-run.js, where the same logic sat in the app.
 */

// ── FFT butterfly ────────────────────────────────────────
// Columns are stages; a stage-k cell reads two cells of the previous stage.
const FFT = {
  rows: 16,
  cols: 5,
  size() { return { rows: FFT.rows, cols: FFT.cols }; },

  getCell(row, col, time) {
    const n = col * FFT.rows + row;
    const cellProgress = (n * 100) / (FFT.rows * FFT.cols);
    const isReady = cellProgress < time ? 1 : 0;
    const connections = [];
    if (col > 0) {
      const dftSize = 1 << (col - 1);
      const dDftSize = dftSize * 2;
      for (let input = 0; input < 2; input++) {
        const connectionProgress = ((n * 2 + input) * 100) / (2 * FFT.rows * FFT.cols);
        const sourceRow = input === 0
          ? row
          : (row + dftSize) % dDftSize + Math.floor(row / dDftSize) * dDftSize;
        connections.push({
          row: sourceRow,
          col: col - 1,
          state: connectionProgress < time ? 1 : 0,
          bendHint: input * 0.3 * ((row & dftSize) > 0 ? -1 : 1),
        });
      }
    }
    return { isReady, connections };
  },
};

// ── Smith-Waterman ───────────────────────────────────────
// Column-major fill; each cell reads above, left and diagonal.
const SmithWaterman = {
  rows: 12,
  cols: 12,
  size() { return { rows: SmithWaterman.rows, cols: SmithWaterman.cols }; },

  getCell(row, col, time) {
    const R = SmithWaterman.rows - 1, C = SmithWaterman.cols - 1;
    const n = (col - 1) * R + row;
    let cellProgress = (n * 100) / (R * C);
    let isReady = cellProgress < time ? 1 : 0;
    const connections = [];
    if (row > 0 && col > 0) {
      const deps = [
        { row: row - 1, col },          // above
        { row, col: col - 1 },          // left
        { row: row - 1, col: col - 1 }, // diagonal
      ];
      for (const dep of deps) {
        connections.push({ ...dep, state: cellProgress <= time ? 1 : 0, bendHint: 0 });
        cellProgress -= 0.34;           // the three inputs arrive in turn
      }
    } else {
      isReady = 1;                      // the boundary row and column are given
    }
    return { isReady, connections };
  },
};

// ── Multigrid V-cycle ────────────────────────────────────
// Coarse to fine, then back up; only the cell being worked on shows inputs.
const MultiGrid = {
  levels: 4,
  rows: 9,
  cols: 9,
  size() { return { rows: MultiGrid.rows, cols: MultiGrid.cols }; },

  _order: null,
  executionOrder() {
    if (MultiGrid._order) return MultiGrid._order;
    const order = [];
    const { levels, rows, cols } = MultiGrid;
    for (let level = levels - 1; level >= 0; level--) {
      const step = 1 << level;
      for (let r = 0; r < rows; r += step)
        for (let c = 0; c < cols; c += step) order.push({ row: r, col: c, level });
    }
    for (let level = 1; level < levels; level++) {
      const step = 1 << level;
      for (let r = 0; r < rows; r += step)
        for (let c = 0; c < cols; c += step) order.push({ row: r, col: c, level, isUpward: true });
    }
    return (MultiGrid._order = order);
  },

  // First occurrence of (row, col) in the order, and the index being worked on at time t.
  findCellIndex(row, col, time) {
    const order = MultiGrid.executionOrder();
    const currentIndex = Math.floor((time / 100) * order.length);
    const index = order.findIndex(e => e.row === row && e.col === col);
    return { index, entry: index >= 0 ? order[index] : null, currentIndex };
  },

  getCell(row, col, time) {
    const { index, entry, currentIndex } = MultiGrid.findCellIndex(row, col, time);
    const isReady = (index !== -1 && index < currentIndex) ? 1 : 0;
    const connections = [];
    if (index === currentIndex && entry) {
      const step = 1 << entry.level;
      const neighbours = [
        { row: row - step, col }, { row: row + step, col },
        { row, col: col - step }, { row, col: col + step },
      ];
      for (const n of neighbours) {
        if (n.row < 0 || n.row >= MultiGrid.rows || n.col < 0 || n.col >= MultiGrid.cols) continue;
        const { index: nIndex } = MultiGrid.findCellIndex(n.row, n.col, time);
        connections.push({ ...n, state: (nIndex !== -1 && nIndex < currentIndex) ? 1 : 0, bendHint: 0 });
      }
      if (!entry.isUpward && entry.level < MultiGrid.levels - 1) {
        const coarseStep = 1 << (entry.level + 1);
        const coarseRow = Math.floor(row / coarseStep) * coarseStep;
        const coarseCol = Math.floor(col / coarseStep) * coarseStep;
        if (coarseRow !== row || coarseCol !== col) {
          connections.push({ row: coarseRow, col: coarseCol, state: 1, bendHint: 0.2 });
        }
      }
    }
    return { isReady, connections };
  },
};

const ALGORITHM_TRACES = { FFT, SmithWaterman, MultiGrid };

export { ALGORITHM_TRACES, FFT, SmithWaterman, MultiGrid };
