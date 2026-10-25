import { SYS, sceneRegistry } from '../omni-support/sys.js';
import '../nodes2d/basic-collection-node.js';   // 'basic-collection'
import '../nodes2d/chrome-node.js';   // 'chrome-node'
import '../nodes2d/clip-node.js';   // 'clip-node'
import '../nodes2d/flyweight-array-node.js';   // 'flyweight-array'
export { makeArray };

/* ─────────────────────────────────────────────────────────────────────────────
make-array — one flyweight node standing for a whole data array, with the
selection and hover channel wired through it.

clip-node and chrome-node are reached only when the leaf class declares
clipPath or drawOverlay.  The imports below are therefore an over-estimate for
some models: the type is named here, so a slice keeps it.  That is the honest
answer until the branch itself is a separate builder.
──────────────────────────────────────────────────────────────────────────── */

function makeArray(leafType, data, opts = {}) {
  const cls = sceneRegistry.meta[leafType]?.nodeClass;
  const count = opts.count ?? cls?.getCount?.(data) ?? data?.length ?? 0;

  const proto = SYS.makeNode(leafType, {});
  const fly = SYS.makeNode('flyweight-array', {
    count,
    drawOrder: opts.drawOrder ?? cls?.getDrawOrder?.(data, count),
    hitOrder:  opts.hitOrder  ?? cls?.getHitOrder?.(data, count),
    data,
  }, [proto]);

  /* Shared geometry is cheap arithmetic derived from the pane and the data,
     and both can change between frames, so it is simply recomputed.  Caching
     it needed a key over everything a control might touch, and got it wrong. */

  const itemValue = opts.getValue ?? ((mix, n, p, i) => data?.[i]);
  const selectable = opts.selectable !== false;

  fly.inst = {
    visibleRange: opts.visibleRange,
    getCount: cls?.getCount ? (node) => cls.getCount(node.value.data) : null,

    getValue: (mix, node, params, i) => {
      const base = itemValue(mix, node, params, i);
      if (!base) return base;
      return {
        ...base,
        selected: !!node.state?.selected?.has(i),
        hovered: node.state?.hovered === i,
      };
    },

    /* Selection needs no flag of its own: a family whose setValue keeps
       `selected` has selectable items, and one that drops it does not. */
    setValue: (mix, node, params, i, patch) => {
      const st = (node.state ||= {});
      let changed = false;

      if ('selected' in patch && selectable) {
        const set = (st.selected ||= new Set());
        const was = set.has(i);
        if (patch.selected && !was) { set.add(i); changed = true; }
        else if (!patch.selected && was) { set.delete(i); changed = true; }
      }
      if ('hovered' in patch) {
        const now = patch.hovered ? i : (st.hovered === i ? null : st.hovered);
        if (st.hovered !== now) { st.hovered = now; changed = true; }
      }
      if (opts.setValue) changed = opts.setValue(mix, node, params, i, patch) || changed;
      return changed;
    },
  };

  const kids = [];
  const chrome = (which) => {
    const n = SYS.makeNode('chrome-node', { data });
    n.inst = { drawFn: (mix, node, p) => cls[which](mix, node, p) };
    return n;
  };
  if (cls?.drawBackground) kids.push(chrome('drawBackground'));
  kids.push(fly);
  if (cls?.drawOverlay) kids.push(chrome('drawOverlay'));

  /* Whatever the root turns out to be, it carries the data and a way to
     reach the array, so a model need not know how it was assembled. */
  const finish = (root) => {
    root.inst = { ...(root.inst || {}), flyweight: fly };
    return root;
  };

  if (!cls?.clipPath) return finish(SYS.makeNode('basic-collection', { data }, kids));

  /* A clip brackets only what it should contain.  The overlay is drawn
     after it is released, so it sits outside. */
  const overlay = cls?.drawOverlay ? kids.pop() : null;
  const clip = SYS.makeNode('clip-node', { data }, [
    SYS.makeNode('basic-collection', { data }, kids),
  ]);
  clip.inst = { pathFn: (mix, node, p) => cls.clipPath(mix, node, p) };
  return finish(SYS.makeNode('basic-collection', { data }, overlay ? [clip, overlay] : [clip]));
}
