import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { NavCheckboxWidget };

// `nav-checkbox` — a hamburger-menu item with a checkbox (leaf)

class NavCheckboxWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const el = document.createElement('div');
    el.className = 'nav-menu-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'nav-menu-checkbox';
    cb.checked = !!v.checked;
    cb.onclick = (e) => e.stopPropagation();
    cb.onchange = () => { if (node.inst?.onChange) node.inst.onChange(cb.checked); };

    el.appendChild(cb);
    el.appendChild(document.createTextNode(v.label || ''));
    el.onclick = (e) => {
      if (e.target !== cb) {
        cb.checked = !cb.checked;
        if (node.inst?.onChange) node.inst.onChange(cb.checked);
      }
      e.stopPropagation();
    };

    ctxMix.parentEl.appendChild(el);
  }
}

SYS.NODE_CLASSES.push({ name: 'nav-checkbox', cls: NavCheckboxWidget, defaults: { wrapInGroup: false, showInStrip: false } });
