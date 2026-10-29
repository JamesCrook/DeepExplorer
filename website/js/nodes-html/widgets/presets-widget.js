import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { PresetWidget };

// `presets` — the row of preset buttons (container)

class PresetWidget extends OmniWidget {

  static before_mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'presets';
    el.id = v.presetsId || v.id || 'presets';

    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl = el;
  }

  static after_mount(ctxMix, node, params) {
    const el = ctxMix.parentEl;
    ctxMix.parentEl = ctxMix.parentStack.pop();
    ctxMix.parentEl.appendChild(el);
  }
}

SYS.NODE_CLASSES.push({ name: 'presets', cls: PresetWidget, defaults: { navVersion: 'nav-submenu' } });
