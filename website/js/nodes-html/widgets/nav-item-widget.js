import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { NavItemWidget };

// ════════════════════════════════════════════════════════════════
//  Nav widgets — menu items as scene graph nodes
// ════════════════════════════════════════════════════════════════

class NavItemWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'nav-menu-item';
    el.textContent = v.label || '';
    el.onclick = () => {
      if (node.inst?.action) node.inst.action();
      ctxMix.closeMenu();
    };
    ctxMix.parentEl.appendChild(el);
  }
}

SYS.NODE_CLASSES.push({ name: 'nav-item', cls: NavItemWidget, defaults: { wrapInGroup: false, showInStrip: false } });
