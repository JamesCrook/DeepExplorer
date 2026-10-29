import { SYS } from '../omni-support/sys.js';
export { HtmlTemplateNode };

// `html-template` — an element from a named template
// `html-template` — an element made from a named template, with the node's value fields filled in
/* ─────────────────────────────────────────────────────────────────────────────
The type from html-node-types.md that replaces D+'s dozen chat widgets (server icon, topic, message, embed card…),
which are template strings with fields already.

Templates are records in SYS.TEMPLATES, { name, markup, from }.  Any nugget
may push one.  A book of Markdown+ text holding fences of the form

    ```html template=message
    <div class="tpl-msg"> … {name} … {!body} … </div>
    ```

is pushed with pushBook(), one record per fence; plain Markdown shows the book
as code.  A name pushed again overrides the earlier one: lookups take the
last record with the name.

Every template is a node type
  This nugget adds SYS.TEMPLATES to the registry's sources, so pushing a
  template named 'message' also registers a node type 'message': a subclass
  of this one that knows its template.  A scene says { type: 'message', value:
  { name, body } }, which is what D+'s rules emit.  The generic form,
  { type: 'html-template', value: { template: 'message' } }, still works.

Placeholders
  {key}    node.value[key], HTML-escaped
  {!key}   node.value[key] as markup, for text the Markdown+ pipeline has
           already rendered.  Trusted, like the raw-html island.
  with     a fence attribute, with=name: template.<name> in SYS.FUNCTIONS
           computes more fields from the value before the fill, fn(value) →
           { key: … }.  What a template cannot say (a coverage bar from two
           numbers, an icon or a picture) is a named function, and the
           markup stays in the book.
  <slot>   where the node's children mount.  It becomes a display:contents
           div, so children lay out as if they were the template's own.

A template has one root element.  Its inner elements are not nodes, so a
click inside one selects the template; a child mounted in the slot is a node
of its own and selects itself.

Editing
  The Selected panel offers the template (for a typed node, its type: '@type'
  writes node.type, so a message can become a card), one field per
  placeholder, and the markup itself.  Edited markup is kept on the node
  under 'markup:<name>', an override for this node only; the book is shared
  and is edited where it lives, in its Markdown+ file.
──────────────────────────────────────────────────────────────────────────── */

class HtmlTemplateNode {
  static TEMPLATE = null;          // set on each per-template subclass

  /** One { name, markup, attrs, from } record per ```html template=name fence.
      Words after the name are attributes: a bare word is a flag (sticky),
      key=value a value.  They become the node type's meta, which is how a
      book says a stage pins while the chat scrolls under it. */
  static parseBook(markdown, from = 'book') {
    return [...String(markdown).matchAll(/```html[ \t]+template=([\w-]+)([^\n]*)\n([\s\S]*?)```/g)]
      .map(m => {
        const attrs = {};
        for (const w of m[2].trim().split(/\s+/).filter(Boolean)) {
          const [k, v] = w.split('=');
          attrs[k] = v === undefined ? true : v;
        }
        return { name: m[1], markup: m[3].trim(), attrs, from };
      });
  }
  static pushBook(markdown, from) {
    SYS.TEMPLATES.push(...HtmlTemplateNode.parseBook(markdown, from));
  }

  /** The node class for one template record: knows its template, and carries
      the record's attributes as meta. */
  static typed(record) {
    const cls = class extends HtmlTemplateNode {
      static TEMPLATE = record.name;
      static meta = { ...HtmlTemplateNode.meta, ...(record.attrs || {}) };
    };
    Object.defineProperty(cls, 'name', { value: `Template(${record.name})` });
    return cls;
  }

  /** Which template a node uses: its own field, else its type's. */
  static nameOf(node) {
    return node.value?.template ?? SYS.registry.meta[node.type]?.nodeClass?.TEMPLATE ?? null;
  }

  static markupOf(node) {
    const name = HtmlTemplateNode.nameOf(node), v = node.value || {};
    return v['markup:' + name] ?? SYS.named(SYS.TEMPLATES, name)?.markup
      ?? `<div class="tpl-missing">No template called “${HtmlTemplateNode.esc(name ?? '')}”</div>`;
  }

  /** The fields a fill sees: the node's value, plus what its template's
      with= function computes from it. */
  static fieldsOf(node) {
    const v = node.value || {};
    const w = SYS.named(SYS.TEMPLATES, HtmlTemplateNode.nameOf(node))?.attrs?.with;
    const rec = w && SYS.named(SYS.FUNCTIONS, 'template.' + w);
    return rec ? { ...v, ...rec.fn(v) } : v;
  }

  static keys(markup) {
    return [...new Set([...markup.matchAll(/\{!?(\w+)\}/g)].map(m => m[1]))];
  }

  static esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  static fill(markup, v) {
    return markup.replace(/\{(!?)(\w+)\}/g, (_, raw, k) => {
      const x = v[k] ?? '';
      return raw ? String(x) : HtmlTemplateNode.esc(x);
    });
  }

  static meta = {
    editableFields: (node) => {
      const v = node.value || {}, markup = HtmlTemplateNode.markupOf(node);
      const name = HtmlTemplateNode.nameOf(node);
      const typed = !!SYS.registry.meta[node.type]?.nodeClass?.TEMPLATE;
      const names = SYS.namesIn(SYS.TEMPLATES).map(k => [k, k]);
      return [
        typed
          ? { key: '@type',    label: 'Template', type: 'select', value: node.type, reselect: true, options: names }
          : { key: 'template', label: 'Template', type: 'select', value: v.template, reselect: true, options: names },
        ...HtmlTemplateNode.keys(markup)
          .filter(k => k !== 'template')
          .map(k => ({ key: k, label: k, type: 'text', value: v[k] ?? '' })),
        { key: 'markup:' + name, label: 'Markup', type: 'text', multiline: true, value: markup },
      ];
    },
  };

  /* First parameter not named ctxMix, so the registry does not take it for a phase. */
  static _build(mix, node) {
    const t = document.createElement('template');
    t.innerHTML = HtmlTemplateNode.fill(HtmlTemplateNode.markupOf(node), HtmlTemplateNode.fieldsOf(node)).trim();
    let el = t.content.firstElementChild;
    if (!el || t.content.children.length > 1) {        // not one root: wrap what there is
      el = document.createElement('div');
      el.append(...t.content.childNodes);
    }
    let slotEl = null;
    const slot = el.matches('slot') ? null : el.querySelector('slot');
    if (slot) {
      slotEl = document.createElement('div');
      slotEl.className = 'tpl-slot';
      slotEl.style.display = 'contents';
      slot.replaceWith(slotEl);
    }
    node.inst = { ...(node.inst || {}), el, slotEl };
    mix.parentEl.appendChild(el);
    return node.inst;
  }

  // With children: they mount in the slot, or after the content if there is none.
  static before_mount(ctxMix, node, params) {
    const i = HtmlTemplateNode._build(ctxMix, node);
    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl = i.slotEl ?? i.el;
  }
  static after_mount(ctxMix, node, params) {
    ctxMix.parentEl = ctxMix.parentStack.pop();
  }
  static mount(ctxMix, node, params) {
    HtmlTemplateNode._build(ctxMix, node);
  }
}

SYS.NODE_CLASSES.push({ name: 'html-template',    cls: HtmlTemplateNode });

/* Every template is also a node type of its own name. */
SYS.registry.addSource(SYS.TEMPLATES, (r) => ({ name: r.name, cls: HtmlTemplateNode.typed(r) }));
