export { Camera };

// Camera — screen/world conversion and the canvas transform for a 2D pane (the plain object, not a node)

/* ─────────────────────────────────────────────────────────────────────────────
Camera — screen/world conversion and the canvas transform for a 2D pane.

Distinct from pane-camera-node, which is the scene-graph node that carries pan
and zoom as node value.  This is the plain object DemoHarness2D drives.
──────────────────────────────────────────────────────────────────────────── */

class Camera {
  constructor() { this.ox = 0; this.oy = 0; this.z = 1; }
  toWorld(sx, sy)  { return { x: sx / this.z + this.ox, y: sy / this.z + this.oy }; }
  toScreen(wx, wy) { return { x: (wx - this.ox) * this.z, y: (wy - this.oy) * this.z }; }
  apply(ctx) { ctx.setTransform(this.z, 0, 0, this.z, -this.ox * this.z, -this.oy * this.z); }
  reset(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); }
  pan(dsx, dsy) { this.ox -= dsx / this.z; this.oy -= dsy / this.z; }
  zoomAt(sx, sy, factor) {
    const wp = this.toWorld(sx, sy);
    this.z = Math.max(0.15, Math.min(5, this.z * factor));
    this.ox = wp.x - sx / this.z; this.oy = wp.y - sy / this.z;
  }
}
