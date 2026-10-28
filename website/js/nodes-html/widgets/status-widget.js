import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { StatusWidget };

// ════════════════════════════════════════════════════════════════
//  StatusWidget (leaf)
// ════════════════════════════════════════════════════════════════

class StatusWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'status-message';
    el.id = v.statusId || v.id || 'status';
    if (ctxMix.panel) ctxMix.panel.statusEl = el;
    ctxMix.parentEl.appendChild(el);
  }
}

SYS.NODE_CLASSES.push({ name: 'status', cls: StatusWidget, defaults: { showInStrip: false } });
