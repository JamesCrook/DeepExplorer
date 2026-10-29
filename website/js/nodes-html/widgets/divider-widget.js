import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { DividerWidget };

// ════════════════════════════════════════════════════════════════
// `divider` — a thin horizontal rule between controls (leaf)
// ════════════════════════════════════════════════════════════════

class DividerWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const el = document.createElement('div');
    el.className = 'ow-divider';
    el.style.cssText = 'height:1px;background:rgba(79,195,247,0.12);margin:8px 0;';
    ctxMix.parentEl.appendChild(el);
  }
}

SYS.NODE_CLASSES.push({ name: 'divider', cls: DividerWidget, defaults: { wrapInGroup: false, showInStrip: false } });
