import { GraphModel } from './graph-model.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
export { ProceduralTreeModel };
// Generates Trees and Stars procedurally using a top-down hierarchical layout

class ProceduralTreeModel extends GraphModel {
  constructor(name, branching) {
    super();
    this._name = name;
    this.branching = branching; // e.g. [5] for a star, [5, 2] for a 2-level tree
    this.visible = true;
    this.sceneRoot = makeZoomableCamera(this.getScene(), { centerOrigin: true });
  }

  get name() { return this._name; }

  getScene() {
    const pos = [];
    const edges = [];
    let idCounter = 0;

    const buildNode = (depth, x, y, parentId) => {
      const myId = idCounter++;
    // Root gets a distinct color
      pos.push({ x, y, color: depth === 0 ? '#c66' : '#6c6' });

      if (parentId !== null) {
        edges.push([parentId, myId]);
      }

    // If we haven't reached the bottom of our branching array, spawn children
      if (depth < this.branching.length) {
        const b = this.branching[depth];

      // Dynamically calculate horizontal spread so branches don't overlap as much
        const spread = Math.pow(2.2, this.branching.length - depth) * 20; 
        const startX = x - ((b - 1) * spread) / 2;

        for (let i = 0; i < b; i++) {
          buildNode(depth + 1, startX + i * spread, y + 70, myId);
        }
      }
    };

  // Start building from the root (adjust starting Y so deep trees fit well)
    buildNode(0, 0, -this.branching.length * 30, null);
    return this.buildScene(pos, edges);
  }
}
