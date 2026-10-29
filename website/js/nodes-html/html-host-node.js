import { SYS } from '../omni-support/sys.js';
import { skipChildren } from '../omni-support/scene.js';
import { HtmlTemplateNode } from './html-template-node.js';
export { HtmlHostNode };

// `html-host` — another backend's scene inside the HTML tree (container)
/* ─────────────────────────────────────────────────────────────────────────────
The boundary between backends: D+'s stage cards, the D+ Mini word cloud.

What runs inside is a strategy, named: host.<name> in SYS.FUNCTIONS,

    fn(holder, node, harness) → { resize?, pause?, resume?, live?, destroy? }

called once the holder is in the document and has a size.  The panopticon
pushes host.demo2d (a DemoHarness2D over the host's first child); the
library pushes host.omni-scene (an OmniSceneApp, sharing the page's control
panel).  Everything around the strategy is the same for every host, and is
here:

  host      the strategy's name (default 'demo2d')
  height    px, the host's height; ignored with a frame, whose markup says
  frame     a template to draw round the host: its markup, filled from the
            node's value, with the host where its <slot> is.  D+'s stage is a
            host framed by 'stage-frame' (badge, title, live marker, hint).
  engage    'click'  the wheel scrolls the page until the host is pressed,
                     then reaches the scene until something outside is
                     pressed, so scrolling past a host never zooms it
            'always' the wheel always reaches the scene
  group     with groupKey: a selection group, as for any node.  Pressing the
            host makes it the active member; when it becomes active, the
            strategy's live() runs (D+: the live stage drives the panel).

A host scrolled out of its scroller is paused, and resumed when it returns.

The HTML walk stops at a host: in every HTML phase it swaps the walker's
iterator for an empty one, so its children (the scene it hosts) are never
mounted, updated or torn down as HTML.

A type may be a host with settings fixed: HtmlHostNode.typed(defaults, meta)
makes the class, as host-omni-scene does for D+'s 'stage'.
──────────────────────────────────────────────────────────────────────────── */

class HtmlHostNode {
  static meta = {
    editableFields: (node) => [
      { key: 'height', label: 'Height', type: 'number', value: HtmlHostNode.settings(node).height },
      { key: 'engage', label: 'Wheel', type: 'select', value: HtmlHostNode.settings(node).engage,
        options: [['click', 'zooms after a press'], ['always', 'always zooms']] },
      { key: 'host', label: 'Host', type: 'select', value: HtmlHostNode.settings(node).host,
        options: SYS.namesIn(SYS.FUNCTIONS, 'host.').map(n => [n.slice(5), n.slice(5)]) },
    ],
  };

  /** A host type with settings fixed, and meta of its own (sticky, activeClass). */
  static typed(defaults, meta = {}) {
    return class extends HtmlHostNode {
      static meta = { ...HtmlHostNode.meta, ...meta, hostDefaults: defaults };
    };
  }

  /** The node's value over its type's defaults over the host defaults. */
  static settings(node) {
    const typeDefaults = SYS.registry.meta[node.type]?.hostDefaults || {};
    return { host: 'demo2d', height: 240, engage: 'click', ...typeDefaults, ...(node.value || {}) };
  }

  static _make(mix, node, params) {
    const v = HtmlHostNode.settings(node);
    let el, holder;
    if (v.frame) {
      const t = document.createElement('template');
      t.innerHTML = HtmlTemplateNode.fill(SYS.named(SYS.TEMPLATES, v.frame)?.markup ?? '<div><slot></slot></div>', v).trim();
      el = t.content.firstElementChild;
      holder = document.createElement('div');
      holder.className = 'html-host-holder';
      holder.style.cssText = 'position:relative;width:100%;height:100%';
      const slot = el.querySelector('slot');
      if (slot) slot.replaceWith(holder); else el.appendChild(holder);
    } else {
      el = holder = document.createElement('div');
      el.className = 'html-host';
      el.style.height = v.height + 'px';
    }
    mix.parentEl.appendChild(el);

    const inst = node.inst = { ...(node.inst || {}), el, holder, engaged: v.engage === 'always', wasLive: false };

    // The strategy, once the holder has a size; resized with it after.
    inst.ro = new ResizeObserver(() => {
      if (!holder.isConnected || holder.clientWidth === 0) return;
      if (inst.handle || inst.failed) { inst.handle?.resize?.(); return; }
      const rec = SYS.named(SYS.FUNCTIONS, 'host.' + v.host);
      if (!rec) { inst.failed = true; console.warn(`html-host: no host.${v.host} in SYS.FUNCTIONS`); return; }
      inst.handle = rec.fn(holder, node, mix.harness) || {};
      if (inst.handle.failed) { inst.failed = true; return; }
      HtmlHostNode._live(node, mix.harness?.params || params);
      HtmlHostNode._watchVisible(node);
    });
    inst.ro.observe(holder);

    // Wheel gating: until engaged, the scene never sees the wheel.
    holder.addEventListener('wheel', (e) => { if (!inst.engaged) e.stopPropagation(); }, { capture: true });
    el.addEventListener('pointerdown', () => {
      if (v.engage !== 'always') HtmlHostNode._engage(node, true);
      if (v.group) {                        // one channel: write, notify, redraw
        const key = v.groupKey ?? v.key ?? v.id;
        mix.setParam?.(v.group, key);
        mix.onParamChange?.(v.group, key);
        mix.render?.();
      }
    });
    if (v.engage !== 'always') {
      inst.outside = (e) => { if (!el.contains(e.target)) HtmlHostNode._engage(node, false); };
      document.addEventListener('pointerdown', inst.outside, true);
    }
    return inst;
  }

  static _engage(node, on) {
    const i = node.inst;
    if (!i || i.engaged === on) return;
    i.engaged = on;
    i.el.classList.toggle('is-engaged', on);
  }

  /* Paused while out of its scroller's view; its last frame stays. */
  static _watchVisible(node) {
    const i = node.inst;
    const root = i.el.closest('.is-scroll-y, .is-scroll-both');
    i.io = new IntersectionObserver(([e]) => {
      i.el.dataset.visible = e.isIntersecting ? '1' : '0';
      if (e.isIntersecting) i.handle?.resume?.();
      else { i.handle?.pause?.(); HtmlHostNode._engage(node, false); }
    }, { root, threshold: 0 });
    i.io.observe(i.el);
  }

  /* When the host becomes its group's active member, the strategy goes live. */
  static _live(node, params) {
    const v = HtmlHostNode.settings(node), i = node.inst;
    if (!i?.handle || !v.group) return;
    const live = String(params[v.group]) === String(v.groupKey ?? v.key ?? v.id);
    if (live && !i.wasLive) i.handle.live?.();
    i.wasLive = live;
  }

  static _release(node) {
    const i = node.inst;
    if (!i) return;
    i.ro?.disconnect();
    i.io?.disconnect();
    i.handle?.destroy?.();
    if (i.outside) document.removeEventListener('pointerdown', i.outside, true);
    i.handle = null;
  }

  static before_mount(ctxMix, node, params)    { HtmlHostNode._make(ctxMix, node, params); skipChildren(ctxMix); }
  static mount(ctxMix, node, params)           { HtmlHostNode._make(ctxMix, node, params); }
  static before_update(ctxMix, node, params)   { skipChildren(ctxMix); HtmlHostNode._live(node, params); }
  static update(ctxMix, node, params)          { HtmlHostNode._live(node, params); }
  static before_resize(ctxMix, node, params)   { skipChildren(ctxMix); }
  static before_teardown(ctxMix, node, params) { HtmlHostNode._release(node); skipChildren(ctxMix); }
  static teardown(ctxMix, node, params)        { HtmlHostNode._release(node); }
}

SYS.NODE_CLASSES.push({ name: 'html-host',        cls: HtmlHostNode });
