/**
 * multiscroller-nodes.js
 *
 * Three things:
 *
 * 1. ScrollState     — inst for managed stacks. Holds cache, scroll offset,
 *                       anchor cursor, data source. Attached by MultiscrollerNode.
 *
 * 2. HStackNode / VStackNode — all-static stack nodes. If node.inst is a
 *                       ScrollState, they do viewport-aware clipping. Otherwise
 *                       they do plain sequential layout. Same code, both paths.
 *
 * 3. MultiscrollerNode — parent node that wires up ScrollState insts on its
 *                       panel stacks and holds the SyncOrchestrator.
 *
 * The AST stays lightweight. MiniAstNode carries bounding box (from
 * measure/layout) and .inst (heavyweight, optional). The model creates
 * the AST and attaches insts eagerly or the multiscroller wires them.
 *
 * Nesting works: HStack→VStack→HStack, each level clips independently
 * if its inst has a ScrollState.
 */

/*
# ESSENTIALS

A MultiScroller is a Miller-Column like way of showing a tree structure, that synchronises
the scrolling of multiple columns scrolling at different rates in different columns. It is 
enables trees with maybe 1,000x as many nodes as normal without them becoming overwhelming.

This implementation morphs smoothly between the multiscroller table, to stacked bar charts, 
and further supports curved warping to donut charts and spider diagrams - whilst still 
maintaining the multiscroller drag behaviour. The multiscroller can also be used as an emoji
picker.

The different presentations work from the same underlying data, e.g. a CSV file. 
*/ 



import { Vector2D } from '../2d-support/vector2d.js';
import { LinearPath, ArcPath, BlendedPath } from '../2d-support/path.js';
import { sceneRegistry } from '../omni-support/scene.js';


// ============================================================
// SizeCache
// ============================================================

class SizeCache {
  constructor(max = 2000) {
    this.max = max;
    this.map = new Map();
    this._keys = [];
  }

  get(key) { return this.map.get(key); }

  set(key, size) {
    if (this.map.has(key)) { this.map.set(key, size); return; }
    if (this._keys.length >= this.max) {
      const i = Math.floor(Math.random() * this._keys.length);
      this.map.delete(this._keys[i]);
      this._keys[i] = this._keys[this._keys.length - 1];
      this._keys.pop();
    }
    this.map.set(key, size);
    this._keys.push(key);
  }

  get average() {
    if (this.map.size === 0) return 0;
    let sum = 0;
    for (const v of this.map.values()) sum += v;
    return sum / this.map.size;
  }

  clear() {
    this.map.clear();
    this._keys = [];
  }
}


// ============================================================
// ScrollState — inst for managed stacks
// ============================================================
// Attached to a VStack or HStack node by MultiscrollerNode
// (or by the model directly). Its presence is the signal that
// the stack should do viewport-aware clipping.

class ScrollState {
  /**
   * @param {object} opts
   * @param {object} opts.dataSource    — { prev(cursor), next(cursor), cursorKey(cursor) }
   * @param {number} [opts.defaultItemSize=50]
   * @param {*}      [opts.anchorCursor=0]
   * @param {number} [opts.scrollOffset=0]
   * @param {number} [opts.level]        — tree level for sync
   * @param {number} [opts.cacheMax=2000]
   */
  constructor(opts = {}) {
    this.dataSource     = opts.dataSource;
    this.defaultItemSize = opts.defaultItemSize ?? 50;
    this.anchorCursor   = opts.anchorCursor ?? 0;
    this.scrollOffset   = opts.scrollOffset ?? 0;
    this.level          = opts.level ?? 0;
    this.sizeCache      = new SizeCache(opts.cacheMax ?? 2000);

    this.endStops    = opts.endStops ?? false;
    this.offsetBounds = null;  // { min, max } — computed by StackNode.after_draw2d
    // Written by draw2d, read by SyncOrchestrator
    this.anchorBounds   = null;  // { position, size }
  }
}


// ============================================================
// NullIterator — yields nothing
// ============================================================

class NullIterator { next() { return null; } }


// ============================================================
// ClippingIterator — anchor-outward viewport-aware iteration
// ============================================================

class ClippingIterator {
  constructor(opts) {
    this.ds        = opts.dataSource;
    this.cache     = opts.sizeCache;
    this.dfltSize  = opts.defaultSize || 50;
    this.sizeFn    = opts.sizeFn || null;  // (cursor) => size, for cache miss

    this.anchorCursor = opts.anchorCursor;
    this.anchorPos    = opts.anchorPosition;
    this.clipMin      = opts.clipMin;
    this.clipMax      = opts.clipMax;

    this.phase      = 'backward';
    this.backCursor = this.anchorCursor;
    this.backEdge   = this.anchorPos;

    this.fwdCursor  = this.anchorCursor;
    this.anchorSize = this._sizeOf(this.anchorCursor);
    this.fwdEdge    = this.anchorPos + this.anchorSize;

    this._childIdx  = 0;
    this._cursor    = null;
    this._position  = 0;
    this._size      = 0;
  }

  _sizeOf(cursor) {
    if (cursor == null) return this.dfltSize;
    if (this.sizeFn) {
      const size = this.sizeFn(cursor);
      if (size != null) {
        return size;
      }
    }
    return this.dfltSize;
  }

  // caching currently breaks with zoom for charts,
  // so sizeOf caching is commented out.
  _sizeOfXXX(cursor) {
    if (cursor == null) return this.dfltSize;
    const cached = this.cache.get(this.ds.cursorKey(cursor));
    if (cached != null) return cached;
    if (this.sizeFn) {
      const size = this.sizeFn(cursor);
      if (size != null) {
        this.cache.set(this.ds.cursorKey(cursor), size);
        return size;
      }
    }
    return this.dfltSize;
  }

  get cursor()   { return this._cursor; }
  get position() { return this._position; }
  get size()     { return this._size; }

  next(subtree) {
    while (true) {
      switch (this.phase) {
        case 'backward': {
          const prev = this.ds.prev(this.backCursor);
          if (prev === null) { this.phase = 'anchor'; continue; }
          const size = this._sizeOf(prev);
          const pos  = this.backEdge - size;
          if (pos + size <= this.clipMin) { this.phase = 'anchor'; continue; }
          this.backCursor = prev;
          this.backEdge   = pos;
          return this._yield(prev, pos, size, subtree);
        }
        case 'anchor': {
          this.phase = 'forward';
          if (this.anchorPos + this.anchorSize <= this.clipMin ||
              this.anchorPos >= this.clipMax) continue;
          return this._yield(this.anchorCursor, this.anchorPos, this.anchorSize, subtree);
        }
        case 'forward': {
          const nxt = this.ds.next(this.fwdCursor);
          if (nxt === null) { this.phase = 'done'; return null; }
          const size = this._sizeOf(nxt);
          const pos  = this.fwdEdge;
          if (pos >= this.clipMax) { this.phase = 'done'; return null; }
          this.fwdCursor = nxt;
          this.fwdEdge   = pos + size;
          return this._yield(nxt, pos, size, subtree);
        }
        default: return null;
      }
    }
  }

  _yield(cursor, position, size, subtree) {
    this._cursor   = cursor;
    this._position = position;
    this._size     = size;
    if (subtree.length === 1) return subtree[0];
    return subtree[cursor % subtree.length];
  }

}


// ============================================================
// StackNode — unified stack with Path-based positioning
// ============================================================
//
// All positioning flows through a Path instance. For linear stacks
// (the common case), _buildPath creates a LinearPath from the
// node's current bounds each frame. For curved/radial stacks, set
// node.inst.path to any Path and it's used instead.
//
// Branches on node.inst:
//   inst with sizeCache  → managed (ClippingIterator, scrolling)
//   no sizeCache or no inst → unmanaged (sequential equal-division)
//
// Axis resolution:
//   1. node.inst?.axis   (explicit)
//   2. node.type         ('hstack' → 'x', else 'y')
//
// For non-scrolling use (JaTeX etc), omit inst entirely — axis
// falls back to node.type. No per-node overhead.
//
// The Path is built fresh each frame in before_draw2d (it depends
// on bounds the parent just stamped) and stored on node._path.
//
// The flyweight carries for each child:
//   .cursor   — tree cursor (managed stacks only)
//   .corners  — 4-point quad from path.cornersAt
//   .bends    — 4 edge bends from path.edgeBends
//   .t0, .t1  — parameter range

// ============================================================
// StackNode — unified stack with Path-based positioning
// ============================================================
//
// All positioning flows through a Path instance. For linear stacks
// (the common case), _buildPath creates a LinearPath from the
// node's current bounds each frame. For curved/radial stacks, set
// node.inst.path to any Path and it's used instead.
//
// Branches on node.inst:
//   inst with sizeCache  → managed (ClippingIterator, scrolling)
//   no sizeCache or no inst → unmanaged (sequential equal-division)
//
// Axis resolution:
//   1. node.inst?.axis   (explicit)
//   2. node.type         ('hstack' → 'x', else 'y')
//
// For non-scrolling use (JaTeX etc), omit inst entirely — axis
// falls back to node.type. No per-node overhead.
//
// The Path is built fresh each frame in before_draw2d (it depends
// on bounds the parent just stamped) and stored on node._path.
//
// The flyweight carries for each child:
//   .cursor   — tree cursor (managed stacks only)
//   .corners  — 4-point quad from path.cornersAt
//   .bends    — 4 edge bends from path.edgeBends
//   .t0, .t1  — parameter range

class StackNode {

  // ── Internal helpers ───────────────────────────────────

  static _getAxis(node) {
    if (node.inst?.axis) return node.inst.axis;
    return node.type === 'hstack' ? 'x' : 'y';
  }

  static _isManaged(node) {
    return node.inst?.sizeCache != null;
  }

  /**
   * Build a LinearPath from the node's current bounds and axis.
   * Origin at start of main axis, centered on cross axis.
   */
  static _buildPath(node) {
    const x = node.xOffset || 0, y = node.yOffset || 0;
    const w = node.width   || 0, h = node.height  || 0;

    if (StackNode._getAxis(node) === 'x') {
      return new LinearPath(new Vector2D(x, y + h / 2), 0, w, h);
    } else {
      return new LinearPath(new Vector2D(x + w / 2, y), Math.PI / 2, h, w);
    }
  }

  static _bboxFromCorners(corners) {
    let x0 = corners[0].x, y0 = corners[0].y, x1 = x0, y1 = y0;
    for (let i = 1; i < 4; i++) {
      const c = corners[i];
      if (c.x < x0) x0 = c.x;
      if (c.y < y0) y0 = c.y;
      if (c.x > x1) x1 = c.x;
      if (c.y > y1) y1 = c.y;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  static _stampChild(child, corners) {
    const bb = StackNode._bboxFromCorners(corners);
    child.xOffset = bb.x;
    child.yOffset = bb.y;
    child.width   = bb.w;
    child.height  = bb.h;
  }

  static _boundsContain(node, pt) {
    if (!pt) return false;
    const x = node.xOffset || 0, y = node.yOffset || 0;
    return pt.x >= x && pt.x <= x + (node.width  || 0)
        && pt.y >= y && pt.y <= y + (node.height || 0);
  }

  /**
   * Pixel position → t ∈ [0,1].  Bridge for ClippingIterator
   * which still works in pixel space. Disappears when
   * ClippingIterator moves to t-space.
   */
  static _pixelToT(pixelPos, node) {
    const axis   = StackNode._getAxis(node);
    const origin = axis === 'x' ? (node.xOffset || 0) : (node.yOffset || 0);
    const size   = axis === 'x' ? (node.width   || 0) : (node.height  || 0);
    return size > 0 ? (pixelPos - origin) / size : 0;
  }

  static _sizeToT(pixelSize, node) {
    const axis = StackNode._getAxis(node);
    const size = axis === 'x' ? (node.width || 0) : (node.height || 0);
    return size > 0 ? pixelSize / size : 0;
  }

  static _makeClippingIter(node) {
    const s    = node.inst;
    const axis = StackNode._getAxis(node);
    const origin   = axis === 'x' ? (node.xOffset || 0) : (node.yOffset || 0);
    const nodeSize = axis === 'x' ? (node.width   || 0) : (node.height  || 0);

    return new ClippingIterator({
      dataSource:     s.dataSource,
      sizeCache:      s.sizeCache,
      defaultSize:    s.defaultItemSize,
      sizeFn:         s.sizeFn || null,      
      anchorCursor:   s.anchorCursor,
      anchorPosition: origin + s.scrollOffset,
      clipMin:        origin,
      clipMax:        origin + nodeSize,
    });
  }

  /**
   * Compute t0/t1 and stamp child bounds. Shared by draw2d
   * and hit_test phases.
   */
  static _positionChild(ctxMix, node, child) {
    const path = node._path;
    let t0, t1;

    if (StackNode._isManaged(node)) {
      const iter = ctxMix.iterators.at(-1);
      t0 = StackNode._pixelToT(iter.position, node);
      t1 = t0 + StackNode._sizeToT(iter.size, node);
      ctxMix.flyweight.cursor = iter.cursor;
      ctxMix.flyweight.mainAxisSize = iter.size;      
    } else {
      const iter  = ctxMix.iterators.at(-1);
      const count = node.subtree?.length || 1;
      const idx   = iter.index - 1;
      t0 = idx / count;
      t1 = (idx + 1) / count;
    }

    const corners = path.cornersAt(t0, t1);
    StackNode._stampChild(child, corners);

    ctxMix.flyweight.corners = corners;
    ctxMix.flyweight.bends   = path.edgeBends(t0, t1);
    ctxMix.flyweight.t0      = t0;
    ctxMix.flyweight.t1      = t1;
  }

  // -- hit_test ─────────────────────────────────────────────
  static before_hit_test(ctxMix, node, params) {
    StackNode.before_draw2d(ctxMix, node, params);
  }

  static before_child_hit_test(ctxMix, node, params, child) {
    StackNode.before_child_draw2d(ctxMix, node, params, child);

    // Only stamp interactions for managed (scrollable) stacks
    if (!StackNode._isManaged(node)) return;

    const iter     = ctxMix.iterators.at(-1);
    const cellT    = StackNode._pixelToT(iter.position + iter.size / 2, node);
    const inst     = node.inst;       // persistent scroll state (or overlay)
    const nodeRef  = node;             // AST node — persists across frames
    const pathRef  = node._path;       // capture path at creation time
    const axis     = StackNode._getAxis(node);
    const nodeSize = axis === 'x' ? node.width : node.height;
    const orch     = ctxMix.coordinator?.orch;
    const panelIdx = node.inst?.panelIdx;

    if (!ctxMix.flyweight.interactions) ctxMix.flyweight.interactions = {};

    let dragStartT = null;
    let dragStartOffset = null;
    ctxMix.flyweight.interactions.applyDrag = (screenX, screenY) => {
      const t = pathRef.tFromScreen(screenX, screenY);
      if (dragStartT === null) {
        dragStartT = t;
        dragStartOffset = inst.scrollOffset;
      }
      inst.scrollOffset = dragStartOffset + (t - dragStartT) * nodeSize;
//      console.log('drag: t:', t?.toFixed(3), 'startT:', dragStartT?.toFixed(3),
//        'offset:', inst.scrollOffset?.toFixed(1), 'nodeSize:', nodeSize?.toFixed(1));
      if (orch != null && panelIdx != null) {
        orch.syncFrom(panelIdx);
      }
    };

    const position = iter.position;
    const axisName = axis === 'x' ? 'x' : 'y';
    ctxMix.flyweight.interactions.applySelect = (cursor) => {
     if (orch != null && panelIdx != null) {
       orch.select(cursor, panelIdx, position, axisName);
     }
    };

  }


  // ── draw2d ─────────────────────────────────────────────
  static before_draw2d(ctxMix, node, params) {
    //node._path = node.inst?.path || StackNode._buildPath(node);
    const p = node.inst?.path;
    node._path = (typeof p === 'function' ? p(ctxMix, node, params) : p)
      || StackNode._buildPath(node);
    if (StackNode._isManaged(node)) {
      const iter = StackNode._makeClippingIter(node);
      ctxMix.iterators[ctxMix.iterators.length - 1] = iter;
      node._lastIter = iter;
      node.inst.anchorBounds = {
        position: iter.anchorPos,
        size:     iter.anchorSize,
      };
    }
  }

  static before_child_draw2d(ctxMix, node, params, child) {
    StackNode._positionChild(ctxMix, node, child);
  }

  static after_child_draw2d(ctxMix, node, params, child) {
    if (!StackNode._isManaged(node)) return;

    const iter  = ctxMix.iterators.at(-1);
    const cache = node.inst.sizeCache;
    if (iter.cursor == null) return;

    const axis = StackNode._getAxis(node);
//  const mainSize = axis === 'x' ? child.width : child.height;
    const mainSize = ctxMix.flyweight.mainAxisSize
      ?? (axis === 'x' ? child.width : child.height);

    const measured = axis === 'x'
      ? (child.measuredWidth  ?? mainSize)
      : (child.measuredHeight ?? mainSize);

    if (measured != null) {
      cache.set(iter.ds.cursorKey(iter.cursor), measured);
    }
  }

  static after_draw2d(ctxMix, node, params) {
    if (!StackNode._isManaged(node) || !node.inst.endStops) return;

    const iter = node._lastIter;
    if (!iter) return;

    const atStart = iter.ds.prev(iter.backCursor) === null;
    const atEnd   = iter.ds.next(iter.fwdCursor) === null;

    let min = -Infinity, max = Infinity;

    if (atStart) {
      max = node.inst.scrollOffset - (iter.backEdge - iter.clipMin);
    }

    if (atEnd) {
      min = node.inst.scrollOffset + (iter.clipMax - iter.fwdEdge);
    }

    if (min > max) {
      min = max = node.inst.scrollOffset - (iter.backEdge - iter.clipMin);
    }

    node.inst.offsetBounds = { min, max };
  }

  // ── measure ────────────────────────────────────────────

  static before_measure(ctxMix) {
    ctxMix.iterators[ctxMix.iterators.length - 1] = new NullIterator();
  }

  //static measure() {}
}

const HStackNode = StackNode
const VStackNode = StackNode
// ── Registration ─────────────────────────────────────────────

sceneRegistry.registerNodeClass('stack',  StackNode);
sceneRegistry.registerNodeClass('hstack', StackNode);
sceneRegistry.registerNodeClass('vstack', StackNode);



// ============================================================
// ScrollSync — proportional math
// ============================================================

class ScrollSync {
  static ratio(position, size, viewport) {
    const travel = viewport - size;
    if (Math.abs(travel) < 0.5) return 0.5;
    return Math.max(0, Math.min(position / travel, 1));
  }

  static position(ratio, size, viewport) {
    return ratio * (viewport - size);
  }
}


// ============================================================
// SyncOrchestrator
// ============================================================
// Reads scroll state from ScrollState insts on panel nodes.
// Does not own any rendering state — purely coordination.

class SyncOrchestrator {
  constructor(navigator) {
    this.nav = navigator;
    this.panels = [];      // { state, level, viewportSize, origin }
    this.activeCursor = null;
  }

  addPanel(state, level, viewportSizeFn, originFn) {
    this.panels.push({
      state,
      level,
      viewportSize: viewportSizeFn || (() => 600),
      origin: originFn || (() => 0),
    });
    return this.panels.length - 1;
  }

  select(cursor, sourceIndex, hitPosition, axis = 'y') {
    this.activeCursor = cursor;

    const src = this.panels[sourceIndex];
    const s = src.state;

    for (const panel of this.panels) {
      const ps = panel.state;
      if (ps && ps !== s) {
        const translated = this.nav.translateCursor(cursor, panel.level);
        ps.anchorCursor = translated;
      }
    }

    if (hitPosition != null && s) {
      s.scrollOffset = hitPosition - src.origin();
    }
    s.anchorCursor = cursor;

    this.syncFrom(sourceIndex);
  }

  syncFrom(sourceIndex) {
    if (this.activeCursor == null) return;

    const src = this.panels[sourceIndex];
    const ss = src.state;
    if (!ss) return;

    const anchorSize = ss.anchorBounds?.size ?? ss.defaultItemSize;
    const ratio = ScrollSync.ratio(ss.scrollOffset, anchorSize, src.viewportSize());

    for (let i = 0; i < this.panels.length; i++) {
      if (i === sourceIndex) continue;
      this._syncTarget(this.panels[i], ratio);
    }
  }

  _syncTarget(panel, ratio) {
    const ps = panel.state;
    if (!ps) return;

    const translated = this.nav.translateCursor(this.activeCursor, panel.level);
    const count = this.nav.focalCount(this.activeCursor, panel.level);
    const focalSize = this._focalSize(ps, translated, count, ratio, panel.level);
    const targetPos = ScrollSync.position(ratio, focalSize, panel.viewportSize());

    ps.anchorCursor = translated;
    ps.scrollOffset = targetPos;
  }

  /**
   * Compute the total size of the focal item(s) in a target panel.
   *
   * For count ≤ 100: walk the items and sum actual sizes (from sizeFn
   * or cache), giving exact alignment at the viewport extremes.
   *
   * For count > 100: measure the first K and last K items, estimate
   * two totals (one biased toward the start, one toward the end),
   * and blend by ratio.  This guarantees smooth scrolling with no
   * discontinuity.  At ratio ≈ 0 the start estimate dominates
   * (accurate for items near the top); at ratio ≈ 1 the end
   * estimate dominates (accurate for items near the bottom).
   * The only case where ends don't align perfectly is when the
   * unmeasured middle items have a very different average from
   * both measured ends — unlikely in practice, and even then the
   * result is just a slightly off scroll speed in the middle.
   */
  _focalSize(state, startCursor, count, ratio, level) {
    if (count <= 100) {
      let total = 0;
      let cursor = startCursor;
      for (let i = 0; i < count && cursor != null; i++) {
        total += this._itemSize(state, cursor);
        if (i < count - 1) cursor = state.dataSource.next(cursor);
      }
      return total || state.defaultItemSize;
    }

    // count > 100: blended start/end estimate.
    const endCursor = this._lastFocalCursor(state, startCursor, level);
    if (!endCursor) {
      // No way to find the end — fall back to count × average.
      const avg = state.sizeCache.average || state.defaultItemSize;
      return count * avg;
    }

    const K = 50;

    // Measure first K items forward from start
    let sumStart = 0, nStart = 0;
    let cursor = startCursor;
    for (let i = 0; i < K && cursor != null; i++) {
      sumStart += this._itemSize(state, cursor);
      nStart++;
      if (i < K - 1) cursor = state.dataSource.next(cursor);
    }
    const avgStart = nStart > 0 ? sumStart / nStart : state.defaultItemSize;

    // Measure last K items backward from end
    let sumEnd = 0, nEnd = 0;
    cursor = endCursor;
    for (let i = 0; i < K && cursor != null; i++) {
      sumEnd += this._itemSize(state, cursor);
      nEnd++;
      if (i < K - 1) cursor = state.dataSource.prev(cursor);
    }
    const avgEnd = nEnd > 0 ? sumEnd / nEnd : state.defaultItemSize;

    // Estimate total from each perspective:
    //   fromStart uses avgStart for unmeasured tail
    //   fromEnd   uses avgEnd   for unmeasured head
    const totalFromStart = sumStart + (count - nStart) * avgStart;
    const totalFromEnd   = sumEnd   + (count - nEnd)   * avgEnd;

    // Blend: start estimate at ratio≈0, end estimate at ratio≈1.
    return totalFromStart + (totalFromEnd - totalFromStart) * ratio;
  }

  /**
   * Find the last focal cursor at the target level.
   *
   * Three strategies, tried in order:
   *   1. Navigator provides it directly (TreeChartNavigator has
   *      getChildRange, so this is O(depth)).
   *   2. Step to the first item past the focal group (increment the
   *      source cursor's last index, translate down), then prev()
   *      back one.  O(1) when prev() crosses parent boundaries.
   *   3. Returns null → caller falls back to count × average.
   */
  _lastFocalCursor(state, startCursor, level) {
    // Strategy 1: navigator knows directly
    const direct = this.nav.lastFocalCursor?.(this.activeCursor, level);
    if (direct) return direct;

    // Strategy 2: step past the focal group, then back one.
    // "Next sibling at source level" = increment last index.
    const src = this.activeCursor;
    if (!Array.isArray(src) || src.length === 0) return null;

    const nextSrc = [...src.slice(0, -1), src[src.length - 1] + 1];
    const afterFocal = this.nav.translateCursor(nextSrc, level);
    if (!afterFocal) return null;

    // prev() from the first item of the next group crosses back
    // into our group's last item.  Passes sameParentOnly=false to
    // allow crossing the parent boundary — this is specifically why
    // TreeDataSource now accepts a per-call override.
    // Returns null if the source cursor was already the last sibling
    // AND the dataSource doesn't support boundary crossing (e.g.
    // GridDataSource) — in that case we fall through to average.
    try {
      return state.dataSource.prev(afterFocal, false);
    } catch {
      return null;
    }
  }

  /**
   * Size of a single item: try cache, then sizeFn, then default.
   * Caches the result of sizeFn so repeated sync calls don't
   * re-measure.
   */
  _itemSize(state, cursor) {
    const key = state.dataSource.cursorKey(cursor);
    const cached = state.sizeCache.get(key);
    if (cached != null) return cached;

    if (state.sizeFn) {
      const size = state.sizeFn(cursor);
      if (size != null) {
        state.sizeCache.set(key, size);
        return size;
      }
    }
    return state.defaultItemSize;
  }
}

// ============================================================
// Navigators
// ============================================================

class IdentityNavigator {
  translateCursor(cursor) { return cursor; }
  focalCount()            { return 1; }
  lastFocalCursor(cursor) { return cursor; }
}

class TreeNavigator {
  constructor(countChildrenFn) { this._cc = countChildrenFn; }

  translateCursor(cursor, targetLevel) {
    if (!Array.isArray(cursor)) return cursor;
    const d = targetLevel + 1;
    if (cursor.length >= d) return cursor.slice(0, d);
    const p = cursor.slice();
    while (p.length < d) p.push(0);
    return p;
  }

  focalCount(cursor, targetLevel) {
    if (!Array.isArray(cursor)) return 1;
    if (targetLevel <= cursor.length - 1) return 1;
    return this._cc(cursor, targetLevel);
  }

  /** Returns null — _lastFocalCursor will try the "step past
   *  then prev" approach using the panel's dataSource instead. */
  lastFocalCursor() { return null; }
}


// ============================================================
// TreeDataSource — adapter for ClippingIterator
// ============================================================

class TreeDataSource {
  constructor(tree, sameParentOnly = true) {
    this.data = tree;
    this.sameParentOnly = sameParentOnly;
  }
  prev(cursor, sameParentOnly) { return this.data.prev(cursor, sameParentOnly ?? this.sameParentOnly); }
  next(cursor, sameParentOnly) { return this.data.next(cursor, sameParentOnly ?? this.sameParentOnly); }
  cursorKey(cursor) { return cursor.join(','); }
}


// ============================================================
// CursorRange — navigates indices 0..count-1
// ============================================================
// Simple sequential data source for layout scrolling (e.g. the
// outer HStack that pages through panels).

class CursorRange {
  constructor(count) { this.count = count; }
  prev(cursor) { return cursor > 0 ? cursor - 1 : null; }
  next(cursor) { return cursor < this.count - 1 ? cursor + 1 : null; }
  cursorKey(cursor) { return String(cursor); }
}


// ============================================================
// GridDataSource — navigates array cursors by last element
// ============================================================
// For a cursor like [col, row], prev/next change only the row
// (last element), keeping earlier path elements intact.
// Equivalent to TreeDataSource with sameParentOnly=true.

class GridDataSource {
  constructor(count) { this.count = count; }
  prev(cursor) {
    const last = cursor[cursor.length - 1];
    return last > 0 ? [...cursor.slice(0, -1), last - 1] : null;
  }
  next(cursor) {
    const last = cursor[cursor.length - 1];
    return last < this.count - 1 ? [...cursor.slice(0, -1), last + 1] : null;
  }
  cursorKey(cursor) { return cursor.join(','); }
}


// ============================================================
// GridNavigator — translates cursors between grid columns
// ============================================================
// Reinterprets the sync system's `level` as a column index.
// translateCursor replaces cursor[0] with the target column,
// keeping the row (and any deeper path) intact.

class GridNavigator {
  translateCursor(cursor, targetLevel) {
    if (!Array.isArray(cursor)) return cursor;
    return [targetLevel, ...cursor.slice(1)];
  }
  focalCount() { return 1; }
  lastFocalCursor(cursor, targetLevel) {
    return this.translateCursor(cursor, targetLevel);
  }
}

// ============================================================
// MultiscrollerNode — wires ScrollState onto panel stacks
// ============================================================
// Registered as 'multiscroller'. Its .inst holds the orchestrator,
// navigator, and tree. On first draw (or via explicit init), it
// walks its subtree to find panel stacks and attaches ScrollState.
//
// The subtree is expected to be:
//   multiscroller
//     hstack (or vstack) — the layout container
//       vstack (panel 0) — will get ScrollState
//       vstack (panel 1)
//       ...
//
// Panel configuration is passed via node.value:
//   node.value = {
//     tree:     TreeOfData instance,
//     panels:   [{ level, cursor, sameParent, itemSize }, ...],
//     axis:     'y'  (scroll axis for panels, default 'y')
//   }

class MultiscrollerNode {

// ============================================================
// MultiscrollerNode._wire replacement
// ============================================================
//
// In multiscroller-nodes.js, replace the _wire static method
// and the before_draw2d static method on MultiscrollerNode.
//
// Changes:
//   - cfg.tree is no longer required (can be null for grid mode)
//   - cfg.navigator overrides TreeNavigator if provided
//   - pcfg.dataSource overrides TreeDataSource if provided
//   - pcfg.col stamps column index on the panel's ScrollState
//   - cfg.data (CSVData/GridData) stored on inst, passed via ctxMix
//   - Guard changed from (!cfg.tree || !cfg.panels) to (!cfg.panels)
//
// Backward compatible: old configs without navigator/dataSource
// work exactly as before.


  // ── Wiring (called once, eagerly or on first draw) ─────

  static _wire(node) {
    if (node._wired) return;
    node._wired = true;

    const cfg = node.inst;
    if (!cfg || !cfg.panels) return;

    const data   = cfg.data ?? cfg.tree;
    const isTree = !!(data?.first && data?.getSubtreeCount);
    const axis   = cfg.axis || 'y';

    // Navigator
    let nav;
    if (cfg.navigator) {
      nav = cfg.navigator;
    } else if (isTree) {
      function countChildren(cursor, targetLevel) {
        const stc = data.getSubtreeCount(cursor);
        if (stc === null) return 0;
        const cc = stc + 1;
        if (cursor.length + 1 === targetLevel + 1) return cc;
        let total = 0;
        for (let i = 0; i <= stc; i++)
          total += countChildren([...cursor, i], targetLevel);
        return total;
      }
      nav = new TreeNavigator(countChildren);
    } else {
      nav = new GridNavigator();
    }

    const orch = new SyncOrchestrator(nav);

    const layoutNode = node.subtree?.[0];
    const panelNodes = layoutNode?.subtree || [];

    // Wire each panel VStack
    cfg.panels.forEach((pcfg, i) => {
      if (i >= panelNodes.length) return;
      const panelNode = panelNodes[i];

      let cursor = pcfg.cursor ?? (isTree ? data.first(pcfg.level ?? 0) : 0);
      let level  = pcfg.level ?? 0;
      let ds;

      if (!Array.isArray(cursor)) {
        // Grid mode: bare-number cursor becomes [col, row],
        // level is the panel index (used by GridNavigator).
        ds     = pcfg.dataSource || (data ? new GridDataSource(data.rowCount) : null);
        cursor = [i, cursor];
        level  = i;
      } else {
        // Tree mode
        ds = pcfg.dataSource
          || (isTree ? new TreeDataSource(data, pcfg.sameParent ?? false) : null);
      }
      if (!ds) return;

      panelNode.inst = new ScrollState({
        dataSource:      ds,
        defaultItemSize: pcfg.itemSize ?? 50,
        anchorCursor:    cursor,
        scrollOffset:    pcfg.scrollOffset ?? 10,
        level:           level,
      });
      panelNode.inst.panelIdx = i;      

      const ms = axis === 'x' ? 'width' : 'height';
      const os = axis === 'x' ? 'xOffset' : 'yOffset';
      orch.addPanel(
        panelNode.inst,
        level,
        () => panelNode[ms] || 600,
        () => panelNode[os] || 0
      );
    });

    // Managed outer HStack for horizontal scrolling.
    // Enabled when minColWidth is set, or when per-column widths are provided.
    const needsManagedLayout = (cfg.minColWidth || cfg.columnWidths) && panelNodes.length > 0;
    if (needsManagedLayout) {
      layoutNode.inst = new ScrollState({
        dataSource:      new CursorRange(panelNodes.length),
        defaultItemSize: cfg.minColWidth || 100,
        anchorCursor:    0,
        scrollOffset:    0,
        endStops:        true,
      });

      // Pre-populate per-column widths. Columns without an entry
      // fall back to defaultItemSize (minColWidth).
      if (cfg.columnWidths) {
        const cache = layoutNode.inst.sizeCache;
        const ds    = layoutNode.inst.dataSource;
        cfg.columnWidths.forEach((w, i) => {
          if (w != null) cache.set(ds.cursorKey(i), w);
        });
      }
    }

    orch.activeCursor = panelNodes[0]?.inst?.anchorCursor
      ?? cfg.panels[0]?.cursor ?? (isTree ? data.first(0) : 0);
    node.inst = { orch, nav, data, axis, highlightMode: isTree ? 'tree' : 'row' };


    const panel = panelNodes[1]; // pick one panel
//    const cx = 500, cy = 300;    // center of arc
//    panel.inst.path = ArcPath.makePath(
//      new Vector2D(cx, cy - 100),  // origin
//      0,                            // startAngle
//      800,                          // radius
//      panel.inst.defaultItemSize * 5, // crossSize
//      Math.PI,                      // sweep
//    );

//    const x = node.xOffset || 0, y = node.yOffset || 0;
//    const w = node.width   || 0, h = node.height  || 0;
//
//    const linearPath = LinearPath.makePath(
//      new Vector2D(x + w / 2, y), Math.PI / 2, h, w
//    );
//
//    const arcPath = ArcPath.makePath(
//      new Vector2D(x + w / 2, y), Math.PI / 2, h, w, Math.PI
//    );

    //panel.inst.path = new BlendedPath(linearPath, arcPath, bendAmount);

    panel.inst.path = (ctxMix, node, params) => {
      const bendAmount = params.bendStack;
      const x = node.xOffset || 0, y = node.yOffset || 0;
      const w = node.width || 0, h = node.height || 0;
      const lp = LinearPath.makePath(new Vector2D(x + w/2, y), Math.PI/2, h, w);
      const ap = ArcPath.makePath(new Vector2D(x -90 + w/2, y+120), Math.PI*0, h, w/4, Math.PI);
      return new BlendedPath(lp, ap, bendAmount);
    };


  }



  // ── Phase hooks ────────────────────────────────────────

  static before_draw2d(ctxMix, node, params) {
    MultiscrollerNode._wire(node);
    if (node.inst) {
      ctxMix.coordinator = node.inst; // inst is a MultiscrollerNode
      ctxMix.activeCursor = node.inst.orch.activeCursor;
      ctxMix.highlightMode = node.inst.highlightMode;
    }
    if (ctxMix.ctx) {
      const zoom = params.zoom || 1;
      ctxMix.ctx.save();
      ctxMix.ctx.beginPath();
      ctxMix.ctx.rect(
        (node.xOffset || 0) * zoom,
        (node.yOffset || 0) * zoom,
        (node.width   || 0) * zoom,
        (node.height  || 0) * zoom
      );
      ctxMix.ctx.clip();
    }
  }
  static after_draw2d(ctxMix, node) {
    if (ctxMix.ctx) ctxMix.ctx.restore();
  }

  static before_child_draw2d(ctxMix, node, params, child) {
    // Pass our bounds through to the layout container
    child.xOffset = node.xOffset || 0;
    child.yOffset = node.yOffset || 0;
    child.width   = node.width   || 0;
    child.height  = node.height  || 0;
  }

  static before_hit_test(ctxMix, node, params) {
    MultiscrollerNode.before_draw2d(ctxMix, node, params);
  }

  static before_child_hit_test(ctxMix, node, params, child) {
    MultiscrollerNode.before_child_draw2d(ctxMix, node, params, child);
  }

  static after_hit_test(ctxMix, node, params) {
    MultiscrollerNode.after_draw2d(ctxMix, node, params);
  }


//  static before_hit_test(ctxMix, node) {
//    MultiscrollerNode._wire(node);
//  }
//
//  static before_child_hit_test(ctxMix, node, params, child) {
//    child.xOffset = node.xOffset || 0;
//    child.yOffset = node.yOffset || 0;
//    child.width   = node.width   || 0;
//    child.height  = node.height  || 0;
//  }
  //static hit_test() {}
}

sceneRegistry.registerNodeClass('multiscroller', MultiscrollerNode);


// ============================================================
// Exports
// ============================================================

/**
 * Nodes are exported via sceneRegistry. It creates nodes given 
 * a name like hstack or vstack.
 */

export {
  // Core
  SizeCache,
  ScrollState,
  MultiscrollerNode,
  GridNavigator,
  GridDataSource, // Used by OmniChart

  //NullIterator,
  //ClippingIterator,

  // Stack nodes
  //HStackNode,
  //VStackNode,

  // Sync
  //ScrollSync,
  SyncOrchestrator,
  //IdentityNavigator,
  //TreeNavigator,
  //TreeDataSource,
  //CursorRange,

  // Multiscroller
};
// Auto-generated exports
if (typeof window !== 'undefined') window.StackNode = StackNode;
export { StackNode };
