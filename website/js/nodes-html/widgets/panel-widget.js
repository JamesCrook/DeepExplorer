import { SYS } from '../../omni-support/sys.js';
import { OmniWidget } from './widget-base.js';
export { PanelWidget };

// ════════════════════════════════════════════════════════════════
//  PanelWidget — root node for walkPhase('mount')
//  ─ Ensures parentStack exists. Children are top-level sections.
// ════════════════════════════════════════════════════════════════

class PanelWidget extends OmniWidget {
  static before_mount(ctxMix, node, params) {
    ctxMix.parentStack = ctxMix.parentStack || [];
  }
  static after_mount(ctxMix, node, params) {
    // nothing — children already appended into ctxMix.parentEl
  }
}

SYS.NODE_CLASSES.push({ name: 'panel', cls: PanelWidget, defaults: { wrapInGroup: false, showInStrip: false } });
