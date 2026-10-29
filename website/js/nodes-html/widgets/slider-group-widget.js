import { SYS } from '../../omni-support/sys.js';
import { ControlGroupWidget } from './control-group-widget.js';
export { SliderGroupWidget };

// `slider-group` — a control-group of sliders

// ════════════════════════════════════════════════════════════════
// `slider-group` — a control-group whose children are morph-sliders, colour pickers and button rows (container)
//  ─ Inherits before_mount/after_mount (creates .control-group).
//  ─ Children (morph-slider, color-picker, button-row) are subtree
//    nodes; the walker handles iteration.
// ════════════════════════════════════════════════════════════════

class SliderGroupWidget extends ControlGroupWidget {
  // Inherits before_mount/after_mount from ControlGroupWidget.
  // No mount() — it's purely a container.
}

SYS.NODE_CLASSES.push({ name: 'slider-group', cls: SliderGroupWidget, defaults: { navVersion: 'nav-item' } });
