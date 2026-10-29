import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { OptgroupWidget };

// `optgroup` — a group of options inside a select (container)

class OptgroupWidget extends OmniWidget {

  static before_mount(ctxMix, node, params) {
    const og = document.createElement('optgroup');
    og.label = node.value?.label || '';
    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl.appendChild(og);
    ctxMix.parentEl = og;
  }

  static after_mount(ctxMix, node, params) {
    ctxMix.parentEl = ctxMix.parentStack.pop();
  }
}

SYS.NODE_CLASSES.push({ name: 'optgroup', cls: OptgroupWidget, defaults: { navVersion: 'nav-submenu', wrapInGroup: false, showInStrip: false } });
