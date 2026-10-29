import { SYS } from '../omni-support/sys.js';
export { NmBoxNode, NM_NAT_W, NM_NAT_H };

/* ─────────────────────────────────────────────────────────────────────────────
`nm-box` — the mask editor inside a handle-frame: children draw into an
offscreen canvas at a fixed natural size (800 × 600) with the nm params from
node.value, then it is composited at the handle-frame's transform. The
addable-mode partner of `nm-frame`, which explains the offscreen canvas.
──────────────────────────────────────────────────────────────────────────── */

const NM_NAT_W = 800;
const NM_NAT_H = 600;

// AST:
//   handle-frame
//     drag-point ⌜
//     drag-point ⌟
//     nm-box { value: { zoom:2, vx:0, vy:0, nmPx:10, … } }
//       grid-bg
//       lloyd → lloyd-directions
//
// Provides measure() so handle-frame knows the natural size.
// Renders children into an offscreen canvas at NM_NAT_W × NM_NAT_H,
// then composites onto the main canvas at the current transform
// (handle-frame has already set position + scale).
//
// node.value contains nm params that are pushed into the shared
// params for children, then popped afterward.  This prevents nm
// params (especially zoom) from leaking into the handle-frame's
// drag-point rendering.

class NmBoxNode {

  // ── Measure: natural size for handle-frame ──

  static before_measure(ctxMix, node, params) {
    node.box = {
      width()  { return NM_NAT_W; },
      height() { return NM_NAT_H; },
      clone()  { return { width: this.width, height: this.height, clone: this.clone }; },
    };
  }

  // ── Draw ──

  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    // ── Push nm params ──
    const nmP = node.value || {};
    node._savedNmP = {};
    for (const k of Object.keys(nmP)) {
      node._savedNmP[k] = params[k];
      params[k] = nmP[k];
    }

    // ── Offscreen canvas at fixed natural size ──
    if (!node._offCanvas) node._offCanvas = document.createElement('canvas');
    if (node._offCanvas.width !== NM_NAT_W || node._offCanvas.height !== NM_NAT_H) {
      node._offCanvas.width  = NM_NAT_W;
      node._offCanvas.height = NM_NAT_H;
    }
    const offCtx = node._offCanvas.getContext('2d', { willReadFrequently: true });
    offCtx.clearRect(0, 0, NM_NAT_W, NM_NAT_H);

    // Redirect children
    node._mainCtx = ctx;
    ctxMix.ctx = offCtx;

    // Override W/H
    node._savedW = ctxMix.W;
    node._savedH = ctxMix.H;
    ctxMix.W = NM_NAT_W;
    ctxMix.H = NM_NAT_H;
  }

  static after_draw2d(ctxMix, node, params) {
    const mainCtx = node._mainCtx;
    if (!mainCtx) return;

    // Restore main ctx
    ctxMix.ctx = mainCtx;

    // Pop nm params
    if (node._savedNmP) {
      for (const [k, v] of Object.entries(node._savedNmP)) {
        if (v === undefined) delete params[k];
        else params[k] = v;
      }
      node._savedNmP = null;
    }

    // Restore W/H
    if (node._savedW !== undefined) {
      ctxMix.W = node._savedW;
      ctxMix.H = node._savedH;
      node._savedW = undefined;
    }

    // Composite offscreen onto main canvas
    // (handle-frame has already set up scale + translate)
    mainCtx.drawImage(node._offCanvas, 0, 0);

    node._mainCtx = null;
  }

  // ── Hit test ──

  static before_hit_test(ctxMix, node, params) {
    // Push nm params
    const nmP = node.value || {};
    node._savedNmP = {};
    for (const k of Object.keys(nmP)) {
      node._savedNmP[k] = params[k];
      params[k] = nmP[k];
    }

    // Override W/H
    node._savedW = ctxMix.W;
    node._savedH = ctxMix.H;
    ctxMix.W = NM_NAT_W;
    ctxMix.H = NM_NAT_H;

    // hitPoint transform: handle-frame already mapped screen→local.
    // Scale from handle-frame-local → offscreen-canvas coords.
    if (ctxMix.hitPoint) {
      node._savedHitPoint = { ...ctxMix.hitPoint };
      const ls = ctxMix.contentScale || 1;
      // handle-frame local coords are in natural-size space
      // (handle-frame divides by scale), so hitPoint should
      // already be roughly in NM_NAT_W × NM_NAT_H range.
      // No extra transform needed here if handle-frame is
      // doing its job — keep as-is and let mask nodes compare.
    }

    node._hitResultBefore = ctxMix.hitResult;
  }

  static after_hit_test(ctxMix, node, params) {
    // Pop nm params
    if (node._savedNmP) {
      for (const [k, v] of Object.entries(node._savedNmP)) {
        if (v === undefined) delete params[k];
        else params[k] = v;
      }
      node._savedNmP = null;
    }

    // Restore W/H
    if (node._savedW !== undefined) {
      ctxMix.W = node._savedW;
      ctxMix.H = node._savedH;
      node._savedW = undefined;
    }

    // Restore hitPoint
    if (node._savedHitPoint) {
      ctxMix.hitPoint = node._savedHitPoint;
      node._savedHitPoint = null;
    }

    // Wrap applyDrag: screen coords → nm-box local coords
    // (mirror BoxNode's approach)
    if (ctxMix.hitResult && ctxMix.hitResult !== node._hitResultBefore &&
        ctxMix.hitResult.interactions?.applyDrag) {
      const sp = ctxMix.screenHitPoint;
      if (sp && node._savedHitPoint) {
        const ls = ctxMix.contentScale || 1;
        const hitBefore = node._savedHitPoint;
        const frameLeft = sp.x - hitBefore.x * ls;
        const frameTop  = sp.y - hitBefore.y * ls;
        const originalDrag = ctxMix.hitResult.interactions.applyDrag;
        ctxMix.hitResult.interactions.applyDrag = (sx, sy) => {
          originalDrag(
            (sx - frameLeft) / ls,
            (sy - frameTop)  / ls,
          );
        };
      }
    }

    node._hitResultBefore = null;
  }
}

SYS.NODE_CLASSES.push({ name: 'nm-box', cls: NmBoxNode });
