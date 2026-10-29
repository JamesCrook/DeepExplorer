import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { PresetItemWidget };

// `preset-item` — one preset button, marked active when chosen (leaf)

class PresetItemWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};

    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = v.label || '';

    btn.addEventListener('click', () => {
      if (node.inst?.action) node.inst.action();
      // Mark active within the parent .presets container
      const container = btn.closest('.presets');
      if (container) {
        container.querySelectorAll('.preset-btn').forEach(b =>
          b.classList.toggle('active', b === btn));
      }
    });

    ctxMix.parentEl.appendChild(btn);
  }
}

SYS.NODE_CLASSES.push({ name: 'preset-item', cls: PresetItemWidget, defaults: { navVersion: 'nav-item', wrapInGroup: false, showInStrip: false } });
