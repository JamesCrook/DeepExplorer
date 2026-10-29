import { Geo } from './geo.js';
import { Utils } from '../omni-support/utils.js';
import { PipperNode } from '../nodes2d/pipper-node.js';
export { SnapEngine };

// SnapEngine — ranks admissible tile-to-tile joins by distance, and applies them
/* ─────────────────────────────────────────────────────────────────────────────
Every question about whether a join is legal now belongs to PipSetManager:
this class only asks canJoin and sorts what comes back.  Whether a build
permits rafting at all is a manager rule (maxTilePips), not a test here.
──────────────────────────────────────────────────────────────────────────── */
class SnapEngine {

  // Candidate joins between the moving group and everything else.
  static find(mgr, subtree, group, maxDist, params) {
    const moving = [], resting = [];
    for (const node of subtree)
      (group.has(node) ? moving : resting).push(node);

    const free = nodes => mgr.freePips(nodes, params, ref => mgr.kindOf(ref).anchors);
    const movingPips = free(moving), restingPips = free(resting);

    const pairs = [];
    for (const m of movingPips) {
      for (const r of restingPips) {
        if (!mgr.canTileJoin(m.ref, r.ref, params)) continue;
        const dist = Geo.dist(m.pos, r.pos);
        if (dist >= maxDist) continue;
        pairs.push({
          from: m.ref, to: r.ref,
          dx: r.pos.x - m.pos.x,
          dy: r.pos.y - m.pos.y,
          dist,
        });
      }
    }
    return pairs.sort((a, b) => a.dist - b.dist);
  }

  static _connect(mgr, arena, pair, params) {
    // Anything occupying either pip must give way before tiles may abut:
    // controllers reap what they own, then any survivor is released.
    PipperNode.notify(arena, 'clearForTileJoin', arena, [pair.from, pair.to], params);
    mgr.freeForTileJoin(pair.from);
    mgr.freeForTileJoin(pair.to);
    mgr.join(pair.from, pair.to, params);
  }

  static apply(mgr, arena, subtree, group, snapDist, params) {
    const candidates = SnapEngine.find(mgr, subtree, group, snapDist, params);
    if (!candidates.length) return false;

    const primary = candidates[0];
    for (const node of group)
      Utils.moveBy(node, primary.dx, primary.dy);

    SnapEngine._connect(mgr, arena, primary, params);

    /* Whatever else came into exact alignment as a result now joins too.
       Bounded: if canTileJoin ever admits a pair that join then refuses, an
       unbounded loop would spin forever rather than merely misbehave. */
    let again = true, guard = subtree.length + 8;
    while (again && guard-- > 0) {
      again = false;
      for (const pair of SnapEngine.find(mgr, subtree, group, 2, params)) {
        if (!mgr.canTileJoin(pair.from, pair.to, params)) continue;
        const before = mgr.sets.length;
        SnapEngine._connect(mgr, arena, pair, params);
        if (mgr.sets.length !== before || mgr.same(pair.from, pair.to)) again = true;
      }
    }
    return true;
  }
}
