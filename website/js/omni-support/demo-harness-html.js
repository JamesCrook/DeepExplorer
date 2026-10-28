import { SYS, sceneRegistry } from './sys.js';
import { Values } from './values.js';
import { HtmlFill } from '../nodes-html/html-nodes.js';
export { DemoHarnessHtml };

/* ═══════════════════════════════════════════════════════════════════════════
DemoHarnessHtml — owns an HTML pane: mount once, update on change, events,
selection, and control-value routing.  The third harness, beside
DemoHarness2D and DemoHarness3D, and the panopticon's counterpart to the
library's OmniHtml.

Retained, not immediate.  The 2D harness redraws the whole pane every frame;
this one walks 'mount' once, keeps the elements, and afterwards walks only
'update', which re-applies whatever params can change.  No new phases: mount,
update, resize and teardown are the four OmniHtml already uses.

The ctxMix is the HudPanel shape (parentEl, parentStack, getParams, setParam,
onParamChange, render, clearActivePreset), so a node type written for the HUD
mounts here unchanged.  Params follow the HUD's one-channel rule: a node gets
its params object from ctxMix.getParams (the walk's, unless a flyweight says
otherwise; see Values), and writes only through ctxMix.setParam, to that
object.

Param flow
  widget  → setParam + onParamChange → _paramChanged → model, controls, app
  HUD     → App.handleHudChange → applyControl → model.onControl → update
A model may translate a widget's param into the HUD's by returning a map from
onParamChange (the colour picker writes #rrggbbaa; the HUD's colour input
only takes #rrggbb).

Pre-passes
  Before the first mount, any node whose value has prepare: ['scroller', …]
  has its children rewritten by the prepass.<name> functions in
  SYS.FUNCTIONS, and so on down the tree, including nodes a pre-pass made.
  This is how a flat list, as Markdown+ rules emit it, becomes the nested
  scene D+ draws (sections with sticky heads, a scroller, zones).

Events as data
  A node's value may carry on: { click: …, 'keydown:Enter': …, files: … }.
  One listener per DOM event kind sits on the pane's root.  On an event, the
  harness walks from the target up through elements that are nodes; the
  first with a matching entry runs it, and the walk stops.  The deepest node
  passed on the way is the item, so a list can hold one on for all its
  items.  Widgets raise their own events (a file drop raises 'files') with
  ctxMix.fire(node, name, data), which looks up the same way.

  Markup that is not a node (a template's inner button, raw HTML from a
  note) says the same with attributes: data-on="…" for a click,
  data-on-<event>="…" for another event, data-on-<event>-<key> for a key
  (data-on-keydown-enter).  The item is the nearest node above it.

  An entry is an action, or a list of them.  An action is a record
  action.<name> in SYS.FUNCTIONS, { args: [names], fn(ctx, args) }:
      'nav note {label}'                            short form, positional
      { action: 'nav', kind: 'note', target: '{label}' }
  {key} in an argument is filled from the item's value, then from params.
  The last named argument takes the rest of a short form, spaces and all.

Selection groups
  A node with value.group belongs to a group; the param of the same name
  holds the key of the group's active member (value.groupKey, else
  value.key, else value.id).  After each mount, update and edit, members get
  is-active, and the rest lose it.  A node or its type's meta may name the
  classes instead, activeClass and inactiveClass, for CSS that already has
  its own words (D+: .active, .dormant).  action.select sets the param, so
  "active topic" is data, not toggled classes.

Selection for editing, without a mode
  Only when the app can show a selection (app.selectNode).  A pointerdown anywhere in the pane is watched in the capture phase, before
  the widget sees it, and never stopped.  The nearest node whose class
  declares meta.editableFields becomes the selection and goes to
  App.selectNode, which fills the Selected panel.  The widget then handles
  the same pointerdown as usual: one press both selects and drags a slider.
  A class with meta.selectFirst (links) has the click that selected it
  swallowed, so it can be chosen without being followed.  Elements map back
  to nodes through node.inst.el, which every html node sets, and through
  node.inst.clones for the nodes a repeat or variants made.

  An edit arrives as edited(node): the node is torn down and mounted again in
  place.  wrap(node, type) and unwrap(node) change the tree around a node and
  remount its parent.

Loading
  replace(node, kids) swaps a node's children for new ones: the old are torn
  down, the new are prepared (their prepare lists run), and any with zoneOut
  go to the box with that zone anywhere in the scene, replacing what it held.
  The node itself stays mounted, so a zone keeps its element while each
  document loaded into it comes and goes.  append(node, kid) adds one child
  at the end, mounted.

Layout rebuilds detach the pane's div, not the harness.  App calls attach()
each time, which re-parents the same root, so widget state survives solo and
unsolo.
═══════════════════════════════════════════════════════════════════════════ */
class DemoHarnessHtml {
  static EVENTS = ['click', 'dblclick', 'input', 'change', 'keydown'];

  /** Reuse the pane's harness if it has one, else make it; then attach. */
  static attach(div, paneConfig, app) {
    const h = paneConfig.harness instanceof DemoHarnessHtml
      ? paneConfig.harness
      : new DemoHarnessHtml(paneConfig, app);
    h.container = div;
    div.appendChild(h.root);
    return h;
  }

  constructor(paneConfig, app) {
    this.paneConfig = paneConfig;
    this.app = app;
    this.node = paneConfig.sceneRoot;
    paneConfig.harness = this;

// ── Seed params: HUD control values, then the model's own non-HUD params ──
    this.params = {};
    for (const c of paneConfig.controls || []) {
      if (c.id && c.value !== undefined) this.params[c.id] = c.value;
    }
    Object.assign(this.params, paneConfig.params || {});

    this._prepare(this.node);
    this.root = document.createElement('div');
    this.root.className = 'html-pane';
    this.selectedNode = null;
    this._byEl = new WeakMap();
    this._walk('mount', this.root);
    this._index(this.node);
    this._applyGroups();
    this._listen();
  }

/* ── tree ──────────────────────────────────────────────────────── */

  static classOf(node) { return node ? sceneRegistry.meta[node.type]?.nodeClass ?? null : null; }

  /** A node's children for traversal: its subtree, and any clones it made. */
  static kids(node) {
    return [...(node.subtree || []), ...(node.inst?.clones || [])];
  }

  /** The first node, depth first, that satisfies pred. */
  find(pred, node = this.node) {
    if (pred(node)) return node;
    for (const k of DemoHarnessHtml.kids(node)) { const f = this.find(pred, k); if (f) return f; }
    return null;
  }

  /** The node whose subtree holds child (clones have no parent to edit). */
  parentOf(child, node = this.node) {
    if (node.subtree?.includes(child)) return node;
    for (const k of node.subtree || []) { const p = this.parentOf(child, k); if (p) return p; }
    return null;
  }

  _prepare(node) {
    for (const name of node.value?.prepare || []) {
      const rec = SYS.named(SYS.FUNCTIONS, 'prepass.' + name);
      if (rec) node.subtree = rec.fn(node.subtree || [], node);
      else console.warn(`no prepass.${name} in SYS.FUNCTIONS`);
    }
    for (const k of node.subtree || []) this._prepare(k);
  }

  /** Map each node's element back to its node. */
  _index(node) {
    if (node.inst?.el) this._byEl.set(node.inst.el, node);
    for (const k of DemoHarnessHtml.kids(node)) this._index(k);
  }

/* ── events as data ────────────────────────────────────────────── */

  /** The spec an element's data-on attributes give for this event, if any. */
  static attrSpec(el, e) {
    if (!el.hasAttribute) return null;
    const key = e.key && el.getAttribute(`data-on-${e.type}-${e.key.toLowerCase()}`);
    return key ?? el.getAttribute(`data-on-${e.type}`) ?? (e.type === 'click' ? el.getAttribute('data-on') : null);
  }

  _onEvent(e) {
    let item = null, marked = null;
    for (let el = e.target; el && el !== this.root; el = el.parentElement) {
      const node = this._byEl.get(el);
      if (!node) {
        if (marked === null) marked = DemoHarnessHtml.attrSpec(el, e);
        continue;
      }
      item ??= node;
      if (marked !== null) { this.run(marked, { node, item, event: e }); return; }
      const on = node.value?.on;
      const spec = on && ((e.key && on[`${e.type}:${e.key}`]) ?? on[e.type]);
      if (spec === undefined || spec === null) continue;
      this.run(spec, { node, item, event: e });
      return;
    }
  }

  /** A widget's own event, looked up from the widget's node outwards. */
  fire(node, name, data) {
    let item = node;
    for (let el = node.inst?.el; el && el !== this.root; el = el.parentElement) {
      const n = this._byEl.get(el);
      const spec = n?.value?.on?.[name];
      if (spec !== undefined) { this.run(spec, { node: n, item, data }); return true; }
    }
    return false;
  }

  run(spec, ctx) {
    for (const one of Array.isArray(spec) ? spec : [spec]) {
      let action, args = {};
      if (typeof one === 'string') {
        const words = one.trim().split(/\s+/);
        action = words.shift();
        const rec = SYS.named(SYS.FUNCTIONS, 'action.' + action);
        const names = rec?.args || [];
        names.forEach((n, i) => {
          const v = i === names.length - 1 ? words.slice(i).join(' ') : words[i];
          if (v !== undefined && v !== '') args[n] = v;
        });
      } else {
        ({ action, ...args } = one);
      }
      const rec = SYS.named(SYS.FUNCTIONS, 'action.' + action);
      if (!rec) { console.warn(`no action.${action} in SYS.FUNCTIONS`); continue; }
      const scope = { ...this.params, ...(ctx.item?.value || {}) };
      for (const k in args) if (typeof args[k] === 'string') args[k] = HtmlFill.fill(args[k], scope);
      rec.fn({ ...ctx, harness: this, app: this.app, model: this.paneConfig, params: this.params }, args);
    }
  }

/* ── selection groups ──────────────────────────────────────────── */

  static keyOf(node) { return node?.value?.groupKey ?? node?.value?.key ?? node?.value?.id; }

  _applyGroups(node = this.node) {
    const g = node.value?.group;
    if (g && node.inst?.el) {
      const meta = sceneRegistry.meta[node.type];
      const on = node.value.activeClass ?? meta?.activeClass ?? 'is-active';
      const off = node.value.inactiveClass ?? meta?.inactiveClass;
      const active = String(DemoHarnessHtml.keyOf(node)) === String(this.params[g]);
      node.inst.el.classList.toggle(on, active);
      if (off) node.inst.el.classList.toggle(off, !active);
    }
    for (const k of DemoHarnessHtml.kids(node)) this._applyGroups(k);
  }

/* ── selection for editing ─────────────────────────────────────── */

  /** The nearest node at or above an element that has something to edit. */
  _nodeAt(target) {
    for (let el = target; el && el !== this.root; el = el.parentElement) {
      const node = this._byEl.get(el);
      if (node && DemoHarnessHtml.classOf(node)?.meta?.editableFields) return node;
    }
    return null;
  }

  _listen() {
    this.root.addEventListener('pointerdown', (e) => {
      this._swallowClick = false;
      if (!this.app?.selectNode) return;
      const node = this._nodeAt(e.target);
      // Pressing the selected node again refreshes the panel, so a value the
      // HUD or the widget itself changed since selection shows up.
      if (node === this.selectedNode) { if (node) this.app?.updateSelectedPanel?.(); return; }
      this._swallowClick = !!(node && DemoHarnessHtml.classOf(node)?.meta?.selectFirst);
      this._select(node);
      this.app?.selectNode?.(this.selectedHit, this);
    }, true);

    this.root.addEventListener('click', (e) => {
      if (!this._swallowClick) return;
      this._swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    for (const kind of DemoHarnessHtml.EVENTS) this.root.addEventListener(kind, (e) => this._onEvent(e));
  }

  _select(node) {
    this.selectedNode?.inst?.el?.classList.remove('is-selected');
    this.selectedNode = node;
    this.selectedHit = node ? { node, interactions: {} } : null;
    node?.inst?.el?.classList.add('is-selected');
  }

  /** Called by App when the selection moves to another pane. */
  clearSelection() { this._select(null); }

  /** An edit from the Selected panel: tear the node down and mount it again
      where it stood, keeping node.inst's other members. */
  edited(node) {
    const old = node.inst?.el;
    if (!old?.isConnected) return;
    sceneRegistry.runPhases(this._ctxMix(this.root), node, this.params, ['teardown']);
    const frag = document.createDocumentFragment();
    sceneRegistry.runPhases(this._ctxMix(frag), node, this.params, ['mount']);
    old.replaceWith(frag);
    this._index(node);
    this._applyGroups(node);
    if (this.selectedNode) this.selectedNode.inst?.el?.classList.add('is-selected');
  }

  /** Called by App after it has spliced a node out of the scene. */
  removed(node) {
    sceneRegistry.runPhases(this._ctxMix(this.root), node, this.params, ['teardown']);
    node.inst?.el?.remove();
    if (this.selectedNode === node) this._select(null);
  }

  /** Put node inside a new node of the given type (a template with a slot,
      a box), in node's place.  Returns the wrapper, or null at the root. */
  wrap(node, type, value = {}) {
    const parent = this.parentOf(node);
    if (!parent) return null;
    const wrapper = SYS.makeNode(type, value, [node]);
    parent.subtree[parent.subtree.indexOf(node)] = wrapper;
    this.edited(parent);
    return wrapper;
  }

  /** Replace node by its children.  Returns the parent, or null. */
  unwrap(node) {
    const parent = this.parentOf(node);
    if (!parent) return null;
    parent.subtree.splice(parent.subtree.indexOf(node), 1, ...(node.subtree || []));
    sceneRegistry.runPhases(this._ctxMix(this.root), node, this.params, ['teardown']);
    this.edited(parent);
    return parent;
  }

/* ── loading ───────────────────────────────────────────────────── */

  /** Lift every zoneOut node out of a tree, depth first; return them. */
  static liftZoneOut(node) {
    const out = [];
    const lift = (n) => {
      if (!n.subtree) return;
      n.subtree = n.subtree.filter(k => (k.value?.zoneOut ? (out.push(k), false) : true));
      n.subtree.forEach(lift);
    };
    lift(node);
    return out;
  }

  /** Replace node's children with kids, prepared; zoneOut kids go to their
      zones, replacing what those held.  Returns the zones touched. */
  replace(node, kids) {
    const tmp = { type: node.type, value: node.value, subtree: kids };
    this._prepare(tmp);
    const moving = DemoHarnessHtml.liftZoneOut(tmp);    // reassigns tmp.subtree
    const plan = new Map([[node, tmp.subtree]]);
    for (const k of moving) {
      const z = this.find(x => x.value?.zone === k.value.zoneOut);
      if (!z) { console.warn(`zoneOut '${k.value.zoneOut}': no box with that zone`); continue; }
      if (!plan.has(z)) plan.set(z, []);
      plan.get(z).push(k);
    }
    for (const [z, list] of plan) this._swapKids(z, list);
    return [...plan.keys()];
  }

  _swapKids(node, kids) {
    const el = node.inst?.el;
    for (const k of node.subtree || []) sceneRegistry.runPhases(this._ctxMix(el), k, this.params, ['teardown']);
    el?.replaceChildren();
    node.subtree = kids;
    if (!el) return;
    for (const k of kids) sceneRegistry.runPhases(this._ctxMix(el), k, this.params, ['mount']);
    this._index(node);
    this._applyGroups(node);
  }

  /** Add one child at the end of node's subtree, and mount it. */
  append(node, kid) {
    (node.subtree ||= []).push(kid);
    this._prepare(kid);
    const el = node.inst?.slotEl ?? node.inst?.el;
    if (!el) return kid;
    sceneRegistry.runPhases(this._ctxMix(el), kid, this.params, ['mount']);
    this._index(kid);
    this._applyGroups(kid);
    return kid;
  }

/* ── ctxMix factory ────────────────────────────────────────────── */

  _ctxMix(parentEl) {
    const h = this;
    return {
      parentEl,
      parentStack: [],
      iterators: [],
      flyweight: {},
      harness: this,
      panel: null,
      getParams: Values.getParams,
      setParam: (id, val, target = h.params) => { target[id] = val; },
      onParamChange: (id, val) => h._paramChanged(id, val),
      render: () => h.update(),
      fire: (node, name, data) => h.fire(node, name, data),
      clearActivePreset() {},
      closeMenu() {},
    };
  }

  _walk(phase, parentEl = this.root) {
    sceneRegistry.runPhases(this._ctxMix(parentEl), this.node, this.params, [phase]);
  }

/* ── update — batched to one walk per frame, like DemoHarness2D.draw ── */

  update() {
    const run = () => { this._walk('update'); this._applyGroups(); };
    const anim = this.app?.animator;
    if (anim) { anim.add(this, () => { run(); return false; }); return; }
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; run(); });
  }

/* ── params ────────────────────────────────────────────────────── */

  /** For models and actions: write a param from outside any widget and show it. */
  setParam(id, val) {
    this.params[id] = val;
    this._paramChanged(id, val);
    this.update();
  }

  _paramChanged(id, val) {
    const echo = this.paneConfig.onParamChange?.(id, val, this) ?? { [id]: val };
    for (const [k, v] of Object.entries(echo)) {
      this._recordControl(k, v);
      this.app?.onPaneParamChange?.(this, k, v);
    }
  }

  /* Keep the model's control list current, so a HUD rebuilt for this pane
     opens where the widgets left it rather than at the declared default. */
  _recordControl(id, val) {
    const c = this.paneConfig.controls?.find(c => c.id === id);
    if (c) c.value = val;
  }

/* ── control routing (called by App.handleHudChange) ───────────── */

  applyControl(id, val, getValues) {
    this.params[id] = val;
    this._recordControl(id, val);
    if (this.paneConfig.onControl) {
      this.paneConfig.onControl(id, val, getValues, this.app);
    }
    this.update();
  }

/* ── lifecycle ─────────────────────────────────────────────────── */

  /** Called from App.resize.  The browser lays HTML out itself; the walk is
      for the rare node that must react to size. */
  resize() { this._walk('resize'); }

  /** Release listeners a node attached outside its own element, then drop
      the elements.  Nothing in the panopticon calls this yet: panes are only
      hidden, never destroyed. */
  teardown() {
    this._walk('teardown');
    this.root.remove();
    if (this.paneConfig.harness === this) this.paneConfig.harness = null;
  }
}
