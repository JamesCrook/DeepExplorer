import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { THREE, make3DPane } from '../3d-support/three-boot.js';
import '../nodes3d/planet-node.js';   // 'planet-node' (and 'planet')
export { PlanetModel };
class PlanetModel {
  get name() { return 'Planet Cutaway'; }
  get displayType() { return '3d'; }
  get background() { return '#0a0a1e'; }
  constructor() {
    this.visible = true;
    this.controls = [
      {type:'separator',label:'Planet'},{id:'coreRadius',label:'Core',min:0.05,max:0.95,step:0.01,value:0.6},
      {id:'rotation',label:'Rotation',min:0,max:360,step:1,value:0},{id:'wedgeStart',label:'Wedge start',min:0,max:360,step:1,value:0},
      {id:'wedgeAngle',label:'Wedge angle',min:0,max:180,step:1,value:90},{id:'planeOpacity',label:'Plane α',min:0,max:1,step:0.01,value:0.9},
      {id:'coreOpacity',label:'Core α',min:0,max:1,step:0.01,value:1.0}
    ];
  }
  init(container) {
    const v = make3DPane(container);
    if (!v) return null;
    v.renderer.localClippingEnabled = true; v.camera.position.set(0,0.8,3);
    v.scene.add(new THREE.AmbientLight(0xffffff,0.5)); 
    const sun=new THREE.DirectionalLight(0xffffff,0.9); sun.position.set(5,3,4); v.scene.add(sun);
    this.sg = new THREE.Group(); v.scene.add(this.sg);
    this.nv = SYS.makeNode('planet-node', { crustRadius:1, coreRadius:0.6 }); 
    sceneRegistry.walkPhase({iterators:[]}, 'build3d', this.nv, {}); 
    this.sg.add(this.nv.inst.group);   // inst made by the registry during build
    return v;
  }
  onControl(id, val, getValues) {
    if (!this.sg) return;
    const p = getValues();
    this.sg.rotation.y = (p.rotation * Math.PI) / 180;
    sceneRegistry.walkPhase({iterators:[]}, 'update3d', this.nv, p);
  }
}
SYS.MODELS.push(new PlanetModel());
