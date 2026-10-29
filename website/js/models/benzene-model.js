import { SYS } from '../omni-support/sys.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import { MoleculeModel } from './molecule-model.js';
export { BenzeneModel };

// Model 'Benzene' — a benzene ring and its hydrogens, built by MoleculeModel

class BenzeneModel extends MoleculeModel {
  get name() { return 'Benzene'; }
  constructor() {
    super();
    this.visible = true;
    this.sceneRoot = makeZoomableCamera(this.getScene(), { centerOrigin: true });
  }
  getScene() {
    const R = 80;
    const heavy = Array.from({ length: 6 }, (_, i) => ({ symbol: 'C', x: R * Math.cos((i * 60 - 90) * Math.PI / 180), y: R * Math.sin((i * 60 - 90) * Math.PI / 180), nH: 1 }));
    return this.buildMoleculeScene({ heavy, bonds: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]] });
  }
}
SYS.MODELS.push( new BenzeneModel() )
