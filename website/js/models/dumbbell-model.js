import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { THREE, make3DPane } from '../3d-support/three-boot.js';
import '../nodes3d/dumbbell-node.js';   // 'dumbbell-node'
export { DumbbellModel };

// Model 'Dumbbell · Atoms & Bonds' — two atoms and a bond in 3D (dumbbell-node)

class DumbbellModel {
  get name() { return 'Dumbbell · Atoms & Bonds'; }
  get displayType() { return '3d'; }
  get background() { return '#1a1a2e'; }
  constructor() {
    this.visible = true;
    this.controls = [
      { type: 'separator', label: 'Atoms' },
      { id: 'atomRadius', label: 'Atom radius', min: 0, max: 3, step: 0.05, value: 1 },
      { id: 'atomOpacity', label: 'Atom opacity', min: 0, max: 1, step: 0.01, value: 1 },
      { id: 'atomLightness', label: 'Atom lightness', min: 0, max: 1, step: 0.01, value: 0.5 },
      { type: 'separator', label: 'Bonds' },
      { id: 'bondRadius', label: 'Bond radius', min: 0.01, max: 3, step: 0.05, value: 1 },
      { id: 'bondOpacity', label: 'Bond opacity', min: 0, max: 1, step: 0.01, value: 1 },
      { id: 'bondHalfColor', label: 'Half color', min: 0, max: 1, step: 0.01, value: 0.5 },
      { id: 'bondLightness', label: 'Bond lightness', min: 0, max: 1, step: 0.01, value: 0.5 }
    ];
  }
  init(container) {
    const v = make3DPane(container);
    if (!v) return null;
    v.camera.position.set(0, 0, 6);
    v.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(5, 5, 5);
    v.scene.add(sun);
    const dumbbellGroup = new THREE.Group();
    v.scene.add(dumbbellGroup);
    this.nv = SYS.makeNode('dumbbell-node', {});
    sceneRegistry.walkPhase({iterators:[]}, 'build', this.nv, {});
    dumbbellGroup.add(this.nv.value.group);
    return v;
  }
  onControl(id, val, getValues) {
    if (this.nv && this.nv.value.group) sceneRegistry.walkPhase({iterators:[]}, 'update', this.nv, getValues());
  }
}
SYS.MODELS.push(new DumbbellModel());
