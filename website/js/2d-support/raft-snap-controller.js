import { SYS } from '../omni-support/sys.js';
import { Geo } from './geo.js';
import { Values } from '../omni-support/values.js';
import { Utils } from '../omni-support/utils.js';
import { BasicCollectionNode } from '../nodes2d/basic-collection-node.js';
import { ConeEngine } from './cone-engine.js';
import { PipperNode } from '../nodes2d/pipper-node.js';
import { SnapEngine } from './snap-engine.js';
export { RaftSnapController };

// RaftSnapController — abutting tiles travel together
/* ─────────────────────────────────────────────────────────────────────────────
RaftSnapController — tiles that abut travel together, and fracture along a
cone when pulled apart.

This class is droppable.  It names no other controller: everything it once
asked EdgeSnapController to do is now announced through PipperNode as a hook,
so a build without edges still rafts, and a build without rafting still keeps
edges attached.

Note that the manager's maxTilePips rule and this controller are independent
switches.  With the rule left at 2 and this class dropped, rafts remain legal
— loaded scenes keep their joins — but nothing new forms them.
──────────────────────────────────────────────────────────────────────────── */
class RaftSnapController {
  static MOVE_THRESHOLD = 3;   // a drag is under way: show the cone
  static LOCK_IN        = 8;   // far enough to commit to a direction
  static SNAP_DIST      = 12;  // pips near enough to join on drop
  static FRACTURE_DIST  = 5;   // a join stretched this far gives way

  constructor() {
    this.drag = null;
    this.claimPriority = 10;   // offered drags before other controllers
  }

  layout(arenaNode, params) {}

  // ── group formation ──────────────────────────────────────────────

  /* Followers whose every neighbour is already inside the group come along
     with it — an edge spanning only moving tiles is itself moving. */
  _drawInFollowers(group, subtree, mgr) {
    let added = true;
    while (added) {
      added = false;
      for (const child of subtree) {
        if (group.has(child) || !mgr.isFollower(child)) continue;
        const entries = mgr.entriesOf(child);
        if (!entries.length) continue;
        const wholly = entries.every(({ set, entry }) =>
          set.every(e => e.node === entry.node || group.has(e.node)));
        if (!wholly) continue;
        group.add(child);
        added = true;
      }
    }
  }

  // ── fracture ─────────────────────────────────────────────────────

  /* Break every exclusive tile-to-tile set that straddles the group boundary.
     When the raft was a pair, announce the break so that a controller which
     understands edges can put one where the join used to be. */
  _fractureBoundary(arenaNode, mgr, group, params, announce) {
    for (let i = mgr.sets.length - 1; i >= 0; i--) {
      const set = mgr.sets[i];
      if (set.length !== 2 || mgr.tileCount(set) !== 2) continue;

      const inside = set.filter(e => group.has(e.node)).length;
      if (inside === 0 || inside === set.length) continue;

      const a = { node: set[0].node, pip: set[0].pip };
      const b = { node: set[1].node, pip: set[1].pip };
      mgr.drop(set);
      if (announce) PipperNode.notify(arenaNode, 'onFracture', arenaNode, a, b, params);
    }
  }

  // ── position snapshots ───────────────────────────────────────────

  _snapshot(subtree) {
    for (const child of subtree) {
      if (typeof child.value.x !== 'number') continue;
      (child.state ||= {}).dragOrigin = { x: child.value.x, y: child.value.y };
    }
  }

  _restore(subtree) {
    for (const child of subtree) {
      const at = child.state?.dragOrigin;
      if (!at) continue;
      Values.setValue(Values, child, {}, { x: at.x, y: at.y });
    }
  }

  _clearSnapshot(subtree) {
    for (const child of subtree) if (child.state) child.state.dragOrigin = null;
  }

  _offsetGroup(subtree, dx, dy) {
    for (const child of subtree) {
      const at = child.state?.dragOrigin;
      if (!at) continue;
      const k = this.drag.group.has(child) ? 1 : 0;
      Values.setValue(Values, child, {}, { x: at.x + k * dx, y: at.y + k * dy });
    }
  }

  // ── drag ─────────────────────────────────────────────────────────

  wrapHit(ctxMix, arenaNode, hitResult, params, endpointInfo) {
    if (endpointInfo) return false;

    const dragged = hitResult.node;
    const mgr = PipperNode.manager(arenaNode);
    if (mgr.isFollower(dragged)) return false;

    const subtree = arenaNode.subtree;
    const inner = hitResult.interactions;

    this._snapshot(subtree);

    // Bring the whole connected component to the front.
    const component = mgr.component(dragged);
    const back = [], front = [];
    for (const child of subtree) (component.has(child) ? front : back).push(child);
    subtree.length = 0;
    subtree.push(...back, ...front);

    this.drag = {
      node: dragged,
      ox: ctxMix.hitPoint.x - dragged.value.x,
      oy: ctxMix.hitPoint.y - dragged.value.y,
      startWx: ctxMix.hitPoint.x,
      startWy: ctxMix.hitPoint.y,
      phase: 'preLock',
      group: new Set([dragged]),
      cone: null,
      previewGroup: null,
    };
    (arenaNode.state ||= {}).raftDrag = this.drag;

    hitResult.interactions = {
      applyDrag: (wx, wy) => this._applyDrag(arenaNode, mgr, inner, params, wx, wy),
      endDrag: (onStockStrip) => this._endDrag(arenaNode, mgr, inner, params, onStockStrip),
    };
    return true;
  }

  _applyDrag(arenaNode, mgr, inner, params, wx, wy) {
    const subtree = arenaNode.subtree;
    const drag = this.drag;
    const travelled = Geo.dist2(wx, wy, drag.startWx, drag.startWy);

    if (drag.phase !== 'preLock') {
      this._offsetGroup(subtree, wx - drag.ox - drag.node.state.dragOrigin.x,
                                 wy - drag.oy - drag.node.state.dragOrigin.y);
      PipperNode.notify(arenaNode, 'settle', arenaNode, params);
      PipperNode.updateProximity(arenaNode, params);
      return;
    }

    inner.applyDrag(wx, wy);

    if (travelled > RaftSnapController.MOVE_THRESHOLD) {
      const cp = Utils.classOfNode(drag.node)?.meta?.coneParams?.(drag.node) ?? { n: 4, tilt: 0 };
      const angle = Math.atan2(wy - drag.startWy, wx - drag.startWx);
      drag.cone = ConeEngine.computeCone(cp.n, cp.tilt, angle);
      drag.previewGroup = ConeEngine.walkGroup(mgr, drag.node, drag.cone);

      const raftSize = mgr.raft(drag.node).size;
      if (raftSize === 1) drag.cone = null;   // nothing to fracture

      if (travelled > RaftSnapController.LOCK_IN) {
        drag.phase = 'locked';
        drag.group = drag.previewGroup;
        drag.previewGroup = null;
        this._drawInFollowers(drag.group, subtree, mgr);

        // Splitting a pair leaves an edge behind, if edges exist in this build.
        this._fractureBoundary(arenaNode, mgr, drag.group, params, raftSize === 2);
        PipperNode.setDraggedPips(arenaNode, drag.group, params);
      }
    }
    PipperNode.notify(arenaNode, 'settle', arenaNode, params);
  }

  _endDrag(arenaNode, mgr, inner, params, onStockStrip) {
    const subtree = arenaNode.subtree;
    const drag = this.drag;

    if (onStockStrip) {
      for (const child of drag.group) {
        mgr.removeNode(child);
        const idx = subtree.indexOf(child);
        if (idx >= 0) subtree.splice(idx, 1);
      }
    } else {
      const snapped = SnapEngine.apply(mgr, arenaNode, subtree, drag.group,
        RaftSnapController.SNAP_DIST, params);
      if (!snapped && drag.phase === 'preLock') this._restore(subtree);

      PipperNode.notify(arenaNode, 'settle', arenaNode, params);
      mgr.breakStrained(RaftSnapController.FRACTURE_DIST, params);
      PipperNode.notify(arenaNode, 'settle', arenaNode, params);
      PipperNode.notify(arenaNode, 'onDropped', arenaNode, drag.group, params);
      PipperNode.notify(arenaNode, 'settle', arenaNode, params);
    }

    PipperNode.clearDragState(arenaNode);
    this._clearSnapshot(subtree);
    BasicCollectionNode._sortSubtree(subtree);
    inner.endDrag?.(onStockStrip);

    this.drag = null;
    if (arenaNode.state) arenaNode.state.raftDrag = null;
  }
}
SYS.CONTROLS.push({ type: 'separator', label: 'Controllers' })
SYS.CONTROLS.push({ type: 'checkbox', id: 'enableRaftSnap', label: 'Raft Snap', value: true })
