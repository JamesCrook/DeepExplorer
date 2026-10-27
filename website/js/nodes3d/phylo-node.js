import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { THREE } from '../3d-support/three-boot.js';
export { PhyloNode };
class PhyloNode {
  static build3d(ctxMix, node, params) {
    if (node.value.group) return;
    const v = node.value;
    v.group = new THREE.Group();
    v.MAX_INSTANCES = 200000;
    v.dummy = new THREE.Object3D();
    v.leafDummy = new THREE.Object3D();
    const g = new THREE.PlaneGeometry(1, 1);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const gc = cv.getContext('2d');
    const gr = gc.createRadialGradient(32,32,0,32,32,32);
    gr.addColorStop(0,'rgba(255,255,255,1)'); 
    gr.addColorStop(0.2,'rgba(255,255,255,0.8)');
    gr.addColorStop(0.5,'rgba(255,255,255,0.2)'); 
    gr.addColorStop(1,'rgba(255,255,255,0)');
    gc.fillStyle = gr; 
    gc.fillRect(0,0,64,64);
    const m = new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide});
    v.instancedMesh = new THREE.InstancedMesh(g, m, v.MAX_INSTANCES);
    v.group.add(v.instancedMesh);
    PhyloNode.update3d(ctxMix, node, params);
  }
  static update3d(ctxMix, node, params) {
    const v = node.value;
    if (!v.group || !params || !params.levels) return;
    let sd = [];
    const rm = new THREE.Matrix4();
    const rec = (depth, pm, ch) => {
      const lp = params.levels[depth];
      for (let n=1; n<=lp.count; n++) {
        let t = lp.count > 1 ? (n-1)/(lp.count-1) : 0;
        let theta = n * (lp.angle * Math.PI/180);
        let rl = lp.initialRadius*(1-t) + lp.finalRadius*t;
        let mx = Math.max(lp.initialRadius, lp.finalRadius);
        let ref = mx>0 ? mx : 5;
        let r = rl + (Math.sin(t*Math.PI)*lp.bulge*(ref*0.5));
        r = Math.max(0, r);
        v.dummy.position.set(r*Math.cos(theta), r*Math.sin(theta), t*lp.height);
        v.dummy.rotation.set(0,0,theta);
        v.dummy.rotateY(lp.tilt*Math.PI/180);
        v.dummy.updateMatrix();
        const wm = new THREE.Matrix4().multiplyMatrices(pm, v.dummy.matrix);
        let bh = ch + (lp.hueShift*t);
        bh = ((bh%1)+1)%1;
        if (depth < params.levels.length-1) rec(depth+1, wm, bh);
        else sd.push({matrix:wm.clone(), color:new THREE.Color().setHSL(bh, 0.85, 0.5)});
      }
    };
    rec(0, rm, params.baseHue);
    const ic = Math.min(sd.length, v.MAX_INSTANCES);
    v.instancedMesh.count = ic;
    for (let i=0; i<ic; i++) {
      v.leafDummy.position.setFromMatrixPosition(sd[i].matrix);
      v.leafDummy.quaternion.setFromRotationMatrix(sd[i].matrix);
      v.leafDummy.scale.set(params.splatSize*params.splatLength, params.splatSize*params.splatWidth, 1);
      v.leafDummy.updateMatrix();
      v.instancedMesh.setMatrixAt(i, v.leafDummy.matrix);
      v.instancedMesh.setColorAt(i, sd[i].color);
    }
    v.instancedMesh.instanceMatrix.needsUpdate = true;
    if (v.instancedMesh.instanceColor) v.instancedMesh.instanceColor.needsUpdate = true;
  }
}
SYS.NODE_CLASSES.push({ name: 'phylo-node', cls: PhyloNode });;
