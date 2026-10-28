import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { ButtonRowWidget };

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
        ctxMix.setParam(v.id, opt.value, p);
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

SYS.NODE_CLASSES.push({ name: 'button-row', cls: ButtonRowWidget });
