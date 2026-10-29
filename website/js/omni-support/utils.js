import { sceneRegistry } from './sys.js';
import { Values } from './values.js';
export { Utils };

// Utils — ask a node for things without knowing its class: pips, detaching, moving

class Utils {
  static classOfNode(node) {
    if (!node) return null;
    return sceneRegistry.meta[node.type]?.nodeClass || null;
  }
  static hasAffordance(node, phaseName) {
    return node && sceneRegistry.hasPhase(node.type, phaseName);
  }

  /* Pip affordances may come from the class or, failing that, from its
     declared pip kind — so a decorative node becomes draggable-by-edge
     merely by declaring itself a junction. */
  static pipsFn(node) {
    const cls = Utils.classOfNode(node);
    return cls?.getPips ?? cls?.meta?.pipKind?.getPips ?? null;
  }

  static setPipFn(node) {
    const cls = Utils.classOfNode(node);
    return cls?.setPipPos ?? cls?.meta?.pipKind?.setPipPos ?? null;
  }

  /* Detach a child without knowing what else its parent holds it by.  Most
     parents hold a subtree and nothing more; an arena also holds pip sets,
     and says so by answering removeChild. */
  static removeChild(parent, child, params) {
    const cls = Utils.classOfNode(parent);
    if (cls?.removeChild) return cls.removeChild(parent, child, params);
    const idx = parent?.subtree?.indexOf(child) ?? -1;
    if (idx >= 0) parent.subtree.splice(idx, 1);
  }

  /* Translate a node without knowing how it stores its position. */
  static moveBy(node, dx, dy) {
    const cls = Utils.classOfNode(node);
    if (cls?.moveBy) return cls.moveBy(Values, node, { dx, dy });
    const c = cls?.getCentreXY?.(Values, node, {});
    if (c && cls?.setXY) return cls.setXY(Values, node, { x: c.x + dx, y: c.y + dy });
    const v = Values.getValue(Values, node, {}) || {};
    Values.setValue(Values, node, {}, { x: (v.x || 0) + dx, y: (v.y || 0) + dy });
  }
}
