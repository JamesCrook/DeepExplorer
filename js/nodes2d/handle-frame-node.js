/**
 * handle-frame-node.js
 *
 * A generic framing node with two drag-point children that define
 * a bounding rectangle.  Content children (any non-drag-point) are
 * drawn inside that rectangle with a ctx.translate + ctx.scale
 * transform computed from the frame width and the content's
 * measured natural width (aspect-ratio preserving).
 *
 * Optionally draws a filled rounded-rect background.
 *
 * AST shape:
 *
 *   handle-frame  (value.fill = '#rrggbbaa' | null)
 *     drag-point  (⌜ corner)
 *     drag-point  (⌟ corner)
 *     [content]   (optional — jatex, chart, …)
 *
 * Coordinate spaces:
 *   • Drag-points live in the parent (layer) coordinate space.
 *     They continue to handle their own zoom multiplication and
 *     hit-test math — nothing changes for them.
 *   • Content children draw in a local space starting at (0, 0)
 *     with their natural (measured) dimensions. The handle-frame
 *     wraps them in ctx.translate(left, top) + ctx.scale(s, s).
 *
 * contentScale (on ctxMix):
 *   Accumulated total scale from canvas root to the current
 *   drawing context.  Nodes that want zoom-independent strokes
 *   divide by ctxMix.contentScale.  Each handle-frame saves,
 *   multiplies, and restores — so nesting works.
 *
 * Fill:
 *   If node.value.fill is set, draws a filled rect with that
 *   colour (supports 8-hex #RRGGBBAA).  Falls back to
 *   params.color + params.fillOpacity when fill is null.
 *   If neither is set, no fill is drawn.
 *
 * Place in: nodes2d/handle-frame-node.js
 */

import { sceneRegistry } from '../omni-support/scene.js';


class HandleFrameNode {

  // ── Frame geometry from the two drag-point children ────

  static _getFrame(node, params) {
    const ch = node.subtree;
    if (!ch || ch.length < 2) return null;

    const zoom = params.zoom || 1;
    const p0 = ch[0].value || {};
    const p1 = ch[1].value || {};
    const x0 = (p0.x || 0) * zoom;
    const y0 = (p0.y || 0) * zoom;
    const x1 = (p1.x || 0) * zoom;
    const y1 = (p1.y || 0) * zoom;

    return {
      left:   Math.min(x0, x1),
      top:    Math.min(y0, y1),
      width:  Math.abs(x1 - x0),
      height: Math.abs(y1 - y0),
    };
  }

  /** Un-zoomed frame — local coordinates for T calculations. */
  static _getFrameLocal(node) {
    const ch = node.subtree;
    if (!ch || ch.length < 2) return null;
    const p0 = ch[0].value || {};
    const p1 = ch[1].value || {};
    return {
      left:   Math.min(p0.x || 0, p1.x || 0),
      top:    Math.min(p0.y || 0, p1.y || 0),
      width:  Math.abs((p1.x || 0) - (p0.x || 0)),
      height: Math.abs((p1.y || 0) - (p0.y || 0)),
    };
  }

  // ── Resolve fill colour + opacity ─────────────────────

  static _getFill(node, params) {
    const fill = node.value?.fill;
    if (fill) return { color: fill, opacity: 1 };
    if (params.color) return { color: params.color, opacity: params.fillOpacity ?? 1 };
    return null;
  }

  // ══════════════════════════════════════════════════════
  //  MEASURE — capture the content's natural dimensions
  // ══════════════════════════════════════════════════════

  static before_measure(ctxMix, node, params){
    node = node;
  }

  static after_measure(ctxMix, node, params) {
    for (const child of (node.subtree || [])) {
      if (child.token === 'drag-point') continue;
      if (child.box) {
        node._naturalWidth  = child.box.width();
        node._naturalHeight = child.box.height();
        break;                       // first content child wins
      }
    }
  }

  // ══════════════════════════════════════════════════════
  //  LAYOUT — give content children a clean (0,0) origin
  // ══════════════════════════════════════════════════════

  static before_child_layout(ctxMix, node, params, child) {
    if (child.token === 'drag-point') return;
    node._savedLayout = ctxMix.layout ? { ...ctxMix.layout } : { x: 0, y: 0 };
    ctxMix.layout = { x: 0, y: 0 };

    // For stretchContent: expose actual frame pixel dimensions
    if (node.value?.stretchContent) {
      const frame = HandleFrameNode._getFrame(node, params);
      if (frame) ctxMix._contentFrame = frame;
    }
  }

  static after_child_layout(ctxMix, node, params, child) {
    if (child.token === 'drag-point') return;
    if (node._savedLayout) {
      ctxMix.layout = node._savedLayout;
      node._savedLayout = null;
    }
    delete ctxMix._contentFrame;
  }

  // ══════════════════════════════════════════════════════
  //  DRAW — fill background, then transform content
  // ══════════════════════════════════════════════════════

  static before_draw2d(ctxMix, node, params) {
    const fill = HandleFrameNode._getFill(node, params);
    if (!fill) return;

    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const frame = HandleFrameNode._getFrame(node, params);
    if (!frame || frame.width < 1) return;

    const r = Math.min(params.roundedCorners || 0, frame.width / 2, frame.height / 2);

    ctx.save();
    ctx.globalAlpha = fill.opacity;
    ctx.fillStyle   = fill.color;

    if (r > 0 && ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(frame.left, frame.top, frame.width, frame.height, r);
      ctx.fill();
      ctx.strokeStyle = '#ffffff33';
      ctx.lineWidth   = 1;
      ctx.stroke();
    } else {
      ctx.fillRect(frame.left, frame.top, frame.width, frame.height);
      ctx.strokeStyle = '#ffffff33';
      ctx.lineWidth   = 1;
      ctx.strokeRect(frame.left, frame.top, frame.width, frame.height);
    }
    ctx.restore();
  }

  // ── Content children: translate + scale ───────────────

  static before_child_draw2d(ctxMix, node, params, child) {
    if (child.token === 'drag-point') return;

    const frame = HandleFrameNode._getFrame(node, params);
    if (!frame || frame.width < 1) return;

    const ctx = ctxMix.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.translate(frame.left, frame.top);

    node._savedContentScale = ctxMix.contentScale ?? 1;
    node._savedW = ctxMix.W;
    node._savedH = ctxMix.H;
    node._savedBox = ctxMix.box;

    // ── Push T alongside existing ctx ──
    node._savedT = ctxMix.T;
    const localFrame = HandleFrameNode._getFrameLocal(node);

    if (node.value?.stretchContent) {
      // No scaling — content draws at actual frame pixel dimensions
      ctxMix.W = frame.width;
      ctxMix.H = frame.height;
      ctxMix.box = { _w: frame.width, _h: frame.height,
                     width() { return this._w; }, height() { return this._h; },
                     tl() { return { x: 0, y: 0 }; } };

      if (ctxMix.T && localFrame) {
        ctxMix.T = ctxMix.T.child(
          { x: localFrame.left, y: localFrame.top }, 1, 1);
      }
    } else {
      const nw = node._naturalWidth;
      if (!nw) { ctx.restore(); return; }
      const nh = node._naturalHeight || nw;

      const scaleX = frame.width  / nw;
      const scaleY = frame.height / nh;
      ctx.scale(scaleX, scaleY);

      ctxMix.contentScale = node._savedContentScale * Math.sqrt(scaleX * scaleY);
      ctxMix.W = nw;
      ctxMix.H = nh;
      ctxMix.box = { _w: nw, _h: nh,
                     width() { return this._w; }, height() { return this._h; },
                     tl() { return { x: 0, y: 0 }; } };

      if (ctxMix.T && localFrame) {
        ctxMix.T = ctxMix.T.child(
          { x: localFrame.left, y: localFrame.top },
          localFrame.width / nw, localFrame.height / nh);
      }
    }

    node._didTransform = true;
  }

  static after_child_draw2d(ctxMix, node, params, child) {
    if (child.token === 'drag-point') return;
    if (!node._didTransform) return;
    node._didTransform = false;

    ctxMix.ctx?.restore();
    ctxMix.contentScale = node._savedContentScale ?? 1;

    if (node._savedW !== undefined) {
      ctxMix.W = node._savedW;
      ctxMix.H = node._savedH;
      node._savedW = undefined;
    }
    if (node._savedBox) { ctxMix.box = node._savedBox; node._savedBox = null; }

    // ── Pop T ──
    if (node._savedT) {
      ctxMix.T = node._savedT;
      node._savedT = null;
    }
  }

  // ══════════════════════════════════════════════════════
  //  HIT TEST — draggable mode + inverse transform
  // ══════════════════════════════════════════════════════

  /**
   * When node.value.draggable is true, clicking the frame body
   * drags both corners by the same delta (translating the frame).
   * Corner drag-points still override during recursion for resizing.
   */
  static before_hit_test(ctxMix, node, params) {
    if (!node.value?.draggable) return;

    const pt = ctxMix.hitPoint;
    if (!pt) return;

    const frame = HandleFrameNode._getFrame(node, params);
    if (!frame || frame.width < 1) return;

    const zoom = params.zoom || 1;
    const panX = params.panX || 0;
    const panY = params.panY || 0;
    const cxS  = (ctxMix.W || 0) / 2;
    const cyS  = (ctxMix.H || 0) / 2;

    // Screen-space AABB
    const sLeft = frame.left + panX + cxS;
    const sTop  = frame.top  + panY + cyS;

    if (pt.x >= sLeft && pt.x <= sLeft + frame.width &&
        pt.y >= sTop  && pt.y <= sTop  + frame.height) {

      const ch = node.subtree;
      const p0 = ch[0].value;
      const p1 = ch[1].value;

      // Capture starting positions
      const startP0x = p0.x, startP0y = p0.y;
      const startP1x = p1.x, startP1y = p1.y;
      const midSx = sLeft + frame.width  / 2;
      const midSy = sTop  + frame.height / 2;
      const dxHit = pt.x - midSx;
      const dyHit = pt.y - midSy;
      const sz = zoom, spx = panX, spy = panY;

      ctxMix.hitResult = {
        node,
        interactions: {
          applyDrag(screenX, screenY) {
            const oldMidX = (startP0x + startP1x) / 2;
            const oldMidY = (startP0y + startP1y) / 2;
            const newMidX = (screenX - dxHit - spx - cxS) / sz;
            const newMidY = (screenY - dyHit - spy - cyS) / sz;
            const dx = newMidX - oldMidX;
            const dy = newMidY - oldMidY;
            p0.x = startP0x + dx;
            p0.y = startP0y + dy;
            p1.x = startP1x + dx;
            p1.y = startP1y + dy;
          },
        },
      };
    }
  }

  static after_hit_test() {}

  // ── Content children: inverse transform for hit test ──

  static before_child_hit_test(ctxMix, node, params, child) {
    if (child.token === 'drag-point') return;

    const frame = HandleFrameNode._getFrame(node, params);
    if (!frame || frame.width < 1) return;

    node._savedContentScale = ctxMix.contentScale ?? 1;
    node._savedW = ctxMix.W;
    node._savedH = ctxMix.H;
    node._savedBox = ctxMix.box;

    if (ctxMix.hitPoint) {
      node._savedHitPoint = { ...ctxMix.hitPoint };
    }

    // ── Push T ──
    node._savedT = ctxMix.T;
    const localFrame = HandleFrameNode._getFrameLocal(node);

    if (node.value?.stretchContent) {
      // No scaling — just offset by frame origin
      if (ctxMix.hitPoint) {
        ctxMix.hitPoint = {
          x: ctxMix.hitPoint.x - frame.left,
          y: ctxMix.hitPoint.y - frame.top,
        };
      }
      ctxMix.W = frame.width;
      ctxMix.H = frame.height;
      ctxMix.box = { _w: frame.width, _h: frame.height,
                     width() { return this._w; }, height() { return this._h; },
                     tl() { return { x: 0, y: 0 }; } };

      if (ctxMix.T && localFrame) {
        ctxMix.T = ctxMix.T.child(
          { x: localFrame.left, y: localFrame.top }, 1, 1);
      }
    } else {
      const nw = node._naturalWidth;
      if (!nw) return;

      const localScale = frame.width / nw;

      if (ctxMix.hitPoint) {
        ctxMix.hitPoint = {
          x: (ctxMix.hitPoint.x - frame.left) / localScale,
          y: (ctxMix.hitPoint.y - frame.top)  / localScale,
        };
      }
      ctxMix.contentScale = node._savedContentScale * localScale;
      ctxMix.W = nw;
      ctxMix.H = node._naturalHeight;
      ctxMix.box = { _w: nw, _h: (node._naturalHeight || nw),
                     width() { return this._w; }, height() { return this._h; },
                     tl() { return { x: 0, y: 0 }; } };

      if (ctxMix.T && localFrame) {
        ctxMix.T = ctxMix.T.child(
          { x: localFrame.left, y: localFrame.top },
          localFrame.width / nw, localFrame.height / (node._naturalHeight || nw));
      }
    }

    node._didHitTransform = true;
  }

  static after_child_hit_test(ctxMix, node, params, child) {
    if (child.token === 'drag-point') return;
    if (!node._didHitTransform) return;
    node._didHitTransform = false;

    if (node._savedHitPoint) {
      ctxMix.hitPoint = node._savedHitPoint;
      node._savedHitPoint = null;
    }
    ctxMix.contentScale = node._savedContentScale ?? 1;

    if (node._savedW !== undefined) {
      ctxMix.W = node._savedW;
      ctxMix.H = node._savedH;
      node._savedW = undefined;
    }
    if (node._savedBox) { ctxMix.box = node._savedBox; node._savedBox = null; }

    // ── Pop T ──
    if (node._savedT) {
      ctxMix.T = node._savedT;
      node._savedT = null;
    }
  }
}


sceneRegistry.registerNodeClass('handle-frame', HandleFrameNode);

export { HandleFrameNode };