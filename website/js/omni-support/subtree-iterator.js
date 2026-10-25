export { SubtreeIterator };

/* ─────────────────────────────────────────────────────────────────────────────
SubtreeIterator — the default child walk: every child, in order.

A node class may push its own iterator to cull or reorder its children, which
is how a clip node skips what lies outside its rectangle.
──────────────────────────────────────────────────────────────────────────── */

class SubtreeIterator {
  constructor() { this.index = 0; }
  next(subtree) {
    if (this.index >= subtree.length) return null;
    return subtree[this.index++];
  }
}
