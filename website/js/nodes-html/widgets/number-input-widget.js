import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { NumberInputWidget };

// ════════════════════════════════════════════════════════════════
// `number-input` — a labelled number box bound to a param (leaf)
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
      ctxMix.setParam(pid, val, p);
      if (node.inst?.onChange) node.inst.onChange(val, ctxMix.panel);
      ctxMix.onParamChange(pid, val, false, ctxMix.panel);
      ctxMix.render();
      ctxMix.clearActivePreset();
    });

    controlEl.appendChild(input);
    ctxMix.parentEl.appendChild(controlEl);
  }
}

SYS.NODE_CLASSES.push({ name: 'number-input', cls: NumberInputWidget });
