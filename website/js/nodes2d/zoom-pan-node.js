import { SYS } from '../omni-support/sys.js';
export { ZoomPanNode };

// `zoom-pan` — pan and zoom around a subtree
/* ─────────────────────────────────────────────────────────────────────────────
`zoom-pan` — translates by params.panX/panY and scales by params.zoom around
its subtree, and shifts T by the pan (the zoom is already in T, from the layer).
──────────────────────────────────────────────────────────────────────────── */
class ZoomPanNode {

  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    let z = params.zoom ?? 1;
    ctx.save();
    ctx.translate( (params.panX || 0), params.panY || 0);
    ctx.scale(z, z);

    // Push T: pan only (screen-space shift).
    // Zoom is already in T (pushed by LayerNode).
    node._savedT = ctxMix.T;
    if (ctxMix.T) {
      ctxMix.T = ctxMix.T.shift({
        x: params.panX || 0,
        y: params.panY || 0,
      });
    }
  }

  static after_draw2d(ctxMix, node) {
    ctxMix.ctx?.restore();
    if (node?._savedT) { ctxMix.T = node._savedT; node._savedT = null; }
  }

  static before_hit_test(ctxMix, node, params) {
    ctxMix.panZoom = { panX: params.panX || 0, panY: params.panY || 0 };
    // Push T: pan only (same shift as draw2d)
    node._savedT = ctxMix.T;
    if (ctxMix.T) {
      ctxMix.T = ctxMix.T.shift({
        x: params.panX || 0,
        y: params.panY || 0,
      });
    }
  }

  static after_hit_test(ctxMix, node) {
    if (node?._savedT) { ctxMix.T = node._savedT; node._savedT = null; }
  }
}

SYS.NODE_CLASSES.push({ name: 'zoom-pan', cls: ZoomPanNode });
