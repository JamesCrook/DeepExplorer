import { SYS } from '../omni-support/sys.js';
import { chrGeometry } from '../nodes2d/chromosome-zone.js';
import { makeArray } from '../2d-support/make-array.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
export { ChromosomeModel };
class ChromosomeModel {
  get name() { return 'Chromosome 1 · Cytobands'; }
  get displayType() { return '2d'; }
  constructor() {
    this.visible = true;
    const raw=[['p36.33','gneg',0,2300000],['p36.32','gpos25',2300000,5400000],['p36.31','gneg',5400000,7200000],['p36.23','gpos25',7200000,9200000],['p36.22','gneg',9200000,12700000],['p36.21','gpos50',12700000,16200000],['p36.13','gneg',16200000,20400000],['p36.12','gpos25',20400000,23900000],['p36.11','gneg',23900000,28000000],['p35.3','gpos25',28000000,30200000],['p35.2','gneg',30200000,32400000],['p35.1','gpos25',32400000,34600000],['p34.3','gneg',34600000,40100000],['p33','gpos75',46800000,50500000],['p32.3','gneg',50500000,55600000],['p31.1','gpos100',69400000,84400000],['p22.2','gpos75',88300000,92000000],['p21.1','gpos100',101800000,106700000],['p13.2','gpos50',111200000,115300000],['p12','gpos100',117800000,120600000],['p11.2','acen',121700000,125100000],['p11.1','acen',125100000,125800000],['q11','acen',125800000,128900000],['q12','gpos50',128900000,142600000],['q21.1','gneg',142600000,147950000],['q21.2','gpos25',147950000,150600000],['q21.3','gneg',150600000,155000000],['q23.1','gneg',160500000,166200000],['q24.2','gpos50',169700000,172900000],['q25.2','gpos50',176000000,180300000],['q31.1','gneg',185800000,190800000],['q32.1','gneg',198700000,207200000],['q41','gneg',218500000,224100000],['q42.13','gpos50',229900000,233600000],['q43','gneg',236400000,243500000],['q44','gpos25',243500000,248956422]];
    const data = { bands:raw.map(r=>({label:r[0],stain:r[1],start:r[2],end:r[3]})), length:248956422, cenStart:121700000, cenEnd:128900000 };
    this.arrayNode = makeArray('chromosome-band', data, {
      getValue: (mix, n, p, i) => {
        const b = data.bands[i], g = chrGeometry(mix, n, p, data);
        return {
          ...b, ...g,
          y1: g.topY + b.start / data.length * g.chrH,
          y2: g.topY + b.end   / data.length * g.chrH,
          tooltip: { name: b.label, detail: b.stain, extra: `${b.start}–${b.end}` },
        };
      },
    });
    this.sceneRoot = makeZoomableCamera(this.arrayNode);
    this.controls = [];
  }
}
SYS.MODELS.push(new ChromosomeModel());
