import { sceneRegistry } from '../../omni-support/scene.js';
import { Values } from '../../omni-support/values.js';
import { isHexColor, parseHexColor, formatHexColor, lerpColor } from '../../colour/colour.js';

/* ============================================
   widget-base.js — what the panel and nav widgets share
   ============================================

   Each widget node type has its own file in this folder and registers
   itself there; index.js loads them all (in the old registration order)
   and re-exports what omni-widget.js used to.

   SCENE GRAPH MODEL
   ─────────────────
   All panel and nav widgets use the scene graph walker (walkPhase).
   Widgets register static methods on sceneRegistry:

     Leaf nodes:   static mount(ctxMix, node, params)
     Containers:   static before_mount / after_mount

   DOM insertion is via ctxMix.parentEl — widgets never return elements.
   Non-serialisable callbacks live on node.inst.
   Serialisable data lives on node.value.

   Nav is a separate AST produced by coerceToAST(config, { menu:true }).
   The navVersion registration on each type controls whether and how
   a panel widget maps to a nav node.

   ── Node conventions ───────────────────────────────────────
     node.type      — registered type string
     node.value     — plain-JSON data (id, label, min, max, …)
     node.subtree   — child nodes
     node.inst      — non-serialisable (onChange, build, action, …)
*/


// ════════════════════════════════════════════════════════════════
//  Color / format utilities
// ════════════════════════════════════════════════════════════════

function formatValue(val, format) {
  if (typeof format === 'function') return format(val);
  if (typeof val !== 'number') return String(val ?? '');
  if (format === 'degRad') return `${Math.round(val * 180 / Math.PI)}°`;
  if (format === 'deg')    return `${val.toFixed(1)}°`;
  if (format === 'int')    return String(Math.round(val));
  if (format === 'degInt') return `${Math.round(val)}°`;
  if (Math.abs(val) >= 100) return val.toFixed(0);
  if (Math.abs(val) >= 10)  return val.toFixed(1);
  return val.toFixed(2);
}

// isHexColor, parseHexColor, formatHexColor, lerpColor: colour/colour.js
// (re-exported here for the widgets and index.js).


// ── HTML helpers ──────────────────────────────────────────────

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function covBar(doc, wiki, variant, extraStyle) {
  const cls = variant === 'lg' ? 'cov cov-lg' : 'cov cov-sm';
  const st = extraStyle ? ` style="${extraStyle}"` : '';
  return `<div class="${cls}"${st}><div class="cov-d" style="width:${doc}%"></div><div class="cov-w" style="width:${wiki}%"></div></div>`;
}


// ════════════════════════════════════════════════════════════════
//  parseDslValue
// ════════════════════════════════════════════════════════════════

function parseDslValue(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  if (s[0] === '{' || s[0] === '[') {
    try { return JSON.parse(s); } catch (_) { /* fall through */ }
  }
  if (s.includes('=')) {
    const o = {};
    for (const part of s.split('|')) {
      const eq = part.indexOf('=');
      if (eq !== -1) o[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
    return o;
  }
  if (s.includes('|')) return s.split('|').map(t => t.trim()).filter(Boolean);
  return s;
}


// ════════════════════════════════════════════════════════════════
//  WidgetContext
// ════════════════════════════════════════════════════════════════

class WidgetContext {
  constructor(opts = {}) {
    this.params            = opts.params || {};
    this.engine            = opts.engine || null;
    this.panel             = opts.panel || null;
    this.presets           = opts.presets || {};
    this.compact           = opts.compact || false;
    this._render           = opts.render || (() => {});
    this._onParamChange    = opts.onParamChange || (() => {});
    this._clearActive      = opts.clearActivePreset || (() => {});
    this._morphToTarget    = opts.morphToTarget || null;
    this._closeMenu        = opts.closeMenu || (() => {});

    // Walker threading — set before walkPhase
    this.parentEl    = opts.parentEl || null;
    this.parentStack = opts.parentStack || [];
  }

  /** A context for one walk of the panel.  params is what its widgets read
   *  and write: the panel's own, or a section's (sec._params, a layer's
   *  params, say), so the panel walks each section with its own context. */
  static fromPanel(panel, params = panel.params) {
    return new WidgetContext({
      params,
      engine:            panel.engine,
      panel,
      presets:           panel.presets,
      render:            () => panel.render(),
      onParamChange:     panel.onParamChange,
      clearActivePreset: () => panel._clearActivePreset(),
      morphToTarget:     (p, t, d) => panel._morphToTarget(p, t, d),
      closeMenu:         () => {
        if (typeof NavMenu !== 'undefined' && NavMenu.getInstance) {
          NavMenu.getInstance()._close();
        }
      },
    });
  }

  /** One channel.  A widget asks for its params object at mount,
   *  ctxMix.getParams(ctxMix, node, params): the walk's, unless a flyweight
   *  ancestor has bound the node to other params (node.paramsFn; see
   *  values.js).  It writes back to that same object with
   *  ctxMix.setParam(id, value, p), then says so with ctxMix.onParamChange. */
  getParams(ctxMix, node, params) { return Values.getParams(ctxMix, node, params); }
  setParam(id, value, target = this.params) { target[id] = value; }
  getParam(id) { return this.params[id]; }

  render()               { this._render(); }
  onParamChange(...args) { this._onParamChange(...args); }
  clearActivePreset()    { this._clearActive(); }
  closeMenu()            { this._closeMenu(); }

  morphToTarget(params, target, duration) {
    if (this._morphToTarget) this._morphToTarget(params, target, duration);
  }
}


// ════════════════════════════════════════════════════════════════
//  OmniWidget — base class
// ════════════════════════════════════════════════════════════════

class OmniWidget {
  constructor(config) {
    this.config = config;
  }

  get meta() { return { sticky: false, wrapInGroup: true, showInStrip: true }; }
  get showInStrip() { return this.meta.showInStrip ?? true; }
  get wrapInGroup() { return this.meta.wrapInGroup ?? true; }

  // Base mount uses _ctx (not ctxMix) so the scene registry scanner
  // does NOT register it — subclass static/instance methods take over.
  mount(_ctx, node, params) { return null; }

  static elementFromString(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild || t.content;
  }
}


// ════════════════════════════════════════════════════════════════
//  Chat-layout styles
//
//  The chat-layout widgets that were here (server icon, topic, message,
//  embed card, stage card, code island, …) are scene nodes now: markup in
//  deep-wiki/content/_templates.md, code in js/nodes-html/chat-nodes.js and
//  host-omni-scene.js.  These tag colours are shared with them.
// ════════════════════════════════════════════════════════════════

const TAG_STYLES = {
  ds:    'background:#4a6fa522;color:#8ab0e0;border-color:#4a6fa544',
  anim:  'background:#7b5ea722;color:#b898d8;border-color:#7b5ea744',
  exp:   'background:#a0704022;color:#d8a870;border-color:#a0704044',
  ui:    'background:#5a8a6e22;color:#88c8a0;border-color:#5a8a6e44',
  toxin: 'background:#a0555522;color:#d88888;border-color:#a0555544',
  tm:    'background:#5580a022;color:#88b8d8;border-color:#5580a044',
  luca:  'background:#70805022;color:#a8b880;border-color:#70805044',
  mito:  'background:#80609022;color:#c098d8;border-color:#80609044',
  rep:   'background:#88775522;color:#c8b888;border-color:#88775544',
};


// ════════════════════════════════════════════════════════════════
//  Widget helpers — type resolution, backward compat
// ════════════════════════════════════════════════════════════════

function resolveWidgetType(config) {
  if (config.type) return config.type;
  if (config.sliders) return 'slider-group';
  return 'custom';
}

/** Create a widget instance from a section config.
 *  @deprecated — use coerceToAST + walkPhase instead */
function createWidget(config) {
  const type = resolveWidgetType(config);
  const meta = sceneRegistry.meta[type];
  if (!meta) {
    console.warn(`OmniWidget: unknown type "${type}"`);
    return new OmniWidget(config);
  }
  return new meta.nodeClass(config);
}

function stripConfigs(configs) {
  return configs.filter(c => {
    const type = resolveWidgetType(c);
    const meta = sceneRegistry.meta[type];
    return (meta?.defaultParams?.showInStrip ?? true);
  });
}

export {
  OmniWidget,
  WidgetContext,
  resolveWidgetType,
  createWidget,
  stripConfigs,
  parseDslValue,
  formatValue,
  isHexColor,
  parseHexColor,
  formatHexColor,
  lerpColor,
  _esc,
  covBar,
  TAG_STYLES,
};
