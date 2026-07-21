/**
 * warpable-grid-node.js
 *
 * Flyweight grid: one prototype vstack, one prototype cell, reused
 * per column and row via iteration. Cursors are [col, row] arrays.
 *
 * This is used by OmniChart.
 * It replaces the legacy class, ChartNode
 *
 * AST shape:
 *   grid (value = CSVData)
 *     vstack (prototype, managed with GridDataSource)
 *       grid-cell (prototype — WarpedPolygon, path-aware)
 *
 * WarpableGridNode manages outer (column) iteration via RepeatIterator.
 * StackNode manages inner (row) iteration via ClippingIterator
 * over GridDataSource, producing [col, row] cursors.
 * GridCellNode renders via WarpedPolygon with neighborliness + curviness.
 *
 * Segment data (y0/y1 per cell, including stack/normalize) is
 * derived on demand via DataAdapter.getSegment(), which reads
 * from a cached prefix-sum array rebuilt only when data-shaping
 * params change.
 */

import { WarpedPolygon } from './warped-polygon.js';
import { Vector2D, lerp } from '../2d-support/vector2d.js';
import { LinearPath, ArcPath, SectorPath, GridPath, BlendedPath,
         buildBentChild } from '../2d-support/path.js';
import { SizeCache, GridDataSource, SyncOrchestrator, GridNavigator } from './multiscroller-nodes.js';
import { sceneRegistry } from '../omni-support/scene.js';

// ============================================================
// TreeChartNavigator — cursor translation for tree-in-chart
// ============================================================
// The chart flattens tree levels into [level, flatIdx] cursors.
// GridNavigator naively keeps flatIdx the same across levels,
// which is wrong: item 1 at level 0 is NOT the parent of item 1
// at level 1.  This navigator uses the parent/child index maps
// from TreeChartData to translate correctly.

class TreeChartNavigator {
  constructor(data) {
    this._data = data;  // DataAdapter wrapping TreeChartData
  }

  translateCursor(cursor, targetLevel) {
    if (!Array.isArray(cursor)) return cursor;
    const srcLevel = cursor[0];
    const srcIdx   = cursor[cursor.length - 1];
    if (targetLevel === srcLevel) return [targetLevel, srcIdx];

    if (targetLevel < srcLevel) {
      // Walk up: child → parent
      let idx = srcIdx;
      for (let lv = srcLevel; lv > targetLevel; lv--) {
        idx = this._data.getParentIndex(lv, idx) ?? 0;
      }
      return [targetLevel, idx];
    } else {
      // Walk down: parent → first child
      let idx = srcIdx;
      for (let lv = srcLevel; lv < targetLevel; lv++) {
        const range = this._data.getChildRange(lv, idx);
        idx = range ? range.first : 0;
      }
      return [targetLevel, idx];
    }
  }

  focalCount(cursor, targetLevel) {
    if (!Array.isArray(cursor)) return 1;
    const srcLevel = cursor[0];
    const srcIdx   = cursor[cursor.length - 1];
    if (targetLevel <= srcLevel) return 1;

    // Count descendants: walk down one level at a time
    let ranges = [{ first: srcIdx, last: srcIdx }];
    for (let lv = srcLevel; lv < targetLevel; lv++) {
      const nextRanges = [];
      for (const r of ranges) {
        for (let idx = r.first; idx <= r.last; idx++) {
          const cr = this._data.getChildRange(lv, idx);
          if (cr) nextRanges.push(cr);
        }
      }
      ranges = nextRanges;
      if (ranges.length === 0) return 1;
    }
    let count = 0;
    for (const r of ranges) count += r.last - r.first + 1;
    return Math.max(1, count);
  }

  /** Return the last focal cursor at targetLevel — mirror of
   *  translateCursor which returns the first. */
  lastFocalCursor(cursor, targetLevel) {
    if (!Array.isArray(cursor)) return cursor;
    const srcLevel = cursor[0];
    const srcIdx   = cursor[cursor.length - 1];
    if (targetLevel <= srcLevel) return this.translateCursor(cursor, targetLevel);

    // Walk down choosing the last child at each level
    let idx = srcIdx;
    for (let lv = srcLevel; lv < targetLevel; lv++) {
      const range = this._data.getChildRange(lv, idx);
      idx = range ? range.last : idx;
    }
    return [targetLevel, idx];
  }
}

// ============================================================
// Polar — a directed magnitude (complex number in polar form)
//
// Many operations in this file are "displace point P by distance r
// in direction θ." The pair (r, θ) is a single geometric entity —
// a polar vector — but when stored as two loose scalars the pairing
// is invisible. Polar makes it explicit.
//
// Arithmetic mirrors complex multiplication/rotation:
//   polar.rotate(δ)  →  z · e^(iδ)
//   polar.scale(s)   →  z · s
//   polar.perp       →  z · i       (rotate +π/2)
//   polar.flip       →  z · (-1)    (rotate +π)
// ============================================================

class Polar {
  constructor(r, angle) { this.r = r; this.angle = angle; }

  /** Displace a point by this polar vector. P + r·e^(iθ) */
  from(pt) { return pt.addPolar(this.r, this.angle); }

  /** Return as a cartesian {x, y} vector (no origin). */
  toVec() { return Vector2D.fromPolar(this.r, this.angle); }

  /** Rotate by δ radians: z · e^(iδ). */
  rotate(δ) { return new Polar(this.r, this.angle + δ); }

  /** Scale magnitude: z · s. */
  scale(s) { return new Polar(this.r * s, this.angle); }

  /** Perpendicular (rotate +π/2): z · i. */
  get perp() { return new Polar(this.r, this.angle + Math.PI / 2); }

  /** Reverse direction (rotate +π): -z. */
  get flip() { return new Polar(this.r, this.angle + Math.PI); }

  /** Unit polar in a given direction. */
  static unit(angle) { return new Polar(1, angle); }

  /** Apply a chain of polar displacements from a starting point. */
  static chain(start, ...polars) {
    let pt = start;
    for (const p of polars) pt = p.from(pt);
    return pt;
  }
}


// ============================================================
// Layout constants — gathered from ChartLayout
// ============================================================

const GRID_LAYOUT = {
  baselineArcRatio:  0.5,    // baselineArcR = min(W,H)/2 * this
  donutRowScale:     0.4,    // donutR = min(bandW, H) * this
  donutGridScale:    0.4,    // pieR  = min(cellW, cellH) * this
  donutRingScale:    0.4,
  minDonutInner:     0.05,   // minimum donutInnerRatio clamp
  donutGapScale:     0.1,    // donut gap = segmentGap * this
  gridAspectHint:    1.5,    // cols = ceil(sqrt(rowCount * this))
  radialMaxRatio:    0.85,   // label positioning (future)
};


/** Helper: read data value via cursor [col, row]. */
function dataValue(data, cursor) {
  return data.getValue(cursor);
}

/** Clamp to non-zero, preserving sign. */
function nonZero(v) {
  return (v >= 0) ? Math.max(v, 0.0001) : Math.min(v, -0.0001);
}


// ============================================================
// RepeatIterator — yields subtree[0] count times, with cursor
// ============================================================

class RepeatIterator {
  constructor(count) {
    this.count = count;
    this.index = 0;
  }
  /** Current column cursor, e.g. [0], [1], [2]… */
  get cursor() { return [this.index - 1]; }
  next(subtree) {
    if (this.index >= this.count) return null;
    this.index++;
    return subtree[0];
  }
}

// ============================================================
// DataHelper — REMOVED
// Segment computation (y0/y1, stack, normalize) is now handled
// on demand by DataAdapter.getSegment(). The cumulative cache
// in DataAdapter replaces calcSegments — it stores only prefix
// sums and derives everything else via cheap lerps at draw time.
// ============================================================


// ============================================================
// InnerPathBuilder — encapsulates per-column inner path construction
//
// Captures chart-level geometry (computed once in before_draw2d),
// then builds the blended (linear ↔ sector ↔ donut) inner path
// for each column on demand.
//
// Build is split into two steps:
//
//   _columnFrame(col, params)
//     Computes all the anchors, angles, and the centreDir that
//     baseline / alignment / selfLevel / rotateStack / rotateChart
//     feed into.  This is where the chart-specific "specials" live.
//
//   _assembleInner(frame, bendStack)
//     Pure plumbing: three path constructors + two BlendedPath
//     wrappers.  Knows nothing about the specials.
//
// The split makes it easier to reuse _assembleInner (or a variant)
// at other cascade levels without inheriting the special-case logic.
// ============================================================

class InnerPathBuilder {
  /**
   * @param {object} outer - Chart-level outer path geometry
   * @param {BlendedPath} outer.path        - Blended outer path (linear ↔ arc ↔ grid)
   * @param {number}      outer.count       - Number of columns (categories)
   * @param {number}      outer.stackHeight  - px: stack cross-axis extent
   * @param {number}      outer.stackWidth    - px: tangential width of one bar after gaps
   * @param {Vec2}        outer.center      - Chart center point
   *
   * @param {object} arc - Arc/sector sub-path parameters
   * @param {number} arc.startAngle       - Radians: where the arc baseline begins
   * @param {number} arc.blend            - 0..1: linear ↔ arc blend factor
   * @param {number} arc.columnAngle      - Radians: angular span of one column
   * @param {number} arc.sectorHalfAngle  - Radians: half the effective column angle
   *
   * @param {object} ring - Ring/donut sub-path parameters
   * @param {number} ring.fullBendR     - px: donut spine radius at full bend (bendStack=1).
   *                                      Passed through to buildBentChild as fullBendR.
   * @param {number} ring.sweepAngle    - Radians: total angular sweep of the ring
   * @param {number} ring.thickness     - px: full cross-section thickness
   * @param {number} ring.arcLength     - px: arc length along the spine
   * @param {number} ring.segmentGap    - px: gap between segments along the arc
   */
  constructor({ outer, arc, ring }) {
    this.outer = outer;
    this.arc   = arc;
    this.ring  = ring;
  }

  /**
   * Compute the per-column frame: the anchors and directions every
   * candidate inner path needs.  This is where baseline, alignment,
   * selfLevel, rotateStack and rotateChart all get resolved.
   *
   * Returns:
   *   tMid             — t on the outer path for this column
   *   stackLevelledRot — rotation applied to the linear inner's axis
   *   linearOrigin     — anchor for the linear inner
   *   sectorAnchor     — anchor for the sector inner
   *   catAngle         — direction for the sector inner (tangent)
   *   sectorBaseR      — base radius for the sector inner
   *   donutAnchor      — anchor for the donut inner
   *   centreDir        — centreDir (perpAngle) for buildBentChild
   */
  _columnFrame(col, { baseline, alignment, rotateStack, rotateChart,
                      selfLevel, globalMax, maxHeight }) {
    const { outer, arc, ring } = this;
    const tMid = (col + 0.5) / outer.count;

    // ── Column frame from outer path ───────────────────────
    // angleAt is now the tangent direction; recover the normal
    // by subtracting π/2 (turn left-hand).
    const tangentAngle        = outer.path.angleAt(tMid);
    const normalAngle         = tangentAngle - Math.PI / 2;
    const stackAngle          = tangentAngle + rotateStack;
    const stackLevelledAngle  = stackAngle - rotateChart * selfLevel;
    const stackDir            = Polar.unit(stackAngle);

    // From column center, go perpendicular to stackDir by half the depth
    const colCenter = outer.path.positionAt(tMid);
    const innerMid  = stackDir.perp.scale(outer.stackHeight / 2).from(colCenter);

    // ── Linear-inner anchor ──────────────────────────────
    // Shift along the stack normal for baseline + alignment.
    const alignShift   = alignment * (globalMax - maxHeight);
    const originShift  = (-0.5 + baseline + alignShift) * outer.stackHeight;
    const linearOrigin = Polar.unit(stackAngle).perp.flip
                              .scale(originShift).from(innerMid);

    // ── Sector-inner anchor + direction ──────────────────
    const catAngle    = arc.startAngle + rotateStack
                      + (col + 0.5) * arc.columnAngle;
    const sectorBaseR = 0.5 * outer.stackHeight * (baseline - 0.5)
                      + 0.5 * originShift;
    const sectorAnchor = new Polar(sectorBaseR, catAngle).from(outer.center);

    // ── Donut-inner centreDir + anchor ───────────────────
    // stackLevelledAngle rotates to all point right, when in a row.
    // ringAngle rotates to all be towards center, when in a ring and
    // self levelled.
    const ringAngle  = rotateStack
        + (1 - selfLevel) * (rotateChart + (tMid * 2 - 0.5) * Math.PI);
    const alignAngle = alignShift * 2 * Math.PI;
    const centreDir  = lerp(stackLevelledAngle, ringAngle, arc.blend) + alignAngle;

    // Donut anchor: column center shifted along the frame normal for
    // baseline correction.
    const baselineShift = new Polar(
      4 * ring.fullBendR * (0.5 - baseline),
      normalAngle,
    );
    const donutAnchor = baselineShift.from(colCenter);

    return {
      stackLevelledRot: stackLevelledAngle - Math.PI / 2,
      linearOrigin,
      sectorAnchor, catAngle, sectorBaseR,
      donutAnchor, centreDir,
    };
  }

  /**
   * Assemble the three candidate inner paths and blend them.
   * No chart-specific specials here — just path construction and
   * blending.
   */
  _assembleInner(frame, bendStack) {
    const { outer, arc, ring } = this;

    const linearInner = LinearPath.makePath(
      frame.linearOrigin, frame.stackLevelledRot,
      outer.stackHeight, outer.stackWidth,
    );

    const sectorInner = SectorPath.makePath(
      frame.sectorAnchor, frame.catAngle,
      0.5 * outer.stackHeight, 0,
      frame.sectorBaseR, 0.5 * arc.sectorAngle,
    );

    const sharedInner = new BlendedPath(linearInner, sectorInner, arc.blend);

    const donutArc = buildBentChild(
      frame.donutAnchor, frame.centreDir,
      ring.arcLength, ring.thickness,
      ring.sweepAngle, ring.fullBendR,
      ring.segmentGap,
    );

    return new BlendedPath(sharedInner, donutArc, bendStack);
  }

  /**
   * Build the blended inner path for a given column.
   *
   * Geometry flows through three coordinate frames, blended:
   *   1. Linear — baseline + alignment shift along the stack normal
   *   2. Sector — radial wedge at catAngle from chart center
   *   3. Ring   — donut arc around a per-column pivot point
   *
   * The donut arc is constructed via buildBentChild — the pivot
   * arithmetic (spineRadius, pivotOffset, pivot point, arcStartAngle,
   * origin) lives there.  Here we only compute the anchor point and
   * centreDir that feed it.
   */
  buildForColumn(col, params) {
    const frame = this._columnFrame(col, params);
    return this._assembleInner(frame, params.bendStack);
  }
}


// ============================================================
// WarpableGridNode
// ============================================================

class WarpableGridNode {

  // ── One-time wiring ────────────────────────────────────
  static _wire(node) {
    if (node._wired) return;
    node._wired = true;

    const data = node.value;
    if (!data) return;

    const vstackProto = node.subtree?.[0];
    if (!vstackProto) return;
    vstackProto.inst = {
      axis:            'y',
      sizeCache:       new SizeCache(),
      dataSource:      new GridDataSource(data.colCount),
      defaultItemSize: 50,
      anchorCursor:    [0, 0],
      scrollOffset:    0,
    };
    node._sharedInst = vstackProto.inst;
    node._overlays = [];    

    // ── SyncOrchestrator for cross-column sync ───────────
    const nav = data.isTreeChart
      ? new TreeChartNavigator(data)
      : new GridNavigator();
    const orch = new SyncOrchestrator(nav);
    for (let col = 0; col < data.rowCount; col++) {
      const overlay = Object.create(node._sharedInst);
      overlay.sizeCache    = new SizeCache();   // own cache per column
      overlay.anchorCursor = [col, 0];
      overlay.scrollOffset = 0;
      overlay.panelIdx = col;
      node._overlays[col] = overlay;
      orch.addPanel(overlay, col, () => node.inst?.stackHeight || 600, () => 0);
    }
    node._orch = orch;
  }  

  static before_hit_test(ctxMix, node, params) {
    WarpableGridNode.before_draw2d(ctxMix, node, params);
  }
  static before_child_hit_test(ctxMix, node, params, child) {
    WarpableGridNode.before_child_draw2d(ctxMix, node, params, child);
  }

  // ── before_draw2d ──────────────────────────────────────
  static before_draw2d(ctxMix, node, params) {
    WarpableGridNode._wire(node);

    const data     = node.value;
    const rowCount = data.rowCount;

    // Compute maxHeights and globalMax from adapter (on-demand segments).
    // getSegment ensures the cumulative cache is fresh; the cache
    // only rebuilds when data-shaping params actually change.
    const numProducts = params.numProducts ?? data.colCount;
    const maxHeights = [];
    for (let col = 0; col < rowCount; col++) {
      let max = 0;
      for (let r = 0; r < numProducts; r++) {
        const seg = data.getSegment([col, r], params);
        if (seg && seg.y1 > max) max = seg.y1;
      }
      maxHeights.push(max);
    }
    const globalMax  = Math.max(...maxHeights);

    const w  = node.width   || 0, h = node.height || 0;
    const cx = node.xOffset || 0;
    const cy = node.yOffset || 0;
    const center = new Vector2D(cx, cy);

    const bend          = params.bend ?? 0;
    const arcBlend      = Math.min(1, bend / (Math.PI * 2));
    const gridiness     = params.gridiness ?? 0;
    const rotateStack   = params.rotateStack ?? 0;
    const rotateChart   = params.rotateChart ?? 0;
    const bendStack     = params.bendStack ?? 0;
    const segmentWidth  = params.segmentWidth ?? 1;
    const segmentGap    = params.segmentGap ?? 0;

    const bandW = w / rowCount;

    // ── Linear outer ─────────────────────────────────────
    const x = cx - w / 2;
    const linearOrigin = new Vector2D(x, cy).sub(center).rotate(rotateChart).add(center);
    const linearOuter  = LinearPath.makePath(linearOrigin, rotateChart, w, h);

    // ── Arc outer ────────────────────────────────────────
    const nonZeroBend   = nonZero(bend);
    const baselineArcR  = Math.min(w, h) / 2 * GRID_LAYOUT.baselineArcRatio;
    const arcRotate     = rotateChart - nonZeroBend / 2;
    const arcStartAngle = arcRotate - Math.PI / 2;
    const toArcOrigin   = new Polar(baselineArcR, arcStartAngle);
    const arcOuter      = ArcPath.makePath(
      toArcOrigin.from(center), arcRotate,
      baselineArcR * nonZeroBend, h, nonZeroBend,
    );

    // ── Grid outer ───────────────────────────────────────
    const cols  = Math.ceil(Math.sqrt(rowCount * GRID_LAYOUT.gridAspectHint));
    const rows  = Math.ceil(rowCount / cols);
    const cellW = w / cols;
    const cellH = h / rows;
    const gridTopLeft = new Vector2D(cx - w / 2, cy - h / 2);
    const rotatedGridOrigin = gridTopLeft.sub(center).rotate(rotateChart).add(center);
    const gridOuter = GridPath.makePath(
      rotatedGridOrigin, rotateChart, w, bandW, cols, h, rowCount,
    );

    // ── Blend: (linear ↔ arc) ↔ grid ────────────────────
    const radialOuter  = new BlendedPath(linearOuter, arcOuter, arcBlend);
    const outerPath    = new BlendedPath(radialOuter, gridOuter, gridiness);

    // ── Derived dimensions ───────────────────────────────
    const tangentialW  = outerPath.length / rowCount;
    const stackHeight  = outerPath.crossSize;
    const stackWidth   = tangentialW * Math.max(0.001, segmentWidth) * (1 - segmentGap);

    const columnAngle  = nonZeroBend / rowCount;
    const sectorAngle  = columnAngle * segmentWidth * (1 - segmentGap);

    // ── Ring / donut geometry ────────────────────────────
    // donutRadius is the target outer radius of the donut ring at
    // full bend; fullBendR is the spine radius passed to buildBentChild.
    const donutRadius = lerp(
      Math.min(tangentialW, stackHeight) * lerp(
        GRID_LAYOUT.donutRowScale, GRID_LAYOUT.donutRingScale, bend / 6.28,
      ),
      Math.min(cellW, cellH) * GRID_LAYOUT.donutGridScale,
      gridiness,
    );
    const donutInnerRatio = 1 - Math.max(GRID_LAYOUT.minDonutInner, segmentWidth);
    const fullBendR       = donutRadius * (1 + donutInnerRatio) / 2;
    const donutThickness  = donutRadius * (1 - donutInnerRatio);

    const donutArcLen    = fullBendR * 2 * Math.PI;
    const sweepAngle     = bendStack * 2 * Math.PI;
    const blendedArcLen  = lerp(stackHeight, donutArcLen, bendStack);
    const ringThickness  = lerp(stackWidth, donutThickness, bendStack);
    const nonZeroSweep   = nonZero(sweepAngle);
    const spineRadius    = blendedArcLen / nonZeroSweep;
    const spineArcLength = spineRadius * sweepAngle;
    const segmentArcGap  = spineRadius * segmentGap * GRID_LAYOUT.donutGapScale;

    // ── Build the inner-path factory ─────────────────────
    const innerPathBuilder = new InnerPathBuilder({
      outer: { path: outerPath, count: rowCount, stackHeight, stackWidth, center },
      arc:   { startAngle: arcStartAngle, blend: arcBlend,
               columnAngle, sectorAngle },
      ring:  { fullBendR, sweepAngle,
               thickness: ringThickness,
               arcLength: spineArcLength, segmentGap: segmentArcGap },
    });

    // ── Store only what downstream needs ─────────────────
    node.inst = {
      data,
      globalMax,
      maxHeights,
      innerPathBuilder,
      stackHeight,
      stackWidth,
      orch: node._orch,
    };

    ctxMix.outerPath = outerPath;// for diagnostics.
    ctxMix.coordinator = node.inst;
    ctxMix.highlightMode = data.isTreeChart ? 'treeChart' : 'row';
    ctxMix.iterators[ctxMix.iterators.length - 1] =
      new RepeatIterator(rowCount);
  }

  // ── before_child_draw2d ────────────────────────────────
  static before_child_draw2d(ctxMix, node, params, child) {
    const inst = node.inst;
    const iter = ctxMix.iterators.at(-1);
    const col  = iter.cursor[0];

    // ── Build inner path for this column ─────────────────
    const innerPath = inst.innerPathBuilder.buildForColumn(col, {
      baseline:     params.baseline ?? 0.5,
      alignment:    params.alignment ?? 0,
      bendStack:    params.bendStack ?? 0,
      rotateStack:  params.rotateStack ?? 0,
      rotateChart:  params.rotateChart ?? 0,
      selfLevel:    params.selfLevel,
      globalMax:    inst.globalMax,
      maxHeight:    inst.maxHeights[col],
    });

    // Diagnostic: outerPos2 is a point offset 9px from outerPos along
    // the outer path's normal direction.  angleAt is now the tangent,
    // so subtract π/2 to recover the normal direction the original
    // code was using.
    ctxMix.outerPos = ctxMix.outerPath.positionAt((col + 0.5) / 6);
    const theta     = ctxMix.outerPath.angleAt((col + 0.5) / 6) - Math.PI / 2;
    ctxMix.outerPos2 = ctxMix.outerPos.add(9 * Math.cos(theta), 9 * Math.sin(theta));

    ctxMix.innerPath = innerPath;

    // Virtual bounds for ClippingIterator
    child.yOffset = 0;
    child.height  = inst.stackHeight;
    child.xOffset = 0;
    child.width   = inst.stackWidth;


    // ── Populate cache from adapter segments ────────────────
    const numProducts = params.numProducts ?? inst.data.colCount;
    if (!node._overlays[col]) {
      node._overlays[col] = Object.create(node._sharedInst);
    }
    child.inst = node._overlays[col];
    child.inst.path = innerPath;

    if (child.inst) {
      //child.inst.dataSource.count = numProducts;

      const colCount = inst.data.getColCount?.(col) ?? numProducts;
      child.inst.dataSource.count = colCount;

      if (inst.data.isTreeChart) {
        // Content-based sizing at normalize=0 (items have fixed px
        // height, overflow clips like OmniPicker); segment-based
        // sizing at normalize=1 (everything fits in stackHeight).
        const pixPerLine = 20;
        const normalize = params.normalize ?? 0;
        child.inst.defaultItemSize = lerp(pixPerLine, inst.stackHeight / colCount, normalize);
        child.inst.sizeFn = (cursor) => {
          const value = inst.data.getValue(cursor);
          const contentSize = (value != null ? value : 1) * pixPerLine;
          const seg = inst.data.getSegment(cursor, params);
          const normSize = seg ? seg.stackedH * inst.stackHeight : contentSize;
          return lerp(contentSize, normSize, normalize);
        };
      } else {
        child.inst.defaultItemSize = inst.stackHeight / colCount;
        child.inst.sizeFn = (cursor) => {
          const seg = inst.data.getSegment(cursor, params);
          return seg ? seg.stackedH * inst.stackHeight : null;
        };
      }

      // Subtle detail here. Each col potentially has its own version...
      if (!child.inst.hasOwnProperty('anchorCursor')) {
        child.inst.anchorCursor = [col, 0];
        child.inst.scrollOffset = 0;
      }
    }


  }

  // ── helpers ────────────────────────────────────────────

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
}

sceneRegistry.registerNodeClass('warpable-grid', WarpableGridNode);


// ============================================================
// RectGridCellNode — fast axis-aligned cell (direct canvas)
// Largely superseded by SheetCellNode.
// ============================================================
class RectGridCellNode {

  static draw2d(ctxMix, node) {
    const ctx  = ctxMix.ctx;
    const data = ctxMix.coordinator?.data;
    if (!ctx || !data) return;

    const cursor = ctxMix.flyweight?.cursor;
    if (!cursor || !Array.isArray(cursor)) return;
    const col = cursor[0];
    const row = cursor[cursor.length - 1];

    const x = node.xOffset || 0, y = node.yOffset || 0;
    const w = node.width   || 0, h = node.height  || 0;

    const value = dataValue(data, cursor);
    const color = data.getColMeta(row)?.color || '#888';
    const pad = 1;

    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
    ctx.restore();

    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x + pad, y + pad, w - pad * 2, h - pad * 2);

    ctx.fillStyle = '#ccc';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value ?? ''), x + w / 2, y + h / 2);
  }
}

sceneRegistry.registerNodeClass('rect-grid-cell', RectGridCellNode);


export { WarpableGridNode, RectGridCellNode, Polar,
         RepeatIterator, GRID_LAYOUT, dataValue };
// Auto-generated exports
if (typeof window !== 'undefined') window.InnerPathBuilder = InnerPathBuilder;
export { InnerPathBuilder };
if (typeof window !== 'undefined') window.TreeChartNavigator = TreeChartNavigator;
export { TreeChartNavigator };
if (typeof window !== 'undefined') window.nonZero = nonZero;
export { nonZero };
