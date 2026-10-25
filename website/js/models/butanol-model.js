import { SYS } from '../omni-support/sys.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import { MoleculeModel } from './molecule-model.js';
export { ButanolModel };
class ButanolModel extends MoleculeModel {
  get name() { return 'Butanol'; }
  constructor() {
    super();
    this.visible = true;
    this.sceneRoot = makeZoomableCamera(this.getScene(), { centerOrigin: true });
  }
  getScene() {
    const zig = 28;
    const heavy = [
      { symbol: 'C', x: -130, y:  zig, nH: 3 }, { symbol: 'C', x:  -65, y: -zig, nH: 2 },
      { symbol: 'C', x:    0, y:  zig, nH: 2 }, { symbol: 'C', x:   65, y: -zig, nH: 2 },
      { symbol: 'O', x:  130, y:  zig, nH: 1 },
    ];
    return this.buildMoleculeScene({ heavy, bonds: [[0,1],[1,2],[2,3],[3,4]] });
  }
}
SYS.MODELS.push( new ButanolModel() )
