import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { SelectWidget };

// `select` — a labelled dropdown bound to a param; its children are the options (container)

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

SYS.NODE_CLASSES.push({ name: 'select', cls: SelectWidget, defaults: { navVersion: 'nav-submenu' } });
