/* ============================================
   CameraNode — Scene-graph camera (Blender-style)
   ============================================

   Flyweight node: all methods are static, state lives on the MiniAstNode.

   State on the node (set via CameraNode.init or manually):
     node.camera        = { x, y, zoom }
     node.zoomRange     = { min, max }
     node.viewOffset    = { x, y }        — fixed offset, OR
     node.viewOffsetFn  = (zoom) => {x,y} — zoom-dependent offset
     node.applyTransform = true|false      — whether to push ctx transform

   ctxMix contract:
     Writes  ctxMix.camera  in every before_ hook so children can read it.
     When applyTransform is true:
       before_draw2d   ctx.save()  + translate(vo) scale(zoom) translate(-cam)
       after_draw2d    ctx.restore()
       before_hitTest  inverse-transforms ctxMix.hitPoint into camera space
       after_hitTest   restores ctxMix.hitPoint

   Direct-call utilities (not phases — called by app / makeMouseWatchers):
     CameraNode.pan(node, dx, dy)
     CameraNode.zoomAt(node, factor, px, py)
     CameraNode.setZoom(node, zoom)
     CameraNode.resetView(node)

   Camera transform model:
     screen = viewOffset + zoom × (world − camera)

   This is the standard translate-scale-translate used by GridScene.
   For centre-pivot scenes (keyboards etc.) set viewOffset to (W/2, H/2)
   and camera to (0, 0).  Content draws around the world origin and the
   camera transform handles everything — nodes should NOT multiply by
   zoom internally.

   Clamping:
     CameraNode does not know content bounds.  After pan/zoomAt, the app
     should dispatch a 'clampCamera' phase so content nodes (e.g.
     GridCellsNode) can constrain ctxMix.camera.  Alternatively, pass
     an onClamp callback to pan/zoomAt.
*/

class CameraNode2d {

  // ── Initialisation ──────────────────────────────────────────

  /**
   * Attach camera state to a MiniAstNode.
   * Returns the node for chaining.
   *
   * @param {MiniAstNode} node
   * @param {Object}  [opts]
   * @param {number}  [opts.zoom=1]
   * @param {Object}  [opts.viewOffset]     – fixed {x,y}
   * @param {Function}[opts.viewOffsetFn]   – (zoom) => {x,y}
   * @param {Object}  [opts.zoomRange]      – {min, max}
   * @param {boolean} [opts.applyTransform] – default true
   */
  static init(node, opts = {}) {
    node.camera = { x: 0, y: 0, zoom: opts.zoom ?? 1 };
    node.viewOffset    = opts.viewOffset   ?? { x: 0, y: 0 };
    node.viewOffsetFn  = opts.viewOffsetFn ?? null;
    node.zoomRange     = opts.zoomRange    ?? { min: 0.1, max: 10 };
    node.applyTransform = opts.applyTransform !== false;
    return node;
  }

  // ── Internal ────────────────────────────────────────────────

  /**
   * Resolve viewOffset at a given zoom level.
   * Uses viewOffsetFn if present, otherwise the fixed viewOffset.
   */
  static _vo(node, zoom) {
    if (node.viewOffsetFn) return node.viewOffsetFn(zoom);
    return node.viewOffset ?? { x: 0, y: 0 };
  }

  // ── Phase methods: measure ─────────────────────────────────

  static before_measure(ctxMix, node, params) {
    ctxMix.camera = node.camera;
  }

  /**
   * After children have measured, absorb any viewOffset / zoomRange
   * they wrote to ctxMix.  This lets content nodes advertise their
   * requirements without needing a direct reference to the camera node.
   */
  static after_measure(ctxMix, node, params) {
    if (ctxMix.viewOffset) node.viewOffset = ctxMix.viewOffset;
    if (ctxMix.zoomRange)  node.zoomRange  = ctxMix.zoomRange;
  }

  // ── Phase methods: draw2d ──────────────────────────────────

  static before_draw2d(ctxMix, node, params) {
    ctxMix.camera = node.camera;
    if (!node.applyTransform) return;

    const ctx = ctxMix.ctx;
    const cam = node.camera;
    const vo  = CameraNode._vo(node, cam.zoom);

    ctx.save();
    ctx.translate(vo.x, vo.y);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
  }

  static after_draw2d(ctxMix, node, params) {
    if (!node.applyTransform) return;
    ctxMix.ctx.restore();
  }

  // ── Phase methods: hitTest ─────────────────────────────────

  static before_hitTest(ctxMix, node, params) {
    ctxMix.camera = node.camera;
    if (!node.applyTransform || !ctxMix.hitPoint) return;

    const cam = node.camera;
    const vo  = CameraNode._vo(node, cam.zoom);

    node._savedHitPoint = { ...ctxMix.hitPoint };
    ctxMix.hitPoint = {
      x: (ctxMix.hitPoint.x - vo.x) / cam.zoom + cam.x,
      y: (ctxMix.hitPoint.y - vo.y) / cam.zoom + cam.y,
    };
  }

  static after_hitTest(ctxMix, node, params) {
    if (!node.applyTransform || !node._savedHitPoint) return;
    ctxMix.hitPoint = node._savedHitPoint;
    node._savedHitPoint = null;
  }

  // ── Phase methods: clampCamera ─────────────────────────────
  //
  // CameraNode itself has no content bounds.  It publishes the
  // camera so children can clamp it during the walk.

  static before_clampCamera(ctxMix, node, params) {
    ctxMix.camera = node.camera;
  }

  // ── Direct-call utilities ──────────────────────────────────
  //
  // These mutate node.camera immediately.  They are called by
  // the app or by makeMouseWatchers — not by the registry walk.
  //
  // Each accepts an optional `clamp` callback invoked after the
  // mutation, e.g.  () => registry.runPhases(ctxMix, root, params, ['clampCamera'])

  /**
   * Pan by a screen-space delta.
   *
   * screen = vo + zoom × (world − cam)
   * ∴ Δcam = −Δscreen / zoom
   */
  static pan(node, dx, dy, clamp) {
    const cam = node.camera;
    cam.x -= dx / cam.zoom;
    cam.y -= dy / cam.zoom;
    if (clamp) clamp();
  }

  /**
   * Zoom toward a screen-space point (px, py) by a multiplicative factor.
   *
   * The world point under (px, py) before the zoom is:
   *   w = (p − vo_old) / zoom_old + cam
   *
   * After the zoom we want the same world point under (px, py):
   *   cam_new = w − (p − vo_new) / zoom_new
   *
   * viewOffset is evaluated at both old and new zoom so that
   * zoom-dependent chrome (e.g. grid headers that fade at low zoom)
   * stays correctly anchored.
   */
  static zoomAt(node, factor, px, py, clamp) {
    const cam   = node.camera;
    const range = node.zoomRange;
    const voOld = CameraNode._vo(node, cam.zoom);

    // World point under cursor at current zoom
    const wx = (px - voOld.x) / cam.zoom + cam.x;
    const wy = (py - voOld.y) / cam.zoom + cam.y;

    const newZoom = Math.max(range.min,
                   Math.min(range.max, cam.zoom * factor));
    const voNew = CameraNode._vo(node, newZoom);

    cam.x    = wx - (px - voNew.x) / newZoom;
    cam.y    = wy - (py - voNew.y) / newZoom;
    cam.zoom = newZoom;

    if (clamp) clamp();
  }

  /**
   * Set zoom directly (e.g. from a slider).  Clamps to zoomRange.
   * Does not adjust camera position — for focal-point zoom use zoomAt.
   */
  static setZoom(node, zoom, clamp) {
    const range = node.zoomRange;
    node.camera.zoom = Math.max(range.min,
                       Math.min(range.max, zoom));
    if (clamp) clamp();
  }

  /**
   * Reset to default view (origin, zoom 1).
   */
  static resetView(node) {
    node.camera.x    = 0;
    node.camera.y    = 0;
    node.camera.zoom = 1;
  }
}


export { CameraNode2d };