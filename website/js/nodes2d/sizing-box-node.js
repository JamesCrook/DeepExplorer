import { SYS } from '../omni-support/sys.js';
export { BoxNode, CHART_NAT_W, CHART_NAT_H };

// `box` — a chart at its natural size, in a handle-frame
/* ─────────────────────────────────────────────────────────────────────────────
`box` — a chart's fixed natural size (800 × 600) inside a handle-frame: the
addable-mode partner of `frame`. measure gives handle-frame the size; draw and
hit-test set the child's dimensions and map drags into chart-local space.
──────────────────────────────────────────────────────────────────────────── */

const CHART_NAT_W = 800;
const CHART_NAT_H = 600;

//
// Replaces frame when a chart lives inside handle-frame.
// Provides measure() so handle-frame knows the natural size,
// and before_draw2d() to set child dimensions (the same four
// properties frame sets).
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

    const ctx = ctxMix.ctx;
    if (!ctx) return;
    // Override ctxMix.W/H so chart nodes that read these for
    // centering/sizing see the natural dimensions, not the canvas.
    node._savedW = ctxMix.W;
    node._savedH = ctxMix.H;
    ctxMix.W = CHART_NAT_W;
    ctxMix.H = CHART_NAT_H;
    child.width   = CHART_NAT_W * 0.92 ;
    child.height  = CHART_NAT_H * 0.92 ;
    child.xOffset = CHART_NAT_W / (2);
    child.yOffset = CHART_NAT_H / (2);
  }

  static after_draw2d(ctxMix, node, params) {
    if (node._savedW !== undefined) {
      ctxMix.W = node._savedW;
      ctxMix.H = node._savedH;
      node._savedW = undefined;
    }
  }

  static before_hit_test(ctxMix, node, params) {
    // Set chart dimensions (same as draw2d)
    BoxNode.before_draw2d(ctxMix, node, params);

    // The chart's space is the one T maps here (the parent handle-frame pushes
    // it, with separate x and y scales, matching how it draws the content).
    // So the chart's hit point and drags are both T.toLocal of the screen point.
    if (ctxMix.screenHitPoint && ctxMix.T) {
      node._boxT = ctxMix.T.clone();
      node._boxHitBefore = ctxMix.hitPoint ? { ...ctxMix.hitPoint } : null;
      ctxMix.hitPoint = node._boxT.toLocal(ctxMix.screenHitPoint);
      node._hitResultBefore = ctxMix.hitResult;
      return;
    }

    // Fallback without T: the parent handle-frame transformed hitPoint as
    //   (screenHitPoint - frame.left) / localScale
    // but frame.left is in layer-local space while screenHitPoint includes
    // the layer's center+pan translate.  Correct by subtracting the missing
    // (canvasW/2 + panX) offset, scaled by the handle-frame's localScale.
    if (ctxMix.hitPoint) {
      const ls = ctxMix.contentScale || 1;
      const ctx = ctxMix.ctx;
      const dpr = window.devicePixelRatio || 1;
      const canvasW = ctx.canvas.width / dpr;
      const canvasH = ctx.canvas.height / dpr;
      const panX = params.panX || 0;
      const panY = params.panY || 0;

      node._boxHitState = {
        hitBefore: { ...ctxMix.hitPoint },
        ls, canvasW, canvasH, panX, panY,
      };

      ctxMix.hitPoint = {
        x: ctxMix.hitPoint.x - (canvasW / 2 + panX) / ls,
        y: ctxMix.hitPoint.y - (canvasH / 2 + panY) / ls,
      };
    }

    // Save current hitResult so we only wrap results from our subtree
    node._hitResultBefore = ctxMix.hitResult;
  }

  static after_hit_test(ctxMix, node, params) {
    if (node._boxT) {
      const Ts = node._boxT;
      ctxMix.hitPoint = node._boxHitBefore;
      // Only wrap a hit made in this subtree: screen coords -> chart-local coords.
      const hit = ctxMix.hitResult;
      if (hit && hit !== node._hitResultBefore && hit.interactions?.applyDrag) {
        const originalDrag = hit.interactions.applyDrag;
        hit.interactions.applyDrag = (sx, sy) => {
          const p = Ts.toLocal({ x: sx, y: sy });
          return originalDrag(p.x, p.y);
        };
      }
      node._boxT = null; node._boxHitBefore = null; node._hitResultBefore = null;
      BoxNode.after_draw2d(ctxMix, node, params);
      return;
    }
    const state = node._boxHitState;
    if (state) {
      ctxMix.hitPoint = state.hitBefore;

      // Wrap applyDrag: screen coords → chart-local coords.
      // Only wrap if hitResult was set during our subtree walk.
      if (ctxMix.hitResult && ctxMix.hitResult !== node._hitResultBefore &&
          ctxMix.hitResult.interactions?.applyDrag) {
        const sp = ctxMix.screenHitPoint;
        if (sp) {
          // Recover frame.left from handle-frame's transform:
          //   hitBefore = (screenHitPoint - frame.left) / ls
          const { ls, canvasW, canvasH, panX, panY, hitBefore } = state;
          const frameLeft = sp.x - hitBefore.x * ls;
          const frameTop  = sp.y - hitBefore.y * ls;
          const originalDrag = ctxMix.hitResult.interactions.applyDrag;
          ctxMix.hitResult.interactions.applyDrag = (sx, sy) => {
            originalDrag(
              (sx - canvasW / 2 - panX - frameLeft) / ls,
              (sy - canvasH / 2 - panY - frameTop)  / ls,
            );
          };
        }
      }
      node._boxHitState = null;
    }
    node._hitResultBefore = null;
    BoxNode.after_draw2d(ctxMix, node, params)
  }
}

SYS.NODE_CLASSES.push({ name: 'box', cls: BoxNode });
