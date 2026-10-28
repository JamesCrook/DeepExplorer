import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { NavLinkWidget };

class NavLinkWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('a');
    el.className = 'nav-menu-item';
    el.href = v.href || '#';
    el.textContent = v.label || '';
    ctxMix.parentEl.appendChild(el);
  }
}

SYS.NODE_CLASSES.push({ name: 'nav-link', cls: NavLinkWidget, defaults: { wrapInGroup: false, showInStrip: false } });
