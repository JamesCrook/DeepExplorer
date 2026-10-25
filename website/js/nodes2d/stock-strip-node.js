import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { Geo } from '../2d-support/geo.js';
import { Values } from '../omni-support/values.js';
import { Utils } from '../omni-support/utils.js';
import { BasicCollectionNode } from './basic-collection-node.js';
import { PipperNode } from './pipper-node.js';
export { StockStripNode };
class StockStripNode {
  static layout(ctxMix, node) {
    const { W, H } = ctxMix.getWH();
    const stripH = node.value.height, protos = node.subtree, y = H - stripH / 2;
    const gap = Math.min(120, W / (protos.length + 1)), x0 = (W - gap * (protos.length - 1)) / 2;
    protos.forEach((p, i) => {
      const cx = x0 + gap * i, cy = y;
      StockStripNode.setXY( p, cx, cy );
    });
  }

  static setXY( node, x, y ){
    const cls = Utils.classOfNode(node);
    if (cls && cls.setXY) 
      cls.setXY(Values, node, { x: x, y: y });
    else 
      Values.setValue(Values, node, {}, { x, y });
  }

  static before_draw2d(ctxMix, node, params) {
    StockStripNode.layout(ctxMix, node);
    const ctx = ctxMix.ctx, { W, H } = ctxMix.getWH(), stripH = node.value.height;
    const opacity = (params.stripOpacity ?? 100) / 100;

    ctx.save(); 
    ctx.globalAlpha = opacity; 
    ctx.fillStyle = '#16163a'; 
    ctx.fillRect(0, H - stripH, W, stripH); 
    ctx.restore();

    ctx.strokeStyle = '#282850'; ctx.lineWidth = 1; 
    ctx.beginPath(); ctx.moveTo(0, H - stripH); ctx.lineTo(W, H - stripH); ctx.stroke();
  }

// This is called if there was nothing in the stock strip.
// Call the before_draw2d, so that we still draw the (empty) background 
  static draw2d(ctxMix, node, params) {
    StockStripNode.before_draw2d(ctxMix, node, params)
  }

  static before_child_draw2d(ctxMix, node, params, child) {
    ctxMix.ctx.save();
    ctxMix.ctx.globalAlpha = 1.0;
  }

  static after_child_draw2d(ctxMix, node, params, child) {
    const ctx = ctxMix.ctx, cls = Utils.classOfNode(child);
    let cx = child.value.x, cy = child.value.y;

    if (cls && cls.getCentreXY) {
      const center = cls.getCentreXY(ctxMix, child, params);
      cx = center.x; cy = center.y;
    }

    const stripPips = Utils.pipsFn(child);
    if (stripPips) {
      for (const p of stripPips(ctxMix, child, params)) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Geo.TAU); 
        ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    ctx.restore();

    ctx.fillStyle = '#556'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(child.value.label || '', cx, cy + 27);
  }

  static before_hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt || pt.y < ctxMix.getWH().H - node.value.height) {
      ctxMix.abortPhase = true; 
      return;
    }
    StockStripNode.layout(ctxMix, node);
  }

  static after_child_hit_test(ctxMix, node, params, child) {
    if (!ctxMix.hitResult) return;

    const arena = node.inst?.arenaNode;
    const camNode = node.inst?.cameraNode;

    if (!arena || !camNode) {
      ctxMix.hitResult.isStockPrototype = true;
      ctxMix.abortPhase = true;
      return;
    }

    const proto = ctxMix.hitResult.node;
    const pt = ctxMix.hitPoint;

// Convert screen coords → camera world coords
    const toWorld = (sx, sy) => {
      const v = camNode.value;
      const cx = v.centerOrigin ? ctxMix.W / 2 : 0;
      const cy = v.centerOrigin ? ctxMix.H / 2 : 0;
      const z  = v.zoom || 1;
      return {
        x: (sx - cx) / z + (v.scrollX || 0),
        y: (sy - cy) / z + (v.scrollY || 0),
      };
    };

// Capture click offset relative to proto centre (in screen space)
    const cls = Utils.classOfNode(proto);
    let protoCx = proto.value.x || 0, protoCy = proto.value.y || 0;
    if (cls?.getCentreXY) {
      const c = cls.getCentreXY(ctxMix, proto, params);
      protoCx = c.x; protoCy = c.y;
    }
    const offX = pt.x - protoCx;
    const offY = pt.y - protoCy;

// Clone creation and controller wrapping are deferred to first applyDrag
// (after_child_hit_test also fires on hover, where we must not spawn)
    let clone = null;
    let innerDrag = null;
    let innerEnd = null;

    ctxMix.hitResult = {
      node: proto,
      interactions: {
        applyDrag(sx, sy) {
          const w = toWorld(sx - offX, sy - offY);

          if (!clone) {
      // First drag: create clone, run hit_test, wrap with controllers
            const overrides = cls?.meta?.spawnOverrides?.(w) ?? { x: w.x, y: w.y };
            clone = SYS.cloneProto(proto, overrides);
            arena.subtree.push(clone);
            BasicCollectionNode._sortSubtree(arena.subtree);

            const cloneCls = Utils.classOfNode(clone);
            // The strip is a sibling of the camera, so its coords are already
            // world coords for the arena: carry the incoming context through.
            const cloneMix = { ...ctxMix, hitPoint: w, hitResult: null };
            cloneCls.hit_test(cloneMix, clone, params);

            if (cloneMix.hitResult) {
              PipperNode.claim(cloneMix, arena, cloneMix.hitResult, params);
              innerDrag = cloneMix.hitResult.interactions?.applyDrag;
              innerEnd  = cloneMix.hitResult.interactions?.endDrag;
            }
          }

          if (innerDrag) innerDrag(w.x, w.y);
          else StockStripNode.setXY(clone, w.x, w.y);
          return clone;
        },
        endDrag(onStrip) {
          if (!clone) return;
          if (onStrip) {
            if (innerEnd) innerEnd(true);
      // Belt-and-suspenders: ensure clone is removed
            const idx = arena.subtree.indexOf(clone);
            if (idx >= 0) arena.subtree.splice(idx, 1);
            PipperNode.manager(arena).removeNode(clone);
          } else {
            if (innerEnd) innerEnd(false);
          }
        },
      },
    };
    ctxMix.abortPhase = true;
  }
}


sceneRegistry.registerNodeClass('stock-strip', StockStripNode);
