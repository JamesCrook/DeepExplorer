import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { InfoWidget };

// ════════════════════════════════════════════════════════════════
//  InfoWidget (leaf)
// ════════════════════════════════════════════════════════════════

class InfoWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'info-panel';
    el.id = v.infoId || v.id || 'info';
    if (ctxMix.panel) ctxMix.panel.infoEl = el;
    ctxMix.parentEl.appendChild(el);
  }
}

SYS.NODE_CLASSES.push({ name: 'info', cls: InfoWidget, defaults: { showInStrip: false } });
