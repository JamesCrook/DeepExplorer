// Transform (T) — the coordinate transform passed down the scene graph
/**
 * Carries the accumulated mapping from local coordinates to screen
 * coordinates (CSS pixels). Pushed by intermediate nodes (LayerNode,
 * HandleFrameNode), read by leaf nodes (DragPointNode, RibbonPointNode).
 *
 * Convention: no node cascades ctx.translate/scale. Intermediate nodes
 * push T and Box on ctxMix. Leaf nodes call ctxMix.transformedCtx()
 * (local coords, T maps to screen) or ctxMix.directCtx() (screen
 * coords, node uses T.toScreen manually).
 *
 * Rotation: rot (radians, clockwise on screen) is optional and 0 by default,
 * so every transform made before it existed behaves exactly as before.  The
 * mapping is  screen = origin + R(rot) · (sx·x, sy·y).  Composing children
 * adds angles and multiplies scales, which is exact when scales are uniform
 * (they are wherever rotation is used: the composite and fit-stage nodes).
 * Code that reads sx, sy or origin directly assumes rot = 0; such code sits
 * outside rotated subtrees.
 *
 * ── The general T interface ──────────────────────────────────
 * T is an interface with two implementations: this affine Transform, and
 * PathTransform (2d-support/path-transform.js), which maps local units onto
 * a bent Path.  Nodes use only these, never the fields, so either works:
 *
 *   toScreen(p), toLocal(q)     the mapping and its inverse
 *   isAffine                    true here
 *   affine                      the nearest affine T: this, or a PathTransform's parent
 *   scaleAt(p), scaleX, scaleY  screen px per local unit (at p; along local x; along y)
 *   uniformScale                scaleAt at the origin
 *   angleAt(p)                  screen angle of the local x axis at p
 *   frameAt(p)                  { origin, ex, ey }: screen point and the screen
 *                               vectors of one local unit along x and y
 *   mapQuad(q0, q1, q2, q3)     { corners, bends } of a local quad, in the
 *                               path.js corner order ([0] start −y, [1] start +y,
 *                               [2] end +y, [3] end −y); bends are arc angles
 *                               per edge, as WarpedPolygon draws them
 *   mapRect(x0, y0, x1, y1)     mapQuad of a rectangle, start at x0
 *   localBounds(rect)           local box covering a screen rect (for culling)
 *   pinned(axis, value)         this T with its screen origin's axis fixed at value
 *   ctxMatrix()                 [a, b, c, d, e, f] for ctx.setTransform (affine only)
 *
 * Place in: omni-support/transform.js
 */

import { Vector2D } from '../2d-support/vector2d.js';

class Transform {
  /**
   * @param {Object}  origin  — { x, y } screen position of local (0,0)
   * @param {number}  sx      — accumulated x scale (local → screen)
   * @param {number}  sy      — accumulated y scale (local → screen)
   * @param {number}  rot     — accumulated rotation in radians (default 0)
   */
  constructor(origin, sx, sy, rot) {
    this.origin = origin || { x: 0, y: 0 };
    this.sx = sx ?? 1;
    this.sy = sy ?? 1;
    this.rot = rot ?? 0;
  }

  /** Local → screen. */
  toScreen(local) {
    const x = local.x * this.sx, y = local.y * this.sy;
    if (!this.rot) return { x: x + this.origin.x, y: y + this.origin.y };
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return { x: x * c - y * s + this.origin.x, y: x * s + y * c + this.origin.y };
  }

  /** Screen → local. */
  toLocal(screen) {
    let x = screen.x - this.origin.x, y = screen.y - this.origin.y;
    if (this.rot) {
      const c = Math.cos(this.rot), s = Math.sin(this.rot);
      [x, y] = [x * c + y * s, -x * s + y * c];
    }
    return { x: x / this.sx, y: y / this.sy };
  }

  /** Uniform scale (positive = screen pixels per local unit). */
  get uniformScale() {
    return Math.sqrt(Math.abs(this.sx * this.sy));
  }

  // ── The general T interface (see the header) ───────────────

  get isAffine() { return true; }
  get affine()   { return this; }

  scaleAt()    { return this.uniformScale; }
  get scaleX() { return this.sx; }
  get scaleY() { return this.sy; }
  angleAt()    { return this.rot; }

  frameAt(p = { x: 0, y: 0 }) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return {
      origin: this.toScreen(p),
      ex: { x: c * this.sx, y: s * this.sx },
      ey: { x: -s * this.sy, y: c * this.sy },
    };
  }

  mapQuad(q0, q1, q2, q3) {
    const v = q => { const p = this.toScreen(q); return new Vector2D(p.x, p.y); };
    return { corners: [v(q0), v(q1), v(q2), v(q3)], bends: [0, 0, 0, 0] };
  }

  mapRect(x0, y0, x1, y1) {
    return this.mapQuad({ x: x0, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 });
  }

  /** Local axis-aligned box { x0, y0, x1, y1 } covering screen rect { x, y, w, h }. */
  localBounds(r) {
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]
      .map(([x, y]) => this.toLocal({ x, y }));
    return {
      x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)),
      y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)),
    };
  }

  /** This T with the screen origin's x or y fixed: content then ignores scroll on that axis. */
  pinned(axis, value) {
    const origin = { ...this.origin, [axis]: value };
    return new Transform(origin, this.sx, this.sy, this.rot);
  }

  ctxMatrix() {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return [c * this.sx, s * this.sx, -s * this.sy, c * this.sy, this.origin.x, this.origin.y];
  }

  /**
   * Push a child transform: translate by offset (in local coords
   * of the current T), then scale.
   */
  child(offset, childSx, childSy, childRot) {
    const screen = this.toScreen(offset);
    return new Transform(
      screen,
      this.sx * (childSx ?? 1),
      this.sy * (childSy ?? 1),
      this.rot + (childRot ?? 0),
    );
  }

  /**
   * Center within a screen-space box, with optional pan.
   * Sets origin to the box center + pan. Keeps existing scale.
   */
  centered(box, pan) {
    const bx = box.tl?.().x ?? box.vecs?.[0]?.x ?? 0;
    const by = box.tl?.().y ?? box.vecs?.[0]?.y ?? 0;
    return new Transform(
      {
        x: bx + box.width() / 2 + (pan?.x || 0),
        y: by + box.height() / 2 + (pan?.y || 0),
      },
      this.sx,
      this.sy,
      this.rot,
    );
  }

  /** Apply uniform zoom (multiplies scale, origin unchanged). */
  zoomed(z) {
    return new Transform(this.origin, this.sx * z, this.sy * z, this.rot);
  }

  /**
   * Offset origin in screen space (not scaled by sx/sy).
   *
   * Use when the offset is already in screen/parent pixels —
   * e.g. undoing a centering translate, or a container's
   * zoomed-pixel offset. Unlike child(), the offset is NOT
   * multiplied by the current scale.
   *
   * ctx equivalent: ctx.translate(dx, dy) when dx/dy are in
   * the coordinate system BEFORE any pending scale.
   */
  shift(screenDelta) {
    return new Transform(
      {
        x: this.origin.x + (screenDelta.x || 0),
        y: this.origin.y + (screenDelta.y || 0),
      },
      this.sx,
      this.sy,
      this.rot,
    );
  }

  /** Clone. */
  clone() {
    return new Transform({ ...this.origin }, this.sx, this.sy, this.rot);
  }
}

export { Transform };
