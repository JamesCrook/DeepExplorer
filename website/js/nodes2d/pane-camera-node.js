import { SYS, sceneRegistry } from '../omni-support/sys.js';
export { PaneCameraNode };

/* ─────────────────────────────────────────────────────────────────────────────
PaneCameraNode — lightweight camera for per-pane 2D canvases.

Node value properties:
 centerOrigin — true  → world (0,0) maps to pane centre  (charts)
                false → world (0,0) maps to pane top-left (zones)
 zoom, scrollX, scrollY — pan / zoom state (mutated by DemoHarness2D)

DemoHarness2D applies DPR scaling with setTransform(dpr,0,0,dpr,0,0).
This node multiplies on top via ctx.transform so both layers compose.
──────────────────────────────────────────────────────────────────────────── */
class PaneCameraNode {

  static _offsets(ctxMix, node) {
    const v = node.value;
    const cx = v.centerOrigin ? ctxMix.W / 2 : 0;
    const cy = v.centerOrigin ? ctxMix.H / 2 : 0;
    return { cx, cy, z: v.zoom || 1, sx: v.scrollX || 0, sy: v.scrollY || 0 };
  }

  static before_draw2d(ctxMix, node, params) {
    const { cx, cy, z, sx, sy } = PaneCameraNode._offsets(ctxMix, node);
    ctxMix.ctx.transform(z, 0, 0, z, cx - sx * z, cy - sy * z);
  }

/* after_draw2d intentionally omitted — DemoHarness2D resets the 
 transform at the start of every frame so no restore is needed. */

  static before_hit_test(ctxMix, node, params) {
    const { cx, cy, z, sx, sy } = PaneCameraNode._offsets(ctxMix, node);
    node.value._savedHit = ctxMix.hitPoint;
    node.value._savedHitResult = ctxMix.hitResult;
    if (ctxMix.hitPoint) {
      ctxMix.hitPoint = {
        x: (ctxMix.hitPoint.x - cx) / z + sx,
        y: (ctxMix.hitPoint.y - cy) / z + sy,
      };
    }
  }

  static after_hit_test(ctxMix, node, params) {
    ctxMix.hitPoint = node.value._savedHit;

// Only wrap hits produced within this camera's subtree, not pre-existing ones
    if (ctxMix.hitResult?.interactions && ctxMix.hitResult !== node.value._savedHitResult) {
      const inner = ctxMix.hitResult.interactions;
      const { cx, cy, z, sx, sy } = PaneCameraNode._offsets(ctxMix, node);
      const toWorld = (px, py) => ({
        x: (px - cx) / z + sx,
        y: (py - cy) / z + sy,
      });

      if (inner.applyDrag) {
        const origDrag = inner.applyDrag;
        inner.applyDrag = (px, py) => {
          const w = toWorld(px, py);
          return origDrag(w.x, w.y);
        };
      }
      if (inner.endDrag) {
        const origEnd = inner.endDrag;
        inner.endDrag = (...args) => 
          origEnd(...args);
      }
    }
  }
}

SYS.NODE_CLASSES.push({ name: 'pane-camera', cls: PaneCameraNode });;
