import { SYS } from '../omni-support/sys.js';
import { makeArray } from '../2d-support/make-array.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import '../nodes2d/mouse-zone.js';   // 'mouse-button'
export { MouseModel };
import { mouseGeometry } from '../nodes2d/mouse-zone.js';

// Model 'Mouse Bindings · 6 Zones' — a mouse drawn as clickable zones, each showing its binding (mouse-button)

class MouseModel {
  get name() {
    return 'Mouse Bindings · 6 Zones';
  }

  get displayType() {
    return '2d';
  }

  constructor() {
    this.visible = true;
    const BUTTONS = [
      { name: 'Left Click', value: 'Primary Fire', type: 'Main Button' },
      { name: 'Right Click', value: 'Aim Down Sights', type: 'Main Button' },
      { name: 'Scroll Wheel', value: 'Ping Location', type: 'Wheel Button' },
      { name: 'DPI Cycle', value: 'Cycle Sensitivity', type: 'System Button' },
      { name: 'Side Button 1', value: 'Melee', type: 'Side Button' },
      { name: 'Side Button 2', value: 'Throw Grenade', type: 'Side Button' }
    ];
    this.arrayNode = makeArray('mouse-button', BUTTONS, {
      getValue: (mix, n, p, i) => ({
        ...BUTTONS[i],
        shape: i,
        ...mouseGeometry(mix, n, p),
        tooltip: { name: BUTTONS[i].name, detail: BUTTONS[i].value, extra: BUTTONS[i].type }
      }),
    });
    this.sceneRoot = makeZoomableCamera(this.arrayNode);
    this.controls = [];
  }
}
SYS.MODELS.push(new MouseModel());
