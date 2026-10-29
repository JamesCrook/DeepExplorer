// `grid-view` — the OmniGrid renderer as one opaque node
/**
 * A deliberate stop-gap.  GridScene (2d-support/grid-scene.js) draws the whole
 * table itself, with its own camera; this node gives it the pane to draw in
 * and passes it the pointer.  Unwrapping it into real nodes comes later.
 *
 *   node.inst.renderer   the GridScene, created on first use
 *   params               GridScene options (distanceMatrix, colorTarget, …),
 *                        zoom and focusAlign, as the old app's sliders set them
 *
 * Drawing: GridScene draws in its own canvas coordinates, 0..W by 0..H.  The
 * node hands it a stand-in canvas of the pane's size in CSS pixels and, for
 * the length of the draw, the pane's screen-space context.  T is ignored:
 * the grid fills the pane and does its own zoom and scroll.
 *
 * Pointer, as the old app had it:
 *   - press on a cell: focus its run of same-initial rows; drag pans
 *   - press on the A-Z index: focus that letter; drag slides focusAlign
 *   - press on nothing: clear focus; drag pans
 *   - wheel: zoom about the cursor (applyWheel)
 * zoom and focusAlign moved by the pointer are read back by the model
 * (GridViewNode.readBack), which puts them in the layer's params and sliders.
 */

import { SYS } from '../omni-support/sys.js';
import { GridScene } from '../2d-support/grid-scene.js';
import { DataAdapter } from '../data/csv-data.js';

// A canvas-like object: the pane's size, and a context for measuring text.
function makeStandInCanvas() {
  const measure = document.createElement('canvas').getContext('2d');
  return { width: 300, height: 150, getContext: () => measure };
}

function paneSize(ctxMix) {
  const dpr = window.devicePixelRatio || 1;
  return {
    W: ctxMix.W ?? ctxMix.ctx.canvas.width / dpr,
    H: ctxMix.H ?? ctxMix.ctx.canvas.height / dpr,
  };
}

// Option keys the sliders and presets own; everything else in params is ignored.
const OPTION_KEYS = [
  'distanceMatrix', 'reverseRows', 'reverseCols', 'headersAffectWidth',
  'colorTarget', 'colorScheme', 'smoothGradient', 'blobMode', 'textAlign', 'indexOverlay',
];

class GridViewNode {

  /** The renderer, created on first use. */
  static renderer(node) {
    node.inst ??= {};
    node.inst.seen ??= {};
    return node.inst.renderer ??= new GridScene(makeStandInCanvas());
  }

  /** Give the renderer new data (raw GridData, wrapped here). Resets the view. */
  static setData(node, data) {
    const r = GridViewNode.renderer(node);
    r.focus = null;
    r.setData(data ? new DataAdapter(data) : null);
  }

  /** Copy params into the renderer: options, decimal places, zoom, focusAlign. */
  static _sync(node, params, W, H) {
    const r = GridViewNode.renderer(node);
    const st = node.inst;
    if (r.canvas.width !== W || r.canvas.height !== H) {
      r.canvas.width = W;
      r.canvas.height = H;
      r.clampCamera();
    }
    for (const k of OPTION_KEYS) if (params[k] !== undefined) r.options[k] = params[k];
    const dp = Math.round(params.decimalPlaces ?? 2);
    if (dp !== r.options.decimalPlaces) {
      r.options.decimalPlaces = dp;
      r.calculateBaseDimensions();
    }
    // zoom and focusAlign have two writers: the sliders (through params) and
    // the pointer (straight into the renderer).  seen.* is the param value
    // last applied or read back; params differing from it means a slider moved.
    if (params.zoom !== undefined && params.zoom !== st.seen.zoom) {
      r.setZoom(params.zoom);
      st.seen.zoom = params.zoom;
    }
    if (params.focusAlign !== undefined && params.focusAlign !== st.seen.focusAlign && r.focus) {
      r.scrollToFocusAlign(params.focusAlign);
      st.seen.focusAlign = params.focusAlign;
    }
  }

  /**
   * For the model: what the pointer did since params were last applied.
   * Returns { zoom, focusAlign } for the values that moved under the pointer
   * (the model writes them into the layer's params and sliders), and marks
   * them seen.  A node cannot write params itself: the walk restores them.
   */
  static readBack(node, params) {
    const r = node.inst?.renderer;
    if (!r) return {};
    const st = node.inst, moved = {};
    if (params.zoom === st.seen.zoom && r.camera.zoom !== st.seen.zoom) {
      moved.zoom = st.seen.zoom = r.camera.zoom;
    }
    if (r.focus && r.lastLayout && params.focusAlign === st.seen.focusAlign) {
      const t = Math.max(0, Math.min(1, r.getFocusAlignValue()));
      if (Math.abs(t - (st.seen.focusAlign ?? -1)) > 1e-6) moved.focusAlign = st.seen.focusAlign = t;
    }
    return moved;
  }

  /** For the model: the view was reset to zoom; take that as seen. */
  static markZoom(node, zoom) {
    GridViewNode.renderer(node);
    node.inst.seen.zoom = zoom;
  }

  static draw2d(ctxMix, node, params) {
    const { W, H } = paneSize(ctxMix);
    GridViewNode._sync(node, params, W, H);
    const r = node.inst.renderer;
    const ctx = ctxMix.directCtx ? ctxMix.directCtx() : (ctxMix.ctx.save(), ctxMix.ctx);
    const measuring = r.ctx;
    r.ctx = ctx;
    try { r.render(); } finally { r.ctx = measuring; ctx.restore(); }
  }

  static hit_test(ctxMix, node, params) {
    const { W, H } = paneSize(ctxMix);
    GridViewNode._sync(node, params, W, H);
    const r = node.inst.renderer;
    const p = ctxMix.screenHitPoint ?? ctxMix.hitPoint;
    if (!p || p.x < 0 || p.y < 0 || p.x > W || p.y > H) return;

    // hit_test only claims the point; it changes nothing, because the wheel
    // hit-tests too.  The press itself happens on the first applyDrag, which
    // the pane calls at pointer-down.
    let pressed = false, indexDrag = null, last = { ...p };
    const press = () => {
      pressed = true;
      const hit = r.gridData ? r.hitTest(p.x, p.y) : null;
      if (!hit) {
        r.focus = null;
      } else if (hit.type === 'index') {
        r.focus = r.computeFocusFromIndex(hit.row);
        const viewH = r.canvas.height - r.lastLayout.offsetY;
        const t = Math.max(0, Math.min(1, (p.y - r.lastLayout.offsetY) / viewH));
        r.scrollToFocusAlign(t);
        indexDrag = { startT: t, startY: p.y, viewH };
      } else {
        r.focus = r.computeFocusFromDataCell(hit.row, hit.col);
      }
    };

    ctxMix.hitResult = {
      node,
      interactions: {
        applyDrag(x, y) {
          if (!pressed) press();
          if (indexDrag) {
            const t = Math.max(0, Math.min(1, indexDrag.startT + (y - indexDrag.startY) / indexDrag.viewH));
            r.scrollToFocusAlign(t);
          } else {
            r.pan(x - last.x, y - last.y);
            last = { x, y };
          }
        },
        applyWheel(x, y, deltaY) {
          r.zoomAt(deltaY > 0 ? 0.9 : 1.1, x, y);
        },
      },
    };
  }
}

SYS.NODE_CLASSES.push({ name: 'grid-view', cls: GridViewNode });

export { GridViewNode };
