/**
 * `fit-stage` — a reference area fitted into its box (container)
 *
 * Children are laid out in a fixed reference area, refW × refH local units.
 * The stage scales it uniformly to fit the box it is in (ctxMix.W × H, the
 * pane or a handle-frame's content area) and places the spare space by
 * originX / originY (0 = all to the right/below, 1 = all to the left/above).
 * The same fit as the old animate-scene node, but pushed as T rather than
 * applied to ctx, so it nests inside frames like any other container.
 *
 *   value = { refW, refH, originX, originY }    defaults 620, 500, 0.5, 0.5
 */

import { SYS } from '../omni-support/sys.js';

class FitStageNode {
  static _fit(ctxMix, node) {
    const v = node.value || {};
    const refW = v.refW ?? 620, refH = v.refH ?? 500;
    const W = ctxMix.W ?? refW, H = ctxMix.H ?? refH;
    const sc = Math.min(W / refW, H / refH);
    const off = { x: (v.originX ?? 0.5) * (W - refW * sc), y: (v.originY ?? 0.5) * (H - refH * sc) };
    return ctxMix.T.child(off, sc, sc);
  }

  /** Natural size, for a frame that sizes itself from its content. */
  static before_measure(ctxMix, node) {
    const v = node.value || {};
    const refW = v.refW ?? 620, refH = v.refH ?? 500;
    node.box = { width: () => refW, height: () => refH, clone() { return this; } };
  }

  static before_draw2d(ctxMix, node)  { node._savedT_draw = ctxMix.T; ctxMix.T = FitStageNode._fit(ctxMix, node); }
  static after_draw2d(ctxMix, node)   { ctxMix.T = node._savedT_draw; node._savedT_draw = null; }
  static before_hit_test(ctxMix, node) { node._savedT_hit = ctxMix.T; ctxMix.T = FitStageNode._fit(ctxMix, node); }
  static after_hit_test(ctxMix, node)  { ctxMix.T = node._savedT_hit; node._savedT_hit = null; }
}

SYS.NODE_CLASSES.push({ name: 'fit-stage', cls: FitStageNode });

export { FitStageNode };
