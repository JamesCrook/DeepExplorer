import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { OptionWidget };

// `option` — one option of a select (leaf)

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

SYS.NODE_CLASSES.push({ name: 'option', cls: OptionWidget, defaults: { navVersion: 'nav-item', wrapInGroup: false, showInStrip: false } });
