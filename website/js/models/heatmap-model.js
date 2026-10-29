import { SYS } from '../omni-support/sys.js';
import { BODY, BODY_REGIONS, ORGAN_LABELS } from '../nodes2d/heatmap-zone.js';
import { makeArray } from '../2d-support/make-array.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
export { HeatmapModel };
import { organGeometry } from '../nodes2d/heatmap-zone.js';

// Model 'Body Heatmap · 9 Organs' — a body outline whose organ regions are coloured by value (organ-region)

class HeatmapModel {
  get name() {
    return 'Body Heatmap · 9 Organs';
  }

  get displayType() {
    return '2d';
  }

  constructor() {
    this.visible = true;
    const REGIONS = JSON.parse(JSON.stringify(BODY_REGIONS));
    this.arrayNode = makeArray('organ-region', REGIONS, {
      getValue: (mix, n, p, i) => ({
        ...REGIONS[i],
        organ: BODY.organs[i],
        label: ORGAN_LABELS[i],
        ...organGeometry(mix, n, p),
        tooltip: {
          name: REGIONS[i].name,
          detail: 'Base Health: ' + Math.round(REGIONS[i].val * 100) + '%',
          extra: ORGAN_LABELS[i]
        }
      }),
    });
    this.sceneRoot = makeZoomableCamera(this.arrayNode);
    this.controls = [];
  }
}

SYS.MODELS.push(new HeatmapModel());
