import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { TextInputWidget };

// `text-input` — a labelled text box bound to a param (leaf)

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
      ctxMix.setParam(pid, input.value, p);
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

SYS.NODE_CLASSES.push({ name: 'text-input', cls: TextInputWidget });
