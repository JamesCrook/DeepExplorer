// `warpable-grid` — OmniChart's flyweight grid, on the general T
/**
 * `warpable-grid` — OmniChart's flyweight grid: one column and one cell prototype, reused
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
import { SizeCache, GridDataSource, CyclicDataSource, SyncOrchestrator, GridNavigator } from './multiscroller-nodes.js';
import { SYS } from '../omni-support/sys.js';
import { PathTransform } from '../2d-support/path-transform.js';

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
  /** Columns first .. count-1 (first > 0 when columns before it are culled). */
  constructor(count, first = 0) {
    this.count = count;
    this.index = first;
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
    // Uniform columns, or each its share of the spine (outer.colMid/colFrac).
    const tMid = outer.colMid ? outer.colMid[col] : (col + 0.5) / outer.count;

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
                      + (outer.colMid ? tMid * arc.totalAngle : (col + 0.5) * arc.columnAngle);
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

    // Column widths: one for all, or this column's.
    const stackWidth  = outer.stackWidths ? outer.stackWidths[col] : outer.stackWidth;
    const sectorAngle = arc.sectorAngles ? arc.sectorAngles[col] : arc.sectorAngle;
    const ringThickness = ring.thicknesses ? ring.thicknesses[col] : ring.thickness;

    return {
      stackLevelledRot: stackLevelledAngle - Math.PI / 2,
      linearOrigin,
      sectorAnchor, catAngle, sectorBaseR,
      donutAnchor, centreDir,
      stackWidth, sectorAngle, ringThickness,
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
      outer.stackHeight, frame.stackWidth,
    );

    const sectorInner = SectorPath.makePath(
      frame.sectorAnchor, frame.catAngle,
      0.5 * outer.stackHeight, 0,
      frame.sectorBaseR, 0.5 * frame.sectorAngle,
    );

    const sharedInner = new BlendedPath(linearInner, sectorInner, arc.blend);

    const donutArc = buildBentChild(
      frame.donutAnchor, frame.centreDir,
      ring.arcLength, frame.ringThickness,
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
  //
  // A parent (OmniGrid's viewport) may set, before the first draw:
  //   node.sharedOrch   a SyncOrchestrator to join instead of making one, so
  //                     several grids scroll as one (body, row names, index)
  //   node.syncLevel    the level this grid's columns register under, for a
  //                     one-column grid in a shared orchestrator ('rows')
  //   node.cyclic       the rows wrap round (CyclicDataSource)
  // and, each frame, node.itemSize, node.colWeights and node.highlightMode.
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
      dataSource:      node.cyclic ? new CyclicDataSource(data.colCount) : new GridDataSource(data.colCount),
      defaultItemSize: 50,
      anchorCursor:    [0, 0],
      scrollOffset:    0,
    };
    node._sharedInst = vstackProto.inst;
    node._overlays = [];

    // The cell's value, per flyweight item: its quad in the stack's local
    // units, colour and text (see cellValue).
    const cellProto = vstackProto.subtree?.[0];
    if (cellProto) cellProto.flyFn = (res, n, params) => WarpableGridNode.cellValue(res, node, params);

    // ── SyncOrchestrator for cross-column sync ───────────
    const orch = node.sharedOrch ?? new SyncOrchestrator(data.isTreeChart
      ? new TreeChartNavigator(data)
      : new GridNavigator());
    for (let col = 0; col < data.rowCount; col++) {
      const overlay = Object.create(node._sharedInst);
      overlay.sizeCache    = new SizeCache();   // own cache per column
      overlay.anchorCursor = [col, 0];
      overlay.scrollOffset = 0;
      overlay.panelIdx = orch.addPanel(overlay, node.syncLevel ?? col, () => node.inst?.stackHeight || 600, () => 0);
      node._overlays[col] = overlay;
    }
    node._orch = orch;
  }  

  static before_hit_test(ctxMix, node, params) {
    if (!node.subtree?.length) return;   // childless: unchanged from before walkPhase gave containers their hooks
    WarpableGridNode.before_draw2d(ctxMix, node, params);
  }
  static before_child_hit_test(ctxMix, node, params, child) {
    WarpableGridNode.before_child_draw2d(ctxMix, node, params, child);
  }
  static after_hit_test(ctxMix, node, params) {
    WarpableGridNode.after_draw2d(ctxMix, node, params);
  }

  static after_draw2d(ctxMix, node, params) {
    if (node._savedT !== undefined) { ctxMix.T = node._savedT; node._savedT = undefined; }
  }

  // ── before_draw2d ──────────────────────────────────────
  static before_draw2d(ctxMix, node, params) {
    if (!node.subtree?.length) return;   // childless: unchanged from before walkPhase gave containers their hooks
    WarpableGridNode._wire(node);

    const data     = node.value;
    const rowCount = data.rowCount;

    // Compute maxHeights and globalMax from adapter (on-demand segments).
    // getSegment ensures the cumulative cache is fresh; the cache
    // only rebuilds when data-shaping params actually change.
    // Only alignment reads them, and they cost rows x columns: skip at 0.
    const numProducts = params.numProducts ?? data.colCount;
    const maxHeights = [];
    if ((params.alignment ?? 0) !== 0) {
      for (let col = 0; col < rowCount; col++) {
        let max = 0;
        for (let r = 0; r < numProducts; r++) {
          const seg = data.getSegment([col, r], params);
          if (seg && seg.y1 > max) max = seg.y1;
        }
        maxHeights.push(max);
      }
    }
    const globalMax  = maxHeights.length ? Math.max(...maxHeights) : 0;

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

    // ── Variable column widths ───────────────────────────
    // A parent may stamp colWeights (one per column, any units): each column
    // then takes that share of the spine, for its position and its width.
    // Gridiness keeps equal cells.  Without weights, the uniform values above.
    let colMid = null, colFrac = null, stackWidths = null, sectorAngles = null, thicknesses = null;
    const weights = node.colWeights;
    if (weights?.length === rowCount) {
      const total = weights.reduce((a, b) => a + b, 0) || 1;
      colMid = new Array(rowCount); colFrac = new Array(rowCount);
      stackWidths = new Array(rowCount); sectorAngles = new Array(rowCount); thicknesses = new Array(rowCount);
      let acc = 0;
      const fill = Math.max(0.001, segmentWidth) * (1 - segmentGap);
      for (let c = 0; c < rowCount; c++) {
        const f = weights[c] / total;
        colFrac[c] = f;
        colMid[c] = acc + f / 2;
        acc += f;
        stackWidths[c]  = outerPath.length * f * fill;
        sectorAngles[c] = nonZeroBend * f * segmentWidth * (1 - segmentGap);
        thicknesses[c]  = lerp(stackWidths[c], donutThickness, bendStack);
      }
    }

    // ── Build the inner-path factory ─────────────────────
    const innerPathBuilder = new InnerPathBuilder({
      outer: { path: outerPath, count: rowCount, stackHeight, stackWidth, center,
               colMid, colFrac, stackWidths },
      arc:   { startAngle: arcStartAngle, blend: arcBlend,
               columnAngle, sectorAngle, totalAngle: nonZeroBend, sectorAngles },
      ring:  { fullBendR, sweepAngle,
               thickness: ringThickness, thicknesses,
               arcLength: spineArcLength, segmentGap: segmentArcGap },
    });

    // ── Column culling ───────────────────────────────────
    // While the chart is straight (no bend, grid or ring, columns upright or
    // reversed), a column stays inside its band of the outer path, so only
    // the columns whose band meets the visible rect are walked.  The rect is
    // ctxMix.clipRect when a viewport sets one, else the canvas.
    let firstCol = 0, lastCol = rowCount - 1;
    const straight = arcBlend === 0 && gridiness === 0 && bendStack === 0
                  && Math.abs(Math.sin(rotateStack)) < 1e-9;
    if (straight && ctxMix.ctx) {
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const rect = ctxMix.clipRect
        ?? { x: 0, y: 0, w: ctxMix.ctx.canvas.width / dpr, h: ctxMix.ctx.canvas.height / dpr };
      const outerT = new PathTransform(outerPath, ctxMix.T?.affine ?? ctxMix.T,
        { length: outerPath.length, cross: stackHeight });
      const lb = outerT.localBounds(rect);
      const L = outerPath.length;
      const start = c => colMid ? (colMid[c] - colFrac[c] / 2) * L : c / rowCount * L;
      const end   = c => colMid ? (colMid[c] + colFrac[c] / 2) * L : (c + 1) / rowCount * L;
      while (firstCol < rowCount - 1 && end(firstCol) < lb.x0) firstCol++;
      while (lastCol > firstCol && start(lastCol) > lb.x1) lastCol--;
    }

    // ── Store only what downstream needs ─────────────────
    node.inst = {
      data,
      globalMax,
      maxHeights,
      innerPathBuilder,
      stackHeight,
      stackWidth,
      stackWidths,
      firstCol, lastCol,
      syncLevel: node.syncLevel,
      orch: node._orch,
    };

    // T: the outer path over the units this grid was given.  Each column
    // replaces it with its own inner path (a cascade, not a composition).
    node._savedT = ctxMix.T;
    const parentT = ctxMix.T?.affine ?? ctxMix.T;
    ctxMix.T = new PathTransform(outerPath, parentT, { length: outerPath.length, cross: stackHeight });

    ctxMix.coordinator = node.inst;
    ctxMix.highlightMode = node.highlightMode ?? (data.isTreeChart ? 'treeChart' : 'row');
    ctxMix.iterators[ctxMix.iterators.length - 1] =
      new RepeatIterator(lastCol + 1, firstCol);
  }

  /**
   * A cell's value (the cell prototype's flyFn): where it sits, in the
   * column's local units, and what it shows.  The data shaping — stack,
   * normalise, neighbourliness — happens here, so the cell only draws.
   *
   *   quad    [q0, q1, q2, q3] local points, path.js corner order: x along
   *           the column (0 .. stackHeight), y across (±stackWidth / 2).  The
   *           far edge (q1, q2) takes the next column's values as
   *           neighbourliness asks, which makes the quad a trapezoid.
   *   color   the segment's colour (CSS)
   *   text    display text
   *   cursor  the flyweight cursor, for the cell's highlight state
   */
  static cellValue(ctxMix, node, params) {
    const inst = node.inst, data = inst?.data;
    const cursor = ctxMix.flyweight?.cursor;
    if (!data || !Array.isArray(cursor)) return null;
    const seg = data.getSegment(cursor, params);
    if (!seg) return null;

    const col = cursor[0], row = cursor[cursor.length - 1];
    const stack = params.stack ?? 1;
    const neighborliness = params.neighborliness ?? 0;
    const bendStack = params.bendStack ?? 0;

    const L = inst.stackHeight, half = (inst.stackWidths ? inst.stackWidths[col] : inst.stackWidth) / 2;
    const t0 = lerp(seg.y0, ctxMix.flyweight.t0, stack);
    const t1 = lerp(seg.y1, ctxMix.flyweight.t1, stack);

    // Neighbour blending: for grid data, the same draw-order position in the
    // next column.  For tree data, skip naive index matching: parent weights
    // already keep the columns proportional.
    let t0A = t0, t1A = t1;
    if (!data.isTreeChart) {
      const nextSeg = data.getSegment([(col + 1) % data.rowCount, row], params);
      if (nextSeg) {
        t0A = lerp(lerp(nextSeg.y0, t0, 1 - neighborliness), t0, bendStack);
        t1A = lerp(lerp(nextSeg.y1, t1, 1 - neighborliness), t1, bendStack);
      }
    }

    return {
      quad: [{ x: t0 * L, y: -half }, { x: t0A * L, y: half }, { x: t1A * L, y: half }, { x: t1 * L, y: -half }],
      color: seg.color,
      text: data.getDisplayText([col, seg.origIdx ?? 0], params),
      cursor,
    };
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
      maxHeight:    inst.maxHeights[col] ?? 0,
    });

    // Virtual bounds for ClippingIterator
    child.yOffset = 0;
    child.height  = inst.stackHeight;
    child.xOffset = 0;
    child.width   = inst.stackWidths ? inst.stackWidths[col] : inst.stackWidth;


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

      if (node.itemSize != null) {
        // Content sizing for any data (a table's rows): every item itemSize
        // px at normalize=0, blending to value shares of the column at 1.
        const itemSize = node.itemSize, normalize = params.normalize ?? 0;
        child.inst.defaultItemSize = lerp(itemSize, inst.stackHeight / colCount, normalize);
        child.inst.sizeFn = normalize === 0 ? () => itemSize : (cursor) => {
          const seg = inst.data.getSegment(cursor, params);
          return lerp(itemSize, seg ? seg.stackedH * inst.stackHeight : itemSize, normalize);
        };
      } else if (inst.data.isTreeChart) {
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

}

SYS.NODE_CLASSES.push({ name: 'warpable-grid', cls: WarpableGridNode });


export { WarpableGridNode, Polar,
         RepeatIterator, GRID_LAYOUT, dataValue };
// Auto-generated exports
if (typeof window !== 'undefined') window.InnerPathBuilder = InnerPathBuilder;
export { InnerPathBuilder };
if (typeof window !== 'undefined') window.TreeChartNavigator = TreeChartNavigator;
export { TreeChartNavigator };
if (typeof window !== 'undefined') window.nonZero = nonZero;
export { nonZero };
