import { sceneRegistry } from '../omni-support/scene.js';



/**
 * Ribbon is centred as a frame and handles its own point and is centred as an addable
 * Ribbon frame does zoom-pan
 * Ribbon addable does uncenter.
 * 
 * Displays correctly and hit tests and drags correctly.
 * 
 * Jatex is top left (with margin) as a frame and has a handle frame as an addable
 * Jatex frame does zoom-pan
 * Jatex addable is directly in handle frame
 * 
 * Displays correctly and drags correctly. No hit test required,
 * 
 * Heatmap is centred as a frame, and has a handle frame as an addable
 * Heatmap frame does zoom-pan
 * Heatmap addable is directly in handle frame
 * 
 * Displays correctly and drags correctly. No hit test required,
 * 
 * Chart is centred as a frame and has a handle frame as an addable.
 * Chart frame does zoom-pan and then FrameNode
 * Chart addable does handle frame then FrameBox
 * 
 * Display and dragging do pan and scale correctly. Hit test working and dragging within 
 * chart correctly.
 */



const CHART_NAT_W = 800;
const CHART_NAT_H = 600;

// ═══════════════════════════════════════════════════════
// FRAME — sets child dimensions like GenericScene
// ═══════════════════════════════════════════════════════
//
// GenericScene.renderAny sets the root node to unzoomed
// canvas dimensions centred at (W/2, H/2).  ctx.scale(zoom)
// and ctx.translate(pan) handle the rest.
//
// FrameNode replicates this so that existing chart
// nodes (whose _bounds multiplies by zoom) keep working.
// The parent ZoomScaleNode applies ctx.translate + ctx.scale.
//
// NOTE: this means chart line widths scale with zoom (legacy).
// When chart nodes are converted to manual zoom, ChartFrameNode
// can switch to zoomed dimensions and ZoomScaleNode goes away.

class FrameNode {

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
    FrameNode.before_draw2d(ctxMix, node, params);

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

sceneRegistry.registerNodeClass('frame', FrameNode);


// ═══════════════════════════════════════════════════════
//  BOX NODE — fixed-size sizer for addable mode
// ═══════════════════════════════════════════════════════
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

    // The parent handle-frame already transformed hitPoint as
    //   (screenHitPoint - frame.left) / localScale
    // but that's wrong: frame.left is in layer-local space while
    // screenHitPoint includes the layer's center+pan translate.
    // Correct by subtracting the missing (canvasW/2 + panX) offset,
    // scaled by the handle-frame's localScale.
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

    if (node._savedW !== undefined) {
      ctxMix.W = node._savedW;
      ctxMix.H = node._savedH;
      node._savedW = undefined;
    }
  }
}

sceneRegistry.registerNodeClass('box', BoxNode);


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

sceneRegistry.registerNodeClass('zoom-pan', ZoomPanNode);

// ═══════════════════════════════════════════════════════
//  UNCENTER NODE — undoes a parent layer's center:true
//  translate so nodes that internally add W/2, H/2
//  (like the ribbon node) don't double-centre.
//  hit_test: no adjustment — ribbon-point computes screen
//  positions independently using W/2 + panX.
// ═══════════════════════════════════════════════════════

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

sceneRegistry.registerNodeClass('uncenter', UncenterNode);



/**
 * nm-sizing-nodes.js
 *
 * Sizing nodes for nanometre coordinate space (mask editor).
 * Analogous to sizing-nodes.js (FrameNode / BoxNode) for charts.
 *
 * Two nodes:
 *   nm-frame  — scene mode: offscreen at PHYSICAL pixel size (1:1 blit)
 *   nm-box    — addable mode: fixed natural size inside handle-frame
 *
 * Both redirect children to an offscreen canvas so that:
 *   1. Mask nodes can getImageData without slow GPU→CPU readback
 *      from the composited main canvas (willReadFrequently: true)
 *   2. Sibling nodes (chip-layer) can read the buffer for Sobel
 *      edge detection without interference from other layers
 *   3. ctxMix.W / ctxMix.H are set for children
 *
 * nm-frame sizes its offscreen to the main canvas's PHYSICAL pixel
 * dimensions (read via ctx.getTransform()) so the composite is a
 * direct 1:1 blit — no scaling, no interpolation.
 *
 * Layer convention for nm-frame:
 *   - Layer must NOT use center:true (mask nodes centre via nm2screen)
 *   - Layer params include: { zoom, vx, vy, nmPx, ... }
 *   - Cursor-anchored zoom is handled by Omni2d detecting 'vx' in params
 *
 * Place in: nodes2d/nm-sizing-nodes.js
 */



/**
 * nm-sizing-nodes.js
 *
 * Sizing nodes for nanometre coordinate space (mask editor).
 * Analogous to sizing-nodes.js (FrameNode / BoxNode) for charts.
 *
 * Two nodes:
 *   nm-frame  — scene mode: offscreen at CSS-pixel size + DPR-scaled blit
 *   nm-box    — addable mode: fixed natural size inside handle-frame
 *
 * Both redirect children to an offscreen canvas so that:
 *   1. Mask nodes can getImageData without slow GPU→CPU readback
 *      from the composited main canvas (willReadFrequently: true)
 *   2. Sibling nodes (chip-layer) can read the buffer for Sobel
 *      edge detection without interference from other layers
 *   3. ctxMix.W / ctxMix.H are set for children
 *
 * nm-frame sizes its offscreen to CSS-pixel dimensions (matching
 * OmniMask standalone) so per-pixel shaders do the same work and
 * widgets are the same size.  The composite uses the ctx's DPR
 * scale (via getTransform) for a GPU-accelerated blit.
 * The real performance key is willReadFrequently — without it,
 * every getImageData stalls on a GPU→CPU readback.
 *
 * Layer convention for nm-frame:
 *   - Layer must NOT use center:true (mask nodes centre via nm2screen)
 *   - Layer params include: { zoom, vx, vy, nmPx, ... }
 *   - Cursor-anchored zoom is handled by Omni2d detecting 'vx' in params
 *
 * Place in: nodes2d/nm-sizing-nodes.js
 */


const NM_NAT_W = 800;
const NM_NAT_H = 600;


// ═══════════════════════════════════════════════════════
//  NM-FRAME — scene-mode sizer
// ═══════════════════════════════════════════════════════
//
// AST:
//   layer { center:false, params: { zoom, vx, vy, nmPx, … } }
//     nm-frame
//       grid-bg
//       lloyd → lloyd-directions
//       …
//
// Offscreen canvas at CSS-pixel resolution — same pixel count
// as OmniMask standalone, so per-pixel shaders (lloyd, chip-layer)
// do the same amount of work and widgets are the same size.
//
// The offscreen context is created with willReadFrequently:true
// so getImageData (Sobel, lloyd pixel loop) stays CPU-side
// instead of stalling on GPU→CPU readback.
//
// The composite uses the ctx's DPR scale (from getTransform)
// to blit the CSS-pixel image to the physical canvas.  This
// is a GPU-accelerated texture sample — trivially fast
// compared to the per-pixel computation.
//
// Because both the offscreen and hitPoint are in CSS-pixel
// space, hit_test needs no coordinate transform at all.

class NmFrameNode {

  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    // Read the live transform — we need the scale factors
    // for the blit and the CSS-pixel dimensions.
    const xf = ctx.getTransform();
    node._xf = xf;

    // CSS-pixel dimensions (physical ÷ DPR scale)
    const W = Math.round(ctx.canvas.width  / xf.a);
    const H = Math.round(ctx.canvas.height / xf.d);

    // ── Offscreen at CSS-pixel size ──
    if (!node._offCanvas) node._offCanvas = document.createElement('canvas');
    if (node._offCanvas.width !== W || node._offCanvas.height !== H) {
      node._offCanvas.width  = W;
      node._offCanvas.height = H;
    }
    const offCtx = node._offCanvas.getContext('2d', { willReadFrequently: true });
    offCtx.clearRect(0, 0, W, H);

    // Redirect children to offscreen — no transform, children
    // draw in CSS-pixel space via nm2screen, matching OmniMask.
    node._mainCtx = ctx;
    ctxMix.ctx    = offCtx;

    node._savedW = ctxMix.W;
    node._savedH = ctxMix.H;
    ctxMix.W = W;
    ctxMix.H = H;
  }

  static after_draw2d(ctxMix, node, params) {
    const mainCtx = node._mainCtx;
    if (!mainCtx) return;

    ctxMix.ctx = mainCtx;
    if (node._savedW !== undefined) {
      ctxMix.W = node._savedW;
      ctxMix.H = node._savedH;
      node._savedW = undefined;
    }

    // Blit with DPR scale only (drop any parent translate
    // so the mask fills from canvas origin).  The GPU handles
    // the 1× → 2× upscale as a fast texture sample.
    const xf = node._xf;
    mainCtx.save();
    mainCtx.setTransform(xf.a, 0, 0, xf.d, 0, 0);
    mainCtx.drawImage(node._offCanvas, 0, 0);
    mainCtx.restore();

    node._mainCtx = null;
  }

  // ── Hit test ──
  //
  // Both hitPoint (from Omni2d) and ctxMix.W/H are in
  // CSS-pixel space — same coordinate system as the
  // offscreen.  No transform needed.

  static before_hit_test(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const xf = ctx.getTransform();

    node._savedW = ctxMix.W;
    node._savedH = ctxMix.H;
    ctxMix.W = Math.round(ctx.canvas.width  / xf.a);
    ctxMix.H = Math.round(ctx.canvas.height / xf.d);
  }

  static after_hit_test(ctxMix, node, params) {
    if (node._savedW !== undefined) {
      ctxMix.W = node._savedW;
      ctxMix.H = node._savedH;
      node._savedW = undefined;
    }
  }
}

sceneRegistry.registerNodeClass('nm-frame', NmFrameNode);


// ═══════════════════════════════════════════════════════
//  NM-BOX — addable-mode sizer (inside handle-frame)
// ═══════════════════════════════════════════════════════
//
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

sceneRegistry.registerNodeClass('nm-box', NmBoxNode);


export { NmFrameNode, NmBoxNode, NM_NAT_W, NM_NAT_H };