import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { FlyweightIterator } from '../omni-support/flyweight-iterator.js';
export { FlyweightArrayNode };

/* ─────────────────────────────────────────────────────────────────────────────
FlyweightArrayNode — draws N copies of one proto child.

The proto is written as an ordinary node and never learns that it is shared.
The model says how an index becomes a value, and what a write to an item
means; this class only scopes those to the item currently being visited.

  value.count            how many items
  value.drawOrder        visiting order for layout and drawing
  value.hitOrder         visiting order for hit testing (default: reverse draw)

  inst.getValue(ctxMix, node, params, i)         -> the item's value
  inst.setValue(ctxMix, node, params, i, patch)  -> true if changed
  inst.visibleRange(ctxMix, node, params)        -> [start, end) to cull to

Selection needs no flag: a model whose setValue does something with `selected`
has selectable items, and one whose setValue drops it does not.
──────────────────────────────────────────────────────────────────────────── */
class FlyweightArrayNode {
  static clear_selection(ctxMix, node, params) {
    const st = node.state;
    if (st?.selected?.size) st.selected.clear();
  }

  /* Asked for rather than frozen: a control that changes bytes-per-row
     changes how many chunks there are. */
  static count(node) { return node.inst?.getCount?.(node) ?? node.value.count ?? 0; }

  static *_order(ctxMix, node, params, phase) {
    const v = node.value;
    const [from, to] = node.inst?.visibleRange?.(ctxMix, node, params)
                    ?? [0, FlyweightArrayNode.count(node)];

    const listed = phase === 'hit_test' ? (v.hitOrder ?? v.drawOrder) : v.drawOrder;
    if (listed) {
      const seq = (phase === 'hit_test' && !v.hitOrder) ? [...listed].reverse() : listed;
      for (const i of seq) if (i >= from && i < to) yield i;
      return;
    }
    if (phase === 'hit_test') { for (let i = to - 1; i >= from; i--) yield i; return; }
    for (let i = from; i < to; i++) yield i;
  }

  static valueAt(node, ctxMix, params, index) {
    const getValue = node.inst?.getValue;
    return getValue ? getValue(ctxMix, node, params, index) : { index };
  }

  static writeAt(node, ctxMix, params, index, patch) {
    const setValue = node.inst?.setValue;
    return setValue ? !!setValue(ctxMix, node, params, index, patch) : false;
  }

  static _install(ctxMix, node, params, phase) {
    ctxMix.iterators.pop();
    const iter = new FlyweightIterator(FlyweightArrayNode._order(ctxMix, node, params, phase));
    ctxMix.iterators.push(iter);

    const proto = node.subtree?.[0];
    if (!proto) return;

    // Scoped to whichever item the iterator is on when these are called.
    proto.flyFn = (mix, n, p)    => FlyweightArrayNode.valueAt(node, mix, p, iter.current);
    proto.setFn = (mix, n, p, x) => FlyweightArrayNode.writeAt(node, mix, p, iter.current, x);
  }

  static before_layout(ctxMix, node, params)   { FlyweightArrayNode._install(ctxMix, node, params, 'layout'); }
  static before_draw2d(ctxMix, node, params)   { FlyweightArrayNode._install(ctxMix, node, params, 'draw2d'); }
  static before_hit_test(ctxMix, node, params) { FlyweightArrayNode._install(ctxMix, node, params, 'hit_test'); }

  /* A hit landed on the shared proto.  Bind every interaction to this item,
     so that the app can act on the hit long after the walk has ended without
     ever knowing that an index exists.  Wrapping composes: a nested flyweight
     wraps these again, adding its own scope. */
  static after_child_hit_test(ctxMix, node, params, child) {
    const hit = ctxMix.hitResult;
    if (!hit || hit.node !== child) return;

    const index = ctxMix.iterators.at(-1)?.current ?? 0;
    const inner = hit.interactions || {};

    hit.interactions = {
      ...inner,
      getValue:   ()      => FlyweightArrayNode.valueAt(node, ctxMix, params, index),
      setValue:   (patch) => FlyweightArrayNode.writeAt(node, ctxMix, params, index, patch),
      getTooltip: inner.getTooltip
        ?? (() => FlyweightArrayNode.valueAt(node, ctxMix, params, index)?.tooltip ?? null),
    };
    ctxMix.abortPhase = true;
  }
}

SYS.NODE_CLASSES.push({ name: 'flyweight-array', cls: FlyweightArrayNode });;
