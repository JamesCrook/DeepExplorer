import { sceneRegistry } from '../omni-support/sys.js';
import { Utils } from '../omni-support/utils.js';
export { BasicCollectionNode };
class BasicCollectionNode {
  // Selection lives on the item, so clearing it is a walk over the scene.
  static clear_selection(ctxMix, node, params) {
    if (node.state) node.state.selected = undefined;
  }

  static _sortSubtree(sub) {
    sub.sort((a, b) => {
      const az = Utils.classOfNode(a)?.meta?.zOrder ?? 0;
      const bz = Utils.classOfNode(b)?.meta?.zOrder ?? 0;
      return az - bz;
    });
  }

  static after_child_hit_test(ctxMix, node, params, child) {
    if (ctxMix.hitResult && ctxMix.hitResult.node === child && !ctxMix.hoverOnly) {
      const inner = ctxMix.hitResult.interactions;
      const sub = node.subtree;
      ctxMix.hitResult.interactions = {
        applyDrag: (wx, wy) => { if (inner && inner.applyDrag) inner.applyDrag(wx, wy); },
        endDrag: (onStrip) => {
          if (inner && inner.endDrag) inner.endDrag(onStrip);
          if (onStrip) {
            const idx = sub.indexOf(child);
            if (idx >= 0) sub.splice(idx, 1);
          }
        }
      };
    }
  }
}

sceneRegistry.registerNodeClass('basic-collection', BasicCollectionNode);
