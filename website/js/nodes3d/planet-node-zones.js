import { sceneRegistry } from '../omni-support/sys.js';
import { THREE } from '../3d-support/three-boot.js';
export { PlanetNode };
class PlanetNode {
  static build3d(ctxMix, node, params) {
    if (node.value.group) return;
    const v = node.value;
    v._crustRadius = v.crustRadius ?? 1;
    v._coreRadius = v.coreRadius ?? 0.6;
    v.group = new THREE.Group();
    v.clipPlane1 = new THREE.Plane(new THREE.Vector3(1,0,0), 0);
    v.clipPlane2 = new THREE.Plane(new THREE.Vector3(0,0,1), 0);
    v.clippingPlanes = [v.clipPlane1, v.clipPlane2];
    const tl = new THREE.TextureLoader();
    const et = tl.load(v.earthTexture ?? 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
    v.crustMat = new THREE.MeshPhongMaterial({map:et, clippingPlanes:v.clippingPlanes, clipIntersection:true, side:THREE.DoubleSide});
    v.coreMat = new THREE.MeshPhongMaterial({color:0xff6600, emissive:0x441100, clippingPlanes:v.clippingPlanes, clipIntersection:true, side:THREE.DoubleSide});
    v.gridMat = new THREE.MeshBasicMaterial({color:0xffffff, wireframe:true, transparent:true, opacity:0.2, clippingPlanes:v.clippingPlanes, clipIntersection:true});
    v.planeMat1 = new THREE.MeshPhongMaterial({side:THREE.DoubleSide, transparent:true, opacity:0.9});
    v.planeMat2 = new THREE.MeshPhongMaterial({side:THREE.DoubleSide, transparent:true, opacity:0.9});
    const r = v._crustRadius;
    v.crust = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 64), v.crustMat);
    v.core = new THREE.Mesh(new THREE.SphereGeometry(v._coreRadius, 64, 64), v.coreMat);
    v.grid = new THREE.Mesh(new THREE.SphereGeometry(r*1.005, 32, 32), v.gridMat);
    const pg = new THREE.CircleGeometry(r, 64, -Math.PI/2, Math.PI);
    v.plane1 = new THREE.Mesh(pg, v.planeMat1);
    v.plane1.rotation.y = Math.PI/2;
    v.plane2 = new THREE.Mesh(pg, v.planeMat2);
    v.plane2.rotation.z = Math.PI;
    v.group.add(v.crust, v.core, v.grid, v.plane1, v.plane2);
    PlanetNode._updateRadialTexture(node, v._coreRadius, 1.0);
  }
  static update3d(ctxMix, node, params) {
    const v = node.value;
    if (!v.group) return;
    const rotRad = ((params.rotation??0)*Math.PI)/180;
    const radStart = -((params.wedgeStart??0)*Math.PI)/180;
    const rad1 = radStart - rotRad;
    v.clipPlane1.normal.set(Math.cos(rad1), 0, Math.sin(rad1));
    v.plane1.rotation.y = -radStart + Math.PI/2;
    const radEnd = radStart + Math.PI - ((params.wedgeAngle??90)*Math.PI)/180;
    const rad2 = radEnd - rotRad;
    v.clipPlane2.normal.set(Math.cos(rad2), 0, Math.sin(rad2));
    v.plane2.rotation.y = -radEnd + Math.PI/2;
    const cr = params.coreRadius ?? v._coreRadius;
    if (cr !== v._coreRadius) {
      v._coreRadius = cr;
      v.group.remove(v.core);
      v.core.geometry.dispose();
      v.core.geometry = new THREE.SphereGeometry(cr, 64, 64);
      v.group.add(v.core);
    }
    if (params.planeOpacity !== undefined) {
      v.planeMat1.opacity = params.planeOpacity;
      v.planeMat2.opacity = params.planeOpacity;
    }
    PlanetNode._updateRadialTexture(node, v._coreRadius, params.coreOpacity ?? 1.0);
  }
  static _updateRadialTexture(node, coreRadius, coreOpacity) {
    const v = node.value;
    if (v.radialTexture) v.radialTexture.dispose();
    const cv = document.createElement('canvas');
    const sz = 512; cv.width = sz; cv.height = sz;
    const ctx = cv.getContext('2d');
    const cx = sz/2, cy = sz/2, maxR = sz/2;
    ctx.clearRect(0,0,sz,sz);
    const mg = ctx.createRadialGradient(cx,cy,0,cx,cy,maxR);
    mg.addColorStop(0,'#d4a373'); mg.addColorStop(0.5,'#8b6f47'); mg.addColorStop(1,'#654321');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(cx,cy,maxR,0,Math.PI*2); ctx.fill();
    const cR = maxR * coreRadius;
    if (coreOpacity < 1) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${1-coreOpacity})`;
      ctx.beginPath(); ctx.arc(cx,cy,cR,0,Math.PI*2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (coreOpacity > 0) {
      ctx.globalAlpha = coreOpacity;
      const cg = ctx.createRadialGradient(cx,cy,0,cx,cy,cR);
      cg.addColorStop(0,'#ffff00'); cg.addColorStop(0.3,'#ff8800');
      cg.addColorStop(0.7,'#ff4500'); cg.addColorStop(1,'#cc3300');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx,cy,cR,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
    for (let r=0.2; r<=1; r+=0.2) { ctx.beginPath(); ctx.arc(cx,cy,maxR*r,0,Math.PI*2); ctx.stroke(); }
      v.radialTexture = new THREE.CanvasTexture(cv);
    v.radialTexture.needsUpdate = true;
    v.planeMat1.map = v.radialTexture; v.planeMat1.needsUpdate = true;
    v.planeMat2.map = v.radialTexture; v.planeMat2.needsUpdate = true;
  }
}
sceneRegistry.registerNodeClass('planet-node', PlanetNode);
