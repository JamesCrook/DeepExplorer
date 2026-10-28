class GridTreeAdapter {
  constructor(grid, opts = {}) {
    this.grid = grid;
    this._t = opts.transpose || false;
  }
  get outerCount() { return this._t ? this.grid.colCount : this.grid.rowCount; }
  get innerCount() { return this._t ? this.grid.rowCount : this.grid.colCount; }
  _rc(o, i) { return this._t ? [i, o] : [o, i]; }

  levelOf(c) { return (!c || c.length === 0) ? -1 : c.length - 1; }
  first(level) { return new Array(level + 1).fill(0); }

  getNode(cursor) {
    if (!cursor) return null;
    const lv = this.levelOf(cursor);
    if (lv === -1) return ['root', this.outerCount - 1];
    const o = cursor[0];
    if (o < 0 || o >= this.outerCount) return null;
    if (lv === 0) {
      const name = this._t ? this.grid.getColName(o) : this.grid.getRowName(o);
      return [name, this.innerCount - 1];
    }
    if (lv === 1) {
      const i = cursor[1];
      if (i < 0 || i >= this.innerCount) return null;
      const [r, c] = this._rc(o, i);
      return [String(this.grid.getValue(r, c) ?? ''), 0];
    }
    return null;
  }

  getString(c)       { return this.getNode(c)?.[0] ?? null; }
  getSubtreeCount(c) { return this.getNode(c)?.[1] ?? null; }
  getSiblingCount(c) { return (!c || c.length === 0) ? null : this.getSubtreeCount(c.slice(0, -1)); }
  getNumericValue(c) {
    if (!c || c.length !== 2) return null;
    const [r, col] = this._rc(c[0], c[1]);
    return this.grid.getValue(r, col);
  }

  next(cursor, sameParentOnly = true) {
    if (!cursor || cursor.length === 0) return [0];
    const lv = this.levelOf(cursor);
    const last = cursor[lv];
    const sibs = this.getSiblingCount(cursor) ?? -1;
    if (last < sibs) return [...cursor.slice(0, -1), last + 1];
    if (lv < 1 || sameParentOnly) return null;
    const pn = this.next(cursor.slice(0, -1), false);
    return pn ? [...pn, 0] : null;
  }

  prev(cursor, sameParentOnly = true) {
    if (!cursor || cursor.length === 0) return null;
    const lv = this.levelOf(cursor);
    const last = cursor[lv];
    if (last > 0) return [...cursor.slice(0, -1), last - 1];
    if (lv < 1 || sameParentOnly) return null;
    const pp = this.prev(cursor.slice(0, -1), false);
    if (!pp) return null;
    const result = [...pp, 0];
    const sibs = this.getSiblingCount(result);
    if (sibs === null) return null;
    result[lv] = sibs;
    return result;
  }

  translateCursor(cursor, targetLevel) {
    if (!Array.isArray(cursor)) return cursor;
    const d = targetLevel + 1;
    if (cursor.length >= d) return cursor.slice(0, d);
    const p = cursor.slice();
    while (p.length < d) p.push(0);
    return p;
  }

  isADescendantOf(child, parent) {
    if (child.length <= parent.length) return false;
    for (let i = 0; i < parent.length; i++) {
      if (child[i] !== parent[i]) return false;
    }
    return true;
  }
}

export { GridTreeAdapter }