import { GridData } from './csv-data.js';

function getNodeLabel(tree, cursor) {
  const node = tree.getNode(cursor);
  if (!node) return '';
  if (typeof node === 'string') return node;
  return node.name ?? node.label ?? node[0] ?? String(node);
}

function collectAllAtLevel(tree, level) {
  if (level === 0) {
    const items = [];
    let c = tree.first(0);
    while (c) { items.push([...c]); c = tree.next(c); }
    return items;
  }
  const parents = collectAllAtLevel(tree, level - 1);
  const items = [];
  for (const parent of parents) {
    const count = (tree.getSubtreeCount(parent) ?? -1) + 1;
    for (let i = 0; i < count; i++) items.push([...parent, i]);
  }
  return items;
}

function wordCount(label) {
  return label ? label.split(/\s+/).filter(Boolean).length || 1 : 1;
}

class TreeChartData extends GridData {
  constructor(tree, panelConfigs) {
    const panels = panelConfigs.map(cfg => {
      const cursors = collectAllAtLevel(tree, cfg.level);
      return {
        level: cfg.level,
        label: cfg.label || `Level ${cfg.level}`,
        items: cursors.map(c => ({
          cursor: c,
          label: getNodeLabel(tree, c),
          rootIdx: c[0],
          weight: 0,
        })),
      };
    });

    const maxItems = Math.max(1, ...panels.map(p => p.items.length));
    super(panels.length, maxItems);

    this._tree = tree;
    this._panels = panels;
    this.colMeta = new Array(maxItems).fill(null);
    this.rowMeta = panels.map(() => null);

    this._computeWeights();
    this._buildIndexMaps();
  }

  // ── Flag for downstream detection ─────────────────────────
  get isTreeChart() { return true; }

  // Leaf weights = word count. Inner weights = sum of children.
  // This ensures a parent occupies exactly the same vertical
  // extent as its children in the next column.
  _computeWeights() {
    const last = this._panels.length - 1;

    // Leaves: weight = word count
    for (const item of this._panels[last].items) {
      item.weight = wordCount(item.label);
    }

    // Bottom-up: parent weight = sum of children weights
    for (let p = last - 1; p >= 0; p--) {
      const childPanel = this._panels[p + 1];
      for (const item of this._panels[p].items) {
        const key = item.cursor.join(',');
        let sum = 0;
        for (const child of childPanel.items) {
          if (child.cursor.slice(0, -1).join(',') === key) {
            sum += child.weight;
          }
        }
        item.weight = sum || wordCount(item.label);
      }
    }
  }

  // ── Parent/child flat-index maps ──────────────────────────
  // _parentIdx[level][childFlatIdx] = parentFlatIdx at level-1
  // _childRange[level][parentFlatIdx] = { first, last } at level+1
  _buildIndexMaps() {
    const n = this._panels.length;
    this._parentIdx  = new Array(n).fill(null);
    this._childRange = new Array(n).fill(null);

    for (let lv = 1; lv < n; lv++) {
      const parentPanel = this._panels[lv - 1];
      const childPanel  = this._panels[lv];

      // Build cursor-key → flat-index lookup for parents
      const parentKeyToIdx = new Map();
      for (let pi = 0; pi < parentPanel.items.length; pi++) {
        parentKeyToIdx.set(parentPanel.items[pi].cursor.join(','), pi);
      }

      // Map each child to its parent
      const pIdx = new Array(childPanel.items.length);
      for (let ci = 0; ci < childPanel.items.length; ci++) {
        const parentKey = childPanel.items[ci].cursor.slice(0, -1).join(',');
        pIdx[ci] = parentKeyToIdx.get(parentKey) ?? 0;
      }
      this._parentIdx[lv] = pIdx;

      // Build child ranges per parent (children are contiguous)
      const ranges = new Array(parentPanel.items.length).fill(null);
      for (let ci = 0; ci < pIdx.length; ci++) {
        const pi = pIdx[ci];
        if (!ranges[pi]) ranges[pi] = { first: ci, last: ci };
        else ranges[pi].last = ci;
      }
      this._childRange[lv - 1] = ranges;
    }
  }

  /**
   * Get the flat index of the parent at level-1 for item flatIdx
   * at the given level. Returns null for level 0.
   */
  getParentIndex(level, flatIdx) {
    if (level <= 0 || !this._parentIdx[level]) return null;
    return this._parentIdx[level][flatIdx] ?? null;
  }

  /**
   * Get the {first, last} flat-index range of children at level+1
   * for item flatIdx at the given level. Returns null if no children.
   */
  getChildRange(level, flatIdx) {
    if (!this._childRange[level]) return null;
    return this._childRange[level][flatIdx] ?? null;
  }

  /**
   * Get the tree-path cursor for a given [level, flatIdx].
   */
  getTreeCursor(level, flatIdx) {
    return this._panels[level]?.items[flatIdx]?.cursor ?? null;
  }

  /**
   * Check whether two chart cursors [levelA, idxA] and [levelB, idxB]
   * are in an ancestor–descendant relationship.
   */
  isAncestor(levelA, idxA, levelB, idxB) {
    if (levelA === levelB) return idxA === idxB;
    // Ensure A is the shallower level
    let shallow = levelA, sIdx = idxA, deep = levelB, dIdx = idxB;
    if (levelA > levelB) {
      shallow = levelB; sIdx = idxB; deep = levelA; dIdx = idxA;
    }
    // Walk dIdx up to shallow's level
    for (let lv = deep; lv > shallow; lv--) {
      dIdx = this.getParentIndex(lv, dIdx);
      if (dIdx == null) return false;
    }
    return dIdx === sIdx;
  }

  // ── Item value = own label size, not sum-of-children ────
  // Alignment across levels is handled by positional sync
  // (SyncOrchestrator + TreeChartNavigator), not by inflating
  // parent values.  wordCount is the test value; will change later.
  getValue(row, col) {
    const pixPerLine = 1;
    const panel = this._panels[row];
    if (!panel || col >= panel.items.length) return 0;
    const label = panel.items[col].label;
    return (label ? wordCount(label) : 1) * pixPerLine;
  }

  getColCount(row) {
    return this._panels[row]?.items.length ?? 0;
  }

  getRowName(row) {
    return this._panels[row]?.label ?? String(row);
  }

  getColName(col) { return String(col); }

  getLabel(cursor) {
    const [row, col] = [cursor[0], cursor[cursor.length - 1]];
    return this._panels[row]?.items[col]?.label ?? '';
  }

  // Color by level-0 ancestor so parent groups share a color
  getCellColor(row, col) {
    const panel = this._panels[row];
    if (!panel || col >= panel.items.length) return '#888';
    const rootIdx = panel.items[col].rootIdx;
    const rootCount = this._panels[0].items.length;
    const hue = (rootIdx * 360 / rootCount) % 360;
    return `hsl(${hue}, 55%, 50%)`;
  }

  getString(cursor) { return this.getLabel(cursor); }
  isNumeric(row, col) { return col < (this._panels[row]?.items.length ?? 0); }
  hasRowNames() { return true; }
  getColMeta(col) { return this.colMeta[col]; }
  setColMeta(col, obj) { this.colMeta[col] = obj; }
  getRowMeta(row) { return this.rowMeta[row]; }
  setRowMeta(row, obj) { this.rowMeta[row] = obj; }
}

export { TreeChartData };
// Auto-generated exports
if (typeof window !== 'undefined') window.collectAllAtLevel = collectAllAtLevel;
export { collectAllAtLevel };
if (typeof window !== 'undefined') window.getNodeLabel = getNodeLabel;
export { getNodeLabel };
if (typeof window !== 'undefined') window.wordCount = wordCount;
export { wordCount };
