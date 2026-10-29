import { SYS } from '../omni-support/sys.js';
export { BoxNode, CHART_NAT_W, CHART_NAT_H };

// `box` — a chart at its natural size, in a handle-frame
/* ─────────────────────────────────────────────────────────────────────────────
`box` — a chart's natural size (800 × 600) inside a handle-frame: the
addable-mode partner of `frame`.  measure gives handle-frame that size; draw
and hit test give the child its dimensions, centred in the box.  The
handle-frame's T maps the box's units to the screen, and the chart draws,
hit-tests and drags through T, so nothing here remaps points.
──────────────────────────────────────────────────────────────────────────── */

const CHART_NAT_W = 800;
const CHART_NAT_H = 600;

class BoxNode {

  static before_measure(ctxMix, node, params) {
    node.box = {
      width()  { return CHART_NAT_W; },
      height() { return CHART_NAT_H; },
      clone()  { return { width: this.width, height: this.height, clone: this.clone }; },
    };
  }

  static before_draw2d(ctxMix, node, params) {
    const child = node.subtree?.[0];
    if (!child) return;
    child.width   = CHART_NAT_W * 0.92;
    child.height  = CHART_NAT_H * 0.92;
    child.xOffset = CHART_NAT_W / 2;
    child.yOffset = CHART_NAT_H / 2;
  }

  static before_hit_test(ctxMix, node, params) {
    BoxNode.before_draw2d(ctxMix, node, params);
  }
}

SYS.NODE_CLASSES.push({ name: 'box', cls: BoxNode });
