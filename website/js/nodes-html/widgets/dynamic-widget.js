import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { DynamicWidget };

// ════════════════════════════════════════════════════════════════
// `dynamic` — an empty container the panel fills later, registered in panel.dynamicContainers (leaf)
// ════════════════════════════════════════════════════════════════

class DynamicWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'dynamic-controls';
    el.id = v.containerId || v.id || '';
    if (ctxMix.panel) ctxMix.panel.dynamicContainers[v.id || v.containerId] = el;
    ctxMix.parentEl.appendChild(el);
  }
}

SYS.NODE_CLASSES.push({ name: 'dynamic', cls: DynamicWidget });
