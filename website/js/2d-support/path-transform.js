// PathTransform — T over a bent Path: local x along the spine, y across
/**
 * The non-affine implementation of the general T interface (the affine one is
 * omni-support/transform.js, whose header lists the interface).  It wraps any
 * Path from path.js — linear, arc, sector, grid, blended — so content placed in
 * local units follows the path's bend.
 *
 *   T = new PathTransform(path, parentT, { length, cross })
 *
 * Local units:
 *   x  distance along the spine, 0 .. length.  The path's own t is x / length.
 *      length defaults to path.length; the chart passes the stack's nominal
 *      height instead, so its pixel iterators keep the units they had.
 *   y  distance across, −cross/2 .. +cross/2, −y on the path's corner [0]
 *      side, +y on the [1] side.  cross defaults to path.crossSize.
 *
 * Composition (docs/general-t-and-grid-unwrap.md 2.3):
 *   - The path is built in its parent's local space, and parentT (affine) maps
 *     that to the screen.  Exact for any similarity parent (translate, uniform
 *     scale, rotation, reflection); a non-uniform parent keeps the corners
 *     exact and the arc bends approximate.
 *   - An affine child inside a PathTransform (T.child) is a NestedTransform:
 *     exact toScreen/toLocal; mapQuad exact while the child stays axis-aligned.
 *   - Non-affine inside non-affine is a cascade, not a composition: the chart's
 *     inner paths are new paths built from the outer path's frame, and the
 *     column replaces T rather than composing it.
 *
 * mapQuad keeps path.js's corner conventions exactly: a quad that spans the
 * whole cross section maps through path.cornersAt(t0, t1, t0Alt, t1Alt), so
 * segment gaps, sector wedges and the chart's neighbourliness trapezoids come
 * out as they always have.  A quad inside the cross section interpolates
 * between the two sides at each end.
 *
 * toLocal: x from path.tFromScreen (exact for linear and arc; by projection for
 * blends, with the last answer as a hint), y by projecting onto the across
 * segment at that x (exact for linear and arc, a chord for sectors).
 */

import { Vector2D } from './vector2d.js';
import { BlendedPath, pathPointAt } from './path.js';

const H = 0.5;   // finite-difference step, local units

class PathTransform {
  constructor(path, parent, { length, cross } = {}) {
    this.path   = path;
    this.parent = parent?.affine ?? parent ?? null;
    this.length = length ?? path.length ?? 1;
    this.cross  = cross ?? path.crossSize ?? 0;
    this._hint  = null;
  }

  get isAffine() { return false; }
  get affine()   { return this.parent; }

  // ── path space (the parent's local space) ──────────────────

  _t(x) { return this.length ? x / this.length : 0; }
  _f(y) { return this.cross ? 0.5 + y / this.cross : 0.5; }     // 0 at −y side, 1 at +y side

  _up(p) {
    if (!this.parent) return new Vector2D(p.x, p.y);
    const q = this.parent.toScreen(p);
    return new Vector2D(q.x, q.y);
  }

  /** Path-space point at local (x, y): start-side and end-side versions averaged
   *  (they differ only by a segment gap, where a path has one). */
  _pathPoint(x, y) {
    const t = this._t(x), f = this._f(y);
    return pathPointAt(this.path, t, f).lerp(pathPointAt(this.path, t, f, true), 0.5);
  }

  toScreen(p) {
    const q = this._up(this._pathPoint(p.x, p.y));
    return { x: q.x, y: q.y };
  }

  toLocal(q) {
    const p = this.parent ? this.parent.toLocal(q) : q;
    const hint = this._hint;
    let t = this.path.tFromScreen(p.x, p.y, hint);
    if (!isFinite(t)) t = hint ?? 0;
    this._hint = t;
    const a = pathPointAt(this.path, t, 0), b = pathPointAt(this.path, t, 1);
    const ab = b.sub(a), len2 = ab.x * ab.x + ab.y * ab.y;
    const f = len2 > 1e-12 ? ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / len2 : 0.5;
    return { x: t * this.length, y: (f - 0.5) * this.cross };
  }

  // ── scale, angle and frame, by finite differences ──────────

  frameAt(p = { x: this.length / 2, y: 0 }) {
    const o  = this.toScreen(p);
    const px = this.toScreen({ x: p.x + H, y: p.y });
    const py = this.toScreen({ x: p.x, y: p.y + H });
    return {
      origin: o,
      ex: { x: (px.x - o.x) / H, y: (px.y - o.y) / H },
      ey: { x: (py.x - o.x) / H, y: (py.y - o.y) / H },
    };
  }

  scaleAt(p) {
    const { ex, ey } = this.frameAt(p);
    return Math.sqrt(Math.abs(ex.x * ey.y - ex.y * ey.x));
  }

  get uniformScale() { return this.scaleAt(); }
  get scaleX() { const { ex } = this.frameAt(); return Math.hypot(ex.x, ex.y); }
  get scaleY() { const { ey } = this.frameAt(); return Math.hypot(ey.x, ey.y); }

  angleAt(p) {
    const { ex } = this.frameAt(p);
    return Math.atan2(ex.y, ex.x);
  }

  // ── quads ──────────────────────────────────────────────────

  /**
   * The screen image of a local quad, in path.js corner order:
   *   q0 start −y, q1 start +y, q2 end +y, q3 end −y.
   * Returns { corners: Vector2D[4], bends: number[4] }.
   */
  mapQuad(q0, q1, q2, q3) {
    const h = this.cross / 2, eps = 1e-6 * (this.cross || 1);
    const full = Math.abs(q0.y + h) < eps && Math.abs(q3.y + h) < eps
              && Math.abs(q1.y - h) < eps && Math.abs(q2.y - h) < eps;
    const t0 = this._t(q0.x), t1 = this._t(q3.x);
    let corners;
    if (full) {
      corners = this.path.cornersAt(t0, t1, this._t(q1.x), this._t(q2.x));
    } else {
      const start = (q) => pathPointAt(this.path, this._t(q.x), this._f(q.y));
      const end   = (q) => pathPointAt(this.path, this._t(q.x), this._f(q.y), true);
      corners = [start(q0), start(q1), end(q2), end(q3)];
    }
    let bends = this.path.edgeBends(t0, t1);
    if (this.parent) {
      corners = corners.map(c => this._up(c));
      if (this.parent.scaleX * this.parent.scaleY < 0) bends = bends.map(b => -b);   // a reflection turns arcs the other way
    }
    return { corners, bends };
  }

  mapRect(x0, y0, x1, y1) {
    return this.mapQuad({ x: x0, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 });
  }

  /** Local box covering a screen rect: the inverse of points round its edge,
   *  padded by one percent of the extent.  Conservative for culling. */
  localBounds(r) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      pts.push({ x: r.x + u * r.w, y: r.y }, { x: r.x + u * r.w, y: r.y + r.h },
               { x: r.x, y: r.y + u * r.h }, { x: r.x + r.w, y: r.y + u * r.h });
    }
    const saved = this._hint;
    const loc = pts.map(q => this.toLocal(q));
    this._hint = saved;
    const xs = loc.map(p => p.x), ys = loc.map(p => p.y);
    const padX = 0.01 * this.length, padY = 0.01 * this.cross;
    return { x0: Math.min(...xs) - padX, x1: Math.max(...xs) + padX,
             y0: Math.min(...ys) - padY, y1: Math.max(...ys) + padY };
  }

  /** Pinning an axis of a bent T has no single meaning; the T is returned as is. */
  pinned() { return this; }

  /** An affine child inside the path's local space. */
  child(offset, sx, sy, rot) {
    return new NestedTransform(this, offset, sx ?? 1, sy ?? 1, rot ?? 0);
  }

  ctxMatrix() { throw new Error('PathTransform: a bent T cannot be baked into ctx; use T.affine'); }
}


/**
 * NestedTransform — an affine child of a PathTransform.  Local → the base's
 * local by origin + R(rot)·(sx·x, sy·y), then the base maps to the screen.
 */
class NestedTransform {
  constructor(base, offset, sx, sy, rot) {
    this.base = base;
    this.origin = { x: offset?.x ?? 0, y: offset?.y ?? 0 };
    this.sx = sx; this.sy = sy; this.rot = rot;
  }

  get isAffine() { return false; }
  get affine()   { return this.base.affine; }

  _toBase(p) {
    const x = p.x * this.sx, y = p.y * this.sy;
    if (!this.rot) return { x: x + this.origin.x, y: y + this.origin.y };
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return { x: x * c - y * s + this.origin.x, y: x * s + y * c + this.origin.y };
  }

  _fromBase(q) {
    let x = q.x - this.origin.x, y = q.y - this.origin.y;
    if (this.rot) {
      const c = Math.cos(this.rot), s = Math.sin(this.rot);
      [x, y] = [x * c + y * s, -x * s + y * c];
    }
    return { x: x / this.sx, y: y / this.sy };
  }

  toScreen(p) { return this.base.toScreen(this._toBase(p)); }
  toLocal(q)  { return this._fromBase(this.base.toLocal(q)); }

  frameAt(p = { x: 0, y: 0 }) {
    const o = this.toScreen(p), px = this.toScreen({ x: p.x + H, y: p.y }), py = this.toScreen({ x: p.x, y: p.y + H });
    return { origin: o, ex: { x: (px.x - o.x) / H, y: (px.y - o.y) / H }, ey: { x: (py.x - o.x) / H, y: (py.y - o.y) / H } };
  }
  scaleAt(p) { const { ex, ey } = this.frameAt(p); return Math.sqrt(Math.abs(ex.x * ey.y - ex.y * ey.x)); }
  get uniformScale() { return this.scaleAt(); }
  get scaleX() { const { ex } = this.frameAt(); return Math.hypot(ex.x, ex.y); }
  get scaleY() { const { ey } = this.frameAt(); return Math.hypot(ey.x, ey.y); }
  angleAt(p) { const { ex } = this.frameAt(p); return Math.atan2(ex.y, ex.x); }

  /** Exact while the child is axis-aligned with the path (no rotation); with
   *  rotation the corners are exact and the edges are the base's bends, an
   *  approximation (an edge of a rotated rect is not an arc after a bend). */
  mapQuad(q0, q1, q2, q3) {
    const r = this.base.mapQuad(...[q0, q1, q2, q3].map(q => this._toBase(q)));
    if (this.rot) r.approx = true;
    return r;
  }
  mapRect(x0, y0, x1, y1) {
    return this.mapQuad({ x: x0, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 });
  }
  localBounds(r) {
    const b = this.base.localBounds(r);
    const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([x, y]) => this._fromBase({ x, y }));
    return { x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)),
             y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) };
  }
  pinned() { return this; }
  child(offset, sx, sy, rot) {
    return new NestedTransform(this.base, this._toBase(offset ?? { x: 0, y: 0 }),
      this.sx * (sx ?? 1), this.sy * (sy ?? 1), this.rot + (rot ?? 0));
  }
  ctxMatrix() { throw new Error('NestedTransform: a bent T cannot be baked into ctx; use T.affine'); }
}


/** A blend of two PathTransforms over the same parent: one T whose k morphs A into B. */
function blendedTransform(A, B, k, opts) {
  return new PathTransform(new BlendedPath(A.path, B.path, k), A.parent,
    { length: opts?.length ?? A.length, cross: opts?.cross ?? A.cross });
}

export { PathTransform, NestedTransform, blendedTransform };
