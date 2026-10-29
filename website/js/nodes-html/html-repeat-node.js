import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { skipChildren } from '../omni-support/scene.js';
export { HtmlRepeatNode, HtmlVariantsNode, Clones };

// `html-repeat` and `html-variants` — one pattern node, many mounted copies
/* ─────────────────────────────────────────────────────────────────────────────
Both keep their first child as a pattern that is never mounted itself.  They
deep-copy it once per item, overlay the item's fields on the copy's value,
and mount the copies inside their own element.  The copies live on
node.inst.clones, which the harness indexes, so a click on a copy finds it,
its on entries run, and its group membership shows.

html-repeat     a list from data.  D+'s chat log, topic list and server column.
  items         an array of objects (a string becomes { text })
  itemsFrom     or the name of a param holding one; when the param is given a
                new array, the copies are rebuilt on the next update
  itemsSource   with itemsFrom: the name of a source.<name> in SYS.FUNCTIONS,
                fn(node, params) → items or a promise of them.  It is asked
                at each mount and its answer goes into the param, so a note
                that shows a live stream shows it fresh each time it opens.
                On failure the element says so (failText, then the error).
  pattern       a node type, for a repeat with no child: the copies are that
                type with each item as its value.  So a Markdown+ rule can
                emit a repeat of messages without a pattern node.
  class         for the element holding the copies

html-variants   one subject at several settings, side by side, each captioned
                with what differs.  For comparing design choices.
  variants      [{ label?, key: value, … }, …], each a hand-picked set of
                overrides; label is the caption's first line, not a field
  vary          or { key: [v1, v2, …] } for every combination of the lists
  class         for the grid

Copies are made from the pattern, so editing a copy in the Selected panel
changes that copy only, until the copies are rebuilt.  To change them all,
edit the pattern (in the model, or the Markdown+ it came from).
──────────────────────────────────────────────────────────────────────────── */

class Clones {
  /** A deep copy of a node with no runtime state, value overlaid with extra. */
  static copy(node, extra = {}) {
    return {
      type: node.type,
      value: { ...JSON.parse(JSON.stringify(node.value || {})), ...extra },
      subtree: (node.subtree || []).map(k => Clones.copy(k)),
    };
  }

  /* A context of its own for mounting copies, so the walk that reached this
     node keeps its iterator stack. */
  static mount(mix, clones, parentEl, params) {
    const sub = { ...mix, parentEl, parentStack: [], iterators: [], flyweight: {} };
    for (const c of clones) sceneRegistry.walkPhase(sub, 'mount', c, params);
  }
  static walk(mix, clones, phase, params) {
    const sub = { ...mix, parentStack: [], iterators: [], flyweight: {} };
    for (const c of clones) sceneRegistry.walkPhase(sub, phase, c, params);
  }
}

class HtmlRepeatNode {
  static meta = {
    editableFields: (node) => [
      { key: 'itemsFrom', label: 'Items from', type: 'text', value: node.value.itemsFrom ?? '' },
      { key: 'class',     label: 'Class',      type: 'text', value: node.value.class ?? '' },
    ],
  };

  static _items(node, params) {
    const v = node.value || {};
    const list = v.itemsFrom ? params[v.itemsFrom] : v.items;
    return (Array.isArray(list) ? list : []).map(x => (x && typeof x === 'object') ? x : { text: x });
  }

  static _pattern(node) {
    return node.subtree?.[0] ?? (node.value?.pattern ? { type: node.value.pattern, value: {}, subtree: [] } : null);
  }

  static _build(mix, node, params) {
    const pattern = HtmlRepeatNode._pattern(node);
    const items = HtmlRepeatNode._items(node, params);
    node.inst.itemsRef = node.value.itemsFrom ? params[node.value.itemsFrom] : node.value.items;
    node.inst.clones = pattern ? items.map(item => Clones.copy(pattern, item)) : [];
    Clones.mount(mix, node.inst.clones, node.inst.el, params);
  }

  /* Ask the source, if there is one, and put its answer in the param; the
     update that follows rebuilds the copies. */
  static _fetch(mix, node, params) {
    const v = node.value || {};
    if (!v.itemsSource || !v.itemsFrom) return;
    const rec = SYS.named(SYS.FUNCTIONS, 'source.' + v.itemsSource);
    if (!rec) { console.warn(`html-repeat: no source.${v.itemsSource} in SYS.FUNCTIONS`); return; }
    const el = node.inst.el, harness = mix.harness;
    Promise.resolve().then(() => rec.fn(node, params)).then(
      (items) => harness?.setParam(v.itemsFrom, Array.isArray(items) ? items : []),
      (err) => {
        if (!el.isConnected) return;
        const p = document.createElement('p');
        p.className = 'html-repeat-fail';
        p.textContent = `${v.failText ?? 'Not available'}: ${err?.message ?? err}`;
        el.replaceChildren(p);
      });
  }

  static _open(mix, node, params) {
    const el = document.createElement('div');
    el.className = 'html-repeat ' + (node.value.class || '');
    mix.parentEl.appendChild(el);
    node.inst = { ...(node.inst || {}), el };
    HtmlRepeatNode._build(mix, node, params);
    HtmlRepeatNode._fetch(mix, node, params);
  }

  static _update(mix, node, params) {
    const v = node.value, i = node.inst;
    if (!i?.el) return;
    if (v.itemsFrom && params[v.itemsFrom] !== i.itemsRef) {
      Clones.walk(mix, i.clones, 'teardown', params);
      i.el.replaceChildren();
      HtmlRepeatNode._build(mix, node, params);
      mix.harness?._index(node);
    } else {
      Clones.walk(mix, i.clones, 'update', params);
    }
  }

  // With a pattern child the walk calls before_*, and must not descend into
  // the pattern; with none (pattern by name) it calls the bare phase.
  static before_mount(ctxMix, node, params)    { HtmlRepeatNode._open(ctxMix, node, params); skipChildren(ctxMix); }
  static mount(ctxMix, node, params)           { HtmlRepeatNode._open(ctxMix, node, params); }
  static before_update(ctxMix, node, params)   { skipChildren(ctxMix); HtmlRepeatNode._update(ctxMix, node, params); }
  static update(ctxMix, node, params)          { HtmlRepeatNode._update(ctxMix, node, params); }
  static before_teardown(ctxMix, node, params) {
    skipChildren(ctxMix);
    Clones.walk(ctxMix, node.inst?.clones || [], 'teardown', params);
  }
  static teardown(ctxMix, node, params) {
    Clones.walk(ctxMix, node.inst?.clones || [], 'teardown', params);
  }
}

class HtmlVariantsNode {
  /* The list (or vary) is edited as JSON text; before_mount takes it when it
     parses, and keeps the last good one when it does not. */
  static meta = {
    editableFields: (node) => node.value.variants
      ? [{ key: 'variantsText', label: 'Variants', type: 'text', multiline: true,
           value: JSON.stringify(node.value.variants, null, 1) }]
      : [{ key: 'varyText', label: 'Vary', type: 'text', value: JSON.stringify(node.value.vary ?? {}) }],
  };

  static _takeText(v, textKey, key) {
    if (v[textKey] === undefined) return;
    try { v[key] = JSON.parse(v[textKey]); } catch { /* keep the last good one */ }
    delete v[textKey];
  }

  /** Every combination of the vary lists, as override objects. */
  static combos(vary) {
    let out = [{}];
    for (const [k, vals] of Object.entries(vary || {})) {
      out = out.flatMap(o => (Array.isArray(vals) ? vals : [vals]).map(x => ({ ...o, [k]: x })));
    }
    return out;
  }

  static before_mount(ctxMix, node, params) {
    HtmlVariantsNode._takeText(node.value, 'variantsText', 'variants');
    HtmlVariantsNode._takeText(node.value, 'varyText', 'vary');
    const el = document.createElement('div');
    el.className = 'html-variants ' + (node.value.class || '');
    ctxMix.parentEl.appendChild(el);
    node.inst = { ...(node.inst || {}), el, clones: [] };
    const subject = node.subtree?.[0];
    const list = Array.isArray(node.value.variants) ? node.value.variants : HtmlVariantsNode.combos(node.value.vary);
    for (const { label, ...o } of list) {
      const cell = document.createElement('figure');
      cell.className = 'html-variant';
      const cap = document.createElement('figcaption');
      if (label) {
        const b = document.createElement('b');
        b.textContent = label;
        cap.appendChild(b);
      }
      const what = document.createElement('span');
      what.textContent = Object.entries(o).map(([k, x]) => `${k} ${JSON.stringify(x)}`).join(' · ');
      cap.appendChild(what);
      cell.appendChild(cap);
      el.appendChild(cell);
      if (!subject) continue;
      const copy = Clones.copy(subject, o);
      node.inst.clones.push(copy);
      Clones.mount(ctxMix, [copy], cell, params);
    }
    skipChildren(ctxMix);
  }
  static before_update(ctxMix, node, params) {
    skipChildren(ctxMix);
    Clones.walk(ctxMix, node.inst?.clones || [], 'update', params);
  }
  static before_teardown(ctxMix, node, params) {
    skipChildren(ctxMix);
    Clones.walk(ctxMix, node.inst?.clones || [], 'teardown', params);
  }
}

SYS.NODE_CLASSES.push({ name: 'html-repeat',      cls: HtmlRepeatNode });
SYS.NODE_CLASSES.push({ name: 'html-variants',    cls: HtmlVariantsNode });
