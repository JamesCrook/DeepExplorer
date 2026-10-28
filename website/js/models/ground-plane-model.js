import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { THREE, make3DPane } from '../3d-support/three-boot.js';
import '../nodes3d/ground-plane-node.js';   // 'ground-plane'
export { GroundPlaneModel };
class GroundPlaneModel {
  get name() { return 'Ground Plane'; }
  get displayType() { return '3d'; }
  get background() { return '#111116'; }
  constructor() {
    this.visible = true;
    this.controls = [
      {type:'separator',label:'Ground'},{id:'gridSize',label:'Grid size',min:2,max:60,step:1,value:20},
      {id:'gridDivisions',label:'Divisions',min:2,max:60,step:1,value:20},{id:'gridY',label:'Grid Y',min:-10,max:2,step:0.1,value:-4},
      {id:'gridOpacity',label:'Opacity',min:0,max:1,step:0.01,value:1.0}
    ];
  }
  init(container) {
    const v = make3DPane(container);
    if (!v) return null;
    v.camera.position.set(8,6,12); v.camera.lookAt(0,-2,0); v.controls.target.set(0,-2,0);
    v.scene.add(new THREE.AmbientLight(0xffffff,0.6)); 
    const sun=new THREE.DirectionalLight(0xffffff,0.8); sun.position.set(5,8,4); v.scene.add(sun);
    this.nv = SYS.makeNode('ground-plane', {grid:{size:20,divisions:20,y:-4,color1:0x444444,color2:0x333333},axes:{size:2,position:[-9,-3.9,-9]}});
    sceneRegistry.walkPhase({iterators:[]}, 'build', this.nv, {}); 
    v.scene.add(this.nv.inst.group);   // inst made by the registry during build
    return v;
  }
  onControl(id, val, getValues) {
    if (this.nv?.inst?.group) sceneRegistry.walkPhase({iterators:[]}, 'update', this.nv, getValues());
  }
}
SYS.MODELS.push(new GroundPlaneModel());
