import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { ButtonWidget };

// ════════════════════════════════════════════════════════════════
//  ButtonWidget (leaf)
// ════════════════════════════════════════════════════════════════

class ButtonWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const btn = document.createElement('button');
    btn.className = 'btn' + (v.secondary ? ' secondary' : '');
    btn.id = v.buttonId || v.id || '';
    btn.textContent = v.label || 'Button';
    btn.addEventListener('click', () => {
      if (node.inst?.onClick) node.inst.onClick(ctxMix.panel);
    });
    ctxMix.parentEl.appendChild(btn);
  }
}

SYS.NODE_CLASSES.push({ name: 'button', cls: ButtonWidget });
