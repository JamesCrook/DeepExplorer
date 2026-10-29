import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { Values } from '../omni-support/values.js';
export { HudPanel };

/* ─────────────────────────────────────────────────────────────────────────────
`hud-panel` and its controls (hud-slider, -button, -checkbox, -select, -color, -separator): the Zones demos' floating panel

HudPanel — standalone floating panel using sceneRegistry.walkPhase

Compatible with OmniWidget conventions so hud-* node types work in either
system. The ctxMix shape matches what OmniWidgets expect:

  parentEl       current DOM parent (pushed/popped by containers)
  parentStack    push/pop array
  params         live params object (built from controls)
  sectionParams  null (no per-section params in HudPanelLite)
  setParam       (id, val) => write to params
  render         () => trigger redraw
  onParamChange  (id, val) => notification callback
  clearActivePreset  () => clear preset highlights
  panel          null (no OmniControlPanel)

Node conventions (same as OmniWidget):
  node.value     serialisable data (id, label, min, max, step, options, …)
  node.inst      non-serialisable (action callbacks)
  node.subtree   child nodes

Drop this file into an all-in-one stnda build by pasting after the
sceneRegistry definition. No imports needed.
──────────────────────────────────────────────────────────────────────────── */


// ═══════════════════════════════════════════════════════════════
//  NODE CLASSES — compatible with both HudPane and OmniWidget
// ═══════════════════════════════════════════════════════════════

class HudPanelNode {

  static before_mount(ctxMix, node, params) {
    const v = node.value || {};

    const root = document.createElement('div');
    root.className = 'hud-panel';
    root.style.top  = (v.position?.top  ?? 60) + 'px';
    root.style.left = (v.position?.left ?? 12) + 'px';

    const header = document.createElement('h3');
    header.innerHTML = `::: &nbsp; ${v.title || 'Controls'}`;
    root.appendChild(header);
    HudPanelNode._makeDraggable(root, header);

    node._el = root;

    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl = root;
  }

  static after_mount(ctxMix, node, params) {
    const container = ctxMix.parentStack.pop();
    container.appendChild(node._el);
    ctxMix.parentEl = container;
  }

  static _makeDraggable(root, handle) {
    let dragging = false, sx, sy, sl, st;
    handle.addEventListener('mousedown', e => {
      dragging = true; handle.style.cursor = 'grabbing';
      sx = e.clientX; sy = e.clientY;
      const r = root.getBoundingClientRect();
      sl = r.left; st = r.top;
      root.style.right = 'auto';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      root.style.left = (sl + e.clientX - sx) + 'px';
      root.style.top  = (st + e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', () => {
      if (dragging) { dragging = false; handle.style.cursor = 'grab'; }
    });
  }
}


class HudSliderNode {
  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const { id, label, min = 0, max = 1, step = 0.01 } = v;
    const initVal = params[id] ?? v.value ?? min;

    // Capture params ref for closure safety (see OmniWidget writeParam pattern)
    const row = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    row.appendChild(span);

    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min, max, step, value: initVal });
    row.appendChild(input);

    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = parseFloat(initVal).toFixed(step % 1 === 0 ? 0 : 2);
    row.appendChild(val);

    input.addEventListener('input', () => {
      const num = parseFloat(input.value);
      val.textContent = num.toFixed(step % 1 === 0 ? 0 : 2);
      ctxMix.setParam(id, num);
      ctxMix.onParamChange(id, num);
      ctxMix.render();
    });

    if (id) { input.id = id; val.id = `${id}-val`; }
    ctxMix.parentEl.appendChild(row);
  }
}


class HudButtonNode {
  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const btn = document.createElement('button');
    btn.className = 'hud-btn' + (v.cls ? ' ' + v.cls : '');
    btn.textContent = v.label;
    btn.addEventListener('click', node.inst?.action || (() => {}));
    ctxMix.parentEl.appendChild(btn);
  }
}


class HudCheckboxNode {
  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const { id, label } = v;
    const initVal = params[id] ?? v.value ?? false;

    const row = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    row.appendChild(span);

    const sw = document.createElement('div');
    sw.className = 'toggle-switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!initVal;
    input.addEventListener('change', () => {
      ctxMix.setParam(id, input.checked);
      ctxMix.onParamChange(id, input.checked);
      ctxMix.render();
    });

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';

    sw.appendChild(input);
    sw.appendChild(slider);
    row.appendChild(sw);

    if (id) input.id = id;
    ctxMix.parentEl.appendChild(row);
  }
}


class HudSelectNode {
  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const { id, label, options = [] } = v;
    const initVal = params[id] ?? v.value;

    const row = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    row.appendChild(span);

    const select = document.createElement('select');
    for (const opt of options) {
      const option = document.createElement('option');
      option.value = opt[0];
      option.textContent = opt[1];
      if (opt[0] === String(initVal)) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener('change', () => {
      ctxMix.setParam(id, select.value);
      ctxMix.onParamChange(id, select.value);
      ctxMix.render();
    });

    row.appendChild(select);
    if (id) select.id = id;
    ctxMix.parentEl.appendChild(row);
  }
}


class HudColorNode {
  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const { id, label } = v;
    const initVal = params[id] ?? v.value ?? '#ffffff';

    const row = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    row.appendChild(span);

    const input = document.createElement('input');
    Object.assign(input, { type: 'color', value: initVal });
    input.addEventListener('input', () => {
      ctxMix.setParam(id, input.value);
      ctxMix.onParamChange(id, input.value);
      ctxMix.render();
    });

    row.appendChild(input);
    if (id) input.id = id;
    ctxMix.parentEl.appendChild(row);
  }
}


class HudSeparatorNode {
  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const sep = document.createElement('div');
    sep.className = 'separator';
    if (v.label) sep.textContent = v.label;
    ctxMix.parentEl.appendChild(sep);
  }
}


// ═══════════════════════════════════════════════════════════════
//  REGISTRATIONS
// ═══════════════════════════════════════════════════════════════

SYS.NODE_CLASSES.push({ name: 'hud-panel', cls: HudPanelNode });;
SYS.NODE_CLASSES.push({ name: 'hud-slider', cls: HudSliderNode });;
SYS.NODE_CLASSES.push({ name: 'hud-button', cls: HudButtonNode });;
SYS.NODE_CLASSES.push({ name: 'hud-checkbox', cls: HudCheckboxNode });;
SYS.NODE_CLASSES.push({ name: 'hud-select', cls: HudSelectNode });;
SYS.NODE_CLASSES.push({ name: 'hud-color', cls: HudColorNode });;
SYS.NODE_CLASSES.push({ name: 'hud-separator', cls: HudSeparatorNode });;


// ═══════════════════════════════════════════════════════════════
//  TYPE MAP — hud shorthand → registered node type
// ═══════════════════════════════════════════════════════════════

const _HUD_TYPE_MAP = {
  button:         'hud-button',
  checkbox:       'hud-checkbox',
  select:         'hud-select',
  color:          'hud-color',
  separator:      'hud-separator',
  'morph-slider': 'morph-slider',   // bridges to OmniWidget when available
};


// ═══════════════════════════════════════════════════════════════
//  HudPanel
// ═══════════════════════════════════════════════════════════════

class HudPanel {

  /**
   * @param {Object}   opts
   * @param {string}   opts.title       — panel heading
   * @param {Element}  opts.container   — DOM parent for the floating panel
   * @param {Array}    opts.controls    — control definitions
   * @param {Function} opts.onChange     — (id, val) notification
   * @param {Function} [opts.onRender]  — () called after every param change
   * @param {Object}   [opts.position]  — { top, left }
   * @param {Object}   [opts.params]    — reuse an existing params object
   */
  constructor({
    title     = 'Controls',
    container = document.body,
    controls  = [],
    onChange,
    onRender,
    position  = { top: 60, left: 12 },
    params,
  } = {}) {
    this._onChange = onChange || (() => {});
    this._onRender = onRender || (() => {});

    HudPanel._injectStyles();

    // ── Build params from controls (or reuse provided) ──
    this.params = params || {};
    if (!params) {
      for (const c of controls) {
        if (c.id && c.value !== undefined) {
          this.params[c.id] = c.value;
        }
      }
    }

    // ── Coerce controls into AST ────────────────────────
    const children = controls.map(c => {
      // A type that is already a registered node type (e.g. one an app adds)
      // is used as is; otherwise map the shorthand, defaulting to a slider.
      const type = _HUD_TYPE_MAP[c.type]
        || (sceneRegistry.meta[c.type] ? c.type : 'hud-slider');
      // Separate serialisable from non-serialisable
      const { action, ...rest } = c;
      return {
        type,
        value:   rest,
        inst:    action ? { action } : {},
        subtree: [],
      };
    });

    const root = {
      type:    'hud-panel',
      value:   { title, position },
      subtree: children,
    };

    // ── Minimal WidgetContext-compatible ctxMix ──────────
    const self = this;

    const ctxMix = {
      parentEl:       container,
      parentStack:    [],
      iterators:      [],
      flyweight:      {},

      // The params object a control reads and writes (morph-slider asks).
      getParams(res, node, params) {
        return Values.getParams(res, node, params);
      },
      setParam(id, val) {
        self.params[id] = val;
      },
      render() {
        self._onRender();
      },
      onParamChange(id, val) {
        self._onChange(id, val);
      },
      clearActivePreset() {
        // Future: clear preset button highlights
      },
      closeMenu() {},
    };

    // ── Walk ─────────────────────────────────────────────
    sceneRegistry.runPhases(ctxMix, root, this.params, ['mount']);

    // ── Collect results ──────────────────────────────────
    this._root = root._el;
    this._ast  = root;  // retained for future update walks
  }

  destroy() {
    if (this._root?.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
  }

  /** Update a control's DOM to reflect a new value (e.g. from a preset). */
  updateControl(id, value) {
    this.params[id] = value;
    const input = document.getElementById(id);
    if (input) {
      if (input.type === 'checkbox') input.checked = !!value;
      else input.value = value;
    }
    const valEl = document.getElementById(`${id}-val`);
    if (valEl) {
      valEl.textContent = typeof value === 'number'
        ? value.toFixed(value % 1 === 0 ? 0 : 2) : String(value);
    }
  }

  /** Bulk update from a preset snapshot. */
  applyPreset(preset) {
    for (const [id, value] of Object.entries(preset)) {
      this.updateControl(id, value);
    }
  }


  // ── Styles (injected once) ────────────────────────────

  static _injected = false;

  static _injectStyles() {
    if (HudPanel._injected) return;
    HudPanel._injected = true;

    const s = document.createElement('style');
    s.id = 'hud-panel-css';
    s.textContent = `
  .hud-panel { position: absolute; background: rgba(18, 18, 22, 0.85); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 14px 18px; color: #ddd; font: 11px/1.6 system-ui, sans-serif; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 1000; min-width: 260px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); user-select: none; max-height: calc(100vh - 40px); overflow-y: auto; }
  .hud-panel::-webkit-scrollbar { width: 6px; }
  .hud-panel::-webkit-scrollbar-track { background: transparent; }
  .hud-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
  .hud-panel h3 { margin: 0 0 12px; font-size: 11px; color: #b0a898; letter-spacing: 1px; cursor: grab; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); text-transform: uppercase; }
  .hud-panel h3:active { cursor: grabbing; }
  .hud-panel label { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
  .hud-panel label > span:first-child { min-width: 90px; color: #999; }
  .hud-panel input[type=range] { flex: 1; accent-color: #6cf; cursor: pointer; }
  .hud-panel input[type=color] { -webkit-appearance: none; border: none; width: 24px; height: 24px; border-radius: 4px; padding: 0; background: none; cursor: pointer; flex-shrink: 0; }
  .hud-panel input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
  .hud-panel input[type=color]::-webkit-color-swatch { border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; }
  .hud-panel select { flex: 1; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid rgba(255,255,255,0.2); padding: 4px; border-radius: 4px; font-size: 10px; outline: none; cursor: pointer; }
  .hud-panel .toggle-switch { position: relative; width: 28px; height: 16px; display: inline-block; flex-shrink: 0; }
  .hud-panel .toggle-switch input { opacity: 0; width: 0; height: 0; margin: 0; position: absolute; }
  .hud-panel .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); transition: .2s; border-radius: 16px; }
  .hud-panel .toggle-slider:before { position: absolute; content: ""; height: 10px; width: 10px; left: 2px; bottom: 2px; background-color: #889; transition: .2s; border-radius: 50%; }
  .hud-panel .toggle-switch input:checked + .toggle-slider { background-color: rgba(102, 204, 255, 0.15); border-color: #6cf; }
  .hud-panel .toggle-switch input:checked + .toggle-slider:before { transform: translateX(12px); background-color: #6cf; box-shadow: 0 0 4px #6cf; }
  .hud-panel .val { min-width: 32px; text-align: right; font-variant-numeric: tabular-nums; color: #8cf; font-weight: 600; }
  .hud-panel .separator { margin: 14px 0 8px 0; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.1); font-size: 9px; color: #a59d8c; text-transform: uppercase; letter-spacing: 1px; }
  .hud-btn { display: block; width: 100%; margin: 4px 0; padding: 6px 0; background: rgba(0,0,0,0.4); color: #ccc; font-size: 11px; font-family: system-ui, sans-serif; text-align: center; border: 1px solid rgba(255,255,255,0.12); border-radius: 5px; cursor: pointer; transition: background .15s, border-color .15s; }
  .hud-btn:hover { border-color: #6cf; background: rgba(102,204,255,0.08); }
  .hud-btn.primary { color: #8cf; border-color: rgba(102,204,255,0.3); }
  .hud-btn.primary:hover { background: rgba(102,204,255,0.12); }
    `;
    document.head.appendChild(s);
  }
}
