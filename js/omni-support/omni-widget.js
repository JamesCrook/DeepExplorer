import { sceneRegistry, MiniAstNode } from './scene.js';

/* ============================================
   omni-widget.js — Widget Classes for Controls & Nav
   ============================================

   Extracts every control type from OmniControlPanel._build*() into
   standalone widget classes that can render into BOTH the sidebar
   controls panel AND the hamburger nav menu.

   Each widget implements:
     buildControl(ctx)   → DOM element for the controls panel
     buildMenuItem(ctx)  → NavMenu item config (or null to skip)

   The same sliderConfig array drives both surfaces:

     const ctx = WidgetContext.fromPanel(panel);
     mountWidgets(sliderConfig, ctx, containerEl);

   ── Config compatibility ─────────────────────────────────────
   All existing section configs work unchanged.  Type dispatch:

     config.type          widget class
     ─────────────        ─────────────────────
     (none, has sliders)  SliderGroupWidget
     'presets'            PresetWidget
     'select'             SelectWidget
     'button'             ButtonWidget
     'toggle'         NEW ToggleWidget
     'filedrop'           FileDropWidget
     'status'             StatusWidget
     'info'               InfoWidget
     'dynamic'            DynamicWidget
     'custom'             CustomWidget
     'layers'             LayersWidget
     'addbar'             AddBarWidget
     'selection-action-bar' SelectionActionBarWidget
     'divider'        NEW DividerWidget
     'label'          NEW LabelWidget
     'number-input'   NEW NumberInputWidget
     'text-input'     NEW TextInputWidget
     'button-group'   NEW ButtonGroupWidget
*/


/* ═══════════════════════════════════════════════════════════════
   MIGRATION STATUS: omni-widget → scene graph nodes
   ═══════════════════════════════════════════════════════════════

   COMPLETED:
     ✓ DSL params parsed by parseDslValue (JSON.parse with pipe fallback)
     ✓ TextSpec class deleted
     ✓ All widgets read node.value instead of node.textSpec.asStruct()
     ✓ Widgets registered on sceneRegistry via registerNodeClass
     ✓ WidgetFactory deleted — replaced by createWidget, mountWidgets, stripConfigs
     ✓ meta getters → defaultParams on registration
     ✓ All DSL content converted to JSON

   REMAINING (next steps):
     - Flatten SliderGroup/ButtonGroup children into subtrees
     - Add update phase for morph sync (replaces DOM-query-by-id)
     - Switch mountWidgets to walkPhase once DOM insertion model settles
     - Delete buildControl shim + elementFromString

   ═══════════════════════════════════════════════════════════════ */


// ════════════════════════════════════════════════════════════════
//  Color / format utilities
// ════════════════════════════════════════════════════════════════

function formatValue(val, format) {
  if (typeof val !== 'number') return String(val ?? '');
  if (format === 'degRad') return `${Math.round(val * 180 / Math.PI)}°`;
  if (format === 'deg')    return `${val.toFixed(1)}°`;
  if (format === 'int')    return String(Math.round(val));
  if (format === 'degInt') return `${Math.round(val)}°`;
  if (Math.abs(val) >= 100) return val.toFixed(0);
  if (Math.abs(val) >= 10)  return val.toFixed(1);
  return val.toFixed(2);
}

function isHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6,8}$/.test(v);
}

function parseHexColor(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

function formatHexColor({ r, g, b, a }) {
  const hx = (v) => Math.round(Math.max(0, Math.min(255, v)))
                      .toString(16).padStart(2, '0');
  return '#' + hx(r) + hx(g) + hx(b) + hx((a ?? 1) * 255);
}

function lerpColor(c0, c1, t) {
  return {
    r: c0.r + (c1.r - c0.r) * t,
    g: c0.g + (c1.g - c0.g) * t,
    b: c0.b + (c1.b - c0.b) * t,
    a: c0.a + (c1.a - c0.a) * t,
  };
}


// ── HTML helpers (shared across chat-layout widgets) ───────────

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function covBar(doc, wiki, variant, extraStyle) {
  const cls = variant === 'lg' ? 'cov cov-lg' : 'cov cov-sm';
  const st = extraStyle ? ` style="${extraStyle}"` : '';
  return `<div class="${cls}"${st}><div class="cov-d" style="width:${doc}%"></div><div class="cov-w" style="width:${wiki}%"></div></div>`;
}


// ════════════════════════════════════════════════════════════════
//  parseDslValue — parse the params portion after :type:
// ════════════════════════════════════════════════════════════════
//
//  Replaces TextSpec.  Tries JSON.parse first (full fidelity:
//  nested objects, arrays, proper types, pipes in strings).
//  Falls back to legacy pipe format so old content keeps working.
//
//  :server: {"icon":"⚙","id":"gear"}       → {icon:'⚙', id:'gear'}
//  :diagrams: ["arch","flow"]               → ['arch','flow']
//  :server: icon=⚙ | id=gear               → {icon:'⚙', id:'gear'}   (legacy)
//  :diagrams: arch | flow                   → ['arch','flow']          (legacy)
//  :group: Theme                            → 'Theme'                  (bare word)
//  :separator:                              → null
// ════════════════════════════════════════════════════════════════

function parseDslValue(raw) {
  const s = (raw || '').trim();
  if (!s) return null;

  // 1. Try JSON — gives us arrays, nested objects, proper types, the lot.
  if (s[0] === '{' || s[0] === '[') {
    try { return JSON.parse(s); } catch (_) { /* fall through to legacy */ }
  }

  // 2. Legacy pipe format with = signs → struct
  if (s.includes('=')) {
    const o = {};
    for (const part of s.split('|')) {
      const eq = part.indexOf('=');
      if (eq !== -1) o[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
    return o;
  }

  // 3. Bare list (no =, has |) → array
  if (s.includes('|')) return s.split('|').map(t => t.trim()).filter(Boolean);

  // 4. Single bare word / phrase
  return s;
}


// ════════════════════════════════════════════════════════════════
//  WidgetContext
// ════════════════════════════════════════════════════════════════
//
//  Lightweight adapter that widgets use to read/write params,
//  trigger renders, and close menus — without coupling to
//  OmniControlPanel directly.
//
//  Build one with WidgetContext.fromPanel(panel) for the normal
//  panel path, or construct manually for nav-only / standalone use.
// ════════════════════════════════════════════════════════════════

class WidgetContext {
  /**
   * @param {Object} opts
   * @param {Object}   opts.params            — live params object
   * @param {Object}   [opts.sectionParams]   — per-section params (takes priority for writes)
   * @param {Object}   [opts.engine]          — OmniParamEngine
   * @param {Object}   [opts.panel]           — OmniControlPanel instance
   * @param {Object}   [opts.presets]         — fallback presets dict
   * @param {Function} [opts.render]
   * @param {Function} [opts.onParamChange]
   * @param {Function} [opts.clearActivePreset]
   * @param {Function} [opts.morphToTarget]   — (params, target, duration?)
   * @param {Function} [opts.closeMenu]
   */
  constructor(opts = {}) {
    this.params            = opts.params || {};
    this.sectionParams     = opts.sectionParams || null;
    this.engine            = opts.engine || null;
    this.panel             = opts.panel || null;
    this.presets           = opts.presets || {};
    this.compact           = opts.compact || false;
    this._render           = opts.render || (() => {});
    this._onParamChange    = opts.onParamChange || (() => {});
    this._clearActive      = opts.clearActivePreset || (() => {});
    this._morphToTarget    = opts.morphToTarget || null;
    this._closeMenu        = opts.closeMenu || (() => {});
  }

  /** Convenience — build a context from an OmniControlPanel. */
  static fromPanel(panel) {
    return new WidgetContext({
      params:            panel.params,
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

  // ── Param access ────────────────────────────────────────

  /** Write a param — routes through sectionParams or engine. */
  setParam(id, value) {
    if (this.sectionParams) {
      this.sectionParams[id] = value;
    } else if (this.engine) {
      this.engine.setParam(id, value, false);
    } else {
      this.params[id] = value;
    }
  }

  /** Read a param, preferring sectionParams when present. */
  getParam(id) {
    const src = this.sectionParams || this.params;
    return src[id];
  }

  // ── Actions ─────────────────────────────────────────────

  render()               { this._render(); }
  onParamChange(...args) { this._onParamChange(...args); }
  clearActivePreset()    { this._clearActive(); }
  closeMenu()            { this._closeMenu(); }

  morphToTarget(params, target, duration) {
    if (this._morphToTarget) this._morphToTarget(params, target, duration);
  }

  // ── Derivation ──────────────────────────────────────────

  /**
   * Return a child context whose reads/writes target the
   * section's own _params object (if present).
   */
  forSection(sectionConfig) {
    const sp = sectionConfig._params || null;
    return new WidgetContext({
      params:            sp || this.params,
      sectionParams:     sp,
      engine:            sp ? null : this.engine,   // bypass engine for direct params
      panel:             this.panel,
      presets:           this.presets,
      compact:           this.compact,
      render:            this._render,
      onParamChange:     this._onParamChange,
      clearActivePreset: this._clearActive,
      morphToTarget:     this._morphToTarget,
      closeMenu:         this._closeMenu,
    });
  }
}


// ════════════════════════════════════════════════════════════════
//  OmniWidget — base class
// ════════════════════════════════════════════════════════════════

class OmniWidget {
  constructor(config) {
    /** @type {Object} section config from sliderConfig */
    this.config = config;
  }

  /**
   * Metadata that the host (panel, transformer, tree walker) reads to
   * decide how to mount this widget.  Override in subclasses.
   *
   *   sticky      — wrap in a position:sticky section (chat layout)
   *   wrapInGroup — wrap in .control-group + h3 (panel layout)
   *   showInStrip — create a multiscroller tab (panel layout)
   */
  get meta() { return { sticky: false, wrapInGroup: true, showInStrip: true }; }

  // Backward-compat getters — existing code reads these directly.
  get showInStrip() { return this.meta.showInStrip ?? true; }
  get wrapInGroup() { return this.meta.wrapInGroup ?? true; }

  /**
   * Mount the widget into a container.
   *
   * This is the primary rendering method.  Subclasses override this.
   *
   * @param {WidgetContext} ctxMix — context (setParam, render, panel…)
   * @param {Object}        node   — the config/node (label, id, sliders…)
   * @param {Object}        params — resolved live params object
   * @returns {HTMLElement|DocumentFragment|null}
   */
  mount(ctxMix, node, params) { return null; }

  /**
   * Backward-compat wrapper — delegates to mount().
   * d-plus.html calls widget.buildControl(ctx) directly; this keeps
   * that path working until it migrates to walkPhase.
   */
  buildControl(ctx) {
    return this.mount(ctx, this.config, ctx.sectionParams || ctx.params);
  }

  // ── Helpers for template-based widgets ───────────────────

  /** Convert an HTML string to a DOM element.  Use when a template
   *  literal is more convenient than element-by-element construction. */
  static elementFromString(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild || t.content;
  }

  /**
   * Build a morphable slider — the standard range control everywhere.
   *
   * Returns { el, setValue(v) } where el is the root .morph-slider div
   * and setValue repositions the pip/fill/readout programmatically
   * (used by preset morph, param sync, etc).
   *
   * @param {Object} opts
   * @param {string}   opts.label
   * @param {number}   opts.min
   * @param {number}   opts.max
   * @param {number}   opts.step
   * @param {number}   opts.value     — initial value
   * @param {Function} [opts.format]  — (v) => display string
   * @param {Function} [opts.onChange] — (v) => void
   * @param {boolean}  [opts.disabled]
   */
  static buildMorphSlider(opts) {
    const min = +opts.min, max = +opts.max, step = +(opts.step || 1);
    const fmt = opts.format || (v => {
      // Auto-format: up to 2 decimals if step is fractional
      return step % 1 !== 0 ? (+v).toFixed(2) : String(Math.round(+v));
    });

    const el = document.createElement('div');
    el.className = 'morph-slider';
    if (opts.disabled) el.style.opacity = '0.4';

    const track = document.createElement('div');
    track.className = 'ms-track';
    const fill = document.createElement('div');
    fill.className = 'ms-fill';
    track.appendChild(fill);

    const pip = document.createElement('div');
    pip.className = 'ms-pip';

    const lbl = document.createElement('span');
    lbl.className = 'ms-label';
    lbl.textContent = opts.label || '';

    const val = document.createElement('span');
    val.className = 'ms-val';

    el.append(track, pip, lbl, val);

    // ── Internal state ───────────────────────────────────
    let currentValue = +(opts.value ?? min);

    function pctFromValue(v) {
      return max === min ? 0 : (v - min) / (max - min);
    }

    function valueFromPct(pct) {
      let v = min + pct * (max - min);
      // Snap to step
      v = Math.round(v / step) * step;
      return Math.max(min, Math.min(max, +v.toFixed(10)));
    }

    function render(v) {
      const pct = pctFromValue(v) * 100;
      fill.style.width = pct + '%';
      pip.style.left   = pct + '%';
      val.textContent   = fmt(v);
    }

    // Public: set value from outside (preset morph, param sync)
    function setValue(v) {
      currentValue = +v;
      render(currentValue);
    }

    render(currentValue);

    // ── Pointer interaction ──────────────────────────────
    if (!opts.disabled) {
      const update = (clientX) => {
        const rect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        currentValue = valueFromPct(pct);
        render(currentValue);
        if (opts.onChange) opts.onChange(currentValue);
      };

      let engaged = false;

      el.addEventListener('pointerdown', e => {
        engaged = true;
        el.classList.add('engaged');
        el.setPointerCapture(e.pointerId);
        update(e.clientX);
      });
      el.addEventListener('pointermove', e => {
        if (engaged) update(e.clientX);
      });
      el.addEventListener('pointerup', () => {
        engaged = false;
        el.classList.remove('engaged');
      });
      el.addEventListener('pointercancel', () => {
        engaged = false;
        el.classList.remove('engaged');
      });
    }

    // Expose the value element for external id assignment
    el._valEl   = val;
    el._setValue = setValue;
    el._getValue = () => currentValue;

    // Backward-compat: the panel reads/writes .value like an <input>.
    // defineProperty so it's not enumerable (won't confuse iteration).
    Object.defineProperty(el, 'value', {
      get: () => currentValue,
      set: v => { setValue(+v); },
      configurable: true,
    });

    return { el, setValue, getValue: () => currentValue, valEl: val };
  }
}


// ════════════════════════════════════════════════════════════════
//  SliderGroupWidget
//  ─ The default type when config has a .sliders array.
//  ─ Each entry can be a range slider, color picker, or button-row.
// ════════════════════════════════════════════════════════════════

class SliderGroupWidget extends OmniWidget {

  mount(ctxMix, node, params) {
    if (ctxMix.compact) {
      const id = node.id;
      if (!id) return null;
      const cfg = {
        type: 'nav-item', label: node.group || id,
        action: () => {
          const section = document.getElementById(`section-${id}`);
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      };
      return createWidget(cfg).mount(ctxMix, cfg, params);
    }

    const frag = document.createDocumentFragment();

    for (const s of (node.sliders || [])) {
      if (s.type === 'color') {
        frag.appendChild(SliderGroupWidget._buildColor(s, params, ctxMix));
      } else if (s.type === 'button-row') {
        frag.appendChild(SliderGroupWidget._buildButtonRow(s, params, ctxMix));
      } else {
        frag.appendChild(SliderGroupWidget._buildRange(s, params, ctxMix));
      }
    }
    return frag;
  }

  // ── Range slider ──────────────────────────────────────────

  static _buildRange(s, params, ctx) {
    const initVal = s.isData
      ? (s.dataValue || s.default)
      : (params[s.id] ?? s.default);

    const { el, setValue, valEl } = OmniWidget.buildMorphSlider({
      label:    s.label,
      min:      s.min,
      max:      s.max,
      step:     s.step,
      value:    initVal,
      disabled: s.disabled,
      format:   v => formatValue(v, s.format),
      onChange: v => {
        if (s.isData) {
          ctx.onParamChange(s.id, v, true, ctx.panel);
        } else {
          ctx.setParam(s.id, v);
          ctx.onParamChange(s.id, v, false, ctx.panel);
        }
        ctx.render();
        ctx.clearActivePreset();
      },
    });

    // Keep the same id conventions so preset morph / param sync can find them
    el.id = s.id;
    valEl.id = `${s.id}-val`;
    el.dataset.sliderId = s.id;

    return el;
  }

  // ── Color picker ──────────────────────────────────────────

  static _buildColor(s, params, ctx) {
    const initVal = params[s.id] ?? s.default ?? '#ffffffff';

    const controlEl = document.createElement('div');
    controlEl.className = 'control sc-color-control';

    // label row
    const label = document.createElement('label');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = s.label;
    const valSpan = document.createElement('span');
    valSpan.id = `${s.id}-val`;
    valSpan.textContent = initVal;
    label.appendChild(nameSpan);
    label.appendChild(valSpan);

    // swatch
    const swatch = document.createElement('button');
    swatch.className = 'sc-color-swatch';
    swatch.id = `${s.id}-swatch`;
    swatch.style.backgroundColor = initVal;

    // popup
    const popup = document.createElement('div');
    popup.className = 'sc-color-popup';
    popup.style.display = 'none';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = s.id;
    colorInput.value = initVal.slice(0, 7);

    const alphaRow = document.createElement('div');
    alphaRow.className = 'sc-color-alpha-row';
    const alphaLabel = document.createElement('span');
    alphaLabel.textContent = 'Alpha';
    const alphaSlider = document.createElement('input');
    alphaSlider.type = 'range';
    alphaSlider.id = `${s.id}-alpha`;
    alphaSlider.min = 0;
    alphaSlider.max = 1;
    alphaSlider.step = 0.01;
    alphaSlider.value = parseHexColor(initVal).a;

    alphaRow.appendChild(alphaLabel);
    alphaRow.appendChild(alphaSlider);
    popup.appendChild(colorInput);
    popup.appendChild(alphaRow);

    const writeColor = () => {
      const rgb = parseHexColor(colorInput.value);
      rgb.a = parseFloat(alphaSlider.value);
      const hex = formatHexColor(rgb);
      ctx.setParam(s.id, hex);
      swatch.style.backgroundColor = hex;
      valSpan.textContent = hex;
      ctx.render();
      ctx.clearActivePreset();
    };

    colorInput.addEventListener('input', writeColor);
    alphaSlider.addEventListener('input', writeColor);

    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasHidden = popup.style.display === 'none';
      document.querySelectorAll('.sc-color-popup')
              .forEach(p => p.style.display = 'none');
      popup.style.display = wasHidden ? '' : 'none';
    });

    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && e.target !== swatch) {
        popup.style.display = 'none';
      }
    });

    controlEl.appendChild(label);
    controlEl.appendChild(swatch);
    controlEl.appendChild(popup);
    return controlEl;
  }

  // ── Mutually-exclusive button row ─────────────────────────

  static _buildButtonRow(s, params, ctx) {
    const initVal = params[s.id] ?? s.default;

    const controlEl = document.createElement('div');
    controlEl.className = 'control';

    if (s.label) {
      const label = document.createElement('label');
      label.innerHTML = `<span>${s.label}</span>`;
      controlEl.appendChild(label);
    }

    const row = document.createElement('div');
    row.className = 'sc-btn-row';
    row.id = s.id;

    for (const opt of (s.options || [])) {
      const btn = document.createElement('button');
      btn.textContent = opt.label;
      btn.dataset.v = opt.value;
      if (opt.value === initVal) btn.classList.add('on');

      btn.addEventListener('click', () => {
        row.querySelectorAll('button').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        ctx.setParam(s.id, opt.value);
        ctx.onParamChange(s.id, opt.value, false, ctx.panel);
        ctx.render();
        ctx.clearActivePreset();
      });

      row.appendChild(btn);
    }

    controlEl.appendChild(row);
    return controlEl;
  }
}


// ════════════════════════════════════════════════════════════════
//  PresetWidget
// ════════════════════════════════════════════════════════════════

class PresetWidget extends OmniWidget {

  mount(ctxMix, node, params) {
    const presets = node.presets || ctxMix.presets || {};

    if (ctxMix.compact) {
      const cfg = {
        type: 'nav-submenu', label: node.group || 'Presets',
        subtree: Object.keys(presets).map(name => ({
          type: 'nav-item', label: name,
          action: () => {
            if (node._params) ctxMix.morphToTarget(node._params, presets[name]);
            else if (ctxMix.panel) ctxMix.panel.setPreset(name);
          },
        })),
      };
      return createWidget(cfg).mount(ctxMix, cfg, params);
    }

    const el = document.createElement('div');
    el.className = 'presets';
    el.id = node.presetsId || 'presets';

    for (const name of Object.keys(presets)) {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.textContent = name;

      btn.onclick = () => {
        if (node._params) {
          // Direct morph path (setContext / per-layer presets)
          el.querySelectorAll('.preset-btn').forEach(b =>
            b.classList.toggle('active', b === btn));
          ctxMix.morphToTarget(node._params, presets[name]);
        } else if (ctxMix.panel) {
          // Engine morph path (constructor / standalone)
          ctxMix.panel.setPreset(name);
        }
      };

      el.appendChild(btn);
    }

    return el;
  }

}


// ════════════════════════════════════════════════════════════════
//  SelectWidget
// ════════════════════════════════════════════════════════════════

class SelectWidget extends OmniWidget {

  mount(ctxMix, node, params) {
    if (ctxMix.compact) {
      const options = node.optgroups
        ? Object.values(node.optgroups).flat()
        : (node.options || []);
      const cfg = {
        type: 'nav-submenu', label: node.group || node.label || 'Select',
        subtree: options.map(opt => ({
          type: 'nav-item', label: opt.label,
          action: () => {
            const selectEl = document.getElementById(node.selectId || node.id);
            if (selectEl) selectEl.value = opt.value;
            if (node.onChange) node.onChange(opt.value, ctxMix.panel);
            else { ctxMix.onParamChange(node.id, opt.value, false, ctxMix.panel); ctxMix.render(); }
          },
        })),
      };
      return createWidget(cfg).mount(ctxMix, cfg, params);
    }

    const controlEl = document.createElement('div');
    controlEl.className = 'control';

    if (node.label) {
      const label = document.createElement('label');
      label.innerHTML = `<span>${node.label}</span>`;
      controlEl.appendChild(label);
    }

    const select = document.createElement('select');
    select.id = node.selectId || node.id;

    if (node.optgroups) {
      for (const [groupLabel, opts] of Object.entries(node.optgroups)) {
        const og = document.createElement('optgroup');
        og.label = groupLabel;
        for (const opt of opts) {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          if (opt.selected) option.selected = true;
          og.appendChild(option);
        }
        select.appendChild(og);
      }
    } else {
      for (const opt of (node.options || [])) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.selected) option.selected = true;
        select.appendChild(option);
      }
    }

    select.addEventListener('change', () => {
      if (node.onChange) {
        node.onChange(select.value, ctxMix.panel);
      } else {
        ctxMix.onParamChange(node.id, select.value, false, ctxMix.panel);
        ctxMix.render();
      }
    });

    controlEl.appendChild(select);
    return controlEl;
  }

}


// ════════════════════════════════════════════════════════════════
//  ButtonWidget
// ════════════════════════════════════════════════════════════════

class ButtonWidget extends OmniWidget {

  mount(ctxMix, node, params) {
    if (ctxMix.compact) {
      const cfg = {
        type: 'nav-item', label: node.group || node.label || 'Action',
        action: () => { if (node.onClick) node.onClick(ctxMix.panel); },
      };
      return createWidget(cfg).mount(ctxMix, cfg, params);
    }

    const btn = document.createElement('button');
    btn.className = 'btn' + (node.secondary ? ' secondary' : '');
    btn.id = node.buttonId || node.id;
    btn.textContent = node.label || 'Button';
    btn.addEventListener('click', () => {
      if (node.onClick) node.onClick(ctxMix.panel);
    });
    return btn;
  }

}


// ════════════════════════════════════════════════════════════════
//  ToggleWidget  (NEW)
//  ─ Panel: styled toggle switch  (uses existing .toggle-item CSS)
//  ─ Nav:   checkbox menu item
//
//  Config:
//    { type:'toggle', id, label,
//      paramId?,           // param key (defaults to id)
//      checked?,           // initial state (or read from params)
//      onChange?(val, panel) }
// ════════════════════════════════════════════════════════════════

class ToggleWidget extends OmniWidget {

  mount(ctxMix, node, params) {
    const pid = node.paramId || node.id;
    const checked = params[pid] ?? node.checked ?? false;

    if (ctxMix.compact) {
      const cfg = {
        type: 'nav-checkbox', label: node.label || node.group || 'Toggle',
        checked: !!checked,
        onChange: (val) => {
          ctxMix.setParam(pid, val);
          if (node.onChange) node.onChange(val, ctxMix.panel);
          ctxMix.onParamChange(pid, val, false, ctxMix.panel);
          ctxMix.render();
          const el = document.getElementById(pid);
          if (el) el.checked = val;
        },
      };
      return createWidget(cfg).mount(ctxMix, cfg, params);
    }

    const label = document.createElement('label');
    label.className = 'toggle-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = pid;
    input.checked = !!checked;

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';

    const text = document.createElement('span');
    text.className = 'toggle-label';
    text.textContent = node.label || '';

    label.appendChild(input);
    label.appendChild(slider);
    label.appendChild(text);

    label.addEventListener('change', () => {
      const val = input.checked;
      ctxMix.setParam(pid, val);
      if (node.onChange) node.onChange(val, ctxMix.panel);
      ctxMix.onParamChange(pid, val, false, ctxMix.panel);
      ctxMix.render();
    });

    return label;
  }

}


// ════════════════════════════════════════════════════════════════
//  FileDropWidget
// ════════════════════════════════════════════════════════════════

class FileDropWidget extends OmniWidget {

  mount(ctxMix, node, params) {
    if (ctxMix.compact) return null;

    const drop = document.createElement('div');
    drop.className = 'file-drop';
    drop.id = node.id;
    drop.innerHTML = `
      <div class="file-drop-icon">📁</div>
      <div>${node.label || 'Drop files here'}</div>
    `;

    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('dragover');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));

    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      if (node.onDrop) node.onDrop(e.dataTransfer.files, ctxMix.panel);
    });

    drop.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = node.multiple || false;
      input.accept = node.accept || '*';
      input.onchange = () => {
        if (node.onDrop) node.onDrop(input.files, ctxMix.panel);
      };
      input.click();
    });

    return drop;
  }

}


// ════════════════════════════════════════════════════════════════
//  StatusWidget
// ════════════════════════════════════════════════════════════════

class StatusWidget extends OmniWidget {

  get showInStrip() { return false; }

  mount(ctxMix, node, params) {
    if (ctxMix.compact) return null;

    const el = document.createElement('div');
    el.className = 'status-message';
    el.id = node.statusId || 'status';
    if (ctxMix.panel) ctxMix.panel.statusEl = el;
    return el;
  }

}


// ════════════════════════════════════════════════════════════════
//  InfoWidget
// ════════════════════════════════════════════════════════════════

class InfoWidget extends OmniWidget {

  get showInStrip() { return false; }

  mount(ctxMix, node, params) {
    if (ctxMix.compact) return null;

    const el = document.createElement('div');
    el.className = 'info-panel';
    el.id = node.infoId || 'info';
    if (ctxMix.panel) ctxMix.panel.infoEl = el;
    return el;
  }

}


// ════════════════════════════════════════════════════════════════
//  DynamicWidget
// ════════════════════════════════════════════════════════════════

class DynamicWidget extends OmniWidget {

  mount(ctxMix, node, params) {
    if (ctxMix.compact) return null;

    const el = document.createElement('div');
    el.className = 'dynamic-controls';
    el.id = node.containerId || node.id;
    if (ctxMix.panel) ctxMix.panel.dynamicContainers[node.id] = el;
    return el;
  }

}


// ════════════════════════════════════════════════════════════════
//  CustomWidget — delegates to config.build(el, panel)
// ════════════════════════════════════════════════════════════════

class CustomWidget extends OmniWidget {

  mount(ctxMix, node, params) {
    if (ctxMix.compact) return null;

    if (!node.build) return null;
    const wrapper = document.createElement('div');
    node.build(wrapper, ctxMix.panel);
    return wrapper;
  }

}


// ════════════════════════════════════════════════════════════════
//  LayersWidget  (no group wrapper, no strip button)
// ════════════════════════════════════════════════════════════════

class LayersWidget extends OmniWidget {

  get wrapInGroup() { return false; }
  get showInStrip() { return false; }

  mount(ctxMix, node, params) {
    if (ctxMix.compact) {
      const layers = node.layers || [];
      if (!layers.length) return null;
      const cfg = {
        type: 'nav-submenu', label: node.title || 'Layers',
        subtree: layers.map(layer => ({
          type: 'nav-item', label: layer.value?.name || 'Layer',
          action: () => { if (node.onSelect) node.onSelect(layer); },
        })),
      };
      return createWidget(cfg).mount(ctxMix, cfg, params);
    }

    const panel = document.createElement('div');
    panel.className = 'sc-layers-panel';

    const title = document.createElement('div');
    title.className = 'sc-layers-title';
    title.textContent = node.title || 'Layers';
    panel.appendChild(title);

    for (const layer of (node.layers || [])) {
      const item = document.createElement('div');
      item.className = 'sc-layer-item';
      if (layer === node.selectedLayer) item.classList.add('selected');

      const dot = document.createElement('div');
      dot.className = 'sc-layer-dot';
      dot.style.backgroundColor = layer.value?.dotColor || '#888';

      const name = document.createElement('span');
      name.className = 'sc-layer-name';
      name.textContent = layer.value?.name || 'Layer';

      const vis = document.createElement('button');
      vis.className = 'sc-layer-vis';
      vis.textContent = layer.value?.visible !== false ? '👁' : '·';
      vis.onclick = (e) => {
        e.stopPropagation();
        layer.value.visible = !layer.value.visible;
        vis.textContent = layer.value.visible ? '👁' : '·';
        if (node.onToggleVisibility) node.onToggleVisibility(layer);
      };

      item.appendChild(dot);
      item.appendChild(name);
      item.appendChild(vis);
      item.onclick = () => { if (node.onSelect) node.onSelect(layer); };

      panel.appendChild(item);
    }

    return panel;
  }

}


// ════════════════════════════════════════════════════════════════
//  AddBarWidget  (no group wrapper, no strip button)
// ════════════════════════════════════════════════════════════════

class AddBarWidget extends OmniWidget {

  get wrapInGroup() { return false; }
  get showInStrip() { return false; }

  mount(ctxMix, node, params) {
    if (ctxMix.compact) {
      const items = node.items || [];
      if (!items.length) return null;
      const cfg = {
        type: 'nav-submenu', label: 'Add',
        subtree: items.map(item => ({
          type: 'nav-item', label: item.label,
          action: () => { if (node.onAdd) node.onAdd(item.id); },
        })),
      };
      return createWidget(cfg).mount(ctxMix, cfg, params);
    }

    const bar = document.createElement('div');
    bar.className = 'sc-add-bar';

    for (const item of (node.items || [])) {
      const btn = document.createElement('button');
      btn.className = 'sc-add-btn';
      btn.textContent = '+ ' + item.label;
      btn.onclick = () => { if (node.onAdd) node.onAdd(item.id); };
      bar.appendChild(btn);
    }

    return bar;
  }

}


// ════════════════════════════════════════════════════════════════
//  SelectionActionBarWidget  (no group wrapper, no strip button)
// ════════════════════════════════════════════════════════════════

class SelectionActionBarWidget extends OmniWidget {

  get wrapInGroup() { return false; }
  get showInStrip() { return false; }

  mount(ctxMix, node, params) {
    if (ctxMix.compact) return null;

    const bar = document.createElement('div');
    bar.className = 'sc-selection-bar';

    const count = document.createElement('span');
    count.className = 'sc-sel-count';
    count.id = 'sel-count';
    count.textContent = node.count ?? 0;

    const display = document.createElement('span');
    display.className = 'sc-sel-display';
    display.id = 'sel-display';
    display.textContent = node.display || '—';

    const addBtn = document.createElement('button');
    addBtn.className = 'sc-sel-btn';
    addBtn.id = 'sel-add';
    addBtn.textContent = '+';
    addBtn.title = 'Add';
    addBtn.disabled = !node.canAdd;
    addBtn.onclick = () => { if (node.onAdd) node.onAdd(); };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'sc-sel-btn sc-sel-btn-remove';
    removeBtn.id = 'sel-remove';
    removeBtn.textContent = '−';
    removeBtn.title = 'Remove';
    removeBtn.disabled = !node.canRemove;
    removeBtn.onclick = () => { if (node.onRemove) node.onRemove(); };

    bar.appendChild(count);
    bar.appendChild(display);
    bar.appendChild(addBtn);
    bar.appendChild(removeBtn);
    return bar;
  }

}


// ════════════════════════════════════════════════════════════════
//  DividerWidget  (NEW — visual separator)
//  Panel: thin horizontal rule matching the OmniBase theme
//  Nav:   { type: 'nav-divider' }
// ════════════════════════════════════════════════════════════════

class DividerWidget extends OmniWidget {

  get wrapInGroup() { return false; }
  get showInStrip() { return false; }

  mount(ctxMix, node, params) {
    if (ctxMix.compact) {
      const cfg = { type: 'nav-divider' };
      return createWidget(cfg).mount(ctxMix, cfg, params);
    }

    const el = document.createElement('div');
    el.className = 'ow-divider';
    el.style.cssText = 'height:1px;background:rgba(79,195,247,0.12);margin:8px 0;';
    return el;
  }
}


// ════════════════════════════════════════════════════════════════
//  LabelWidget  (NEW — read-only display text)
//
//  Config:
//    { type:'label', id?, group?, text?, html? }
// ════════════════════════════════════════════════════════════════

class LabelWidget extends OmniWidget {

  get showInStrip() { return false; }

  mount(ctxMix, node, params) {
    if (ctxMix.compact) return null;

    const el = document.createElement('div');
    el.className = 'ow-label';
    if (node.labelId || node.id) el.id = node.labelId || node.id;
    el.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    if (node.html) {
      el.innerHTML = node.html;
    } else {
      el.textContent = node.text || '';
    }
    return el;
  }

}


// ════════════════════════════════════════════════════════════════
//  NumberInputWidget  (NEW)
//
//  Config:
//    { type:'number-input', id, label?,
//      paramId?, default?, min?, max?, step?,
//      onChange?(val, panel) }
// ════════════════════════════════════════════════════════════════

class NumberInputWidget extends OmniWidget {

  mount(ctxMix, node, params) {
    if (ctxMix.compact) return null;

    const pid = node.paramId || node.id;
    const initVal = params[pid] ?? node.default ?? 0;

    const controlEl = document.createElement('div');
    controlEl.className = 'control';

    if (node.label) {
      const label = document.createElement('label');
      label.innerHTML = `<span>${node.label}</span>`;
      controlEl.appendChild(label);
    }

    const input = document.createElement('input');
    input.type = 'number';
    input.id = pid;
    input.value = initVal;
    if (node.min != null) input.min = node.min;
    if (node.max != null) input.max = node.max;
    if (node.step != null) input.step = node.step;
    input.style.cssText =
      'width:100%;padding:4px 6px;border:1px solid #333;border-radius:4px;' +
      'background:#0f0f23;color:#ccc;font-size:11px;font-family:monospace;';

    input.addEventListener('change', () => {
      const val = parseFloat(input.value);
      if (isNaN(val)) return;
      ctxMix.setParam(pid, val);
      if (node.onChange) node.onChange(val, ctxMix.panel);
      ctxMix.onParamChange(pid, val, false, ctxMix.panel);
      ctxMix.render();
      ctxMix.clearActivePreset();
    });

    controlEl.appendChild(input);
    return controlEl;
  }

}


// ════════════════════════════════════════════════════════════════
//  TextInputWidget  (NEW)
//
//  Config:
//    { type:'text-input', id, label?, placeholder?,
//      paramId?, default?, liveUpdate?: bool,
//      onChange?(val, panel) }
// ════════════════════════════════════════════════════════════════

class TextInputWidget extends OmniWidget {

  mount(ctxMix, node, params) {
    if (ctxMix.compact) return null;

    const pid = node.paramId || node.id;
    const initVal = params[pid] ?? node.default ?? '';

    const controlEl = document.createElement('div');
    controlEl.className = 'control';

    if (node.label) {
      const label = document.createElement('label');
      label.innerHTML = `<span>${node.label}</span>`;
      controlEl.appendChild(label);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.id = pid;
    input.value = initVal;
    if (node.placeholder) input.placeholder = node.placeholder;
    input.style.cssText =
      'width:100%;padding:4px 6px;border:1px solid #333;border-radius:4px;' +
      'background:#0f0f23;color:#ccc;font-size:11px;';

    const emit = () => {
      ctxMix.setParam(pid, input.value);
      if (node.onChange) node.onChange(input.value, ctxMix.panel);
      ctxMix.onParamChange(pid, input.value, false, ctxMix.panel);
      ctxMix.render();
    };

    input.addEventListener('change', emit);
    if (node.liveUpdate) input.addEventListener('input', emit);

    controlEl.appendChild(input);
    return controlEl;
  }

}


// ════════════════════════════════════════════════════════════════
//  ButtonGroupWidget  (NEW)
//
//  Config:
//    { type:'button-group', id?, group?,
//      direction?: 'row'|'column',  gap?: '8px',
//      buttons: [{ text, id?, className?, style?, onClick }] }
// ════════════════════════════════════════════════════════════════

class ButtonGroupWidget extends OmniWidget {

  mount(ctxMix, node, params) {
    if (ctxMix.compact) {
      const buttons = node.buttons || [];
      if (!buttons.length) return null;
      const cfg = {
        type: 'nav-submenu', label: node.group || 'Actions',
        subtree: buttons.map(b => ({
          type: 'nav-item', label: b.text || b.label || 'Action',
          action: () => { if (b.onClick) b.onClick(ctxMix.panel); },
        })),
      };
      return createWidget(cfg).mount(ctxMix, cfg, params);
    }

    const el = document.createElement('div');
    el.style.display = 'flex';
    el.style.flexDirection = node.direction || 'column';
    el.style.gap = node.gap || '8px';

    for (const b of (node.buttons || [])) {
      const btn = document.createElement('button');
      btn.className = b.className || 'btn';
      btn.textContent = b.text || b.label || '';
      if (b.id) btn.id = b.id;
      if (b.style) Object.assign(btn.style, b.style);
      btn.addEventListener('click', () => {
        if (b.onClick) b.onClick(ctxMix.panel);
      });
      el.appendChild(btn);
    }

    return el;
  }

}


// ════════════════════════════════════════════════════════════════
//  Chat-layout widgets
//
//  These are the :thing: fragment types from the DeepExplorer DSL.
//  Each replaces one branch of the old _renderFragment switch and
//  one or more h.* helper functions.
//
//  Convention:
//    meta.sticky       — host wraps in a position:sticky section
//    meta.wrapInGroup  — false (these are not panel controls)
//    meta.showInStrip  — false (these don't appear in multiscroller)
//
//  Config comes from the DSL parser's _parseProps (key=val|key=val)
//  plus _content for any body text after the first line.
// ════════════════════════════════════════════════════════════════

/** Shared meta for non-sticky chat widgets. */
const _chatMeta   = { sticky: false, wrapInGroup: false, showInStrip: false };
const _stickyMeta = { sticky: true,  wrapInGroup: false, showInStrip: false };


// ── Server icon (col1) ──────────────────────────────────────────

class ServerIconWidget extends OmniWidget {
  get meta() { return _chatMeta; }

  mount(ctxMix, node, params) {
    const c = node.value || node;
    const active = c.active === 'true' || c.active === true ? ' active' : '';
    const style = c.bg ? ` style="--srv-bg:${c.bg}"` : '';
    return OmniWidget.elementFromString(
      `<div class="srv${active}" data-server-id="${_esc(c.id || '')}" data-url="${_esc(c.url || '')}"${style}>${_esc(c.icon || '')}<div class="tip">${_esc(c.name || '')}</div></div>`
    );
  }
}


// ── Server separator (col1) ─────────────────────────────────────

class SrvSeparatorWidget extends OmniWidget {
  get meta() { return _chatMeta; }

  mount(ctxMix, node, params) {
    return OmniWidget.elementFromString('<div class="srv-sep"></div>');
  }
}


// ── Column header (col2) ────────────────────────────────────────

class ColHeaderWidget extends OmniWidget {
  get meta() { return _chatMeta; }

  mount(ctxMix, node, params) {
    const inner = node._content?.trim() || (typeof node.value === 'string' ? node.value : '') || '';
    return OmniWidget.elementFromString(
      `<div class="ch-hdr">${inner}</div>`
    );
  }
}


// ── Chat header (col3 — opens the message scroller) ─────────────

class ChatHeaderWidget extends OmniWidget {
  get meta() { return _chatMeta; }

  mount(ctxMix, node, params) {
    const c = node.value || node;
    const desc = c.desc ? `<span class="desc">${_esc(c.desc)}</span>` : '';
    return OmniWidget.elementFromString(
      `<div class="chat-hdr"><span class="hash">#</span> ${_esc(c.name || '')}${desc}</div>`
    );
  }
}


// ── Section group label ─────────────────────────────────────────

class SectionGroupWidget extends OmniWidget {
  get meta() { return _chatMeta; }

  mount(ctxMix, node, params) {
    const text = (typeof node.value === 'string' ? node.value : '') || node._content?.trim() || '';
    return OmniWidget.elementFromString(
      `<div class="ch-group">${_esc(text)}</div>`
    );
  }
}


// ── Coverage legend ─────────────────────────────────────────────

class CovLegendWidget extends OmniWidget {
  get meta() { return _chatMeta; }

  mount(ctxMix, node, params) {
    const c = node.value || node;
    return OmniWidget.elementFromString(
      `<div class="legend">
        <span><span class="legend-sw" style="background:var(--docstring)"></span>${_esc(c.doc || '')}</span>
        <span><span class="legend-sw" style="background:var(--wiki)"></span>${_esc(c.wiki || '')}</span>
        <span><span class="legend-sw" style="background:var(--surface-2)"></span>${_esc(c.gap || '')}</span></div>`
    );
  }
}


// ── Single topic item (col2 sidebar) ────────────────────────────

class TopicItemWidget extends OmniWidget {
  get meta() { return _chatMeta; }

  mount(ctxMix, node, params) {
    const c = node.value || node;
    const active = c.active === 'true' || c.active === true ? ' active' : '';
    const style = c.bg && c.fg ? `background:${c.bg};color:${c.fg}` : '';
    const scene = c.scene ? ` data-scene="${_esc(c.scene)}"` : '';
    const lblStyle = c.labelStyle ? ` style="${c.labelStyle}"` : '';

    let right = '';
    if (c.doc != null) {
      right = covBar(+c.doc, +(c.wiki || 0), 'sm');
    } else if (c.meta) {
      right = `<div class="ch-meta">${_esc(c.meta)}</div>`;
    }

    return OmniWidget.elementFromString(
      `<div class="ch${active}" data-ch="${_esc(c.id || '')}"${scene}>
        <div class="ch-ico" style="${style}">${_esc(c.icon || '')}</div>
        <div class="ch-lbl"${lblStyle}>${_esc(c.label || '')}</div>${right}</div>`
    );
  }
}


// ── Chat message ────────────────────────────────────────────────

class ChatMessageWidget extends OmniWidget {
  get meta() { return _chatMeta; }

  mount(ctxMix, node, params) {
    const c = node.value || node;
    const body = node._content?.trim() || c._content?.trim() || '';
    const role = c.role || 'u1';
    const avatar = _esc(c.avatar || '?');
    const name = _esc(c.name || '?');
    const time = _esc(c.time || '');

    return OmniWidget.elementFromString(
      `<div class="msg"><div class="msg-in role-${_esc(role)}">
        <div class="msg-av">${avatar}</div>
        <div class="msg-bd">
          <div class="msg-hd"><span class="msg-nm">${name}</span><span class="msg-tm">${time}</span></div>
          <div class="msg-tx">${body}</div>
        </div></div></div>`
    );
  }
}


// ── Embed card (sticky) ─────────────────────────────────────────

class EmbedCardWidget extends OmniWidget {
  get meta() { return _stickyMeta; }

  mount(ctxMix, node, params) {
    const c = node.value || node;
    const doc = +(c.doc || 0), wiki = +(c.wiki || 0);
    const body = node._content?.trim() || c._content?.trim() || '';
    const ts = c.titleStyle ? ` style="${c.titleStyle}"` : '';
    const xs = c.textStyle ? ` style="${c.textStyle}"` : '';
    const warn = c.warn ? `<div class="embed-warn">${_esc(c.warn)}</div>` : '';

    return OmniWidget.elementFromString(
      `<div class="embed">
        <div class="embed-title"${ts}>${_esc(c.title || '')} ${covBar(doc, wiki, 'lg', c.barStyle || '')}</div>
        <div class="embed-text"${xs}>${body}</div>${warn}</div>`
    );
  }
}


// ── Embed row (sticky) ──────────────────────────────────────────

class EmbedRowWidget extends OmniWidget {
  get meta() { return _stickyMeta; }

  mount(ctxMix, node, params) {
    const c = node.value || node;
    const doc = +(c.doc || 0), wiki = +(c.wiki || 0);
    const ls = c.labelStyle ? ` style="${c.labelStyle}"` : '';
    const bs = c.badgeStyle ? ` style="${c.badgeStyle}"` : '';

    return OmniWidget.elementFromString(
      `<div class="embed-row">
        <div class="embed-row-lbl"${ls}>${_esc(c.label || '')}</div>
        ${covBar(doc, wiki, 'sm', c.barStyle || '')}
        <div class="embed-row-badge"${bs}>${_esc(c.badge || '')}</div></div>`
    );
  }
}


// ── Tags pill strip (sticky) ────────────────────────────────────

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

class EmbedTagsWidget extends OmniWidget {
  get meta() { return _stickyMeta; }

  mount(ctxMix, node, params) {
    const v = node.value || node;
    // Accept { label: styleKey, … } or [[label,key],…] or legacy fallback
    const defs = Array.isArray(v)
      ? v.map(e => Array.isArray(e) ? e : [e, e])
      : (typeof v === 'object' ? Object.entries(v) : []);
    const pills = defs.map(([label, key]) =>
      `<span class="tag" style="${TAG_STYLES[key] || key}">${_esc(label)}</span>`
    ).join('');
    return OmniWidget.elementFromString(`<div class="embed-tags">${pills}</div>`);
  }
}


// ── Embed link (sticky) ─────────────────────────────────────────

class EmbedLinkWidget extends OmniWidget {
  get meta() { return _stickyMeta; }

  mount(ctxMix, node, params) {
    const inner = (typeof node.value === 'string' ? node.value : '')
      || node._content?.trim() || '';
    return OmniWidget.elementFromString(
      `<div class="embed-link">${inner}</div>`
    );
  }
}


// ── Diagram thumbnails (sticky) ─────────────────────────────────

class EmbedDiagramsWidget extends OmniWidget {
  get meta() { return _stickyMeta; }

  mount(ctxMix, node, params) {
    const v = node.value;
    const keys = Array.isArray(v) ? v : (typeof v === 'string' ? [v] : []);
    const registry = ctxMix.panel?.diagrams || node._diagrams || {};
    const items = keys.map(k => registry[k]).filter(Boolean);

    const cards = items.map(d =>
      `<div class="dia-card"><div class="dia-thumb">${d.svg}</div><div class="dia-info"><div class="dia-name">${_esc(d.name)}</div><div class="dia-desc">${_esc(d.desc)}</div></div></div>`
    ).join('');
    return OmniWidget.elementFromString(
      `<div class="embed-diagrams">${cards}</div>`
    );
  }
}


// ── CSS-variable slider (settings page) ─────────────────────────

class CssVarSliderWidget extends OmniWidget {
  get meta() { return _chatMeta; }

  mount(ctxMix, node, params) {
    const c = node.value || node;
    const unit = c.unit || '';
    const val = c.value || c.default || '0';
    const suffix = c.suffix || unit;
    const cssVar = c.var || '';

    const { el } = OmniWidget.buildMorphSlider({
      label:  c.label || '',
      min:    c.min,
      max:    c.max,
      step:   c.step || (String(c.min).includes('.') || String(c.max).includes('.') ? 0.01 : 1),
      value:  val,
      format: v => {
        const isFloat = String(c.step || '').includes('.') || String(c.min || '').includes('.');
        return (isFloat ? (+v).toFixed(2) : String(Math.round(+v))) + suffix;
      },
      onChange: v => {
        if (cssVar) {
          document.documentElement.style.setProperty(cssVar, v + unit);
        }
      },
    });

    return el;
  }
}


// ── Chat input bar (widgets zone) ───────────────────────────────

class ChatInputWidget extends OmniWidget {
  get meta() { return _chatMeta; }

  mount(ctxMix, node, params) {
    const c = node.value || node;
    const ph = _esc(c.placeholder || (typeof node.value === 'string' ? node.value : '') || 'Type here...');

    const el = OmniWidget.elementFromString(
      `<div class="chat-input-bar"><div class="chat-input-wrap">
        <input class="chat-input" placeholder="${ph}" />
        <button class="chat-send">→</button></div></div>`
    );
    return el;
  }
}


// ── Stage card (sticky) — mount point for OmniSceneApp ──────────

class StageCardWidget extends OmniWidget {
  get meta() { return _stickyMeta; }

  mount(ctxMix, node, params) {
    const c = node.value || node;
    const height = c.height || 520;

    return OmniWidget.elementFromString(
      `<div class="scene-stage" data-stage-id="${_esc(c.id || '')}" data-stage-scene="${_esc(c.scene || '')}" style="height:${height}px">
        <div class="stage-mount" data-stage-mount></div>
        <div class="stage-bar">
          <div class="stage-badge">${_esc(c.badge || 'O')}</div>
          <div class="stage-name">${_esc(c.label || 'OmniScene')}</div>
          <div class="stage-live">live</div>
        </div>
        <div class="stage-hint">click to engage · scroll passes through until you do</div>
      </div>`
    );
  }
}


// ── GeSHi code island ───────────────────────────────────────────

class CodeIslandWidget extends OmniWidget {
  get meta() { return _chatMeta; }

  mount(ctxMix, node, params) {
    const c = node.value || node;
    const lang = c.lang || '';
    const title = c.title || '';
    const body = (node._content || c._content || '').replace(/^\n/, '').replace(/\s+$/, '');
    const isJson = lang.toLowerCase() === 'json';

    let metaHtml = '';
    if (isJson) {
      try {
        const spec = JSON.parse(body);
        // Use the real panel validator if available
        const validator = c.validator
          || ctxMix.panel?.constructor?.validateSpec;
        if (validator) {
          const errs = validator(spec);
          metaHtml = errs.length
            ? `<span class="ci-meta ci-bad">✗ ${_esc(errs[0])}</span>`
            : `<span class="ci-meta">✓ valid · ${(spec.sections || []).length} sections</span>`;
        } else {
          metaHtml = `<span class="ci-meta">✓ valid JSON</span>`;
        }
      } catch (err) {
        metaHtml = `<span class="ci-meta ci-bad">✗ ${_esc(err.message)}</span>`;
      }
    }

    const highlighted = isJson ? CodeIslandWidget._hlJson(body) : _esc(body);

    return OmniWidget.elementFromString(
      `<div class="code-island">
        <div class="code-island-hdr">
          <span class="ci-lang">${_esc(lang)}</span>
          ${title ? `<span class="ci-title">${_esc(title)}</span>` : ''}${metaHtml}
        </div>
        <pre class="ci-body"><code>${highlighted}</code></pre></div>`
    );
  }

  /** Minimal JSON tokeniser — GeSHi-style colouring, no libraries. */
  static _hlJson(src) {
    return _esc(src).replace(
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


// ── Raw HTML passthrough ────────────────────────────────────────

class RawHtmlWidget extends OmniWidget {
  get meta() { return _chatMeta; }

  mount(ctxMix, node, params) {
    const html = node._content
      || (typeof node.value === 'string' ? node.value : '')
      || '';
    if (!html) return null;
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content;
  }
}


// ════════════════════════════════════════════════════════════════
//  Nav widgets — menu items as first-class widgets
//
//  These replace the ad-hoc config protocol that NavMenu._renderItems
//  used to interpret.  NavMenu now calls mountWidgets to render its
//  dropdown, so every menu item goes through the same widget system
//  as panel controls.
//
//  Types:
//    nav-item      — clickable action
//    nav-link      — anchor (<a>) with href
//    nav-checkbox  — toggle checkbox
//    nav-divider   — horizontal rule
//    nav-submenu   — expandable accordion (container widget)
//
//  CSS class names (nav-menu-item, nav-menu-divider, etc.) are
//  defined in nav.js's stylesheet.  The widgets create the DOM;
//  the consumer provides the styles.
// ════════════════════════════════════════════════════════════════

/** Shared meta for all nav widgets: no group wrapper, no strip button. */
const _navMeta = { sticky: false, wrapInGroup: false, showInStrip: false };


class NavItemWidget extends OmniWidget {
  get meta() { return _navMeta; }

  mount(ctxMix, node, params) {
    const el = document.createElement('div');
    el.className = 'nav-menu-item';
    el.textContent = node.label || '';
    el.onclick = () => {
      if (typeof node.action === 'function') node.action();
      else if (typeof node.action === 'string' && typeof window[node.action] === 'function') window[node.action]();
      ctxMix.closeMenu();
    };
    return el;
  }
}


class NavLinkWidget extends OmniWidget {
  get meta() { return _navMeta; }

  mount(ctxMix, node, params) {
    const el = document.createElement('a');
    el.className = 'nav-menu-item';
    el.href = node.href || '#';
    el.textContent = node.label || '';
    return el;
  }
}


class NavCheckboxWidget extends OmniWidget {
  get meta() { return _navMeta; }

  mount(ctxMix, node, params) {
    const el = document.createElement('div');
    el.className = 'nav-menu-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'nav-menu-checkbox';
    cb.checked = !!node.checked;
    cb.onclick = (e) => e.stopPropagation();
    cb.onchange = () => { if (node.onChange) node.onChange(cb.checked); };

    el.appendChild(cb);
    el.appendChild(document.createTextNode(node.label || ''));
    el.onclick = (e) => {
      if (e.target !== cb) {
        cb.checked = !cb.checked;
        if (node.onChange) node.onChange(cb.checked);
      }
      e.stopPropagation();
    };

    // Store ref so apps can read/update state
    node._checkbox = cb;

    return el;
  }
}


class NavDividerWidget extends OmniWidget {
  get meta() { return _navMeta; }

  mount(ctxMix, node, params) {
    const el = document.createElement('div');
    el.className = 'nav-menu-divider';
    return el;
  }
}


class NavSubmenuWidget extends OmniWidget {
  get meta() { return _navMeta; }

  mount(ctxMix, node, params) {
    const el = document.createElement('div');
    el.className = 'nav-menu-item nav-menu-item-sub';

    const header = document.createElement('div');
    header.className = 'nav-menu-item-sub-header';
    header.textContent = node.label || '';
    el.appendChild(header);

    el.onclick = (e) => {
      e.stopPropagation();
      el.classList.toggle('open');
    };

    const sub = document.createElement('div');
    sub.className = 'nav-submenu';

    // Container pattern: build subtree via mountWidgets
    mountWidgets(node.subtree || [], ctxMix, sub);

    el.appendChild(sub);
    return el;
  }
}


// ════════════════════════════════════════════════════════════════
//  Widget helpers — create, mount, strip  (sceneRegistry is the backing store)
// ════════════════════════════════════════════════════════════════

/** Resolve the effective type for a section config. */
function resolveWidgetType(config) {
  if (config.type) return config.type;
  if (config.sliders) return 'slider-group';
  return 'custom';
}

/** Create a widget instance from a section config. */
function createWidget(config) {
  const type = resolveWidgetType(config);
  const meta = sceneRegistry.meta[type];
  if (!meta) {
    console.warn(`OmniWidget: unknown type "${type}"`);
    return new OmniWidget(config);
  }
  return new meta.nodeClass(config);
}

/**
 * Build all controls from a sliderConfig into a container element.
 *
 * @param {Array}         configs   — sliderConfig array
 * @param {WidgetContext}  ctx       — base context
 * @param {HTMLElement}    container — parent DOM element
 * @returns {OmniWidget[]}          — the widget instances (for later sync)
 */
function mountWidgets(configs, ctx, container) {
  const widgets = [];

  for (const config of configs) {
    const sCtx = config._params ? ctx.forSection(config) : ctx;
    const p = config._params || ctx.params;
    const widget = createWidget(config);
    widgets.push(widget);

    const el = widget.mount(sCtx, config, p);
    if (!el) continue;

    const meta = sceneRegistry.meta[resolveWidgetType(config)];
    const wrapInGroup = meta?.defaultParams?.wrapInGroup ?? true;

    if (wrapInGroup) {
      const groupEl = document.createElement('div');
      groupEl.className = 'control-group';
      groupEl.id = `section-${config.id}`;

      const h3 = document.createElement('h3');
      h3.textContent = config.group || '';
      groupEl.appendChild(h3);
      groupEl.appendChild(el);

      container.appendChild(groupEl);
    } else {
      container.appendChild(el);
    }
  }

  return widgets;
}

/**
 * Return configs that should appear in the multiscroller strip.
 *
 * @param {Array} configs — sliderConfig array
 * @returns {Object[]}
 */
function stripConfigs(configs) {
  return configs.filter(c => {
    const type = resolveWidgetType(c);
    const meta = sceneRegistry.meta[type];
    return (meta?.defaultParams?.showInStrip ?? true);
  });
}


// ── Register built-in types on sceneRegistry ────────────────
//
//  Third arg = defaultParams.  wrapInGroup / showInStrip
//  replace the per-widget meta getter.

// Nav widgets
sceneRegistry.registerNodeClass('nav-item',     NavItemWidget,     { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('nav-link',     NavLinkWidget,     { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('nav-checkbox', NavCheckboxWidget, { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('nav-divider',  NavDividerWidget,  { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('nav-submenu',  NavSubmenuWidget,  { wrapInGroup: false, showInStrip: false });

// Panel widgets
sceneRegistry.registerNodeClass('slider-group', SliderGroupWidget);
sceneRegistry.registerNodeClass('presets',      PresetWidget);
sceneRegistry.registerNodeClass('select',       SelectWidget);
sceneRegistry.registerNodeClass('button',       ButtonWidget);
sceneRegistry.registerNodeClass('toggle',       ToggleWidget);
sceneRegistry.registerNodeClass('filedrop',     FileDropWidget);
sceneRegistry.registerNodeClass('status',       StatusWidget,      { showInStrip: false });
sceneRegistry.registerNodeClass('info',         InfoWidget,        { showInStrip: false });
sceneRegistry.registerNodeClass('dynamic',      DynamicWidget);
sceneRegistry.registerNodeClass('custom',       CustomWidget);
//sceneRegistry.registerNodeClass('layers',     LayersWidget,      { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('addbar',       AddBarWidget,      { wrapInGroup: false, showInStrip: false });
//sceneRegistry.registerNodeClass('selection-action-bar', SelectionActionBarWidget, { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('divider',      DividerWidget,     { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('label',        LabelWidget,       { showInStrip: false });
sceneRegistry.registerNodeClass('number-input', NumberInputWidget);
sceneRegistry.registerNodeClass('text-input',   TextInputWidget);
sceneRegistry.registerNodeClass('button-group', ButtonGroupWidget);

// Chat-layout types (match the :thing: names from the DSL)
sceneRegistry.registerNodeClass('server',       ServerIconWidget,    { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('separator',    SrvSeparatorWidget,  { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('header',       ColHeaderWidget,     { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('chatheader',   ChatHeaderWidget,    { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('group',        SectionGroupWidget,  { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('legend',       CovLegendWidget,     { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('topic',        TopicItemWidget,     { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('message',      ChatMessageWidget,   { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('card',         EmbedCardWidget,     { sticky: true,  wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('row',          EmbedRowWidget,      { sticky: true,  wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('tags',         EmbedTagsWidget,     { sticky: true,  wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('link',         EmbedLinkWidget,     { sticky: true,  wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('diagrams',     EmbedDiagramsWidget, { sticky: true,  wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('control',      CssVarSliderWidget,  { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('input',        ChatInputWidget,     { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('stage',        StageCardWidget,     { sticky: true,  wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('code',         CodeIslandWidget,    { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('html',         RawHtmlWidget,       { wrapInGroup: false, showInStrip: false });


// ════════════════════════════════════════════════════════════════
//  Exports
// ════════════════════════════════════════════════════════════════

export {
  // Core framework
  OmniWidget,
  WidgetContext,
  createWidget,
  mountWidgets,
  stripConfigs,
  parseDslValue,

  // Utilities (shared with OmniControlPanel for morph / sync)
  formatValue,
  isHexColor,
  parseHexColor,
  formatHexColor,
  lerpColor,
  _esc,
  covBar,

  // Nav widget classes (menu items as widgets)
  NavItemWidget,
  NavLinkWidget,
  NavCheckboxWidget,
  NavDividerWidget,
  NavSubmenuWidget,

  // Panel widget classes
  SliderGroupWidget,
  PresetWidget,
  SelectWidget,
  ButtonWidget,
  ToggleWidget,
  FileDropWidget,
  StatusWidget,
  InfoWidget,
  DynamicWidget,
  CustomWidget,
  //LayersWidget,
  AddBarWidget,
  //SelectionActionBarWidget,
  DividerWidget,
  LabelWidget,
  NumberInputWidget,
  TextInputWidget,
  ButtonGroupWidget,

  // Chat-layout widget classes
  ServerIconWidget,
  SrvSeparatorWidget,
  ColHeaderWidget,
  ChatHeaderWidget,
  SectionGroupWidget,
  CovLegendWidget,
  TopicItemWidget,
  ChatMessageWidget,
  EmbedCardWidget,
  EmbedRowWidget,
  EmbedTagsWidget,
  EmbedLinkWidget,
  EmbedDiagramsWidget,
  CssVarSliderWidget,
  ChatInputWidget,
  StageCardWidget,
  CodeIslandWidget,
  RawHtmlWidget,

  // Tag style registry (chat widgets)
  TAG_STYLES,
};

if (typeof window !== 'undefined') {
  window.OmniWidget = {
    OmniWidget, WidgetContext, createWidget, mountWidgets, stripConfigs, parseDslValue,
    formatValue, isHexColor, parseHexColor, formatHexColor, lerpColor,
    _esc, covBar, TAG_STYLES,
    NavItemWidget, NavLinkWidget, NavCheckboxWidget, NavDividerWidget, NavSubmenuWidget,
  };
}