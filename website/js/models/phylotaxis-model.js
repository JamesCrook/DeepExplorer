import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { make3DPane } from '../3d-support/three-boot.js';
import '../nodes3d/phylo-node.js';   // 'phylo-node'
export { PhylotaxisModel };
class PhylotaxisModel {
  constructor(label, state) {
    this._label = label;
    this.visible = true;
    this._phyloState = JSON.parse(JSON.stringify(state));
    this._currentLevel = 0;
    this._maxCounts = [20,20,500];
    this.controls = [
      {type:'separator',label:'Global'},{id:'baseHue',label:'Base Hue',min:0,max:1,step:0.01,value:state.baseHue},{id:'splatSize',label:'Splat Size',min:0.1,max:5,step:0.1,value:state.splatSize},{id:'splatLength',label:'Splat Len',min:0.1,max:10,step:0.1,value:state.splatLength},{id:'splatWidth',label:'Splat W',min:0.1,max:10,step:0.1,value:state.splatWidth},
      {type:'separator',label:'Level'},{id:'level',type:'select',label:'Target',options:[['0','Lvl 1'],['1','Lvl 2'],['2','Lvl 3']],value:'0'},
      {id:'count',label:'Count',min:1,max:this._maxCounts[0],step:1,value:state.levels[0].count},
      {id:'angle',label:'Div. Angle',min:100,max:180,step:0.1,value:state.levels[0].angle},
      {id:'height',label:'Height',min:0,max:50,step:0.1,value:state.levels[0].height},
      {id:'initialRadius',label:'Init R',min:0,max:30,step:0.1,value:state.levels[0].initialRadius},
      {id:'finalRadius',label:'Final R',min:0,max:30,step:0.1,value:state.levels[0].finalRadius},
      {id:'bulge',label:'Bulge',min:-2,max:2,step:0.01,value:state.levels[0].bulge},
      {id:'tilt',label:'Tilt',min:-90,max:90,step:1,value:state.levels[0].tilt},
      {id:'hueShift',label:'Hue Shift',min:-1,max:1,step:0.01,value:state.levels[0].hueShift}
    ];
  }
  get name() { return this._label; }
  get displayType() { return '3d'; }
  get background() { return '#090a0f'; }

  init(container) {
    const v = make3DPane(container);
    if (!v) return null;
    v.camera.position.set(0,-50,80);
    this.nv = SYS.makeNode('phylo-node', {}); 
    sceneRegistry.walkPhase({iterators:[]}, 'build', this.nv, this._phyloState); 
    v.scene.add(this.nv.value.group); 
    v.phyloNode = this.nv; 
    return v;
  }

  onControl(id, val, getValues, app) {
    if (id === 'level') {
      this._currentLevel = parseInt(val, 10);
      const l = this._phyloState.levels[this._currentLevel];
      this.controls.find(c => c.id === 'count').max = this._maxCounts[this._currentLevel];
      ['count','angle','height','initialRadius','finalRadius','bulge','tilt','hueShift'].forEach(k => {
        const ctrl = this.controls.find(c => c.id === k);
        if (ctrl) ctrl.value = l[k];
      });
      app.buildHud(); 
    } else if (['baseHue','splatSize','splatLength','splatWidth'].includes(id)) {
      this._phyloState[id] = val;
      if (this.nv && this.nv.value.group) sceneRegistry.walkPhase({iterators:[]}, 'update', this.nv, this._phyloState);
      const ctrl = this.controls.find(c => c.id === id);
      if (ctrl) ctrl.value = val;
    } else {
      this._phyloState.levels[this._currentLevel][id] = val;
      if (this.nv && this.nv.value.group) sceneRegistry.walkPhase({iterators:[]}, 'update', this.nv, this._phyloState);
      const ctrl = this.controls.find(c => c.id === id);
      if (ctrl) ctrl.value = val;
    }
  }
}
SYS.MODELS.push(new PhylotaxisModel('Phylotaxis α',{baseHue:0.45,splatSize:1,splatLength:5,splatWidth:0.5,levels:[{count:20,angle:115,height:40,initialRadius:10,finalRadius:10,bulge:1,tilt:60,hueShift:0.5},{count:3,angle:137.5,height:22,initialRadius:0,finalRadius:0,bulge:0,tilt:45,hueShift:0.2},{count:165,angle:137.5,height:5,initialRadius:0.1,finalRadius:4,bulge:1,tilt:15,hueShift:0.45}]}));
SYS.MODELS.push(new PhylotaxisModel('Phylotaxis β',{baseHue:0.8,splatSize:1.5,splatLength:2,splatWidth:2,levels:[{count:15,angle:137.5,height:30,initialRadius:2,finalRadius:15,bulge:-1,tilt:30,hueShift:0.2},{count:5,angle:90,height:10,initialRadius:1,finalRadius:3,bulge:0.5,tilt:80,hueShift:0.1},{count:100,angle:137.5,height:2,initialRadius:0.5,finalRadius:2,bulge:0,tilt:0,hueShift:0.1}]}));

