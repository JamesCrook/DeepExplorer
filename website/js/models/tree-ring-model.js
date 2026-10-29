import { SYS } from '../omni-support/sys.js';
import { makeArray } from '../2d-support/make-array.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import { ringGeometry, treeRingData } from '../nodes2d/tree-ring-zone.js';
export { TreeRingModel };

// Model 'Tree Rings · 35 Years' — a trunk's rings, one per year (tree-ring)

class TreeRingModel {
  get name() {
    return 'Tree Rings · 35 Years';
  }

  get displayType() {
    return '2d';
  }

  constructor() {
    this.visible = true;
    const RINGS = treeRingData(35);
    this.arrayNode = makeArray('tree-ring', RINGS, {
      getValue: (mix, n, p, i) => {
        const r = RINGS.rings[i];
        const g = ringGeometry(mix, n, p, RINGS);
        return {
          ...r,
          ...g,
          innerR2: (r.innerR || 0) * g.scale,
          outerR2: (r.outerR || 0) * g.scale,
          tooltip: {
            name: 'Year ' + r.year,
            detail: r.width.toFixed(1) + ' mm',
            extra: r.note || ''
          }
        };
      },
    });
    this.sceneRoot = makeZoomableCamera(this.arrayNode);
    this.controls = [];
  }
}
SYS.MODELS.push(new TreeRingModel());
