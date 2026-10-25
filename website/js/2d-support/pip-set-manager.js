import { Geo } from './geo.js';
import { PipKinds } from './pip-kind.js';
import { Values } from '../omni-support/values.js';
import { Utils } from '../omni-support/utils.js';
export { PipSetManager };

/* ─────────────────────────────────────────────────────────────────────────────
PipSetManager — owns the pip sets of one arena, and the rules they obey.

A pip set is a dumb array of entries { node, pip }: pips that are coincident
in space.  It needs no class of its own.  The manager holds the collection and
the configured constraints.

Bidirectional without identifiers
  pip -> set   node.state.pipSets[pipIndex]  — a direct reference, or null
  set -> pips  the array itself, holding real node references

A pip belongs to at most one set, so the back-reference is a slot, not a list.
Sets are mutated in place and never recreated, so held references stay valid;
only a merge repoints slots, and only for the absorbed set's members.

There are no run-time ids.  Ids exist at rest: a scene is loaded from
{ a, pipA, b, pipB } specs and projected back out again at save time.  The
identifiers are like BASIC line numbers — structure survives the round trip,
the numbers need not.

Configured constraints (held in inst, not value — they persist with the
program, not with the model)
  maxTilePips  2 permits rafting, 1 forbids it outright
  exclusive    a set holding two tile pips admits nothing further
  abutment     joining tile pips must face oppositely
──────────────────────────────────────────────────────────────────────────── */
class PipSetManager {
  static SNAP_DIST = 12;

  constructor(rules = {}) {
    this.maxTilePips = rules.maxTilePips ?? 2;
    this.snapDist    = rules.snapDist ?? PipSetManager.SNAP_DIST;
    this.sets        = [];
  }

  // ── pip access ───────────────────────────────────────────────────

  pipsOf(node, params) {
    const fn = Utils.pipsFn(node);
    return fn ? fn(Values, node, params) : [];
  }

  posOf(ref, params) { return this.pipsOf(ref.node, params)[ref.pip] || null; }

  kindAt(node, pip) {
    const cls = Utils.classOfNode(node);
    const kinds = cls?.getPipKinds?.(node);
    return kinds?.[pip] || cls?.meta?.pipKind || PipKinds.TILE;
  }

  kindOf(ref) { return this.kindAt(ref.node, ref.pip); }

  // Does every pip of this node follow?  (An edge or a junction, not a tile.)
  isFollower(node) {
    if (!Utils.pipsFn(node)) return false;
    const n = this.pipsOf(node, {}).length;
    if (n === 0) return false;
    for (let i = 0; i < n; i++)
      if (!this.kindAt(node, i).follows) return false;
    return true;
  }

  // A follower that is not a junction: a plain edge.
  isEdge(node) {
    if (!this.isFollower(node)) return false;
    const n = this.pipsOf(node, {}).length;
    for (let i = 0; i < n; i++)
      if (this.kindAt(node, i).splits) return false;
    return true;
  }

  isJunction(node) {
    const n = this.pipsOf(node, {}).length;
    for (let i = 0; i < n; i++)
      if (this.kindAt(node, i).splits) return true;
    return false;
  }

  // ── set membership ───────────────────────────────────────────────

  slots(node) {
    const state = (node.state ||= {});
    return (state.pipSets ||= []);
  }

  setFor(node, pip) { return this.slots(node)[pip] || null; }

  // Every occupied slot of a node, as { set, entry }.
  entriesOf(node) {
    const out = [], slots = this.slots(node);
    for (let pip = 0; pip < slots.length; pip++) {
      const set = slots[pip];
      if (set) out.push({ set, entry: { node, pip } });
    }
    return out;
  }

  has(ref) { return this.setFor(ref.node, ref.pip) != null; }

  same(a, b) {
    const sa = this.setFor(a.node, a.pip);
    return sa != null && sa === this.setFor(b.node, b.pip);
  }

  tileCount(members) {
    let n = 0;
    for (const e of members)
      if (this.kindAt(e.node, e.pip).anchors) n++;
    return n;
  }

  // ── constraints ──────────────────────────────────────────────────

  _abut(a, b, params) {
    const pa = this.posOf(a, params), pb = this.posOf(b, params);
    return !!(pa && pb && Geo.pipsOpposite(pa.out, pb.out));
  }

  /* The single predicate that replaces pipUsed / pipUsedDirect /
     _pipCanConnect / the opposite-facing test. */
  canJoin(a, b, params) {
    if (a.node === b.node && a.pip === b.pip) return false;
    if (this.same(a, b)) return false;

    const sa = this.setFor(a.node, a.pip), sb = this.setFor(b.node, b.pip);

    // A tile pip is single-use: once it is in a set it takes no further joins.
    if (this.kindOf(a).anchors && sa) return false;
    if (this.kindOf(b).anchors && sb) return false;

    const members = [...(sa || [a]), ...(sb || [b])];
    const tiles = this.tileCount(members);
    if (tiles > this.maxTilePips) return false;

    if (tiles === 2) {
      // A tile-to-tile join is exclusive — neither side may bring anything else.
      if (members.length > 2) return false;
      if (!this._abut(a, b, params)) return false;
    }
    return true;
  }

  /* A tile pip already carrying followers is not blocked: a tile-to-tile
     join outranks them, and they are squeezed out to make room.  A pip held
     by another tile is not squeezable — that join is already exclusive. */
  squeezable(ref) {
    if (!this.kindOf(ref).anchors) return false;
    const set = this.setFor(ref.node, ref.pip);
    if (!set) return false;
    return !set.some(e => e.node !== ref.node && this.kindAt(e.node, e.pip).anchors);
  }

  /* Whether two tile pips may abut, ignoring followers that would give way.
     Callers must free the pips (freeForTileJoin) before calling join. */
  canTileJoin(a, b, params) {
    if (a.node === b.node && a.pip === b.pip) return false;
    if (this.same(a, b)) return false;
    if (this.maxTilePips < 2) return false;
    if (!this.kindOf(a).anchors || !this.kindOf(b).anchors) return false;
    if (this.has(a) && !this.squeezable(a)) return false;
    if (this.has(b) && !this.squeezable(b)) return false;
    return this._abut(a, b, params);
  }

  // Release a tile pip from whatever followers are holding it.
  freeForTileJoin(ref) {
    if (this.squeezable(ref)) this.disjoin(ref.node, ref.pip);
  }

  // ── joining and parting ──────────────────────────────────────────

  join(a, b, params) {
    if (!this.canJoin(a, b, params)) return null;

    const sa = this.setFor(a.node, a.pip), sb = this.setFor(b.node, b.pip);
    if (sa && sb) return this._merge(sa, sb);
    if (sa) return this._insert(sa, b);
    if (sb) return this._insert(sb, a);

    const set = [{ node: a.node, pip: a.pip }, { node: b.node, pip: b.pip }];
    this.slots(a.node)[a.pip] = set;
    this.slots(b.node)[b.pip] = set;
    this.sets.push(set);
    return set;
  }

  _insert(set, ref) {
    set.push({ node: ref.node, pip: ref.pip });
    this.slots(ref.node)[ref.pip] = set;
    return set;
  }

  // Mutate `into` in place so references held elsewhere stay valid.
  _merge(into, from) {
    for (const e of from) {
      into.push(e);
      this.slots(e.node)[e.pip] = into;
    }
    from.length = 0;
    const i = this.sets.indexOf(from);
    if (i >= 0) this.sets.splice(i, 1);
    return into;
  }

  disjoin(node, pip) {
    const set = this.setFor(node, pip);
    if (!set) return;
    this.slots(node)[pip] = null;
    const i = set.findIndex(e => e.node === node && e.pip === pip);
    if (i >= 0) set.splice(i, 1);
    this._prune(set);
  }

  // Drop a whole set, freeing every member's slot.
  drop(set) {
    for (const e of set) this.slots(e.node)[e.pip] = null;
    set.length = 0;
    const i = this.sets.indexOf(set);
    if (i >= 0) this.sets.splice(i, 1);
  }

  _prune(set) {
    if (set.length >= 2) return;
    this.drop(set);
  }

  removeNode(node) {
    for (const { set, entry } of this.entriesOf(node)) {
      this.slots(node)[entry.pip] = null;
      const i = set.findIndex(e => e.node === node);
      if (i >= 0) set.splice(i, 1);
      this._prune(set);
    }
    this.slots(node).length = 0;
  }

  // Remove every member of `set` that is not a follower, keeping the
  // followers grouped.  Used when a cluster is dragged off its tiles.
  detachTiles(set) {
    for (let i = set.length - 1; i >= 0; i--) {
      const e = set[i];
      if (this.kindAt(e.node, e.pip).follows) continue;
      this.slots(e.node)[e.pip] = null;
      set.splice(i, 1);
    }
    this._prune(set);
  }

  // ── traversal ────────────────────────────────────────────────────

  /* One walk, parameterised by a membership predicate.  This replaces
     component / _directComponent / _expandGroupWithEdges' inner walk.
     Returns a Set of nodes — not ids. */
  walk(startNode, via = () => true) {
    const seen = new Set([startNode]), queue = [startNode];
    while (queue.length) {
      const cur = queue.shift();
      for (const { set, entry } of this.entriesOf(cur)) {
        for (const other of set) {
          if (other.node === cur) continue;
          if (seen.has(other.node)) continue;
          if (!via(other, entry, set)) continue;
          seen.add(other.node);
          queue.push(other.node);
        }
      }
    }
    return seen;
  }

  // Everything reachable, edges included.
  component(node) { return this.walk(node); }

  // Tiles reachable through tile-to-tile joins only: the raft.
  raft(node) { return this.walk(node, other => this.kindOf(other).anchors); }

  /* A cluster of coincident follower pips is now simply the set itself —
     coalescing already put them in one array, so no walk is needed. */
  followerCluster(node, pip) {
    const set = this.setFor(node, pip);
    if (!set) return [{ node, pip }];
    return set.filter(e => this.kindAt(e.node, e.pip).follows);
  }

  // ── queries ──────────────────────────────────────────────────────

  /* The single nearest-pip scan.  Replaces _findNearestPip, the inner loop
     of connectFreeEdgePips, and the candidate half of SnapEngine._findPairs. */
  nearest(subtree, pos, params, opts = {}) {
    const maxDist = opts.maxDist ?? this.snapDist;
    const skip    = opts.skip ?? (() => false);
    const accept  = opts.accept ?? (() => true);

    let best = null, bestD = maxDist;
    for (const node of subtree) {
      const pips = this.pipsOf(node, params);
      for (let pip = 0; pip < pips.length; pip++) {
        const ref = { node, pip };
        if (skip(ref, pips[pip])) continue;
        if (!accept(ref, pips[pip])) continue;
        const d = Math.hypot(pos.x - pips[pip].x, pos.y - pips[pip].y);
        if (d < bestD) { bestD = d; best = ref; }
      }
    }
    return best;
  }

  // Every free pip of the given nodes, as { ref, pos }.
  freePips(nodes, params, accept = () => true) {
    const out = [];
    for (const node of nodes) {
      const pips = this.pipsOf(node, params);
      for (let pip = 0; pip < pips.length; pip++) {
        const ref = { node, pip };
        if (!accept(ref, pips[pip])) continue;
        out.push({ ref, pos: pips[pip] });
      }
    }
    return out;
  }

  // ── strain ───────────────────────────────────────────────────────
  // Only exclusive tile-to-tile sets break under strain; nexuses are
  // maintained by layout and simply follow.
  breakStrained(maxDist, params) {
    for (let i = this.sets.length - 1; i >= 0; i--) {
      const set = this.sets[i];
      if (set.length !== 2) continue;
      if (this.tileCount(set) !== 2) continue;
      const pa = this.posOf(set[0], params), pb = this.posOf(set[1], params);
      if (!pa || !pb) { this.drop(set); continue; }
      if (Geo.dist(pa, pb) > maxDist) this.drop(set);
    }
  }

  // ── ids at rest ──────────────────────────────────────────────────

  /* Build sets from id-based specs.  Accepts the pair form the models and
     the PEG parser emit, { a, pipA, b, pipB }, and the older array form
     [{ id, pip }, ...].  Ids are resolved to references and then discarded. */
  resolve(subtree, specs, params) {
    if (!specs || !specs.length) return;
    const byId = new Map(subtree.map(n => [n.value.id, n]));
    const ref = (id, pip) => {
      const node = byId.get(id);
      return node ? { node, pip } : null;
    };
    for (const spec of specs) {
      if (Array.isArray(spec)) {
        const first = ref(spec[0]?.id, spec[0]?.pip);
        if (!first) continue;
        for (let i = 1; i < spec.length; i++) {
          const other = ref(spec[i].id, spec[i].pip);
          if (other) this.join(first, other, params);
        }
        continue;
      }
      const a = ref(spec.a, spec.pipA), b = ref(spec.b, spec.pipB);
      if (a && b) this.join(a, b, params);
    }
  }

  /* Project fresh ids back out.  The identifiers are generated here and are
     not the ones the scene was loaded with. */
  toSpecs(subtree) {
    const idOf = new Map(subtree.map((n, i) => [n, i]));
    return this.sets
      .filter(set => set.length >= 2)
      .map(set => set
        .filter(e => idOf.has(e.node))
        .map(e => ({ id: idOf.get(e.node), pip: e.pip })));
  }
}
