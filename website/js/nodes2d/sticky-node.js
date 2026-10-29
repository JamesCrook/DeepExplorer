// `sticky` — a band of a pane that ignores the scroll on one axis
/**
 * `sticky` — a container for a band of a pane: column headers that keep to
 * the top while the columns pan sideways, row names that keep to the left
 * while the rows scroll.  It changes no drawing of its own: its children are
 * the same nodes as the pane's body (OmniGrid's header row is a table-cell
 * flyweight like the table), so headers line up with the columns by
 * construction (docs/general-t-and-grid-unwrap.md 4.2).
 *
 *   value = {
 *     band:        name of a rect the parent puts in ctxMix.bands
 *     pin:         'x' | 'y' | null    the T axis to fix at the band's edge
 *     params:      { … }               params for this band's subtree
 *     fill:        CSS colour for the band's background, or null
 *     interactive: false               hits in the band carry no interactions
 *   }
 *
 * ctxMix.bands[band] = { x, y, w, h, alpha }, in screen px, set by the parent
 * (grid-viewport).  alpha fades the band (headers fade out at heatmap zoom);
 * a band with no size or no alpha is skipped.
 *
 * What it does, before its children: T becomes T.pinned(pin, band edge), so
 * the children see the parent's scroll on the other axis only; the canvas is
 * clipped to the band, and ctxMix.clipRect is the band (for culling); params
 * get the band's overrides.  All restored after.  Hit testing skips the band
 * when the point is outside it, and tags a hit made inside with the band's
 * name (hitResult.band), so the parent can tell what was pressed.
 */

import { SYS } from '../omni-support/sys.js';
import { skipChildren } from '../omni-support/scene.js';

class StickyNode {

  static _band(ctxMix, node) {
    const b = ctxMix.bands?.[node.value?.band];
    if (!b || b.w <= 0 || b.h <= 0 || (b.alpha ?? 1) < 0.01) return null;
    return b;
  }

  static _push(ctxMix, node, params, b) {
    const v = node.value || {};
    node._saved = { T: ctxMix.T, clipRect: ctxMix.clipRect, params: {} };
    if (v.pin && ctxMix.T?.pinned) ctxMix.T = ctxMix.T.pinned(v.pin, v.pin === 'x' ? b.x : b.y);
    ctxMix.clipRect = { x: b.x, y: b.y, w: b.w, h: b.h };
    for (const [k, val] of Object.entries(v.params || {})) {
      node._saved.params[k] = params[k];
      params[k] = val;
    }
  }

  static _pop(ctxMix, node, params) {
    const s = node._saved;
    if (!s) return;
    ctxMix.T = s.T;
    ctxMix.clipRect = s.clipRect;
    for (const [k, val] of Object.entries(s.params)) {
      if (val === undefined) delete params[k]; else params[k] = val;
    }
    node._saved = null;
  }

  static before_draw2d(ctxMix, node, params) {
    const b = StickyNode._band(ctxMix, node);
    if (!b) { node._saved = null; skipChildren(ctxMix); return; }
    StickyNode._push(ctxMix, node, params, b);
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha *= b.alpha ?? 1;
    if (node.value?.fill) { ctx.fillStyle = node.value.fill; ctx.fillRect(b.x, b.y, b.w, b.h); }
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    node._ctxSaved = true;
  }

  static after_draw2d(ctxMix, node, params) {
    if (node._ctxSaved) { ctxMix.ctx.restore(); node._ctxSaved = false; }
    StickyNode._pop(ctxMix, node, params);
  }

  static before_hit_test(ctxMix, node, params) {
    const b = StickyNode._band(ctxMix, node);
    const p = ctxMix.screenHitPoint ?? ctxMix.hitPoint;
    node._hitBefore = ctxMix.hitResult;
    if (!b || !p || p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) {
      node._saved = null; skipChildren(ctxMix); return;
    }
    StickyNode._push(ctxMix, node, params, b);
  }

  static after_hit_test(ctxMix, node, params) {
    StickyNode._pop(ctxMix, node, params);
    const hit = ctxMix.hitResult;
    if (hit && hit !== node._hitBefore) {
      if (node.value?.interactive === false) ctxMix.hitResult = { band: node.value.band };
      else hit.band = node.value?.band;
    }
    node._hitBefore = null;
  }
}

SYS.NODE_CLASSES.push({ name: 'sticky', cls: StickyNode });

export { StickyNode };
