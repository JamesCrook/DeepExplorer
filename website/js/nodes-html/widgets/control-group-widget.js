import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { ControlGroupWidget };

// ════════════════════════════════════════════════════════════════
// `control-group` — a titled group of controls: an h3 and its children (container)
//  ─ Used by the coercion to wrap single-widget sections.
//  ─ SliderGroupWidget extends this for slider sections.
// ════════════════════════════════════════════════════════════════

class ControlGroupWidget extends OmniWidget {
  static before_mount(ctxMix, node, params) {
    const v = node.value || {};
    const groupEl = document.createElement('div');
    groupEl.className = 'control-group';
    groupEl.id = `section-${v.id || ''}`;

    const h3 = document.createElement('h3');
    h3.textContent = v.group || '';
    groupEl.appendChild(h3);

    ctxMix.parentStack.push(ctxMix.parentEl);
    ctxMix.parentEl = groupEl;
  }

  static after_mount(ctxMix, node, params) {
    const groupEl = ctxMix.parentEl;
    ctxMix.parentEl = ctxMix.parentStack.pop();
    ctxMix.parentEl.appendChild(groupEl);
  }
}

SYS.NODE_CLASSES.push({ name: 'control-group', cls: ControlGroupWidget, defaults: { wrapInGroup: false, showInStrip: false } });
