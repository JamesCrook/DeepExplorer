import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { ButtonGroupWidget };

// `button-group` — a column or row of buttons from value.buttons, each with its onClick (leaf)

class ButtonGroupWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.style.display = 'flex';
    el.style.flexDirection = v.direction || 'column';
    el.style.gap = v.gap || '8px';

    for (const b of (v.buttons || [])) {
      const btn = document.createElement('button');
      btn.className = b.className || 'btn';
      btn.textContent = b.text || b.label || '';
      if (b.id) btn.id = b.id;
      if (b.style) Object.assign(btn.style, b.style);
      btn.addEventListener('click', () => {
        if (b.onClick) b.onClick(ctxMix.panel);
      });
      el.appendChild(btn);
    }

    ctxMix.parentEl.appendChild(el);
  }
}

SYS.NODE_CLASSES.push({ name: 'button-group', cls: ButtonGroupWidget });
