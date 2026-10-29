import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { ToggleWidget };

// ════════════════════════════════════════════════════════════════
// `toggle` — a labelled on/off switch bound to a param (leaf)
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
      ctxMix.setParam(pid, val, p);
      if (node.inst?.onChange) node.inst.onChange(val, ctxMix.panel);
      ctxMix.onParamChange(pid, val, false, ctxMix.panel);
      ctxMix.render();
    });

    ctxMix.parentEl.appendChild(label);
  }
}

SYS.NODE_CLASSES.push({ name: 'toggle', cls: ToggleWidget });
