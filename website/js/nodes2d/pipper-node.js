import { sceneRegistry } from '../omni-support/sys.js';
import { Geo } from '../2d-support/geo.js';
import { Values } from '../omni-support/values.js';
import { Utils } from '../omni-support/utils.js';
import { BasicCollectionNode } from './basic-collection-node.js';
import { PipSetManager } from '../2d-support/pip-set-manager.js';
export { PipperNode };

/* ─────────────────────────────────────────────────────────────────────────────
PipperNode — the arena.  It owns the pip sets and the controllers, and is the
substrate both controllers stand on, so neither has to name the other.

  node.inst.pipSets      PipSetManager, configured with this build's rules
  node.inst.controllers  live controller instances, in claim order
  node.state.*           drag-time state: recomputable, never serialised

Controllers are optional and independently droppable.  They talk to each other
only through hooks announced here:

  claim(hit)          first controller to return true owns the drag
  clearForTileJoin    make way: two tile pips are about to abut
  onFracture          a tile-to-tile set is being broken by a drag
  settle              re-derive dependent geometry after anything moved
  onDropped           a drag finished; nodes came to rest
──────────────────────────────────────────────────────────────────────────── */
class PipperNode {
  static PROXIMITY_DIST = 12;   // pips this close highlight during a drag
  static GRAB_DIST      = 10;   // how near the pointer must be to seize a pip

  // ── arena services ───────────────────────────────────────────────

  static manager(node) {
    const inst = (node.inst ||= {});
    return (inst.pipSets ||= new PipSetManager(inst.pipSetRules));
  }

  static controllers(node) {
    const list = node.inst?.controllers || [];
    return [...list].sort((a, b) => (b.claimPriority ?? 0) - (a.claimPriority ?? 0));
  }

  // Announce a hook to every controller that answers it.
  static notify(node, hook, ...args) {
    for (const ctrl of PipperNode.controllers(node)) ctrl[hook]?.(...args);
  }

  // The first controller to return true owns the drag.
  static claim(ctxMix, node, hitResult, params, endpointInfo) {
    for (const ctrl of PipperNode.controllers(node))
      if (ctrl.wrapHit?.(ctxMix, node, hitResult, params, endpointInfo)) return true;
    return false;
  }

  // Install a scene: subtree plus id-based connection specs, resolved to
  // references.  The ids do not survive the call.
  static loadScene(node, scene, params) {
    node.subtree = scene.subtree || [];
    const mgr = PipperNode.manager(node);
    mgr.sets.length = 0;
    for (const child of node.subtree) if (child.state) child.state.pipSets = [];
    mgr.resolve(node.subtree, scene.value?.connections, params || {});
    BasicCollectionNode._sortSubtree(node.subtree);
  }

  /* Drop a child from the arena.  The subtree and the pip sets are two
     separate holdings of the same node: splicing one leaves the other with a
     live reference to something no longer in the scene, still walked, still
     driving followers to pips that are no longer drawn.  So both go, and the
     controllers are then given the chance to reap what that orphaned. */
  static removeChild(node, child, params) {
    const idx = node.subtree.indexOf(child);
    if (idx >= 0) node.subtree.splice(idx, 1);
    // Announced while the joins still exist: a controller may want to reap
    // what was only there on this node's account.
    PipperNode.notify(node, 'onRemoving', node, child, params || {});
    PipperNode.manager(node).removeNode(child);
    PipperNode.notify(node, 'settle', node, params || {});
  }

  // ── phases ───────────────────────────────────────────────────────

  static layout(ctxMix, node, params) {
    BasicCollectionNode._sortSubtree(node.subtree);
    PipperNode.notify(node, 'layout', node, params);
  }

  // Intercept pip hit-testing before child bodies are considered.
  static before_hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt || ctxMix.hoverOnly) return;

    const mgr = PipperNode.manager(node), sub = node.subtree;

    for (let i = sub.length - 1; i >= 0; i--) {
      const child = sub[i];
      if (!mgr.isFollower(child)) continue;

      const pipsFn = Utils.pipsFn(child), setPip = Utils.setPipFn(child);
      if (!pipsFn || !setPip) continue;
      const pips = pipsFn(ctxMix, child, params);

      for (let pip = 0; pip < pips.length; pip++) {
        // A pip that splits is grabbed by its body, not its endpoint —
        // that path carries the snap-to-edge behaviour.
        if (mgr.kindAt(child, pip).splits) continue;

        const ox = pt.x - pips[pip].x, oy = pt.y - pips[pip].y;
        if (Math.hypot(ox, oy) > PipperNode.GRAB_DIST) continue;

        ctxMix.hitResult = {
          node: child,
          interactions: {
            applyDrag(wx, wy) {
              setPip(Values, child, { idx: pip, x: wx - ox, y: wy - oy });
            },
            endDrag(onStrip) {
              if (!onStrip) return;
              const idx = sub.indexOf(child);
              if (idx >= 0) sub.splice(idx, 1);
            },
          },
        };

        PipperNode.claim(ctxMix, node, ctxMix.hitResult, params, { pipIdx: pip });
        ctxMix.abortPhase = true;
        return;
      }
    }
  }

  // Wrap a body drag if no pip was hit.
  static after_child_hit_test(ctxMix, node, params, child) {
    if (!ctxMix.hitResult || ctxMix.hitResult.node !== child || ctxMix.hoverOnly) return;

    const inner = ctxMix.hitResult.interactions;
    const sub = node.subtree;
    const mgr = PipperNode.manager(node);

    ctxMix.hitResult.interactions = {
      applyDrag: (wx, wy) => inner?.applyDrag?.(wx, wy),
      endDrag: (onStrip) => {
        inner?.endDrag?.(onStrip);
        if (!onStrip) return;
        const idx = sub.indexOf(child);
        if (idx >= 0) sub.splice(idx, 1);
        mgr.removeNode(child);
      },
    };

    PipperNode.claim(ctxMix, node, ctxMix.hitResult, params);
    ctxMix.abortPhase = true;
  }

  // ── drag-time state (node.state, recomputable) ───────────────────

  static setDraggedPips(node, nodes, params) {
    const mgr = PipperNode.manager(node);
    const dragged = new Map();
    for (const child of nodes) {
      const pips = mgr.pipsOf(child, params);
      if (!pips.length) continue;
      dragged.set(child, new Set(pips.map((_, pip) => pip)));
    }
    (node.state ||= {}).draggedPips = dragged;
    PipperNode.updateProximity(node, params);
  }

  // As above, but for an explicit list of { node, pip } references.
  static setDraggedRefs(node, refs, params) {
    const dragged = new Map();
    for (const ref of refs) {
      if (!dragged.has(ref.node)) dragged.set(ref.node, new Set());
      dragged.get(ref.node).add(ref.pip);
    }
    (node.state ||= {}).draggedPips = dragged;
    PipperNode.updateProximity(node, params);
  }

  static isDragged(node, child, pip) {
    return !!node.state?.draggedPips?.get(child)?.has(pip);
  }

  static clearDragState(node) {
    const state = (node.state ||= {});
    state.draggedPips = null;
    state.proximityPairs = null;
    state.snapEdges = null;
  }

  /* Pips in motion, and the resting pips they are close to.  Purely a
     drawing hint — derived every time the drag moves, never persisted. */
  static updateProximity(node, params) {
    const state = (node.state ||= {});
    const dragged = state.draggedPips;
    if (!dragged || dragged.size === 0) { state.proximityPairs = null; return; }

    const mgr = PipperNode.manager(node);
    const all = [];
    for (const child of node.subtree) {
      const pips = mgr.pipsOf(child, params);
      for (let pip = 0; pip < pips.length; pip++) {
        all.push({
          node: child, pip,
          pos: pips[pip],
          follows: mgr.kindAt(child, pip).follows,
          moving: !!dragged.get(child)?.has(pip),
        });
      }
    }

    const pairs = [];
    for (const a of all) {
      if (!a.moving) continue;
      for (const b of all) {
        if (b.moving) continue;
        if (mgr.same(a, b)) continue;
        if (Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) >= PipperNode.PROXIMITY_DIST) continue;
        pairs.push({ a, b, edgeInvolved: a.follows || b.follows });
      }
    }
    state.proximityPairs = pairs.length ? pairs : null;
  }

  // ── pip rendering ────────────────────────────────────────────────

  static _classifyPip(node, child, pip) {
    const isThis = e => e.node === child && e.pip === pip;

    for (const p of node.state?.proximityPairs || [])
      if (isThis(p.a) || isThis(p.b)) return p.edgeInvolved ? 'edge' : 'raft';

    const mgr = PipperNode.manager(node);
    const set = mgr.setFor(child, pip);
    if (!set) return 'default';
    if (set.length > 2) return 'edge';
    return set.some(e => mgr.kindAt(e.node, e.pip).follows) ? 'edge' : 'raft';
  }

  static after_child_draw2d(ctxMix, node, params, child) {
    const pipsFn = Utils.pipsFn(child);
    if (!pipsFn) return;

    const pips = pipsFn(ctxMix, child, params);
    for (let pip = 0; pip < pips.length; pip++)
      PipperNode._drawPipShape(ctxMix.ctx, pips[pip].x, pips[pip].y,
        PipperNode._classifyPip(node, child, pip));
  }

  static _drawPipShape(ctx, x, y, state) {
    const highlight = state === 'raft' || state === 'edge';

    ctx.beginPath();
    ctx.arc(x, y, highlight ? 5 : 3.5, 0, Geo.TAU);

    if (state === 'raft')      { ctx.fillStyle = '#4d4'; ctx.fill(); }
    else if (state === 'edge') { ctx.fillStyle = '#48f'; ctx.fill(); }
    else                       { ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  static after_draw2d(ctxMix, node, params) {
    for (const ctrl of PipperNode.controllers(node))
      for (const extra of ctrl.getExtraAffordances?.(node) || [])
        PipperNode._drawPipShape(ctxMix.ctx, extra.x, extra.y, extra.state);
  }
}

sceneRegistry.registerNodeClass('pipper-node', PipperNode);
