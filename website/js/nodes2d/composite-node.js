/**
 * `composite` — a group of parts in its own frame: position, rotation, scale (container)
 *
 * A container: its children are placed in local coordinates relative to the
 * composite, which moves, turns and scales them as one.  A molecule of
 * several atoms, a lever with its knob, a striped barrel.
 *
 *   value = { x, y, rotation, scale, visible }
 *
 * rotation is in degrees, clockwise.  It pushes T.child({x, y}, scale,
 * scale, rotation) for its children in draw and hit-test, and restores it
 * after.  visible: false skips the whole group.
 */

import { SYS } from '../omni-support/sys.js';
import { skipChildren } from '../omni-support/scene.js';


class CompositeNode {
  static _push(ctxMix, node, params, tag) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    node['_savedT_' + tag] = ctxMix.T;
    if (v.visible === false) { skipChildren(ctxMix); return; }
    const k = v.scale ?? 1;
    ctxMix.T = ctxMix.T.child({ x: v.x ?? 0, y: v.y ?? 0 }, k, k, (v.rotation ?? 0) * Math.PI / 180);
  }
  static _pop(ctxMix, node, tag) {
    ctxMix.T = node['_savedT_' + tag];
    node['_savedT_' + tag] = null;
  }

  static before_draw2d(ctxMix, node, params) { CompositeNode._push(ctxMix, node, params, 'draw'); }
  static after_draw2d(ctxMix, node)          { CompositeNode._pop(ctxMix, node, 'draw'); }
  static before_hit_test(ctxMix, node, params) { CompositeNode._push(ctxMix, node, params, 'hit'); }
  static after_hit_test(ctxMix, node)          { CompositeNode._pop(ctxMix, node, 'hit'); }
}

SYS.NODE_CLASSES.push({ name: 'composite', cls: CompositeNode });

export { CompositeNode };
