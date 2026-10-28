import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { CustomWidget };

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

SYS.NODE_CLASSES.push({ name: 'custom', cls: CustomWidget });
