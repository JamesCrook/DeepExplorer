import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { AddBarWidget };

// ════════════════════════════════════════════════════════════════
//  AddBarWidget (leaf)
// ════════════════════════════════════════════════════════════════

class AddBarWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const bar = document.createElement('div');
    bar.className = 'sc-add-bar';

    for (const item of (v.items || [])) {
      const btn = document.createElement('button');
      btn.className = 'sc-add-btn';
      btn.textContent = '+ ' + item.label;
      btn.onclick = () => { if (node.inst?.onAdd) node.inst.onAdd(item.id); };
      bar.appendChild(btn);
    }

    ctxMix.parentEl.appendChild(bar);
  }
}

SYS.NODE_CLASSES.push({ name: 'addbar', cls: AddBarWidget, defaults: { wrapInGroup: false, showInStrip: false } });
