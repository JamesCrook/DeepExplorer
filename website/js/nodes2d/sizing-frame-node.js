import { SYS } from '../omni-support/sys.js';
import { CHART_NAT_W, CHART_NAT_H } from './sizing-box-node.js';
export { SizingFrameNode };

// `frame` — a chart sized to the canvas
/* ─────────────────────────────────────────────────────────────────────────────
`frame` — sizes its one child to the canvas: width and height 92 % of the
pane, centred on the local origin.  It sits under a centred layer, whose T
carries the pan and the zoom, so the child works in local units and T maps
them to the screen; nothing here touches ctx or the hit point.

The scene-mode partner of `box` (a chart at its natural size, in a
handle-frame).  Since the chart moved onto the general T, neither needs the
old zoom-pan wrapper or the hit-point and drag remapping that went with it.
──────────────────────────────────────────────────────────────────────────── */

class SizingFrameNode {

  static before_draw2d(ctxMix, node, params) {
    const child = node.subtree?.[0];
    if (!child) return;
    const W = ctxMix.W || CHART_NAT_W;
    const H = ctxMix.H || CHART_NAT_H;
    child.width   = W * 0.92;
    child.height  = H * 0.92;
    child.xOffset = 0;                // centre, in the centred layer's local units
    child.yOffset = 0;
  }

  static before_hit_test(ctxMix, node, params) {
    SizingFrameNode.before_draw2d(ctxMix, node, params);
  }
}

SYS.NODE_CLASSES.push({ name: 'frame', cls: SizingFrameNode });
