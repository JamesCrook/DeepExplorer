import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { Values } from '../omni-support/values.js';
export { ContentFrameNode };

/* ─────────────────────────────────────────────────────────────────────────────
`frame-node` (ContentFrameNode) — a content-agnostic frame with drag, resize and screen-fit (container)

Node value properties:
 x, y          — world position (centre of frame)
 cw, ch        — content width / height (the "drawing area")
 padding       — { left, right, top, bottom } or a single Number (uniform)
                 defaults to { left: 80, right: 80, top: 100, bottom: 100 }
 minCw, minCh  — minimum content dimensions (default 200 × 150)
 resizeMode    — 'corners' | 'edges' | false   (default 'corners')

What it provides to children via ctxMix:
 ctxMix.getWH() → { W:cw, H:ch }   — current frame content dimensions
──────────────────────────────────────────────────────────────────────────── */
class ContentFrameNode {
/* ── geometry helpers (private) ────────────────────────────────────────── */
  static _pad(node) {
    const p = node.value.padding;
    if (p == null) return { left: 80, right: 80, top: 100, bottom: 100 };
    if (typeof p === 'number') return { left: p, right: p, top: p, bottom: p };
    return { left: p.left ?? 80, right: p.right ?? 80, top: p.top ?? 100, bottom: p.bottom ?? 100 };
  }

  static _frameExtents(node) {
    const cw = node.value.cw || 700, ch = node.value.ch || 400;
    const pad = ContentFrameNode._pad(node);
    return {
      hw: cw / 2 + (pad.left + pad.right) / 2,
      hh: ch / 2 + (pad.top + pad.bottom) / 2,
    };
  }

  static _corners(node) {
    const { hw, hh } = ContentFrameNode._frameExtents(node);
    return [
      { cx: -hw, cy: -hh, signX: -1, signY: -1, cursor: 'nwse-resize' },
      { cx:  hw, cy: -hh, signX:  1, signY: -1, cursor: 'nesw-resize' },
      { cx: -hw, cy:  hh, signX: -1, signY:  1, cursor: 'nesw-resize' },
      { cx:  hw, cy:  hh, signX:  1, signY:  1, cursor: 'nwse-resize' },
    ];
  }

  static _edges(node) {
    const { hw, hh } = ContentFrameNode._frameExtents(node);
    return [
      { side: 'top',    test: (lx, ly) => Math.abs(ly + hh) <= 8 && lx > -hw && lx < hw, cursor: 'ns-resize',   axis: 'y', sign: -1 },
      { side: 'bottom', test: (lx, ly) => Math.abs(ly - hh) <= 8 && lx > -hw && lx < hw, cursor: 'ns-resize',   axis: 'y', sign:  1 },
      { side: 'left',   test: (lx, ly) => Math.abs(lx + hw) <= 8 && ly > -hh && ly < hh, cursor: 'ew-resize',   axis: 'x', sign: -1 },
      { side: 'right',  test: (lx, ly) => Math.abs(lx - hw) <= 8 && ly > -hh && ly < hh, cursor: 'ew-resize',   axis: 'x', sign:  1 },
    ];
  }

  static _snapChildren(node) {
    return (node.subtree || []).map(ch => ({ x: ch.value.x, y: ch.value.y }));
  }

/* ── resize (content-agnostic: scales all children's x/y uniformly) ──── */

  static _applySize(node, newCw, newCh, baseCw, baseCh, childSnap) {
    const sx = newCw / baseCw, sy = newCh / baseCh;
    const minCw = node.value.minCw ?? 200, minCh = node.value.minCh ?? 150;
    Values.setValue(Values, node, {},
      { cw: Math.max(minCw, newCw), ch: Math.max(minCh, newCh) });
    for (let i = 0; i < (node.subtree || []).length; i++) {
      const child = node.subtree[i], snap = childSnap[i];
      const patch = {};
      if (snap.x !== undefined) patch.x = snap.x * sx;
      if (snap.y !== undefined) patch.y = snap.y * sy;
      if (patch.x !== undefined || patch.y !== undefined)
        Values.setValue(Values, child, {}, patch);
    }
  }

/* ── draw ──────────────────────────────────────────────────────────────── */

  static before_draw2d(ctxMix, node, params) {
    const cw = node.value.cw || 700, ch = node.value.ch || 400;

    const { W, H, Z, ox, oy } = ctxMix.getWH();
// Screen-mode auto-fit
    if (params.screenMode) {
      const pad = ContentFrameNode._pad(node);
      const targetCw = Math.max(node.value.minCw ?? 200, W / Z - pad.left - pad.right);
      const targetCh = Math.max(node.value.minCh ?? 150, H / Z - pad.top - pad.bottom);
      /* Left as a direct write on purpose.  These are a draw phase editing
         the model — the same disease as _screenSnap below — and routing them
         through the channel would only make them look legitimate. */
      node.value.x = ox;// + W / (2 * Z);
      node.value.y = oy;// + H / (2 * Z);
      if (!node.value._screenSnap) {
        node.value._screenSnap = {
          cw, ch,
          children: ContentFrameNode._snapChildren(node)
        };
      }
      const s = node.value._screenSnap;
      ContentFrameNode._applySize(node, targetCw, targetCh, s.cw, s.ch, s.children);
    } else if (node.value._screenSnap) {
      delete node.value._screenSnap;
    }

    // Expose frame dimensions to children (restored in after_draw2d)
    const frameCw = node.value.cw || 700, frameCh = node.value.ch || 400;
    node.value._savedGetWH = ctxMix.getWH;
    ctxMix.getWH = () => ({ W: frameCw, H: frameCh, Z });

    const ctx = ctxMix.ctx;
    ctx.save();
    ctx.translate(node.value.x || 0, node.value.y || 0);

    if (params.showChartBounds) {
      ctx.fillStyle = 'rgba(55, 55, 255, 0.15)';
      const { hw, hh } = ContentFrameNode._frameExtents(node);
      ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
    }
  }

  static after_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const fv = ctxMix.getValue(ctxMix, node, params) || {};
    const hi = !!(fv.selected || fv.hovered);
    const mode = node.value.resizeMode ?? 'corners';
    const drawFrame = (hi && mode) || params.showChartBounds; 

    if (drawFrame) {
      const { hw, hh } = ContentFrameNode._frameExtents(node);
      const { W, H, Z, ox, oy } = ctxMix.getWH();

      ctx.strokeStyle = 'rgba(102, 204, 255, 0.4)';
      ctx.lineWidth = 1 /Z;
      ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);

      if (mode === 'corners') {
        const size = 10 /Z;
        ctx.fillStyle = '#6cf';
        for (const c of ContentFrameNode._corners(node)) ctx.fillRect(c.cx - size / 2, c.cy - size / 2, size, size);
      } else if (mode === 'edges') {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(102, 204, 255, 0.6)';
        ctx.lineWidth = 2 / Z;
        ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
        ctx.setLineDash([]);
        const ms = 6 / Z;
        ctx.fillStyle = '#6cf';
        ctx.fillRect(-ms / 2, -hh - ms / 2, ms, ms);
        ctx.fillRect(-ms / 2, hh - ms / 2, ms, ms);
        ctx.fillRect(-hw - ms / 2, -ms / 2, ms, ms);
        ctx.fillRect(hw - ms / 2, -ms / 2, ms, ms);
      }
    }
    ctx.restore();
    if (node.value._savedGetWH) { ctxMix.getWH = node.value._savedGetWH; node.value._savedGetWH = null; }
  }

  /* ── hit-test ─────────────────────────────────────────────────────────── */

  static before_hit_test(ctxMix, node, params) {
    // A hit already made before this frame (an ancestor, an earlier sibling)
    // is not in this frame's local space; after_hit_test must leave it alone.
    node.value._savedHitResult = ctxMix.hitResult;
    node.value._savedGetWH = ctxMix.getWH;
    const { W, H, Z, ox, oy } = ctxMix.getWH();
  // Expose frame dimensions for children's hit-test (restored in after_hit_test)
    const frameCw = node.value.cw || 700, frameCh = node.value.ch || 400;
    ctxMix.getWH = () => ({ W: frameCw, H: frameCh, Z });
    if( ! ctxMix.getWH().W )
      debugger;


    node.value._savedHit = ctxMix.hitPoint;
    if (!ctxMix.hitPoint) return;

    const localPt = {
      x: ctxMix.hitPoint.x - (node.value.x || 0),
      y: ctxMix.hitPoint.y - (node.value.y || 0)
    };
    ctxMix.hitPoint = localPt;

    const { hw, hh } = ContentFrameNode._frameExtents(node);
    const fv = ctxMix.getValue(ctxMix, node, params) || {};
    const isHi = !!(fv.selected || fv.hovered);
    const mode = node.value.resizeMode ?? 'corners';

  // Resize hit-test (only when selected and not in screen mode)
    if (isHi && mode && !params.screenMode) {
      const pad = ContentFrameNode._pad(node);
      const startCw = node.value.cw || 700, startCh = node.value.ch || 400;

      if (mode === 'corners') {
        const hs = 14;
        for (const c of ContentFrameNode._corners(node)) {
          if (Math.abs(localPt.x - c.cx) <= hs && Math.abs(localPt.y - c.cy) <= hs) {
            const fixedWx = (node.value.x || 0) - c.signX * hw;
            const fixedWy = (node.value.y || 0) - c.signY * hh;
            const childSnap = ContentFrameNode._snapChildren(node);

            ctxMix.hitResult = {
              node,
              interactions: {
                cursor: c.cursor,
                applyDrag(wx, wy) {
                  const totalPadX = pad.left + pad.right;
                  const totalPadY = pad.top + pad.bottom;
                  const newCw = Math.abs(wx - fixedWx) - totalPadX;
                  const newCh = Math.abs(wy - fixedWy) - totalPadY;
                  Values.setValue(Values, node, params,
                    { x: (fixedWx + wx) / 2, y: (fixedWy + wy) / 2 });
                  ContentFrameNode._applySize(node, newCw, newCh, startCw, startCh, childSnap);
                  return node;
                }
              }
            };
            return;
          }
        }
      } else if (mode === 'edges') {
        for (const e of ContentFrameNode._edges(node)) {
          if (e.test(localPt.x, localPt.y)) {
            const childSnap = ContentFrameNode._snapChildren(node);
            ctxMix.hitResult = {
              node,
              interactions: {
                cursor: e.cursor,
                applyDrag(wx, wy) {
                  let newCw = startCw, newCh = startCh;
                  if (e.axis === 'x') {
                    const localWx = wx - (node.value.x || 0);
                    newCw = Math.abs(localWx / e.sign) * 2;
                  } else {
                    const localWy = wy - (node.value.y || 0);
                    newCh = Math.abs(localWy / e.sign) * 2;
                  }
                  ContentFrameNode._applySize(node, newCw, newCh, startCw, startCh, childSnap);
                  return node;
                }
              }
            };
            return;
          }
        }
      }
    }

  // Frame body drag (pan the whole frame)
    if (localPt.x >= -hw && localPt.x <= hw && localPt.y >= -hh && localPt.y <= hh) {
      const ox = node.value._savedHit.x - (node.value.x || 0);
      const oy = node.value._savedHit.y - (node.value.y || 0);
      ctxMix.hitResult = {
        node,
        interactions: {
          applyDrag(wx, wy) {
            Values.setValue(Values, node, params, { x: wx - ox, y: wy - oy });
          }
        }
      };
    }
  }

  static after_child_hit_test(ctxMix, node, params, child) {
    if (ctxMix.hitResult && ctxMix.hitResult.node === child && !ctxMix.hoverOnly) {
      const inner = ctxMix.hitResult.interactions;
      const sub = node.subtree;
      ctxMix.hitResult.interactions = {
        ...inner,                       // keep cursor, getValue, setValue, …
        applyDrag: (wx, wy) => { return inner?.applyDrag?.(wx, wy); },
        endDrag: (onStrip) => {
          if (inner && inner.endDrag) inner.endDrag(onStrip);
          if (onStrip) {
            const idx = sub.indexOf(child);
            if (idx >= 0) sub.splice(idx, 1);
          }
        }
      }
    }
  }

  /* A hit made inside this frame's subtree was made in frame-local space
     (before_hit_test rewrote hitPoint), so its drag must be mapped the same
     way.  Every enclosing frame does this once, innermost first, so nesting
     composes.  Hits that existed before this frame was visited are left
     alone — they are not in its space (pane-camera uses the same test). */
  static after_hit_test(ctxMix, node, params) {
    ctxMix.hitPoint = node.value._savedHit;
    if (node.value._savedGetWH) { ctxMix.getWH = node.value._savedGetWH; node.value._savedGetWH = null; }
    const hit = ctxMix.hitResult;
    const fromInside = hit && hit !== node.value._savedHitResult;
    node.value._savedHitResult = null;
    if (fromInside && hit.node !== node) {
      const innerDrag = hit.interactions?.applyDrag;
      const cx = node.value.x || 0, cy = node.value.y || 0;
      if (innerDrag) hit.interactions.applyDrag = (wx, wy) => innerDrag(wx - cx, wy - cy);
    }
  }
}

SYS.NODE_CLASSES.push({ name: 'frame-node', cls: ContentFrameNode });;
