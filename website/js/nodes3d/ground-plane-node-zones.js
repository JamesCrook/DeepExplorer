import { sceneRegistry } from '../omni-support/sys.js';
import { THREE } from '../3d-support/three-boot.js';
export { GroundPlaneNode };
class GroundPlaneNode {
  static build3d(ctxMix, node, params) {
    if (node.value.group) return;
    const v = node.value;
    v.group = new THREE.Group();
    v._gridSize = v.grid?.size ?? 20;
    v._gridDivisions = v.grid?.divisions ?? 20;
    v._gridColor1 = v.grid?.color1 ?? 0x444444;
    v._gridColor2 = v.grid?.color2 ?? 0x333333;
    v._gridY = v.grid?.y ?? -4;
    GroundPlaneNode._buildGrid(node);
    if (v.axes) {
      v.axesHelper = new THREE.AxesHelper(v.axes.size ?? 2);
      if (v.axes.position) v.axesHelper.position.set(...v.axes.position);
      v.group.add(v.axesHelper);
    }
  }
  static update3d(ctxMix, node, params) {
    const v = node.value;
    if (!v.group) return;
    const sz = params.gridSize ?? v._gridSize;
    const dv = Math.round(params.gridDivisions ?? v._gridDivisions);
    if (sz !== v._gridSize || dv !== v._gridDivisions) {
      v._gridSize = sz; v._gridDivisions = dv;
      GroundPlaneNode._removeGrid(node);
      GroundPlaneNode._buildGrid(node);
    }
    const y = params.gridY ?? v._gridY;
    if (y !== v._gridY) {
      v._gridY = y;
      if (v.gridHelper) v.gridHelper.position.y = y;
    }
    if (params.gridOpacity !== undefined && v.gridHelper) {
      v.gridHelper.material.opacity = params.gridOpacity;
      v.gridHelper.material.transparent = params.gridOpacity < 1;
      v.gridHelper.material.needsUpdate = true;
    }
  }
  static _buildGrid(node) {
    const v = node.value;
    v.gridHelper = new THREE.GridHelper(v._gridSize, v._gridDivisions, v._gridColor1, v._gridColor2);
    v.gridHelper.position.y = v._gridY;
    v.gridHelper.material.transparent = true;
    v.group.add(v.gridHelper);
  }
  static _removeGrid(node) {
    const v = node.value;
    if (v.gridHelper) {
      v.gridHelper.geometry.dispose();
      v.gridHelper.material.dispose();
      v.group.remove(v.gridHelper);
      v.gridHelper = null;
    }
  }
}
sceneRegistry.registerNodeClass('ground-plane', GroundPlaneNode);
