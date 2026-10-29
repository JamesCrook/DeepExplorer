import { SYS } from '../omni-support/sys.js';
export { NmFrameNode };

/* ─────────────────────────────────────────────────────────────────────────────
`nm-frame` — the mask editor's scene-mode sizer: children draw into an offscreen
canvas at CSS-pixel size, which is then blitted at the device pixel ratio. The
partner of `nm-box`.

Both nm sizers redirect their children to an offscreen canvas so that:
  1. mask nodes can getImageData without a slow GPU→CPU readback from the
     composited main canvas (the context is made with willReadFrequently)
  2. sibling nodes (chip-layer) can read the buffer for Sobel edge detection
     without interference from other layers
  3. ctxMix.W / ctxMix.H are set for children
CSS-pixel size matches OmniMask standalone, so per-pixel shaders do the same
work and widgets are the same size.

Layer convention for nm-frame:
  - the layer must NOT use center:true (mask nodes centre via nm2screen)
  - layer params include { zoom, vx, vy, nmPx, … }
  - cursor-anchored zoom is handled by Omni2d detecting 'vx' in params
──────────────────────────────────────────────────────────────────────────── */

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
    if (!node.subtree?.length) return;   // childless: unchanged from before walkPhase gave containers their hooks
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
    if (!node.subtree?.length) return;   // childless: unchanged from before walkPhase gave containers their hooks
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
    if (!node.subtree?.length) return;   // childless: unchanged from before walkPhase gave containers their hooks
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const xf = ctx.getTransform();

    node._savedW = ctxMix.W;
    node._savedH = ctxMix.H;
    ctxMix.W = Math.round(ctx.canvas.width  / xf.a);
    ctxMix.H = Math.round(ctx.canvas.height / xf.d);
  }

  static after_hit_test(ctxMix, node, params) {
    if (!node.subtree?.length) return;   // childless: unchanged from before walkPhase gave containers their hooks
    if (node._savedW !== undefined) {
      ctxMix.W = node._savedW;
      ctxMix.H = node._savedH;
      node._savedW = undefined;
    }
  }
}

SYS.NODE_CLASSES.push({ name: 'nm-frame', cls: NmFrameNode });
