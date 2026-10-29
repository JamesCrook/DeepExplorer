import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { CustomWidget };

// ════════════════════════════════════════════════════════════════
// `custom` — whatever inst.build(el, panel) makes: the escape hatch for one-off controls (leaf)
// ════════════════════════════════════════════════════════════════

class CustomWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    if (!node.inst?.build) return;
    const wrapper = document.createElement('div');
    node.inst.build(wrapper, ctxMix.panel);
    ctxMix.parentEl.appendChild(wrapper);
  }
}

SYS.NODE_CLASSES.push({ name: 'custom', cls: CustomWidget });
