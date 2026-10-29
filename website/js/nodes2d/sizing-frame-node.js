import { SYS } from '../omni-support/sys.js';
import { CHART_NAT_W, CHART_NAT_H } from './sizing-box-node.js';
export { SizingFrameNode };

// `frame` — a chart sized to the canvas
/* ─────────────────────────────────────────────────────────────────────────────
`frame` — sizes a chart to the canvas: its one child gets width, height and a
centring offset from ctxMix.W/H, as GenericScene.renderAny did. The scene-mode
partner of `box`; a parent `zoom-pan` does the translate and scale.

How the addables use these sizers (frame, box, zoom-pan, uncenter):
  Ribbon   frame: zoom-pan.            addable: uncenter.
  Jatex    frame: zoom-pan, top left.  addable: directly in handle-frame.
  Heatmap  frame: zoom-pan, centred.   addable: directly in handle-frame.
  Chart    frame: zoom-pan then frame. addable: handle-frame then box.
All four display, hit-test and drag correctly.
──────────────────────────────────────────────────────────────────────────── */
//
// GenericScene.renderAny sets the root node to unzoomed
// canvas dimensions centred at (W/2, H/2).  ctx.scale(zoom)
// and ctx.translate(pan) handle the rest.
//
// SizingFrameNode replicates this so that existing chart
// nodes (whose _bounds multiplies by zoom) keep working.
// The parent ZoomScaleNode applies ctx.translate + ctx.scale.
//
// NOTE: this means chart line widths scale with zoom (legacy).
// When chart nodes are converted to manual zoom, ChartFrameNode
// can switch to zoomed dimensions and ZoomScaleNode goes away.

class SizingFrameNode {

  static before_draw2d(ctxMix, node, params) {
    const child = node.subtree?.[0];
    if (!child) return;
    let z = params.zoom || 1
    const W = ctxMix.W || CHART_NAT_W ;
    const H = ctxMix.H || CHART_NAT_H ;
    child.width   = W * 0.92;
    child.height  = H * 0.92;
    // The zoom adjustments gives us centred zooming.
    child.xOffset = W / (2 *z);     
    child.yOffset = H / (2 *z);
  }

  static before_hit_test(ctxMix, node, params) {
    // Set child dimensions (same as draw2d)
    SizingFrameNode.before_draw2d(ctxMix, node, params);

    // Inverse of ZoomPanNode's draw2d: translate(panX,panY) + scale(z)
    // so the chart's geometry (computed in pre-zoom space) matches hitPoint.
    const z    = params.zoom || 1;
    const panX = params.panX || 0;
    const panY = params.panY || 0;
    if (ctxMix.hitPoint) {
      node._savedHitPoint = { ...ctxMix.hitPoint };
      ctxMix.hitPoint = {
        x: (ctxMix.hitPoint.x - panX) / z,
        y: (ctxMix.hitPoint.y - panY) / z,
      };
    }
  }

  static after_hit_test(ctxMix, node, params) {
    if (node._savedHitPoint) {
      ctxMix.hitPoint = node._savedHitPoint;
      node._savedHitPoint = null;
    }
    // Wrap applyDrag so screen coords from pointermove are
    // converted to pre-zoom chart-local coords.
    if (ctxMix.hitResult?.interactions?.applyDrag) {
      const originalDrag = ctxMix.hitResult.interactions.applyDrag;
      const z    = params.zoom || 1;
      const panX = params.panX || 0;
      const panY = params.panY || 0;
      ctxMix.hitResult.interactions.applyDrag = (x, y) => {
        originalDrag((x - panX) / z, (y - panY) / z);
      };
    }
  }
}

SYS.NODE_CLASSES.push({ name: 'frame', cls: SizingFrameNode });
