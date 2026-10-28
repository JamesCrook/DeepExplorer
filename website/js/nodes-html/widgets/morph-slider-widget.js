import { SYS } from '../../omni-support/sys.js';
import '../../omni-support/formats.js';   // format.* in SYS.FUNCTIONS
export { MorphSliderWidget };

/* ─────────────────────────────────────────────────────────────────────────────
MorphSliderWidget — the morphable range slider: a track, a fill and a thin
pip whose geometry is driven by the --ms-* CSS variables.

Taken from the panopticon's own copy, which lived inside pipped-edge-ref-node
(it belongs in a nugget of its own; here it has one) and which is the HUD
dialect of the OmniWidget original: it writes through ctxMix.setParam rather
than ctxMix.currentParams.  Changes:
- The param is node.value.bind, falling back to node.value.id, so a pane
  widget can be bound without its node id doubling as a param name.
- Element ids only for a HUD control (an id and no bind).  HudPanel's
  updateControl finds controls by id; a pane widget sharing that id would
  steal the lookup.
- format names a format.<name> function in SYS.FUNCTIONS.  The panopticon
  copy called a formatValue that no nugget declared, which only mattered once
  a node set format.
- update moves the slider when the param changed from elsewhere (the HUD).
- The compatibility hack that allowed values directly on the node is gone.

Registered as 'morph-slider', so HudPanel's type map bridges to it: a HUD
control of type 'morph-slider' mounts this class.
──────────────────────────────────────────────────────────────────────────── */

class MorphSliderWidget {

  /* bind is editable too: point a slider at another param and it follows
     that one instead. */
  static meta = {
    editableFields: (node) => [
      { key: 'label',  label: 'Label',  type: 'text',   value: node.value.label || '' },
      { key: 'bind',   label: 'Param',  type: 'text',   value: node.value.bind ?? node.value.id ?? '' },
      { key: 'min',    label: 'Min',    type: 'number', value: node.value.min ?? 0 },
      { key: 'max',    label: 'Max',    type: 'number', value: node.value.max ?? 100 },
      { key: 'step',   label: 'Step',   type: 'number', value: node.value.step ?? 1 },
      { key: 'format', label: 'Format', type: 'select', value: node.value.format ?? '',
        options: [['', 'auto'], ...SYS.FUNCTIONS
          .filter((r, i, all) => r.name.startsWith('format.') && SYS.named(all, r.name) === r)
          .map(r => [r.name.slice(7), r.label ?? r.name.slice(7)])] },
    ],
  };

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const pid = v.bind ?? v.id;
    const p = ctxMix.getParams(ctxMix, node, params);    // bound here, written below
    const initVal = v.isData
      ? (v.dataValue || v.default)
      : (p[pid] ?? v.default ?? v.min ?? 0);

    const { el, valEl } = MorphSliderWidget.buildMorphSlider({
      label:    v.label,
      min:      v.min ?? 0,
      max:      v.max ?? 100,
      step:     v.step,
      value:    initVal,
      disabled: v.disabled,
      format:   v.format ? (x => MorphSliderWidget.formatValue(x, v.format)) : undefined,
      onChange: x => {
        if (v.isData) {
          ctxMix.onParamChange(pid, x, true, ctxMix.panel);
        } else {
          ctxMix.setParam(pid, x, p);
          ctxMix.onParamChange(pid, x, false, ctxMix.panel);
        }
        if (node.inst?.onChange) node.inst.onChange(x, ctxMix.panel);
        ctxMix.render();
        ctxMix.clearActivePreset();
      },
    });

    if (v.id !== undefined && v.bind === undefined) {
      el.id = pid;
      valEl.id = `${pid}-val`;
    }
    el.dataset.sliderId = pid;
    node.inst = { ...(node.inst || {}), el };
    ctxMix.parentEl?.appendChild(el);
    return el;
  }

  static update(ctxMix, node, params) {
    const v = node.value || {}, el = node.inst?.el;
    const x = ctxMix.getParams(ctxMix, node, params)[v.bind ?? v.id];
    if (el && x !== undefined && el._getValue() !== +x) el._setValue(x);
  }

  /* A named format from SYS.FUNCTIONS, else a plain number at sensible precision. */
  static formatValue(val, format) {
    if (typeof format === 'function') return format(val);
    if (typeof val !== 'number') return String(val ?? '');
    const named = SYS.named(SYS.FUNCTIONS, 'format.' + format);
    if (named) return named.fn(val);
    if (Math.abs(val) >= 100) return val.toFixed(0);
    if (Math.abs(val) >= 10)  return val.toFixed(1);
    return val.toFixed(2);
  }

  // ── Static factory — the core DOM builder ───────────────────
  //
  //  Returns { el, setValue(v), getValue(), valEl } where el is the root
  //  .morph-slider div and setValue repositions the pip, fill and readout
  //  programmatically (preset morph, param sync and so on).

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
      // Map over the track (inset 8px each side), keeping the whole pip inside it at 0 and 1
      pip.style.left   = `calc(8px + var(--ms-pip-w) * 0.5px + (100% - 16px - var(--ms-pip-w) * 1px) * ${pct / 100})`;
      val.textContent  = fmt(v);
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

    el._valEl    = val;
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

SYS.NODE_CLASSES.push({ name: 'morph-slider',     cls: MorphSliderWidget });
