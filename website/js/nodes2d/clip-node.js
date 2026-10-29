import { SYS, sceneRegistry } from '../omni-support/sys.js';
export { ClipNode };

// `clip-node` — brackets its subtree with a clipping path (container)
/* ─────────────────────────────────────────────────────────────────────────────
A clip is a save/restore pair around other nodes, so it is a wrapper rather
than a sibling: as siblings the bracket would depend on nothing between them
disturbing the context.  The path comes from value.pathFn, which the model
supplies; with none, this node is a plain pass-through.
──────────────────────────────────────────────────────────────────────────── */
class ClipNode {
  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    ctx.save();
    const path = node.inst?.pathFn;
    if (!path) return;
    ctx.beginPath();
    path(ctxMix, node, params);
    ctx.clip();
  }

  static after_draw2d(ctxMix, node, params) { ctxMix.ctx.restore(); }
}

SYS.NODE_CLASSES.push({ name: 'clip-node', cls: ClipNode });;
