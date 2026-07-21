import { Vector2D, lerp } from './vector2d.js';

// ============================================================
// Coordinate conventions
// ============================================================
//
// This file uses the y-down screen coordinate system: x increases
// rightward, y increases *downward*.  This is the native convention
// of Canvas2D and SVG, so we write directly to those surfaces with
// no flip transform.
//
// Angles are in radians, measured from the +x axis (rightward),
// with the convention that (cos θ, sin θ) points in the direction
// of angle θ.  Because y is down, this means:
//   θ = 0     →  right
//   θ = π/2   →  down
//   θ = π     →  left
//   θ = 3π/2  →  up
// i.e. angles increase clockwise *on screen*.  (This is the same
// thing as the mathematical convention "CCW" applied to y-down
// coordinates — we don't flip y in the math, we just interpret
// "positive rotation" the way the rendering target does.)
//
// "Left-hand normal" of a direction d is d rotated by +π/2, which
// in screen terms is 90° clockwise — i.e. the right-hand side
// when walking along d.  Vector2D.perpendicular() returns this.
//
// If any function deviates from these conventions, it MUST say so
// in a comment at the point of deviation.
//
// ============================================================
// Path interface
// ============================================================
//
// Every Path implements:
//
//   positionAt(t)                        → { x, y }
//   angleAt(t)                           → number (radians)
//   childCentreDirAt(t)                  → number (radians)
//   frameAt(t)                           → { tangent, normal }
//   cornersAt(t0, t1, t0Alt?, t1Alt?)    → [4 points]
//   edgeBends(t0, t1)                    → [4 numbers]
//   isVisible(t0, t1, clipRegion)        → bool
//   screenToT(dx, dy, t)                 → dt
//
// ── angleAt(t) ────────────────────────────────────────────
// The *tangent* direction (radians) at parameter t — i.e. the
// direction a point moves as t increases.  For a LinearPath this
// is the line direction; for an ArcPath it is tangential to the
// arc at t; for a SectorPath it is radially outward (which is the
// sector's direction of travel).
//
// ── frameAt(t) ────────────────────────────────────────────
// { tangent, normal } where tangent is the direction of travel
// and normal is tangent rotated +π/2 (left-hand normal).  These
// are unit vectors.  Same convention as angleAt.
//
// ── childCentreDirAt(t) ───────────────────────────────────
// The direction (radians) that a child path anchored at
// positionAt(t) should use for its bend-centre axis.  This is
// *not* a property of this path's own geometry — it's the axis
// handed down to the next level of the cascade.  See
// buildBentChild() for how children consume it.
//
// For a LinearPath, childCentreDirAt is the normal direction
// (perpendicular to the line).  There is no centre of curvature
// to point toward, and by convention children bend around the
// normal.
// For an ArcPath, it points from the point on the arc *toward*
// the arc's own centre of curvature.
// For a SectorPath, it is tangential (perpendicular to the
// radial direction), i.e. circulatory around the chart centre.
// For a GridPath, it inherits from the mainPath's
// childCentreDirAt — grid folds don't rotate the local frame.
//
// ── Corner convention (consistent across all path types) ──
//
//   [0] start (t0),   −normal side
//   [1] start (t0Alt), +normal side
//   [2] end   (t1Alt), +normal side
//   [3] end   (t1),   −normal side
//
// ── Edge indexing ─────────────────────────────────────────
//
//   edge 0→1  "cross" edge at start
//   edge 1→2  "along" edge on +normal side
//   edge 2→3  "cross" edge at end
//   edge 3→0  "along" edge on −normal side
//
// The optional t0Alt, t1Alt parameters in cornersAt allow per-side
// t-values, used by the caller to implement neighborliness (slope
// toward neighboring categories).  When omitted they default to
// t0, t1.
//
// ────────────────────────────────────────────────────────────
// Unified parameter convention
// ────────────────────────────────────────────────────────────
//
// Spine parameters (affect positionAt):
//   origin  — { x, y } position at t = 0
//   rotate  — tangent direction (radians) at t = 0
//   length  — arc-length of the spine
//   bend    — total angular sweep; radius = length / |bend|.
//             bend = 0 → straight line (LinearPath).
//
// Cross-section parameters (affect cornersAt only):
//   crossSize  — perpendicular width
//   spread     — half-angle of angular fan (0 → parallel sides)
//   gapAlong   — inset along the spine at each segment boundary
//   gapAcross  — inset perpendicular to the spine
//
// Each concrete path exposes:
//   static makePath(...)  — unified parameter signature


// Angle-aware lerp: takes the short way around the circle.
// Caveat: discontinuous when |b − a| crosses π — the "short way"
// flips.  Use plain lerp when angles change smoothly.
function lerpAngle(a, b, t) {
  let diff = b - a;
  diff = ((diff % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + diff * t;
}


// ============================================================
// LinearPath
// ============================================================

class LinearPath {
  constructor(origin, rotate, length, crossSize) {
    this.origin    = origin;
    this.rotate    = rotate;
    this.length    = length;
    this.crossSize = crossSize;
    this.dir       = new Vector2D(Math.cos(rotate), Math.sin(rotate));
    this.normal    = this.dir.perpendicular();   // left-hand normal (+π/2)
    if (!(this.origin instanceof Vector2D))
      debugger;
  }

  static makePath(origin, rotate, length, crossSize) {
    return new LinearPath(origin, rotate, length, crossSize);
  }

  positionAt(t) {
    return this.origin.add(this.dir.scale(t * this.length));
  }

  // Tangent direction — along the line.
  angleAt(t) {
    return this.rotate;
  }

  // Child bend-centre direction: perpendicular to the line
  // (the normal), as there is no centre of curvature to point to.
  childCentreDirAt(t) {
    return this.rotate + Math.PI / 2;
  }

  frameAt(t) {
    return { tangent: this.dir, normal: this.normal };
  }

  cornersAt(t0, t1, t0Alt = t0, t1Alt = t1) {
    const p0  = this.positionAt(t0);
    const p0A = t0Alt === t0 ? p0 : this.positionAt(t0Alt);
    const p1A = this.positionAt(t1Alt);
    const p1  = t1Alt === t1 ? p1A : this.positionAt(t1);
    const off = this.normal.scale(this.crossSize / 2);
    return [
      p0.sub(off),   // [0] start, −normal
      p0A.add(off),  // [1] start, +normal
      p1A.add(off),  // [2] end,   +normal
      p1.sub(off),   // [3] end,   −normal
    ];
  }

  edgeBends(t0, t1) {
    return [0, 0, 0, 0];
  }

  isVisible(t0, t1, clipRegion) {
    return true;
  }

  tFromScreen(x, y) {
    return new Vector2D(x - this.origin.x, y - this.origin.y)
      .dot(this.dir) / this.length;
  }

  screenToT(dx, dy, t) {
    return new Vector2D(dx, dy).dot(this.dir) / this.length;
  }
}


// ============================================================
// ArcPath
// ============================================================
// An arc centered at `center` with given `radius`.
// t ∈ [0,1] maps to angles from `startAngle` through `angularSpan`.
// Cross-section extends ±crossSize/2 radially (normal = inward).
//
// Unified derivation:
//   radius     = length / |bend|
//   startAngle = rotate − π/2
//   center     = origin − radius × (cos startAngle, sin startAngle)
//   gapAngle   = gapAlong / radius
//
// Note on internal angle representation: `_centreAngleAt(t)` gives
// the angle from the arc's centre to the point at t (radially
// outward).  The public `angleAt(t)` returns the tangent direction,
// which is that + π/2.

class ArcPath {
  constructor(center, radius, startAngle, angularSpan, crossSize, gapAngle = 0) {
    this.center      = center;
    this.radius      = radius;
    this.startAngle  = startAngle;
    this.angularSpan = angularSpan;
    this.crossSize   = crossSize;
    this.gapAngle    = gapAngle;
    this.length      = radius * Math.abs(angularSpan);
  }

  static makePath(origin, rotate, length, crossSize, bend, gapAlong = 0) {
    // Clamp bend away from zero: a tiny bend produces a huge-radius
    // arc that is numerically indistinguishable from a straight line.
    const minBend    = 1e-9;
    const absBend    = Math.max(Math.abs(bend), minBend);
    const signedBend = absBend * (bend >= 0 ? 1 : -1);
    const radius     = length / absBend;
    const startAngle = rotate - Math.PI / 2;
    const center     = new Vector2D(
      origin.x - radius * Math.cos(startAngle),
      origin.y - radius * Math.sin(startAngle));
    const gapAngle = radius > 0 ? gapAlong / radius : 0;
    return new ArcPath(center, radius, startAngle, signedBend, crossSize, gapAngle);
  }

  // Internal: angle from the arc's centre to the point at t.
  // This is the radially-outward direction at t.
  _centreAngleAt(t) {
    return this.startAngle + t * this.angularSpan;
  }

  positionAt(t) {
    return this.center.addPolar(this.radius, this._centreAngleAt(t));
  }

  // Tangent direction — perpendicular to the radial direction,
  // in the direction of increasing t.
  angleAt(t) {
    return this._centreAngleAt(t) + Math.PI / 2;
  }

  // Child bend-centre direction: from the point on the arc,
  // back toward the arc's own centre of curvature.  This is the
  // reverse of the radial-outward direction.
  childCentreDirAt(t) {
    return this._centreAngleAt(t) + Math.PI;
  }

  frameAt(t) {
    const a = this.angleAt(t);
    const tangent = new Vector2D(Math.cos(a), Math.sin(a));
    const normal  = tangent.perpendicular();   // left-hand normal (+π/2)
    return { tangent, normal };
  }

  cornersAt(t0, t1, t0Alt = t0, t1Alt = t1) {
    const half    = this.crossSize / 2;
    const outerR  = this.radius + half;
    const innerR  = this.radius - half;
    const c       = this.center;
    const hg      = this.gapAngle / 2;
    const a0      = this._centreAngleAt(t0)    + hg;
    const a0A     = this._centreAngleAt(t0Alt) + hg;
    const a1A     = this._centreAngleAt(t1Alt) - hg;
    const a1      = this._centreAngleAt(t1)    - hg;
    return [
      c.addPolar(outerR, a0),    // [0] start, −normal (outer)
      c.addPolar(innerR, a0A),   // [1] start, +normal (inner)
      c.addPolar(innerR, a1A),   // [2] end,   +normal (inner)
      c.addPolar(outerR, a1),    // [3] end,   −normal (outer)
    ];
  }

  edgeBends(t0, t1) {
    const span = (t1 - t0) * this.angularSpan;
    return [0, -span, 0, span];
  }

  isVisible(t0, t1, clipRegion) {
    return true;
  }

  tFromScreen(x, y) {
    const angle = Math.atan2(y - this.center.y, x - this.center.x);
    let rel = angle - this.startAngle;
    while (rel >  Math.PI) rel -= 2 * Math.PI;
    while (rel < -Math.PI) rel += 2 * Math.PI;
    return rel / this.angularSpan;
  }

  screenToT(dx, dy, t) {
    const { tangent } = this.frameAt(t);
    const arcLength = Math.abs(this.radius * this.angularSpan);
    return new Vector2D(dx, dy).dot(tangent) / (arcLength || 1);
  }
}


// ============================================================
// SectorPath
// ============================================================
// A radial spine from `center`.  t ∈ [0,1] maps to radius from
// `baseRadius` to `baseRadius + radialRange`.  The cross-section
// is an angular wedge from `startAngle` to `endAngle`.
//
// Unified derivation:
//   rotate     = midAngle = (startAngle + endAngle) / 2
//   length     = radialRange
//   origin     = center + baseRadius × (cos rotate, sin rotate)
//   center     = origin − baseRadius × (cos rotate, sin rotate)
//   spread     = (endAngle − startAngle) / 2
//   startAngle = rotate − spread
//   endAngle   = rotate + spread

class SectorPath {
  constructor(center, baseRadius, length, startAngle, endAngle, crossSize = 0) {
    this.center      = center;
    this.baseRadius  = baseRadius;
    this.startAngle  = startAngle;
    this.endAngle    = endAngle;
    this._midAngle   = (startAngle + endAngle) / 2;
    this.length      = length;
    this.crossSize   = crossSize;
  }

  static makePath(origin, rotate, length, crossSize, baseRadius, spread) {
    const center = new Vector2D(
      origin.x - baseRadius * Math.cos(rotate),
      origin.y - baseRadius * Math.sin(rotate));
    const startAngle = rotate - spread;
    const endAngle   = rotate + spread;
    return new SectorPath(center, baseRadius, length, startAngle, endAngle, crossSize);
  }

  _radius(t) {
    return this.baseRadius + t * this.length;
  }

  // Tangent direction — radially outward from the sector's centre,
  // which is the sector's direction of travel as t increases.
  angleAt(t) {
    return this._midAngle;
  }

  // Child bend-centre direction: perpendicular to the radial
  // (tangent) direction — i.e. the circulatory direction around
  // the sector's centre of curvature.
  childCentreDirAt(t) {
    return this._midAngle + Math.PI / 2;
  }

  positionAt(t) {
    if (typeof this.center !== 'Vector2D')
      debugger;
    return this.center.addPolar(this._radius(t), this._midAngle);
  }

  frameAt(t) {
    const a = this.angleAt(t);
    const tangent = new Vector2D(Math.cos(a), Math.sin(a));   // radially outward
    const normal  = tangent.perpendicular();                   // left-hand normal
    return { tangent, normal };
  }

  cornersAt(t0, t1, t0Alt = t0, t1Alt = t1) {
    const c  = this.center;
    const r0  = this._radius(t0);
    const r0A = t0Alt === t0 ? r0 : this._radius(t0Alt);
    const r1A = this._radius(t1Alt);
    const r1  = t1Alt === t1 ? r1A : this._radius(t1);
    return [
      c.addPolar(r0, this.startAngle),  // [0] start, −normal (startAngle side)
      c.addPolar(r0A, this.endAngle),   // [1] start, +normal (endAngle side)
      c.addPolar(r1A, this.endAngle),   // [2] end,   +normal
      c.addPolar(r1, this.startAngle),  // [3] end,   −normal
    ];
  }

  edgeBends(t0, t1) {
    const angularSpan = this.endAngle - this.startAngle;
    return [-angularSpan, 0, angularSpan, 0];
  }

  isVisible(t0, t1, clipRegion) {
    return true;
  }

  tFromScreen(x, y) {
    const angle = Math.atan2(y - this.center.y, x - this.center.x);
    let rel = angle - this.startAngle;
    while (rel >  Math.PI) rel -= 2 * Math.PI;
    while (rel < -Math.PI) rel += 2 * Math.PI;
    return rel / this.angularSpan;
  }

  screenToT(dx, dy, t) {
    const a = this._midAngle;
    const radialDir = new Vector2D(Math.cos(a), Math.sin(a));
    return new Vector2D(dx, dy).dot(radialDir) / (this.length || 1);
  }
}


// ============================================================
// WrappedPath
// ============================================================
// Composes two paths: a mainPath (the row direction) and a
// crossPath (the stacking direction).  t ∈ [0,1] maps to
// item index → (col, row) → position from main + cross offset.
//
// Both paths must share the same origin.
// Currently works correctly for two LinearPaths; other
// combinations are geometrically meaningful but untested.

class WrappedPath {
  /**
   * @param {object} mainPath  — path along one row
   * @param {object} crossPath — path perpendicular, defining row offsets
   * @param {number} cols      — items per row
   * @param {number} numItems  — total item count
   */
  constructor(mainPath, crossPath, cols, numItems) {
    this.mainPath  = mainPath;
    this.crossPath = crossPath;
    this.cols      = cols;
    this.numItems  = numItems;
    this.rows      = Math.ceil(numItems / cols);
    this.length    = mainPath.length;
    this.crossSize = crossPath.length / this.rows;
  }

  /** Decompose t into row/col and per-path t values. */
  _decompose(t) {
    const i   = Math.min(Math.floor(t * this.numItems), this.numItems - 1);
    const col = i % this.cols;
    const row = Math.floor(i / this.cols);
    const tMain  = (col + 0.5) / this.cols;
    const tCross = (row + 0.5) / this.rows;
    return { i, col, row, tMain, tCross };
  }

  /** Displacement from crossPath's origin to the row position. */
  _crossOffset(tCross) {
    return this.crossPath.positionAt(tCross).sub(this.crossPath.origin);
  }

  positionAt(t) {
    const { tMain, tCross } = this._decompose(t);
    return this.mainPath.positionAt(tMain).add(this._crossOffset(tCross));
  }

  angleAt(t) {
    return this.mainPath.angleAt(0);
  }

  // Child bend-centre direction: inherit from the mainPath.
  // Grid folds don't rotate the local frame, so the direction
  // is the same as the mainPath's childCentreDirAt.
  childCentreDirAt(t) {
    return this.mainPath.childCentreDirAt(0);
  }

  frameAt(t) {
    return this.mainPath.frameAt(0);
  }

  cornersAt(t0, t1, t0Alt = t0, t1Alt = t1) {
    const pos      = this.positionAt(t0);
    const mainDir  = this.mainPath.frameAt(0).tangent;
    const crossDir = this.crossPath.frameAt(0).tangent;
    const hw = this.mainPath.crossSize / 2;
    const hh = (this.crossPath.length / this.rows) / 2;

    const mOff = mainDir.scale(hw);
    const cOff = crossDir.scale(hh);
    return [
      pos.sub(mOff).sub(cOff),   // [0] start, −normal
      pos.sub(mOff).add(cOff),   // [1] start, +normal
      pos.add(mOff).add(cOff),   // [2] end,   +normal
      pos.add(mOff).sub(cOff),   // [3] end,   −normal
    ];
  }

  edgeBends(t0, t1) {
    return [0, 0, 0, 0];
  }

  isVisible(t0, t1, clipRegion) {
    return true;
  }

  // WrappedPath
  tFromScreen(x, y) {
    const frame  = this.mainPath.frameAt(0);
    const origin = frame.position;
    const dir    = frame.tangent;
    return new Vector2D(x - origin.x, y - origin.y).dot(dir)
      / (this.mainPath.length || 1);
  }

  screenToT(dx, dy, t) {
    const mainDir = this.mainPath.frameAt(0).tangent;
    return new Vector2D(dx, dy).dot(mainDir) / (this.mainPath.length || 1);
  }
}


// ============================================================
// GridPath
// ============================================================
// A convenience that creates two orthogonal LinearPaths and
// delegates to WrappedPath.  Preserves the old constructor
// semantics via makeOld.
//
// Note: the old GridPath rotated corners around the grid's
// center, but didn't actually apply rotation to corner geometry.
// WrappedPath handles rotation correctly via the LinearPath
// directions.

class GridPath extends WrappedPath {
  /**
   * @param {object}  mainPath  — horizontal LinearPath (one row)
   * @param {object}  crossPath — vertical LinearPath (row stacking)
   * @param {number}  cols      — items per row
   * @param {number}  numItems  — total item count
   * @param {object}  meta      — original parameters for backward compat
   */
  constructor(mainPath, crossPath, cols, numItems, meta = {}) {
    super(mainPath, crossPath, cols, numItems);
    // Preserve for any call sites that read these directly
    this.origin    = meta.origin;
    this.rotation  = meta.rotation;
    this.cellW     = meta.cellW;
    this.cellH     = meta.cellH;
    this.crossSize = meta.crossSize;
  }

  static makePath(origin, rotate, length, crossSize, cols, crossLength, numItems) {
    const cellW     = length / cols;
    const mainPath  = new LinearPath(origin, rotate,                length,      crossSize);
    const crossPath = new LinearPath(origin, rotate + Math.PI / 2,  crossLength, cellW);
    const cellH     = crossLength / Math.ceil(numItems / cols);
    return new GridPath(mainPath, crossPath, cols, numItems, {
      origin, rotation: rotate, cellW, cellH, crossSize,
    });
  }

}


// ============================================================
// BlendedPath
// ============================================================
// Linearly interpolates every output of two sub-paths.
//
// Known limitation: this lerps positions and frames in screen
// space rather than interpolating the underlying parameters
// (bend, spread, etc.).  For small deformations the error is
// negligible; for large morphs (e.g. line → semicircle) the
// intermediate states are not valid geometric paths.  The
// proper fix is to lerp the unified parameters and construct
// a single path from the intermediate values — feasible once
// all paths use makePath.

class BlendedPath {
  constructor(pathA, pathB, blend) {
    this.pathA     = pathA;
    this.pathB     = pathB;
    this.blend     = blend;
    this.length    = lerp(pathA.length, pathB.length, blend);
    this.crossSize = lerp(pathA.crossSize, pathB.crossSize, blend);
  }

  positionAt(t) {
    return this.pathA.positionAt(t).lerp(this.pathB.positionAt(t), this.blend);
  }

  // Tangent angle, blended via lerpAngle (modular).
  angleAt(t) {
    return lerpAngle(this.pathA.angleAt(t), this.pathB.angleAt(t), this.blend);
  }

  // Child bend-centre direction: lerp the two sub-paths' directions.
  // Uses lerpAngle so the short way around the circle is taken.
  childCentreDirAt(t) {
    return lerpAngle(
      this.pathA.childCentreDirAt(t),
      this.pathB.childCentreDirAt(t),
      this.blend,
    );
  }

  frameAt(t) {
    const fA = this.pathA.frameAt(t);
    const fB = this.pathB.frameAt(t);
    return {
      tangent: fA.tangent.lerp(fB.tangent, this.blend),
      normal:  fA.normal.lerp(fB.normal, this.blend),
    };
  }

  cornersAt(t0, t1, t0Alt = t0, t1Alt = t1) {
    const cA = this.pathA.cornersAt(t0, t1, t0Alt, t1Alt);
    const cB = this.pathB.cornersAt(t0, t1, t0Alt, t1Alt);
    return cA.map((a, i) => a.lerp(cB[i], this.blend));
  }

  edgeBends(t0, t1) {
    const bA = this.pathA.edgeBends(t0, t1);
    const bB = this.pathB.edgeBends(t0, t1);
    return bA.map((a, i) => lerp(a, bB[i], this.blend));
  }

  isVisible(t0, t1, clipRegion) {
    return true;
  }

  tFromScreen(x, y) {
    const tA = this.pathA.tFromScreen(x, y);
    const tB = this.pathB.tFromScreen(x, y);
    if (isNaN(tB)) return tA;
    if (isNaN(tA)) return tB;
    return lerp(tA, tB, this.blend);
  }

  screenToT(dx, dy, t) {
    const dtA = this.pathA.screenToT(dx, dy, t);
    const dtB = this.pathB.screenToT(dx, dy, t);
    if (isNaN(dtB)) return dtA;
    if (isNaN(dtA)) return dtB;
    return lerp(dtA, dtB, this.blend);
  }
}


// ============================================================
// buildBentChild
// ============================================================
// Build an ArcPath anchored to a parent frame.
//
// Inputs:
//   anchor      — Vector2D: the point on the parent path the child
//                 passes through (typically the parent's positionAt(t)
//                 plus any baseline/alignment shift the caller has
//                 already applied).
//   centreDir   — radians: direction from anchor toward the child's
//                 centre of curvature.  Typically the parent's
//                 childCentreDirAt(t), possibly blended by selfLevel.
//   length      — arc-length along the child's spine.
//   crossSize   — cross-section thickness.
//   bend        — total angular sweep of the child (radians).
//   fullBendR   — the child's desired spine radius when bent fully
//                 (i.e. the radius the child wants to curl to).
//                 At bend = 2π, pivot coincides with the child's own
//                 centre of curvature and the pivotOffset is 0.
//                 At bend → 0, pivotOffset → ∞ and the child
//                 degenerates smoothly to a straight line.
//   gapAlong    — optional inset along the spine (passed through).
//
// Pivot arithmetic lives here.  Single code path — ArcPath.makePath's
// own bend clamp keeps the arithmetic stable as bend → 0, so no
// branching is needed.
function buildBentChild(anchor, centreDir, length, crossSize,
                        bend, fullBendR, gapAlong = 0) {
  const nonZeroBend = (Math.abs(bend) < 1e-9)
                    ? (bend >= 0 ? 1e-9 : -1e-9)
                    : bend;
  const spineRadius = length / nonZeroBend;
  const pivotOffset = spineRadius - fullBendR;

  // Pivot: from anchor, pivotOffset along centreDir.
  const pivot = anchor.addPolar(pivotOffset, centreDir);

  // The child arc starts on the opposite side of the pivot from
  // centreDir, offset by (1 - bend/2π) · π so that at full bend (2π)
  // the start is exactly anti-parallel to centreDir, and at zero
  // bend the construction degenerates smoothly.
  const arcStartAngle = centreDir + Math.PI * (1 - bend / (2 * Math.PI));
  const origin        = pivot.addPolar(spineRadius, arcStartAngle);

  return ArcPath.makePath(
    origin,
    arcStartAngle + Math.PI / 2,
    length, crossSize,
    bend, gapAlong,
  );
}


export { LinearPath, ArcPath, SectorPath, WrappedPath, GridPath, BlendedPath,
         lerpAngle, buildBentChild };