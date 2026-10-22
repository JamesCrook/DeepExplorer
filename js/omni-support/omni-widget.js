import { sceneRegistry, MiniAstNode } from './scene.js';

/* ============================================
   omni-widget.js — Widget Classes for Controls & Nav
   ============================================

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
    this.paramsStack       = opts.paramsStack || [opts.params || {}];
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

  /** The currently active params object (top of the stack). */
  get _currentParams() { return this.paramsStack[this.paramsStack.length - 1]; }
  getParams(ctxMix, node, params) { return ctxMix.paramsStack?.[this.paramsStack.length - 1] ?? params; }

  /** Push a scoped params object (e.g. per-section _params). */
  pushParams(p) { this.paramsStack.push(p); }

  /** Pop back to the previous params scope. */
  popParams() {
    if (this.paramsStack.length > 1) this.paramsStack.pop();
  }

  setParam(id, value) {
    this._currentParams[id] = value;
  }

  getParam(id) {
    return this._currentParams[id];
  }

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
//  PanelWidget — root node for walkPhase('mount')
//  ─ Ensures parentStack exists. Children are top-level sections.
// ════════════════════════════════════════════════════════════════

class PanelWidget extends OmniWidget {
  static before_mount(ctxMix, node, params) {
    ctxMix.parentStack = ctxMix.parentStack || [];
  }
  static after_mount(ctxMix, node, params) {
    // nothing — children already appended into ctxMix.parentEl
  }
}


// ════════════════════════════════════════════════════════════════
//  ControlGroupWidget — .control-group wrapper with h3 heading
//  ─ Used by the coercion to wrap single-widget sections.
//  ─ SliderGroupWidget extends this for slider sections.
// ════════════════════════════════════════════════════════════════

class ControlGroupWidget extends OmniWidget {
  static before_mount(ctxMix, node, params) {
    const v = node.value || {};
    const groupEl = document.createElement('div');
    groupEl.className = 'control-group';
    groupEl.id = `section-${v.id || ''}`;

    const h3 = document.createElement('h3');
    h3.textContent = v.group || '';
    groupEl.appendChild(h3);

    if (node.inst?._params) ctxMix.pushParams(node.inst._params);

    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl = groupEl;
  }

  static after_mount(ctxMix, node, params) {
    const groupEl = ctxMix.parentEl;
    ctxMix.parentEl = ctxMix.parentStack.pop();
    ctxMix.parentEl.appendChild(groupEl);

    if (node.inst?._params) ctxMix.popParams();
  }
}


// ════════════════════════════════════════════════════════════════
//  MorphSliderWidget — the morphable range slider (leaf)
// ════════════════════════════════════════════════════════════════

class MorphSliderWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const pid = v.id;
    const p = ctxMix.getParams(ctxMix, node, params);
    const initVal = v.isData
      ? (v.dataValue || v.default)
      : (p[pid] ?? v.default ?? v.min ?? 0);

    const { el, setValue, getValue, valEl } = MorphSliderWidget.buildMorphSlider({
      label:    v.label,
      min:      v.min ?? 0,
      max:      v.max ?? 100,
      step:     v.step,
      value:    initVal,
      disabled: v.disabled,
      format:   typeof v.format === 'function'
        ? v.format
        : v.format ? (val => formatValue(val, v.format)) : undefined,
      onChange: val => {
        if (v.isData) {
          ctxMix.onParamChange(pid, val, true, ctxMix.panel);
        } else {
          p[pid] = val;
          ctxMix.onParamChange(pid, val, false, ctxMix.panel);
        }
        if (node.inst?.onChange) node.inst.onChange(val, ctxMix.panel);
        ctxMix.render();
        ctxMix.clearActivePreset();
      },
    });

    el.id = pid;
    valEl.id = `${pid}-val`;
    el.dataset.sliderId = pid;

    ctxMix.parentEl.appendChild(el);
  }

  // ── Static factory — the core DOM builder (unchanged) ──────────

  static buildMorphSlider(opts) {
    const min = +opts.min, max = +opts.max, step = +(opts.step || 1);
    const fmt = opts.format || (v => {
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

    let currentValue = +(opts.value ?? min);

    function pctFromValue(v) {
      return max === min ? 0 : (v - min) / (max - min);
    }
    function valueFromPct(pct) {
      let v = min + pct * (max - min);
      v = Math.round(v / step) * step;
      return Math.max(min, Math.min(max, +v.toFixed(10)));
    }
    function render(v) {
      const pct = pctFromValue(v) * 100;
      fill.style.width = pct + '%';
      pip.style.left   = pct + '%';
      val.textContent   = fmt(v);
    }
    function setValue(v) {
      currentValue = +v;
      render(currentValue);
    }

    render(currentValue);

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
      el.addEventListener('pointermove', e => { if (engaged) update(e.clientX); });
      el.addEventListener('pointerup', () => { engaged = false; el.classList.remove('engaged'); });
      el.addEventListener('pointercancel', () => { engaged = false; el.classList.remove('engaged'); });
    }

    el._valEl   = val;
    el._setValue = setValue;
    el._getValue = () => currentValue;

    Object.defineProperty(el, 'value', {
      get: () => currentValue,
      set: v => { setValue(+v); },
      configurable: true,
    });

    return { el, setValue, getValue: () => currentValue, valEl: val };
  }
}


// ════════════════════════════════════════════════════════════════
//  ColorPickerWidget — extracted from SliderGroupWidget._buildColor
// ════════════════════════════════════════════════════════════════

class ColorPickerWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const p = ctxMix.getParams(ctxMix, node, params);
    const initVal = p[v.id] ?? v.default ?? '#ffffffff';

    const controlEl = document.createElement('div');
    controlEl.className = 'control sc-color-control';

    const label = document.createElement('label');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = v.label;
    const valSpan = document.createElement('span');
    valSpan.id = `${v.id}-val`;
    valSpan.textContent = initVal;
    label.appendChild(nameSpan);
    label.appendChild(valSpan);

    const swatch = document.createElement('button');
    swatch.className = 'sc-color-swatch';
    swatch.id = `${v.id}-swatch`;
    swatch.style.backgroundColor = initVal;

    const popup = document.createElement('div');
    popup.className = 'sc-color-popup';
    popup.style.display = 'none';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = v.id;
    colorInput.value = initVal.slice(0, 7);

    const alphaRow = document.createElement('div');
    alphaRow.className = 'sc-color-alpha-row';
    const alphaLabel = document.createElement('span');
    alphaLabel.textContent = 'Alpha';
    const alphaSlider = document.createElement('input');
    alphaSlider.type = 'range';
    alphaSlider.id = `${v.id}-alpha`;
    alphaSlider.min = 0; alphaSlider.max = 1; alphaSlider.step = 0.01;
    alphaSlider.value = parseHexColor(initVal).a;

    alphaRow.appendChild(alphaLabel);
    alphaRow.appendChild(alphaSlider);
    popup.appendChild(colorInput);
    popup.appendChild(alphaRow);

    const writeColor = () => {
      const rgb = parseHexColor(colorInput.value);
      rgb.a = parseFloat(alphaSlider.value);
      const hex = formatHexColor(rgb);
      p[v.id] = hex;
      swatch.style.backgroundColor = hex;
      valSpan.textContent = hex;
      ctxMix.render();
      ctxMix.clearActivePreset();
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
    ctxMix.parentEl.appendChild(controlEl);
  }
}


// ════════════════════════════════════════════════════════════════
//  ButtonRowWidget — mutually-exclusive button row (leaf)
// ════════════════════════════════════════════════════════════════

class ButtonRowWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const p = ctxMix.getParams(ctxMix, node, params);
    const initVal = p[v.id] ?? v.default;

    const controlEl = document.createElement('div');
    controlEl.className = 'control';

    if (v.label) {
      const label = document.createElement('label');
      label.innerHTML = `<span>${v.label}</span>`;
      controlEl.appendChild(label);
    }

    const row = document.createElement('div');
    row.className = 'sc-btn-row';
    row.id = v.id;

    for (const opt of (v.options || [])) {
      const btn = document.createElement('button');
      btn.textContent = opt.label;
      btn.dataset.v = opt.value;
      if (opt.value === initVal) btn.classList.add('on');

      btn.addEventListener('click', () => {
        row.querySelectorAll('button').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        p[v.id] = opt.value;
        ctxMix.onParamChange(v.id, opt.value, false, ctxMix.panel);
        ctxMix.render();
        ctxMix.clearActivePreset();
      });
      row.appendChild(btn);
    }

    controlEl.appendChild(row);
    ctxMix.parentEl.appendChild(controlEl);
  }
}


// ════════════════════════════════════════════════════════════════
//  SliderGroupWidget — extends ControlGroupWidget
//  ─ Inherits before_mount/after_mount (creates .control-group).
//  ─ Children (morph-slider, color-picker, button-row) are subtree
//    nodes; the walker handles iteration.
// ════════════════════════════════════════════════════════════════

class SliderGroupWidget extends ControlGroupWidget {
  // Inherits before_mount/after_mount from ControlGroupWidget.
  // No mount() — it's purely a container.
}


// ════════════════════════════════════════════════════════════════
//  PresetItemWidget — a single preset button (leaf)
// ════════════════════════════════════════════════════════════════

class PresetItemWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};

    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = v.label || '';

    btn.addEventListener('click', () => {
      if (node.inst?.action) node.inst.action();
      // Mark active within the parent .presets container
      const container = btn.closest('.presets');
      if (container) {
        container.querySelectorAll('.preset-btn').forEach(b =>
          b.classList.toggle('active', b === btn));
      }
    });

    ctxMix.parentEl.appendChild(btn);
  }
}


// ════════════════════════════════════════════════════════════════
//  PresetWidget — container for preset-item children
// ════════════════════════════════════════════════════════════════

class PresetWidget extends OmniWidget {

  static before_mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'presets';
    el.id = v.presetsId || v.id || 'presets';

    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl = el;
  }

  static after_mount(ctxMix, node, params) {
    const el = ctxMix.parentEl;
    ctxMix.parentEl = ctxMix.parentStack.pop();
    ctxMix.parentEl.appendChild(el);
  }
}


// ════════════════════════════════════════════════════════════════
//  OptionWidget — a single <option> element (leaf)
// ════════════════════════════════════════════════════════════════

class OptionWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const option = document.createElement('option');
    option.value = v.value ?? '';
    option.textContent = v.label || '';
    if (v.selected) option.selected = true;
    ctxMix.parentEl.appendChild(option);
  }
}


// ════════════════════════════════════════════════════════════════
//  OptgroupWidget — <optgroup> wrapper for option children
// ════════════════════════════════════════════════════════════════

class OptgroupWidget extends OmniWidget {

  static before_mount(ctxMix, node, params) {
    const og = document.createElement('optgroup');
    og.label = node.value?.label || '';
    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl.appendChild(og);
    ctxMix.parentEl = og;
  }

  static after_mount(ctxMix, node, params) {
    ctxMix.parentEl = ctxMix.parentStack.pop();
  }
}


// ════════════════════════════════════════════════════════════════
//  SelectWidget — container for option / optgroup children
// ════════════════════════════════════════════════════════════════

class SelectWidget extends OmniWidget {

  static before_mount(ctxMix, node, params) {
    const v = node.value || {};

    const controlEl = document.createElement('div');
    controlEl.className = 'control';

    if (v.label) {
      const label = document.createElement('label');
      label.innerHTML = `<span>${v.label}</span>`;
      controlEl.appendChild(label);
    }

    const select = document.createElement('select');
    select.id = v.selectId || v.id || '';

    select.addEventListener('change', () => {
      if (node.inst?.onChange) {
        node.inst.onChange(select.value, ctxMix.panel);
      } else {
        ctxMix.onParamChange(v.id, select.value, false, ctxMix.panel);
        ctxMix.render();
      }
    });

    controlEl.appendChild(select);

    // Children (option nodes) append into the <select>
    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl.appendChild(controlEl);
    ctxMix.parentEl = select;
  }

  static after_mount(ctxMix, node, params) {
    ctxMix.parentEl = ctxMix.parentStack.pop();
  }
}


// ════════════════════════════════════════════════════════════════
//  ButtonWidget (leaf)
// ════════════════════════════════════════════════════════════════

class ButtonWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const btn = document.createElement('button');
    btn.className = 'btn' + (v.secondary ? ' secondary' : '');
    btn.id = v.buttonId || v.id || '';
    btn.textContent = v.label || 'Button';
    btn.addEventListener('click', () => {
      if (node.inst?.onClick) node.inst.onClick(ctxMix.panel);
    });
    ctxMix.parentEl.appendChild(btn);
  }
}


// ════════════════════════════════════════════════════════════════
//  ToggleWidget (leaf)
// ════════════════════════════════════════════════════════════════

class ToggleWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const pid = v.id;
    const p = ctxMix.getParams(ctxMix, node, params);
    const checked = p[pid] ?? v.checked ?? false;

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
    text.textContent = v.label || '';

    label.appendChild(input);
    label.appendChild(slider);
    label.appendChild(text);

    label.addEventListener('change', () => {
      const val = input.checked;
      p[pid] = val;
      if (node.inst?.onChange) node.inst.onChange(val, ctxMix.panel);
      ctxMix.onParamChange(pid, val, false, ctxMix.panel);
      ctxMix.render();
    });

    ctxMix.parentEl.appendChild(label);
  }
}


// ════════════════════════════════════════════════════════════════
//  FileDropWidget (leaf)
// ════════════════════════════════════════════════════════════════

class FileDropWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const drop = document.createElement('div');
    drop.className = 'file-drop';
    drop.id = v.id || '';
    drop.innerHTML = `
      <div class="file-drop-icon">📁</div>
      <div>${v.label || 'Drop files here'}</div>
    `;

    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('dragover');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      if (node.inst?.onDrop) node.inst.onDrop(e.dataTransfer.files, ctxMix.panel);
    });
    drop.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = v.multiple || false;
      input.accept = v.accept || '*';
      input.onchange = () => {
        if (node.inst?.onDrop) node.inst.onDrop(input.files, ctxMix.panel);
      };
      input.click();
    });

    ctxMix.parentEl.appendChild(drop);
  }
}


// ════════════════════════════════════════════════════════════════
//  StatusWidget (leaf)
// ════════════════════════════════════════════════════════════════

class StatusWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'status-message';
    el.id = v.statusId || v.id || 'status';
    if (ctxMix.panel) ctxMix.panel.statusEl = el;
    ctxMix.parentEl.appendChild(el);
  }
}


// ════════════════════════════════════════════════════════════════
//  InfoWidget (leaf)
// ════════════════════════════════════════════════════════════════

class InfoWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'info-panel';
    el.id = v.infoId || v.id || 'info';
    if (ctxMix.panel) ctxMix.panel.infoEl = el;
    ctxMix.parentEl.appendChild(el);
  }
}


// ════════════════════════════════════════════════════════════════
//  DynamicWidget (leaf)
// ════════════════════════════════════════════════════════════════

class DynamicWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'dynamic-controls';
    el.id = v.containerId || v.id || '';
    if (ctxMix.panel) ctxMix.panel.dynamicContainers[v.id || v.containerId] = el;
    ctxMix.parentEl.appendChild(el);
  }
}


// ════════════════════════════════════════════════════════════════
//  CustomWidget — delegates to inst.build(el, panel)
// ════════════════════════════════════════════════════════════════

class CustomWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    if (!node.inst?.build) return;
    const wrapper = document.createElement('div');
    node.inst.build(wrapper, ctxMix.panel);
    ctxMix.parentEl.appendChild(wrapper);
  }
}


// ════════════════════════════════════════════════════════════════
//  AddBarWidget (leaf)
// ════════════════════════════════════════════════════════════════

class AddBarWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const bar = document.createElement('div');
    bar.className = 'sc-add-bar';

    for (const item of (v.items || [])) {
      const btn = document.createElement('button');
      btn.className = 'sc-add-btn';
      btn.textContent = '+ ' + item.label;
      btn.onclick = () => { if (node.inst?.onAdd) node.inst.onAdd(item.id); };
      bar.appendChild(btn);
    }

    ctxMix.parentEl.appendChild(bar);
  }
}


// ════════════════════════════════════════════════════════════════
//  SelectionActionBarWidget (leaf)
// ════════════════════════════════════════════════════════════════

class SelectionActionBarWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const d = v._depth ?? '';
    const bar = document.createElement('div');
    bar.className = 'sc-selection-bar';

    const count = document.createElement('span');
    count.className = 'sc-sel-count';
    count.id = `sel-count-${d}`;
    count.textContent = v.count ?? 0;

    const display = document.createElement('span');
    display.className = 'sc-sel-display';
    display.id = `sel-display-${d}`;
    display.textContent = v.display || '—';

    const addBtn = document.createElement('button');
    addBtn.className = 'sc-sel-btn';
    addBtn.id = `sel-add-${d}`;
    addBtn.textContent = '+';
    addBtn.title = 'Add';
    addBtn.disabled = !v.canAdd;
    addBtn.onclick = () => { if (node.inst?.onAdd) node.inst.onAdd(); };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'sc-sel-btn sc-sel-btn-remove';
    removeBtn.id = `sel-remove-${d}`;
    removeBtn.textContent = '−';
    removeBtn.title = 'Remove';
    removeBtn.disabled = !v.canRemove;
    removeBtn.onclick = () => { if (node.inst?.onRemove) node.inst.onRemove(); };

    bar.appendChild(count);
    bar.appendChild(display);
    bar.appendChild(addBtn);
    bar.appendChild(removeBtn);
    ctxMix.parentEl.appendChild(bar);
  }
}


// ════════════════════════════════════════════════════════════════
//  DividerWidget (leaf)
// ════════════════════════════════════════════════════════════════

class DividerWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const el = document.createElement('div');
    el.className = 'ow-divider';
    el.style.cssText = 'height:1px;background:rgba(79,195,247,0.12);margin:8px 0;';
    ctxMix.parentEl.appendChild(el);
  }
}


// ════════════════════════════════════════════════════════════════
//  LabelWidget (leaf)
// ════════════════════════════════════════════════════════════════

class LabelWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'ow-label';
    if (v.labelId || v.id) el.id = v.labelId || v.id;
    el.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    if (v.html) {
      el.innerHTML = v.html;
    } else {
      el.textContent = v.text || '';
    }
    ctxMix.parentEl.appendChild(el);
  }
}


// ════════════════════════════════════════════════════════════════
//  NumberInputWidget (leaf)
// ════════════════════════════════════════════════════════════════

class NumberInputWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const pid = v.id;
    const p = ctxMix.getParams(ctxMix, node, params);
    const initVal = p[pid] ?? v.default ?? 0;

    const controlEl = document.createElement('div');
    controlEl.className = 'control';

    if (v.label) {
      const label = document.createElement('label');
      label.innerHTML = `<span>${v.label}</span>`;
      controlEl.appendChild(label);
    }

    const input = document.createElement('input');
    input.type = 'number';
    input.id = pid;
    input.value = initVal;
    if (v.min != null) input.min = v.min;
    if (v.max != null) input.max = v.max;
    if (v.step != null) input.step = v.step;
    input.style.cssText =
      'width:100%;padding:4px 6px;border:1px solid #333;border-radius:4px;' +
      'background:#0f0f23;color:#ccc;font-size:11px;font-family:monospace;';

    input.addEventListener('change', () => {
      const val = parseFloat(input.value);
      if (isNaN(val)) return;
      p[pid] = val;
      if (node.inst?.onChange) node.inst.onChange(val, ctxMix.panel);
      ctxMix.onParamChange(pid, val, false, ctxMix.panel);
      ctxMix.render();
      ctxMix.clearActivePreset();
    });

    controlEl.appendChild(input);
    ctxMix.parentEl.appendChild(controlEl);
  }
}


// ════════════════════════════════════════════════════════════════
//  TextInputWidget (leaf)
// ════════════════════════════════════════════════════════════════

class TextInputWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const pid = v.id;
    const p = ctxMix.getParams(ctxMix, node, params);
    const initVal = p[pid] ?? v.default ?? '';

    const controlEl = document.createElement('div');
    controlEl.className = 'control';

    if (v.label) {
      const label = document.createElement('label');
      label.innerHTML = `<span>${v.label}</span>`;
      controlEl.appendChild(label);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.id = pid;
    input.value = initVal;
    if (v.placeholder) input.placeholder = v.placeholder;
    input.style.cssText =
      'width:100%;padding:4px 6px;border:1px solid #333;border-radius:4px;' +
      'background:#0f0f23;color:#ccc;font-size:11px;';

    const emit = () => {
      p[pid] = input.value;
      if (node.inst?.onChange) node.inst.onChange(input.value, ctxMix.panel);
      ctxMix.onParamChange(pid, input.value, false, ctxMix.panel);
      ctxMix.render();
    };
    input.addEventListener('change', emit);
    if (v.liveUpdate) input.addEventListener('input', emit);

    controlEl.appendChild(input);
    ctxMix.parentEl.appendChild(controlEl);
  }
}


// ════════════════════════════════════════════════════════════════
//  ButtonGroupWidget (leaf — loops over buttons internally)
// ════════════════════════════════════════════════════════════════

class ButtonGroupWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.style.display = 'flex';
    el.style.flexDirection = v.direction || 'column';
    el.style.gap = v.gap || '8px';

    for (const b of (v.buttons || [])) {
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

    ctxMix.parentEl.appendChild(el);
  }
}


// ════════════════════════════════════════════════════════════════
//  Nav widgets — menu items as scene graph nodes
// ════════════════════════════════════════════════════════════════

class NavItemWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'nav-menu-item';
    el.textContent = v.label || '';
    el.onclick = () => {
      if (node.inst?.action) node.inst.action();
      ctxMix.closeMenu();
    };
    ctxMix.parentEl.appendChild(el);
  }
}


class NavLinkWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('a');
    el.className = 'nav-menu-item';
    el.href = v.href || '#';
    el.textContent = v.label || '';
    ctxMix.parentEl.appendChild(el);
  }
}


class NavCheckboxWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'nav-menu-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'nav-menu-checkbox';
    cb.checked = !!v.checked;
    cb.onclick = (e) => e.stopPropagation();
    cb.onchange = () => { if (node.inst?.onChange) node.inst.onChange(cb.checked); };

    el.appendChild(cb);
    el.appendChild(document.createTextNode(v.label || ''));
    el.onclick = (e) => {
      if (e.target !== cb) {
        cb.checked = !cb.checked;
        if (node.inst?.onChange) node.inst.onChange(cb.checked);
      }
      e.stopPropagation();
    };

    ctxMix.parentEl.appendChild(el);
  }
}


class NavDividerWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const el = document.createElement('div');
    el.className = 'nav-menu-divider';
    ctxMix.parentEl.appendChild(el);
  }
}


class NavSubmenuWidget extends OmniWidget {

  static before_mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'nav-menu-item nav-menu-item-sub';

    const header = document.createElement('div');
    header.className = 'nav-menu-item-sub-header';
    header.textContent = v.label || '';
    el.appendChild(header);

    el.onclick = (e) => {
      e.stopPropagation();
      el.classList.toggle('open');
    };

    const sub = document.createElement('div');
    sub.className = 'nav-submenu';
    el.appendChild(sub);

    // Children append into the .nav-submenu container
    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl.appendChild(el);
    ctxMix.parentEl = sub;
  }

  static after_mount(ctxMix, node, params) {
    ctxMix.parentEl = ctxMix.parentStack.pop();
  }
}


// ════════════════════════════════════════════════════════════════
//  Chat-layout styles
//
//  The chat-layout widgets that were here (server icon, topic, message,
//  embed card, stage card, code island, …) are scene nodes now: markup in
//  deep-wiki/content/_templates.md, code in js/nodes-html/chat-nodes.js and
//  stage-node.js.  These tag colours are shared with them.
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


// ════════════════════════════════════════════════════════════════
//  Registration — with navVersion on meta
// ════════════════════════════════════════════════════════════════

// Structural / root
sceneRegistry.registerNodeClass('panel',         PanelWidget,         { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('control-group',  ControlGroupWidget,  { wrapInGroup: false, showInStrip: false });

// Nav widgets
sceneRegistry.registerNodeClass('nav-item',       NavItemWidget,       { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('nav-link',       NavLinkWidget,       { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('nav-checkbox',   NavCheckboxWidget,   { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('nav-divider',    NavDividerWidget,    { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('nav-submenu',    NavSubmenuWidget,    { wrapInGroup: false, showInStrip: false });

// Panel widgets — navVersion controls nav AST mapping
sceneRegistry.registerNodeClass('morph-slider',   MorphSliderWidget);
sceneRegistry.registerNodeClass('color-picker',   ColorPickerWidget);
sceneRegistry.registerNodeClass('button-row',     ButtonRowWidget);
sceneRegistry.registerNodeClass('slider-group',   SliderGroupWidget,   { navVersion: 'nav-item' });
sceneRegistry.registerNodeClass('preset-item',    PresetItemWidget,    { navVersion: 'nav-item', wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('option',         OptionWidget,        { navVersion: 'nav-item', wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('optgroup',       OptgroupWidget,      { navVersion: 'nav-submenu', wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('presets',        PresetWidget,        { navVersion: 'nav-submenu' });
sceneRegistry.registerNodeClass('select',         SelectWidget,        { navVersion: 'nav-submenu' });
sceneRegistry.registerNodeClass('button',         ButtonWidget);
sceneRegistry.registerNodeClass('toggle',         ToggleWidget);
sceneRegistry.registerNodeClass('filedrop',       FileDropWidget);
sceneRegistry.registerNodeClass('status',         StatusWidget,        { showInStrip: false });
sceneRegistry.registerNodeClass('info',           InfoWidget,          { showInStrip: false });
sceneRegistry.registerNodeClass('dynamic',        DynamicWidget);
sceneRegistry.registerNodeClass('custom',         CustomWidget);
sceneRegistry.registerNodeClass('addbar',         AddBarWidget,        { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('selection-action-bar', SelectionActionBarWidget, { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('divider',        DividerWidget,       { wrapInGroup: false, showInStrip: false });
sceneRegistry.registerNodeClass('label',          LabelWidget,         { showInStrip: false });
sceneRegistry.registerNodeClass('number-input',   NumberInputWidget);
sceneRegistry.registerNodeClass('text-input',     TextInputWidget);
sceneRegistry.registerNodeClass('button-group',   ButtonGroupWidget);

// ════════════════════════════════════════════════════════════════
//  Exports
// ════════════════════════════════════════════════════════════════

export {
  // Core framework
  OmniWidget,
  WidgetContext,
  resolveWidgetType,
  createWidget,
  stripConfigs,
  parseDslValue,

  // Structural
  PanelWidget,
  ControlGroupWidget,

  // Utilities
  formatValue,
  isHexColor,
  parseHexColor,
  formatHexColor,
  lerpColor,
  _esc,
  covBar,

  // Nav widget classes
  NavItemWidget,
  NavLinkWidget,
  NavCheckboxWidget,
  NavDividerWidget,
  NavSubmenuWidget,

  // Panel widget classes
  MorphSliderWidget,
  ColorPickerWidget,
  ButtonRowWidget,
  SliderGroupWidget,
  PresetItemWidget,
  PresetWidget,
  OptionWidget,
  OptgroupWidget,
  SelectWidget,
  ButtonWidget,
  ToggleWidget,
  FileDropWidget,
  StatusWidget,
  InfoWidget,
  DynamicWidget,
  CustomWidget,
  AddBarWidget,
  SelectionActionBarWidget,
  DividerWidget,
  LabelWidget,
  NumberInputWidget,
  TextInputWidget,
  ButtonGroupWidget,

  TAG_STYLES,
};

if (typeof window !== 'undefined') {
  window.OmniWidget = {
    OmniWidget, WidgetContext, createWidget, stripConfigs, parseDslValue,
    resolveWidgetType,
    formatValue, isHexColor, parseHexColor, formatHexColor, lerpColor,
    _esc, covBar, TAG_STYLES,
    NavItemWidget, NavLinkWidget, NavCheckboxWidget, NavDividerWidget, NavSubmenuWidget,
  };
}
