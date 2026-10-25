/**
 * transform.js — Scene graph coordinate transform
 *
 * Carries the accumulated mapping from local coordinates to screen
 * coordinates (CSS pixels). Pushed by intermediate nodes (LayerNode,
 * HandleFrameNode), read by leaf nodes (DragPointNode, RibbonPointNode).
 *
 * Convention: no node cascades ctx.translate/scale. Intermediate nodes
 * push T and Box on ctxMix. Leaf nodes call ctxMix.transformedCtx()
 * (local coords, T maps to screen) or ctxMix.directCtx() (screen
 * coords, node uses T.toScreen manually).
 *
 * Place in: omni-support/transform.js
 */

class Transform {
  /**
   * @param {Object}  origin  — { x, y } screen position of local (0,0)
   * @param {number}  sx      — accumulated x scale (local → screen)
   * @param {number}  sy      — accumulated y scale (local → screen)
   */
  constructor(origin, sx, sy) {
    this.origin = origin || { x: 0, y: 0 };
    this.sx = sx ?? 1;
    this.sy = sy ?? 1;
  }

  /** Local → screen. */
  toScreen(local) {
    return {
      x: local.x * this.sx + this.origin.x,
      y: local.y * this.sy + this.origin.y,
    };
  }

  /** Screen → local. */
  toLocal(screen) {
    return {
      x: (screen.x - this.origin.x) / this.sx,
      y: (screen.y - this.origin.y) / this.sy,
    };
  }

  /** Uniform scale (positive = screen pixels per local unit). */
  get uniformScale() {
    return Math.sqrt(Math.abs(this.sx * this.sy));
  }

  /**
   * Push a child transform: translate by offset (in local coords
   * of the current T), then scale.
   */
  child(offset, childSx, childSy) {
    const screen = this.toScreen(offset);
    return new Transform(
      screen,
      this.sx * (childSx ?? 1),
      this.sy * (childSy ?? 1),
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
    );
  }

  /** Apply uniform zoom (multiplies scale, origin unchanged). */
  zoomed(z) {
    return new Transform(this.origin, this.sx * z, this.sy * z);
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
    );
  }

  /** Clone. */
  clone() {
    return new Transform({ ...this.origin }, this.sx, this.sy);
  }
}

export { Transform };
