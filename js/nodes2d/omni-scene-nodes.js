/**
 * omni-scene-nodes.js  — v5
 *
 * Changes from v4:
 *   - Transform system: T and box flow through ctxMix
 *   - SceneRootNode initializes T, box, screenHitPoint, canvasW/H
 *   - SceneRootNode attaches directCtx() and transformedCtx() to ctxMix
 *   - LayerNode pushes T (centered + zoomed) alongside existing ctx
 *   - DragPointNode uses T for draw2d and hit_test (directCtx mode)
 *
 * Place in: nodes2d/omni-scene-nodes.js
 */

import { sceneRegistry } from '../omni-support/scene.js';
import { Transform }     from '../omni-support/transform.js';
import './handle-frame-node.js';


// ═══════════════════════════════════════════════════════
//  ctxMix helpers — attached by SceneRootNode
// ═══════════════════════════════════════════════════════
//
// directCtx()       — ctx at DPR scale only, 1 unit = 1 CSS px.
//                     Node positions via T.toScreen manually.
//                     Caller MUST ctx.restore() when done.
//
// transformedCtx()  — ctx with T baked in: local (0,0) → screen
//                     T.origin, 1 local unit → T.scale screen px.
//                     Caller MUST ctx.restore() when done.

function _directCtx(ctxMix) {
  const ctx = ctxMix.ctx;
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function _transformedCtx(ctxMix) {
  const ctx = ctxMix.ctx;
  const dpr = window.devicePixelRatio || 1;
  const T   = ctxMix.T;
  ctx.save();
  ctx.setTransform(
    dpr * T.sx, 0,
    0, dpr * T.sy,
    dpr * T.origin.x, dpr * T.origin.y,
  );
  return ctx;
}


// ═══════════════════════════════════════════════════════
//  LAYER NODE
// ═══════════════════════════════════════════════════════

class LayerNode {

  static _pushParams(node, params, tag) {
    const lp = node.value?.params;
    if (!lp) return;
    const saved = {};
    for (const k of Object.keys(lp)) {
      saved[k] = params[k];
      params[k] = lp[k];
    }
    node['_sp_' + tag] = saved;
  }

  static _popParams(node, params, tag) {
    const saved = node['_sp_' + tag];
    if (!saved) return;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete params[k];
      else params[k] = v;
    }
    node['_sp_' + tag] = null;
  }

  static _skipIfHidden(ctxMix, node) {
    if (node.value?.visible === false) {
      ctxMix.iterators[ctxMix.iterators.length - 1] = { next: () => null };
      return true;
    }
    return false;
  }

  // ── T push: center + zoom ──
  //
  // Centering: if the layer has center:true, T gets centered
  // within the current box (screen-space origin at box center + pan).
  //
  // Zoom: if the layer's OWN params include zoom, T gets zoomed.
  // This is the single source of truth for zoom in T — adapter
  // nodes (UncenterNode, ZoomPanNode) must NOT also push zoom
  // into T (they still apply ctx.scale for legacy rendering).
  //
  // Only the layer that OWNS zoom pushes it, so inherited zoom
  // (from a parent layer's params) doesn't get pushed twice.
  static _pushT(ctxMix, node, params) {
    node._savedT = ctxMix.T;
    if (ctxMix.T) {
      if (node.value?.center && ctxMix.box) {
        const pan = { x: params.panX || 0, y: params.panY || 0 };
        ctxMix.T = ctxMix.T.centered(ctxMix.box, pan);
      }
      // Push zoom from the layer's own params (not inherited)
      const ownZoom = node.value?.params?.zoom;
      if (ownZoom != null && ownZoom !== 1) {
        ctxMix.T = ctxMix.T.zoomed(ownZoom);
      }
    }
  }

  static _popT(ctxMix, node) {
    if (node._savedT) {
      ctxMix.T = node._savedT;
      node._savedT = null;
    }
  }

  // ── draw2d ──

  static before_draw2d(ctxMix, node, params) {
    LayerNode._pushParams(node, params, 'draw2d');
    LayerNode._pushT(ctxMix, node, params);
    if (LayerNode._skipIfHidden(ctxMix, node)) return;
    const ctx = ctxMix.ctx;
    if (ctx) {
      ctx.save();
      if (node.value?.alpha != null) ctx.globalAlpha *= node.value.alpha;
      // Legacy ctx.translate — still needed for non-migrated nodes
      if (node.value?.center) {
        ctx.translate(
          (ctxMix.W || 0) / 2 + (params.panX || 0),
          (ctxMix.H || 0) / 2 + (params.panY || 0),
        );
      }
    }
  }

  static after_draw2d(ctxMix, node, params) {
    LayerNode._popT(ctxMix, node);
    LayerNode._popParams(node, params, 'draw2d');
    if (node.value?.visible !== false) ctxMix.ctx?.restore();
  }

  // ── hit_test ──

  static before_hit_test(ctxMix, node, params) {
    LayerNode._pushParams(node, params, 'hit_test');
    LayerNode._pushT(ctxMix, node, params);
    LayerNode._skipIfHidden(ctxMix, node);
  }

  static after_hit_test(ctxMix, node, params) {
    LayerNode._popT(ctxMix, node);
    LayerNode._popParams(node, params, 'hit_test');
  }

  // ── measure + layout ──

  static before_measure(ctxMix, node, params) {
    LayerNode._pushParams(node, params, 'measure');
    LayerNode._skipIfHidden(ctxMix, node);
  }

  static after_measure(ctxMix, node, params) {
    LayerNode._popParams(node, params, 'measure');
  }

  static before_layout(ctxMix, node, params) {
    LayerNode._pushParams(node, params, 'layout');
    LayerNode._skipIfHidden(ctxMix, node);
  }

  static after_layout(ctxMix, node, params) {
    LayerNode._popParams(node, params, 'layout');
  }
}

sceneRegistry.registerNodeClass('layer', LayerNode);


/** Lightweight box factory for ctxMix.box propagation. */
function makeBox(w, h) {
  return { _w: w, _h: h, width() { return this._w; }, height() { return this._h; },
           tl() { return { x: 0, y: 0 }; }, br() { return { x: this._w, y: this._h }; } };
}


// ═══════════════════════════════════════════════════════
//  SCENE ROOT — clear + background, init T and box
// ═══════════════════════════════════════════════════════

class SceneRootNode {

  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = ctx.canvas.width / dpr;
    const H = ctx.canvas.height / dpr;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = node.value?.bg || '#0f0f23';
    ctx.fillRect(0, 0, W, H);
    ctxMix.W = W;
    ctxMix.H = H;

    // ── Initialize transform system ──
    ctxMix.T   = new Transform({ x: 0, y: 0 }, 1, 1);
    ctxMix.box = makeBox(W, H);

    // ── Attach ctx helpers ──
    ctxMix.directCtx      = () => _directCtx(ctxMix);
    ctxMix.transformedCtx = () => _transformedCtx(ctxMix);
  }

  static after_draw2d(ctxMix) { ctxMix.ctx?.restore(); }

  static before_hit_test(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = ctx.canvas.width / dpr;
    const H = ctx.canvas.height / dpr;
    ctxMix.W = W;
    ctxMix.H = H;

    // ── Persisted originals (legacy, used by non-migrated nodes) ──
    ctxMix.canvasW = W;
    ctxMix.canvasH = H;
    if (ctxMix.hitPoint) ctxMix.screenHitPoint = { ...ctxMix.hitPoint };

    // ── Initialize transform system ──
    ctxMix.T   = new Transform({ x: 0, y: 0 }, 1, 1);
    ctxMix.box = makeBox(W, H);
  }
}

sceneRegistry.registerNodeClass('scene-root', SceneRootNode);


// ═══════════════════════════════════════════════════════
//  CORNER RECT — migrated to T + directCtx
// ═══════════════════════════════════════════════════════

class CornerRectNode {
  static before_draw2d(ctxMix, node, params) {
    const T = ctxMix.T;
    if (!T) return;
    const ch = node.subtree || [];
    if (ch.length < 2) return;
    const s0 = T.toScreen({ x: ch[0].value?.x || 0, y: ch[0].value?.y || 0 });
    const s1 = T.toScreen({ x: ch[1].value?.x || 0, y: ch[1].value?.y || 0 });
    const l = Math.min(s0.x, s1.x), t = Math.min(s0.y, s1.y);
    const w = Math.abs(s1.x - s0.x), h = Math.abs(s1.y - s0.y);
    const r = Math.min(params.roundedCorners || 0, w / 2, h / 2);
    const ctx = ctxMix.directCtx();
    ctx.globalAlpha = params.fillOpacity ?? 0.8;
    ctx.fillStyle = params.color || '#4466aa';
    if (r > 0 && ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(l, t, w, h, r); ctx.fill();
      ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 1; ctx.stroke();
    } else {
      ctx.fillRect(l, t, w, h);
      ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 1; ctx.strokeRect(l, t, w, h);
    }
    ctx.restore();
  }
}

sceneRegistry.registerNodeClass('corner-rect', CornerRectNode);


// ═══════════════════════════════════════════════════════
//  SIMPLE PATH — migrated to T + directCtx
// ═══════════════════════════════════════════════════════

class SimplePathNode {
  static before_draw2d(ctxMix, node, params) {
    const T = ctxMix.T;
    if (!T) return;
    const ch = node.subtree || [];
    if (ch.length < 2) return;
    const ctx = ctxMix.directCtx();
    ctx.globalAlpha = params.fillOpacity ?? 0.7;
    ctx.lineWidth = params.pathWidth || 4;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = params.pathColor || '#4fc3f7';
    ctx.beginPath();
    const s0 = T.toScreen({ x: ch[0].value?.x || 0, y: ch[0].value?.y || 0 });
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < ch.length; i++) {
      const si = T.toScreen({ x: ch[i].value?.x || 0, y: ch[i].value?.y || 0 });
      ctx.lineTo(si.x, si.y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

sceneRegistry.registerNodeClass('simple-path', SimplePathNode);


// ═══════════════════════════════════════════════════════
//  DRAG POINT — migrated to T + directCtx
//
//  draw2d: uses directCtx() to draw at T.toScreen positions.
//    Point radius and labels are zoom-independent (fixed screen px).
//  hit_test: compares screen hitPoint against T.toScreen.
//    applyDrag uses T.toLocal to convert back.
// ═══════════════════════════════════════════════════════

class DragPointNode {

  static draw2d(ctxMix, node, params) {
    const T = ctxMix.T;
    if (!T) return;
    const v = node.value || {};
    const s = T.toScreen({ x: v.x || 0, y: v.y || 0 });
    const r = params.pointRadius || 6;
    const color = v.color || params.pointColor || '#4fc3f7';

    const ctx = ctxMix.directCtx();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 1.5; ctx.stroke();

    if (ctxMix.highlighted?.has(node)) {
      ctx.beginPath(); ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (v.name) {
      ctx.fillStyle = '#ffffffcc'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(v.name, s.x, s.y - r - 3);
    }
    if (v.emoji) {
      ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = (2 * r - 1) + 'px Arial';
      const fd = r / 6;
      ctx.fillText(v.emoji, s.x + fd * 0.33, s.y + fd);
    }
    ctx.restore();
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    const T  = ctxMix.T;
    if (!pt || !T) return;
    const v = node.value || {};
    const s = T.toScreen({ x: v.x || 0, y: v.y || 0 });
    const dx = pt.x - s.x, dy = pt.y - s.y;
    if (dx * dx + dy * dy > ((params.pointRadius || 6) + 5) ** 2) return;

    const Ts = T.clone();
    ctxMix.hitResult = {
      node,
      interactions: {
        applyDrag(screenX, screenY) {
          const local = Ts.toLocal({ x: screenX - dx, y: screenY - dy });
          node.value.x = local.x;
          node.value.y = local.y;
        },
      },
    };
  }
}

sceneRegistry.registerNodeClass('drag-point', DragPointNode);


export {
  LayerNode, SceneRootNode, CornerRectNode, SimplePathNode, DragPointNode, makeBox,
};
