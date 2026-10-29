import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { NavDividerWidget };

// `nav-divider` — a rule between hamburger-menu items (leaf)

class NavDividerWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const el = document.createElement('div');
    el.className = 'nav-menu-divider';
    ctxMix.parentEl.appendChild(el);
  }
}

SYS.NODE_CLASSES.push({ name: 'nav-divider', cls: NavDividerWidget, defaults: { wrapInGroup: false, showInStrip: false } });
