import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { Values } from '../omni-support/values.js';
import { Utils } from '../omni-support/utils.js';
import { BasicCollectionNode } from '../nodes2d/basic-collection-node.js';
import { PipperNode } from '../nodes2d/pipper-node.js';
import '../nodes2d/pipped-edge-ref-node.js';   // 'pipped-edge'
export { EdgeSnapController };

/* ─────────────────────────────────────────────────────────────────────────────
EdgeSnapController — edges and junctions stay attached to the pips they meet.

This class is droppable, and names no other controller.  It answers hooks
announced by PipperNode rather than being called by RaftSnapController:

  onFracture        a tile pair came apart — put an edge where the join was
  clearForTileJoin  two tiles want to abut — remove the edges in the way
  onDropped         a drag came to rest — attach free edge ends nearby
  settle            re-derive edge geometry after anything moved

With this class dropped, tiles still raft: they simply never grow edges.
──────────────────────────────────────────────────────────────────────────── */
class EdgeSnapController {
  static SNAP_DIST = 12;
  static SPLIT_DIST = 10;

  constructor(edgeType = 'pipped-edge') {
    this.edgeType = edgeType;
    this.claimPriority = 0;   // offered drags after more specific controllers
  }

  // ── shared helpers ───────────────────────────────────────────────

  _remove(arenaNode, mgr, node) {
    mgr.removeNode(node);
    const idx = arenaNode.subtree.indexOf(node);
    if (idx >= 0) arenaNode.subtree.splice(idx, 1);
  }

  _driverOf(arenaNode, mgr, set) {
    for (const e of set) if (mgr.kindAt(e.node, e.pip).anchors) return e;
    for (const e of set) if (PipperNode.isDragged(arenaNode, e.node, e.pip)) return e;
    return set[0] || null;
  }

  // ── layout ───────────────────────────────────────────────────────
  /* Every follower in a set moves to the driving pip.  Two passes let a
     position propagate along a chain of edges within one frame. */

  layout(arenaNode, params) {
    const mgr = PipperNode.manager(arenaNode);

    for (let pass = 0; pass < 2; pass++) {
      for (const set of mgr.sets) {
        if (!set.some(e => mgr.kindAt(e.node, e.pip).follows)) continue;

        const driver = this._driverOf(arenaNode, mgr, set);
        if (!driver) continue;
        const pos = mgr.posOf(driver, params);
        if (!pos) continue;

        for (const e of set) {
          if (e === driver) continue;
          if (!mgr.kindAt(e.node, e.pip).follows) continue;
          Utils.setPipFn(e.node)?.(Values, e.node, { idx: e.pip, x: pos.x, y: pos.y });
        }
      }
    }
  }

  settle(arenaNode, params) {
    this.deleteOrphanEdges(arenaNode);
    this.layout(arenaNode, params);
  }

  // ── hooks from other controllers ─────────────────────────────────
  //   onFracture / clearForTileJoin / onDropped / onRemoving / settle

  onFracture(arenaNode, a, b, params) {
    this.spawnEdge(arenaNode, a, b, params);
  }

  clearForTileJoin(arenaNode, refs, params) {
    for (const ref of refs) this.deleteEdgesOnPip(arenaNode, ref);
  }

  onDropped(arenaNode, movedNodes, params) {
    this.connectFreeEdgePips(arenaNode, movedNodes, params);
  }

  /* A tile is leaving.  Its edges were there to reach it, so they go with it
     — the same judgement clearForTileJoin makes when a pip is needed for
     something else.  A departing follower takes nothing with it: an edge
     dragged away is just an edge. */
  onRemoving(arenaNode, child, params) {
    const mgr = PipperNode.manager(arenaNode);
    if (mgr.isFollower(child)) return;
    for (const { entry } of mgr.entriesOf(child)) this.deleteEdgesOnPip(arenaNode, entry);
  }

  // ── spawning and reaping ─────────────────────────────────────────

  spawnEdge(arenaNode, a, b, params) {
    if (!sceneRegistry.meta[this.edgeType]) return null;
    const mgr = PipperNode.manager(arenaNode);

    const pa = mgr.posOf(a, params), pb = mgr.posOf(b, params);
    if (!pa || !pb) return null;

    const cls = sceneRegistry.meta[this.edgeType]?.nodeClass;
    const edge = SYS.makeNode(this.edgeType, cls.spanValue(pa, pb));
    arenaNode.subtree.push(edge);
    mgr.join({ node: edge, pip: 0 }, a, params);
    mgr.join({ node: edge, pip: 1 }, b, params);
    return edge;
  }

  deleteEdgesOnPip(arenaNode, ref) {
    const mgr = PipperNode.manager(arenaNode);
    const set = mgr.setFor(ref.node, ref.pip);
    if (!set) return;

    const doomed = set.filter(e => e.node !== ref.node && mgr.isEdge(e.node)).map(e => e.node);
    for (const edge of doomed) this._remove(arenaNode, mgr, edge);
  }

  deleteOrphanEdges(arenaNode) {
    const mgr = PipperNode.manager(arenaNode);
    for (let i = arenaNode.subtree.length - 1; i >= 0; i--) {
      const child = arenaNode.subtree[i];
      if (!mgr.isEdge(child)) continue;
      if (mgr.entriesOf(child).length) continue;
      arenaNode.subtree.splice(i, 1);
    }
  }

  // ── attaching on drop ────────────────────────────────────────────

  // Free pips of a moved node reach for the nearest pip that will take them.
  connectNearbyPips(arenaNode, moved, params) {
    const mgr = PipperNode.manager(arenaNode);
    const pips = mgr.pipsOf(moved, params);

    for (let pip = 0; pip < pips.length; pip++) {
      const ref = { node: moved, pip };
      const match = mgr.nearest(arenaNode.subtree, pips[pip], params, {
        skip: cand => cand.node === moved,
        accept: cand => mgr.canJoin(ref, cand, params),
      });
      if (match) mgr.join(ref, match, params);
    }
  }

  // After a raft comes to rest, free tile pips pick up any edge end nearby.
  connectFreeEdgePips(arenaNode, movedNodes, params) {
    const mgr = PipperNode.manager(arenaNode);

    for (const body of movedNodes) {
      if (mgr.isFollower(body)) continue;
      const pips = mgr.pipsOf(body, params);

      for (let pip = 0; pip < pips.length; pip++) {
        const ref = { node: body, pip };
        if (mgr.has(ref)) continue;
        const match = mgr.nearest(arenaNode.subtree, pips[pip], params, {
          accept: cand => mgr.kindOf(cand).follows && mgr.canJoin(ref, cand, params),
        });
        if (match) mgr.join(ref, match, params);
      }
    }
  }

  // A dragged cluster of follower pips lands on whatever is nearest.
  _connectClusterOnDrop(arenaNode, cluster, params) {
    if (!cluster.length) return;
    const mgr = PipperNode.manager(arenaNode);
    const head = cluster[0];
    const pos = mgr.posOf(head, params);
    if (!pos) return;

    const inCluster = ref => cluster.some(c => c.node === ref.node && c.pip === ref.pip);
    const match = mgr.nearest(arenaNode.subtree, pos, params, {
      skip: inCluster,
      accept: cand => mgr.canJoin(head, cand, params),
    });
    if (match) mgr.join(head, match, params);
  }

  // ── drag interaction factory ─────────────────────────────────────

  _createDragInteractions(arenaNode, targetNode, inner, params, hooks) {
    const mgr = PipperNode.manager(arenaNode);
    let initialised = false;

    const init = () => {
      if (initialised) return;
      initialised = true;
      hooks.onInit?.(mgr);
    };

    return {
      applyDrag: (wx, wy) => {
        init();
        inner.applyDrag(wx, wy);
        hooks.onApply?.(mgr);
        PipperNode.updateProximity(arenaNode, params);
      },
      endDrag: (onStockStrip) => {
        if (onStockStrip) {
          this._remove(arenaNode, mgr, targetNode);
          this.deleteOrphanEdges(arenaNode);
        } else if (initialised) {
          hooks.onConnect?.(mgr);
          this._absorbJunctions(arenaNode, params);
          this.settle(arenaNode, params);
        }
        PipperNode.clearDragState(arenaNode);
        BasicCollectionNode._sortSubtree(arenaNode.subtree);
        inner.endDrag?.(onStockStrip);
      },
    };
  }

  // ── the three drags ──────────────────────────────────────────────

  // An edge end, grabbed at the pip.  Its whole coincident cluster travels.
  _wrapEndpointDrag(arenaNode, hitResult, pipIdx, params) {
    const inner = hitResult.interactions;
    if (!inner) return;

    const edge = hitResult.node;
    const mgr = PipperNode.manager(arenaNode);
    const cluster = mgr.followerCluster(edge, pipIdx).map(e => ({ node: e.node, pip: e.pip }));

    hitResult.interactions = this._createDragInteractions(arenaNode, edge, inner, params, {
      onInit: () => {
        const set = mgr.setFor(edge, pipIdx);
        if (set) mgr.detachTiles(set);
        PipperNode.setDraggedRefs(arenaNode, cluster, params);
      },
      onApply: () => {
        const pos = mgr.pipsOf(edge, params)[pipIdx];
        if (pos) {
          for (const ref of cluster) {
            if (ref.node === edge && ref.pip === pipIdx) continue;
            Utils.setPipFn(ref.node)?.(Values, ref.node, { idx: ref.pip, x: pos.x, y: pos.y });
          }
        }
        this.layout(arenaNode, params);
      },
      onConnect: () => this._connectClusterOnDrop(arenaNode, cluster, params),
    });
  }

  // An edge or junction grabbed by its body: it parts from everything, then
  // takes up whatever it is dropped beside.
  _wrapFollowerBodyDrag(arenaNode, hitResult, child, params) {
    const inner = hitResult.interactions;
    if (!inner) return;

    hitResult.interactions = this._createDragInteractions(arenaNode, child, inner, params, {
      onInit: (mgr) => {
        mgr.removeNode(child);
        PipperNode.setDraggedPips(arenaNode, [child], params);
      },
      onConnect: () => this.connectNearbyPips(arenaNode, child, params),
    });
  }

  // A tile nobody else claimed.  Its pips anchor, so its edges simply follow.
  _wrapTileBodyDrag(arenaNode, hitResult, child, params) {
    const inner = hitResult.interactions;
    if (!inner) return;

    hitResult.interactions = this._createDragInteractions(arenaNode, child, inner, params, {
      onInit: () => PipperNode.setDraggedPips(arenaNode, [child], params),
      onApply: () => this.layout(arenaNode, params),
      onConnect: () => this.connectNearbyPips(arenaNode, child, params),
    });
  }

  // A junction: its tile joins become real edges so it can be pulled away.
  _wrapJunctionDrag(arenaNode, hitResult, child, params) {
    const inner = hitResult.interactions;
    if (!inner) return;

    hitResult.interactions = this._createDragInteractions(arenaNode, child, inner, params, {
      onInit: (mgr) => {
        for (const { set, entry } of mgr.entriesOf(child)) {
          const tiles = set.filter(e => mgr.kindAt(e.node, e.pip).anchors)
                           .map(e => ({ node: e.node, pip: e.pip }));
          for (const tile of tiles) {
            mgr.disjoin(tile.node, tile.pip);
            this.spawnEdge(arenaNode, tile, entry, params);
          }
        }
        PipperNode.setDraggedPips(arenaNode, [child], params);
      },
      onApply: () => {
        this.layout(arenaNode, params);
        this._scanSnapEdge(arenaNode, child, params);
      },
      onConnect: () => {
        const snaps = arenaNode.state?.snapEdges;
        if (snaps?.length) {
          for (const snap of snaps) this._splitEdgeAtJunction(arenaNode, child, snap, params);
          return;
        }
        this.connectNearbyPips(arenaNode, child, params);
      },
    });
  }

  // ── snap-to-edge ─────────────────────────────────────────────────

  _scanSnapEdge(arenaNode, junction, params) {
    const state = (arenaNode.state ||= {});
    state.snapEdges = null;

    const jx = junction.value.x, jy = junction.value.y;
    const snaps = [];

    for (const child of arenaNode.subtree) {
      const segments = Utils.classOfNode(child)?.getSnapSegments?.(Values, child, params);
      if (!segments) continue;

      for (const seg of segments) {
        const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1, lenSq = dx * dx + dy * dy;
        if (lenSq < 1) continue;

        const t = Math.max(0, Math.min(1, ((jx - seg.x1) * dx + (jy - seg.y1) * dy) / lenSq));
        const exclude = 8 / Math.sqrt(lenSq);
        if (t < exclude || t > 1 - exclude) continue;

        const px = seg.x1 + t * dx, py = seg.y1 + t * dy;
        if (Math.hypot(jx - px, jy - py) < EdgeSnapController.SPLIT_DIST)
          snaps.push({ edge: child, t, x: px, y: py });
      }
    }
    state.snapEdges = snaps.length ? snaps : null;
  }

  _splitEdgeAtJunction(arenaNode, junction, snap, params) {
    const mgr = PipperNode.manager(arenaNode);
    const edge = snap.edge;
    if (!arenaNode.subtree.includes(edge)) return;

    const group = edge.value.group;
    Values.setValue(Values, junction, params,
      group ? { x: snap.x, y: snap.y, group } : { x: snap.x, y: snap.y });

    // What the old edge reached at either end.
    const reach = pip => {
      const set = mgr.setFor(edge, pip);
      const other = set?.find(e => e.node !== edge);
      return other ? { node: other.node, pip: other.pip } : null;
    };
    const near = reach(0), far = reach(1);

    const values = Utils.classOfNode(edge).splitValues(edge, snap);
    if (group) for (const v of values) v.group = group;

    this._remove(arenaNode, mgr, edge);

    const halves = values.map(v => SYS.makeNode(edge.type, v));
    arenaNode.subtree.push(...halves);

    const jRef = { node: junction, pip: 0 };
    if (near) mgr.join({ node: halves[0], pip: 0 }, near, params);
    mgr.join({ node: halves[0], pip: 1 }, jRef, params);
    mgr.join({ node: halves[1], pip: 0 }, jRef, params);
    if (far) mgr.join({ node: halves[1], pip: 1 }, far, params);
  }

  getExtraAffordances(arenaNode) {
    const out = [];
    for (const snap of arenaNode.state?.snapEdges || []) {
      const v = snap.edge.value;
      out.push(
        { x: snap.x, y: snap.y, state: 'edge' },
        { x: v.x1,   y: v.y1,   state: 'edge' },
        { x: v.x2,   y: v.y2,   state: 'edge' },
      );
    }
    return out;
  }

  // ── absorbing pass-through junctions ─────────────────────────────
  /* A junction sharing a set with a tile and with real edge ends was only
     a staging post for those edges reaching the tile.  A junction sitting
     alone on a tile survives: it is a handle for edges yet to come. */

  /* A pip set holds at most one junction.  When another is dragged onto it
     the newcomer wins and the incumbent is absorbed, its other connections
     rehomed onto the survivor. */
  _absorbDuplicateJunctions(arenaNode, params) {
    const mgr = PipperNode.manager(arenaNode);
    let changed = true;

    while (changed) {
      changed = false;
      for (const set of [...mgr.sets]) {
        const junctions = [...new Set(set.filter(e => mgr.isJunction(e.node)).map(e => e.node))];
        if (junctions.length < 2) continue;

        const winner = junctions.find(n => PipperNode.isDragged(arenaNode, n, 0)) ?? junctions[0];
        for (const loser of junctions) {
          if (loser === winner) continue;
          for (const { set: other, entry } of mgr.entriesOf(loser)) {
            if (other === set) continue;
            mgr.disjoin(loser, entry.pip);
            const survivor = other.find(e => e.node !== loser);
            if (survivor) mgr.join({ node: winner, pip: 0 }, survivor, params);
          }
          this._remove(arenaNode, mgr, loser);
          changed = true;
        }
      }
    }
  }

  _absorbJunctions(arenaNode, params) {
    const mgr = PipperNode.manager(arenaNode);
    this._absorbDuplicateJunctions(arenaNode, params);
    let changed = true;

    while (changed) {
      changed = false;
      for (const child of [...arenaNode.subtree]) {
        if (!mgr.isJunction(child)) continue;

        const absorbable = mgr.entriesOf(child).some(({ set, entry }) =>
          set.some(e => e.node !== child && mgr.kindAt(e.node, e.pip).anchors) &&
          set.some(e => e.node !== child && mgr.isEdge(e.node)));

        if (!absorbable) continue;
        this._remove(arenaNode, mgr, child);
        changed = true;
      }
    }
    this.deleteOrphanEdges(arenaNode);
  }

  // ── claim ────────────────────────────────────────────────────────

  wrapHit(ctxMix, arenaNode, hitResult, params, endpointInfo) {
    const mgr = PipperNode.manager(arenaNode);
    const node = hitResult.node;

    if (endpointInfo) {
      this._wrapEndpointDrag(arenaNode, hitResult, endpointInfo.pipIdx, params);
    } else if (mgr.isJunction(node)) {
      this._wrapJunctionDrag(arenaNode, hitResult, node, params);
    } else if (mgr.isFollower(node)) {
      this._wrapFollowerBodyDrag(arenaNode, hitResult, node, params);
    } else {
      this._wrapTileBodyDrag(arenaNode, hitResult, node, params);
    }
    return true;
  }
}
SYS.CONTROLS.push({ type: 'checkbox', id: 'enableEdgeSnap', label: 'Edge Snap', value: true })
