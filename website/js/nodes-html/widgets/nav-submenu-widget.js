import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { NavSubmenuWidget };

// `nav-submenu` — a hamburger-menu item that opens a submenu of its children (container)

class NavSubmenuWidget extends OmniWidget {

  static before_mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'nav-menu-item nav-menu-item-sub';

    const header = document.createElement('div');
    header.className = 'nav-menu-item-sub-header';
    header.textContent = v.label || '';
    el.appendChild(header);

    el.onclick = (e) => {
      e.stopPropagation();
      el.classList.toggle('open');
    };

    const sub = document.createElement('div');
    sub.className = 'nav-submenu';
    el.appendChild(sub);

    // Children append into the .nav-submenu container
    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl.appendChild(el);
    ctxMix.parentEl = sub;
  }

  static after_mount(ctxMix, node, params) {
    ctxMix.parentEl = ctxMix.parentStack.pop();
  }
}

SYS.NODE_CLASSES.push({ name: 'nav-submenu', cls: NavSubmenuWidget, defaults: { wrapInGroup: false, showInStrip: false } });
