import { SYS } from '../omni-support/sys.js';
import { skipChildren } from '../omni-support/scene.js';
export { HtmlBoxNode, HtmlTextNode, HtmlAdoptNode, HtmlFill };

// `html-box`, `html-text`, `html-adopt` — structural HTML nodes
/* ─────────────────────────────────────────────────────────────────────────────
`html-box`, `html-text`, `html-adopt` — the structural HTML nodes: a box of nodes, text, an adopted element
The widget panels are laid out with nothing else.

Both are retained: mount creates the element once, update re-applies what can
change.  What can change is written as a template, '{level}' in a text or a
style being filled from params, so neither type needs a bind field, and a node
whose text has no braces costs nothing on update.

Named html-box and html-text because 'box' and 'text' are already 2D types in
the library's registry.  A type may carry handlers for several backends, but a
name that means two different things is a rosetta problem waiting.
──────────────────────────────────────────────────────────────────────────── */


class HtmlFill {
  static has(s) { return typeof s === 'string' && s.includes('{'); }
  static fill(s, params) {
    return String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => params?.[k] ?? '');
  }
}

class HtmlBoxNode {

  /* What the Selected panel offers when a box is clicked.  Every node class
     here declares its own; the panel builds itself from the list. */
  static meta = {
    editableFields: (node) => [
      { key: 'class', label: 'Class', type: 'text', value: node.value.class || '' },
      { key: 'style', label: 'Style', type: 'text', value: node.value.style || '' },
    ],
  };

  /* attrs: { id, role, 'data-x', … } are set as attributes, for markup that
     CSS or other code finds by attribute.  (Not value.id, which is the
     node's own id.)

     Layout fields, as classes so a style template never clobbers them:
       scroll: 'y' | 'x' | 'both'   the box scrolls (D+'s chat scroller)
       sticky: true                 the box pins to the top of the nearest
                                    scrolling box, and gets is-stuck while
                                    pinned (D+'s sticky heads)
     The first parameter is deliberately not named ctxMix: the registry
     registers any static whose first parameter is, as a phase. */
  static _make(mix, node, params) {
    const v = node.value || {};
    const el = document.createElement(v.tag || 'div');
    if (v.class) el.className = v.class;
    if (v.style) el.style.cssText = HtmlFill.fill(v.style, params);
    for (const [k, x] of Object.entries(v.attrs || {})) el.setAttribute(k, x);
    if (v.scroll) el.classList.add('is-scroll-' + v.scroll);
    node.inst = { ...(node.inst || {}), el };
    mix.parentEl.appendChild(el);
    if (v.sticky) HtmlBoxNode._stick(node, el);
    return el;
  }

  /* is-stuck needs the scroller as an observer root, which exists only once
     the pane is in the document; so the observer is made on the first frame
     the element is connected. */
  static _stick(node, el) {
    el.classList.add('is-sticky');
    const sentinel = document.createElement('div');
    sentinel.className = 'sticky-sentinel';
    sentinel.style.cssText = 'height:1px;margin-bottom:-1px';   // a line to observe, taking no space
    el.before(sentinel);
    let io = null, frame = 0;
    const setup = () => {
      if (!el.isConnected) { frame = requestAnimationFrame(setup); return; }
      const root = el.parentElement.closest('.is-scroll-y, .is-scroll-both');
      io = new IntersectionObserver(([entry]) => {
        const above = entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
        el.classList.toggle('is-stuck', !entry.isIntersecting && above);
      }, { root, threshold: 0 });
      io.observe(sentinel);
    };
    frame = requestAnimationFrame(setup);
    node.inst.unstick = () => { cancelAnimationFrame(frame); io?.disconnect(); sentinel.remove(); };
  }
  static before_teardown(ctxMix, node, params) { node.inst?.unstick?.(); }
  static teardown(ctxMix, node, params)        { node.inst?.unstick?.(); }

  // A box with children: they mount inside it.
  static before_mount(ctxMix, node, params) {
    const el = HtmlBoxNode._make(ctxMix, node, params);
    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl = el;
  }
  static after_mount(ctxMix, node, params) {
    ctxMix.parentEl = ctxMix.parentStack.pop();
  }
  // An empty box: the walker calls the bare phase for a leaf.
  static mount(ctxMix, node, params) {
    HtmlBoxNode._make(ctxMix, node, params);
  }

  static _restyle(node, params) {
    const v = node.value || {}, el = node.inst?.el;
    if (el && HtmlFill.has(v.style)) el.style.cssText = HtmlFill.fill(v.style, params);
  }
  static before_update(ctxMix, node, params) { HtmlBoxNode._restyle(node, params); }
  static update(ctxMix, node, params)        { HtmlBoxNode._restyle(node, params); }
}

class HtmlTextNode {

  static meta = {
    editableFields: (node) => [
      { key: 'text',  label: 'Text',  type: 'text', value: node.value.text || '' },
      { key: 'class', label: 'Class', type: 'text', value: node.value.class || '' },
    ],
  };
  /* value.raw: the text is shown as it is, with no {param} filling, and update
     re-reads it, so a model that writes value.text sees it on the next render.
     For text from outside (a file's metadata), where braces are content. */
  static _text(v, params) {
    return v.raw ? String(v.text ?? '') : HtmlFill.fill(v.text, params);
  }
  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement(v.tag || 'div');
    if (v.class) el.className = v.class;
    el.textContent = HtmlTextNode._text(v, params);
    node.inst = { ...(node.inst || {}), el };
    ctxMix.parentEl.appendChild(el);
  }
  static update(ctxMix, node, params) {
    const v = node.value || {}, el = node.inst?.el;
    if (!el || !(v.raw || HtmlFill.has(v.text))) return;
    const text = HtmlTextNode._text(v, params);
    if (el.textContent !== text) el.textContent = text;
  }
}

/* An element made outside the scene, placed in it: a control panel that holds
   its container for life, say.  from names it in the harness's paneConfig
   elements.  The scene owns where it goes, not what is inside it, so
   teardown leaves it alone; a remount just moves it. */
class HtmlAdoptNode {
  static mount(ctxMix, node, params) {
    const el = ctxMix.harness?.paneConfig?.elements?.[node.value?.from];
    if (!el) { console.warn(`html-adopt: no element '${node.value?.from}'`); return; }
    node.inst = { ...(node.inst || {}), el };
    ctxMix.parentEl.appendChild(el);
  }
}

SYS.NODE_CLASSES.push({ name: 'html-box',         cls: HtmlBoxNode });
SYS.NODE_CLASSES.push({ name: 'html-text',        cls: HtmlTextNode });
SYS.NODE_CLASSES.push({ name: 'html-adopt',       cls: HtmlAdoptNode });
