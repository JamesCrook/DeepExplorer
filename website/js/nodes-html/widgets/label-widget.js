import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { LabelWidget };

// `label` — a line of small text or HTML among the controls (leaf)

class LabelWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'ow-label';
    if (v.labelId || v.id) el.id = v.labelId || v.id;
    el.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    if (v.html) {
      el.innerHTML = v.html;
    } else {
      el.textContent = v.text || '';
    }
    ctxMix.parentEl.appendChild(el);
  }
}

SYS.NODE_CLASSES.push({ name: 'label', cls: LabelWidget, defaults: { showInStrip: false } });
