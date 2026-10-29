import { SYS } from '../omni-support/sys.js';
export { UncenterNode };

/* ─────────────────────────────────────────────────────────────────────────────
`uncenter` — undoes a parent layer's center:true translate, so nodes that add
W/2, H/2 themselves (the ribbon) don't centre twice. hit_test shifts T the same
way; ribbon-point computes its screen positions independently.
──────────────────────────────────────────────────────────────────────────── */
class UncenterNode {
  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.translate(
      -(ctxMix.W || 0) / 2,
      -(ctxMix.H || 0) / 2 ,
    );
    let z = params.zoom ?? 1;
    ctx.scale( z, z );

    // Push T: undo centering via screen-space shift.
    // Zoom is already in T (pushed by LayerNode), so we
    // do NOT push it again — just shift the origin.
    node._savedT = ctxMix.T;
    if (ctxMix.T) {
      ctxMix.T = ctxMix.T.shift({
        x: -(ctxMix.W || 0) / 2,
        y: -(ctxMix.H || 0) / 2,
      });
    }
  }

  static after_draw2d(ctxMix, node) {
    ctxMix.ctx?.restore();
    if (node?._savedT) { ctxMix.T = node._savedT; node._savedT = null; }
  }

  static before_hit_test(ctxMix, node, params) {
    ctxMix.panZoom = { panX: params.panX || 0, panY: params.panY || 0 };
    // Push T (same shift as draw2d)
    node._savedT = ctxMix.T;
    if (ctxMix.T) {
      ctxMix.T = ctxMix.T.shift({
        x: -(ctxMix.W || 0) / 2,
        y: -(ctxMix.H || 0) / 2,
      });
    }
  }

  static after_hit_test(ctxMix, node) {
    if (node?._savedT) { ctxMix.T = node._savedT; node._savedT = null; }
  }
}

SYS.NODE_CLASSES.push({ name: 'uncenter', cls: UncenterNode });
