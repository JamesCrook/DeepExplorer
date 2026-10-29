// D+'s chat node types that need code — tags, diagrams, control, code, html — and its template functions
/*
# ESSENTIALS

chat-nodes — the D+ node types that need code, and the template functions
its template book calls.

Most of D+'s chat widgets are markup with fields, and live as templates in
content/_templates.md: server, topic, message, card, row and the rest.  What a
template cannot say lives here, as one of two things:

  template.<name>   in SYS.FUNCTIONS: fields computed from a value, for a
                    template whose fence says with=<name>.  A coverage bar
                    from two numbers, an icon or a picture, a subtitle that
                    is absent when empty.  The markup stays in the book.

  a node class      when the node does more than fill markup:
                      tags       pills from a map of label → style key
                      diagrams   cards from the diagrams registry
                      control    a slider for a CSS variable: its param is the
                                 variable's name, and the app applies it
                      code       a code island, JSON highlighted and checked
                      html       raw HTML from a note, as written

Each class mounts the way every HTML node does: it makes its element,
appends it to ctxMix.parentEl, and keeps it as node.inst.el.  Anything the
class needs from the application comes from the harness's paneConfig
(diagrams, validator), not from a panel reference.

These replace the chat-layout widgets that were in omni-widget.js, which
d-plus.html mounted one by one with createWidget().  The stage, which hosts
an OmniSceneApp, is an html-host: host-omni-scene.js.
*/

import { SYS } from '../omni-support/sys.js';
import { MorphSliderWidget, covBar, TAG_STYLES } from './widgets/index.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One element from markup, appended where the walk is, kept on the node. */
function put(ctxMix, node, html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  let el = t.content.firstElementChild;
  if (!el || t.content.childElementCount > 1 || t.content.textContent.trim() !== (el.textContent ?? '').trim()) {
    el = document.createElement('div');
    el.style.display = 'contents';
    el.append(...t.content.childNodes);
  }
  node.inst = { ...(node.inst || {}), el };
  ctxMix.parentEl.appendChild(el);
  return el;
}

// ── Template functions ────────────────────────────────────────────

SYS.FUNCTIONS.push(
  { name: 'template.server', fn: (v) => ({
      face: v.pic ? `<img src="./content/${esc(v.pic)}" style="width:100%">` : esc(v.icon ?? ''),
      srvStyle: v.bg ? `--srv-bg:${v.bg}` : '',
    }) },
  { name: 'template.topic', fn: (v) => ({
      icoStyle: v.bg && v.fg ? `background:${v.bg};color:${v.fg}` : '',
      right: v.doc != null && v.doc !== ''
        ? covBar(+v.doc, +(v.wiki || 0), 'sm')
        : (v.meta ? `<div class="ch-meta">${esc(v.meta)}</div>` : ''),
    }) },
  { name: 'template.card', fn: (v) => ({
      bar: covBar(+(v.doc || 0), +(v.wiki || 0), 'lg', v.barStyle || ''),
      warnHtml: v.warn ? `<div class="embed-warn">${esc(v.warn)}</div>` : '',
    }) },
  { name: 'template.row', fn: (v) => ({
      bar: covBar(+(v.doc || 0), +(v.wiki || 0), 'sm', v.barStyle || ''),
    }) },
  { name: 'template.header', fn: (v) => ({ domain: v.icon || '深' }) },
  { name: 'template.chatheader', fn: (v) => ({
      descHtml: v.desc ? `<span class="desc">${esc(v.desc)}</span>` : '',
    }) },
);

// ── Node classes ──────────────────────────────────────────────────

class TagsNode {
  static meta = { sticky: true };
  static mount(ctxMix, node, params) {
    const { id: _, ...v } = node.value || {};
    const defs = Array.isArray(v.list)
      ? v.list.map(e => Array.isArray(e) ? e : [e, e])
      : Object.entries(v).filter(([k]) => !['group', 'groupKey', 'on'].includes(k));
    const pills = defs.map(([label, key]) =>
      `<span class="tag" style="${TAG_STYLES[key] || key}">${esc(label)}</span>`).join('');
    put(ctxMix, node, `<div class="embed-tags">${pills}</div>`);
  }
}

class DiagramsNode {
  static meta = { sticky: true };
  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const keys = Array.isArray(v.list) ? v.list : (v.text ? [v.text] : []);
    const registry = ctxMix.harness?.paneConfig?.diagrams || {};
    const cards = keys.map(k => registry[k]).filter(Boolean).map(d =>
      `<div class="dia-card"><div class="dia-thumb">${d.svg}</div><div class="dia-info"><div class="dia-name">${esc(d.name)}</div><div class="dia-desc">${esc(d.desc)}</div></div></div>`
    ).join('');
    put(ctxMix, node, `<div class="embed-diagrams">${cards}</div>`);
  }
}

/** A slider for a CSS custom property.  The value is the declaration from a
    controls island, seeded from resolved config; a change sets the param
    named by the variable (--msg-font-size) and announces it. */
class CssVarSliderNode {
  static mount(ctxMix, node, params) {
    const c = node.value || {};
    const unit = c.unit || '';
    const suffix = c.suffix || unit;
    const isFloat = String(c.step || '').includes('.') || String(c.min || '').includes('.');
    const p = ctxMix.getParams?.(ctxMix, node, params) ?? params;
    const { el } = MorphSliderWidget.buildMorphSlider({
      label: c.label || '', min: c.min, max: c.max,
      step: c.step || (String(c.min).includes('.') || String(c.max).includes('.') ? 0.01 : 1),
      value: c.value ?? c.default ?? '0',
      format: v => (isFloat ? (+v).toFixed(2) : String(Math.round(+v))) + suffix,
      // One channel: the value goes to params and is announced; what a CSS
      // variable param does to the page is the application's to say.
      onChange: v => {
        if (!c.var) return;
        ctxMix.setParam?.(c.var, v + unit, p);
        ctxMix.onParamChange?.(c.var, v + unit);
      },
    });
    node.inst = { ...(node.inst || {}), el };
    ctxMix.parentEl.appendChild(el);
  }
}

class CodeIslandNode {
  static mount(ctxMix, node, params) {
    const c = node.value || {};
    const lang = c.lang || '';
    const body = String(c.body ?? '').replace(/^\n/, '').replace(/\s+$/, '');
    const isJson = lang.toLowerCase() === 'json';
    let metaHtml = '';
    if (isJson) {
      try {
        const spec = JSON.parse(body);
        const validator = ctxMix.harness?.paneConfig?.validator;
        if (validator) {
          const errs = validator(spec);
          metaHtml = errs.length
            ? `<span class="ci-meta ci-bad">✗ ${esc(errs[0])}</span>`
            : `<span class="ci-meta">✓ valid · ${(spec.sections || []).length} sections</span>`;
        } else {
          metaHtml = `<span class="ci-meta">✓ valid JSON</span>`;
        }
      } catch (err) {
        metaHtml = `<span class="ci-meta ci-bad">✗ ${esc(err.message)}</span>`;
      }
    }
    const highlighted = isJson ? CodeIslandNode.hlJson(body) : esc(body);
    put(ctxMix, node,
      `<div class="code-island">
        <div class="code-island-hdr">
          <span class="ci-lang">${esc(lang)}</span>
          ${c.title ? `<span class="ci-title">${esc(c.title)}</span>` : ''}${metaHtml}
        </div>
        <pre class="ci-body"><code>${highlighted}</code></pre></div>`);
  }
  /* Text escaping without quotes, so the pattern can see JSON's own. */
  static hlJson(src) {
    const t = String(src).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return t.replace(
      /("(?:\\.|[^"\\])*")(\s*:)|("(?:\\.|[^"\\])*")|(-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b/g,
      (m, key, colon, str, num, lit) => {
        if (key) return `<span class="j-key">${key}</span>${colon}`;
        if (str) return `<span class="j-str">${str}</span>`;
        if (num) return `<span class="j-num">${num}</span>`;
        if (lit) return `<span class="j-lit">${lit}</span>`;
        return m;
      });
  }
}

/** Raw HTML, as a note wrote it: trusted, like the fence it came from.  One
    root element is the node's element; more are wrapped in a
    display:contents div, so the layout is as if there were none. */
class RawHtmlNode {
  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const html = v.body ?? v.text ?? '';
    if (!html) return;
    put(ctxMix, node, html);
  }
}

SYS.NODE_CLASSES.push({ name: 'tags',     cls: TagsNode });
SYS.NODE_CLASSES.push({ name: 'diagrams', cls: DiagramsNode });
SYS.NODE_CLASSES.push({ name: 'control',  cls: CssVarSliderNode });
SYS.NODE_CLASSES.push({ name: 'code',     cls: CodeIslandNode });
SYS.NODE_CLASSES.push({ name: 'html',     cls: RawHtmlNode });

export { TagsNode, DiagramsNode, CssVarSliderNode, CodeIslandNode, RawHtmlNode, put };
