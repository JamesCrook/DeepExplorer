import { SYS } from '../omni-support/sys.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import '../nodes2d/button-node-zones.js';   // 'button-node'
export { ButtonSetModel };
class ButtonSetModel {
  get name() { return 'Button Set · Scene Graph'; }
  get displayType() { return '2d'; }
  constructor() {
    this.visible = true;
    const group = SYS.makeNode('group', {});
    group.subtree = [
      SYS.makeNode('button-node', { x: -90, y: -40, width: 64, height: 64, label: 'あ', sub: 'a' }),
      SYS.makeNode('button-node', { x:   0, y: -40, width: 64, height: 64, label: 'い', sub: 'i' }),
      SYS.makeNode('button-node', { x:  90, y: -40, width: 64, height: 64, label: 'う', sub: 'u' }),
      SYS.makeNode('button-node', { x: -90, y:  40, width: 64, height: 64, label: 'え', sub: 'e', color: '#6b8cae' }),
      SYS.makeNode('button-node', { x:   0, y:  40, width: 64, height: 64, label: 'お', sub: 'o', color: '#8b6b4a', badge: 3 }),
      SYS.makeNode('button-node', { x:  90, y:  40, width: 64, height: 64, label: '✕', disabled: true }),
    ];
    this.sceneRoot = makeZoomableCamera(group, { centerOrigin: true });
  }
}
SYS.MODELS.push(new ButtonSetModel());

