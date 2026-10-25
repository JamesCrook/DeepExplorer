import { SYS } from '../omni-support/sys.js';
import { GraphModel } from './graph-model.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import { ProceduralTreeModel } from './procedural-tree-model.js';
export { ProceduralCompleteModel };
class ProceduralCompleteModel extends GraphModel {
  constructor(name, n) {
    super();
    this._name = name;
    this.n = n;
    this.visible = true;
    this.sceneRoot = makeZoomableCamera(this.getScene(), { centerOrigin: true });
  }

  get name() { return this._name; }

  getScene() {
    const pos = [];
    const edges = [];
    const R = Math.max(60, this.n * 15); // Scale radius dynamically with node count

    // Position nodes in a circle
    for (let i = 0; i < this.n; i++) {
      pos.push({
        x: R * Math.cos(i * Math.PI * 2 / this.n - Math.PI / 2),
        y: R * Math.sin(i * Math.PI * 2 / this.n - Math.PI / 2)
      });
    }

    // Connect every node to every other node
    for (let i = 0; i < this.n; i++) {
      for (let j = i + 1; j < this.n; j++) {
        edges.push([i, j]);
      }
    }

    return this.buildScene(pos, edges);
  }
}

// Register as many custom permutations as you like!
SYS.MODELS.push(
//new ProceduralTreeModel('Star Graph', [5]),
  new ProceduralTreeModel('Binary Tree', [2, 2, 2]),
//new ProceduralTreeModel('Deep Tree', [5, 2, 2]),
//new ProceduralCompleteModel('K4 Graph', 4),
  new ProceduralCompleteModel('K6 Graph', 6)
  );
