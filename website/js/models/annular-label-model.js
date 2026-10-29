import { SYS } from '../omni-support/sys.js';
import { makeArray } from '../2d-support/make-array.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import { fieldStarData, mulberry32 } from '../2d-support/sky-gl.js';
import '../nodes2d/sky-nodes.js';        // 'field-star'
import '../nodes2d/ring-label-node.js';  // 'ring-label', 'label-layer'
export { AnnularLabelModel };

/*
Model 'Annular Labels · Rings' — one constellation, its star names wrapped round the stars

One constellation from the northern atlas: a region seal round it, stars
   inside, and a few outside to show the shapes.  Brightest first, because the
   label layer places in subtree order. */
class AnnularLabelModel {
  get name() { return 'Annular Labels · Rings'; }
  get displayType() { return '2d'; }
  get background() { return '#05070d'; }

  constructor() {
    this.visible = true;
    const STARS = [
      ['Molam', 1, 'B', 0, 0],
      ['Cognitive Development & Meditation Subtopic:125', 2, 'G', 0, -150],
      ['SQLite protein front end', 3, 'B', 145, -55],
      ['Alignment with structure', 3, 'B', -145, -55],
      ['Seqrius ellcari', 3.5, 'G', 95, 125],
      ['Annular labels', 4, 'B', -95, 125],
      ['Pathway viewer', 4.5, 'G', 0, 170],
      ['tRNA table', 5, 'G', 230, 120],
      ['Twilight zone', 3, 'G', -360, -300],
      ['Iter Quasicrystallinum — Quasicrystals', 5.6, 'G', 360, -300],
      ['Krebs world', 4, 'M', -380, 300],
      ['Catalase', 1.2, 'M', 380, 300],
    ].map(([text, mag, cls, x, y]) => SYS.makeNode('ring-label', {
      text, mag, cls, x, y, tooltip: { name: text, detail: `magnitude ${mag} · class ${cls}`, extra: '' },
    })).sort((a, b) => a.value.mag - b.value.mag);

    const seal = SYS.makeNode('ring-label', {
      x: 0, y: 0, region: true, extent: 380, text: 'Proteuchus — Molecular Tools', color: '#9fe0b4',
      tooltip: { name: 'Proteuchus', detail: 'region seal', extra: '' },
    });

    const rng = mulberry32(1017);
    const field = fieldStarData(rng, [], 320, 520);
    const fieldNode = makeArray('field-star', field, { getValue: (mix, n, p, i) => field[i], selectable: false });

    const layer = SYS.makeNode('label-layer', {}, [seal, ...STARS]);
    const group = SYS.makeNode('group', {}, [fieldNode, layer]);
    this.sceneRoot = makeZoomableCamera(group, { centerOrigin: true, zoom: 0.65 });

    const num = (id, label, min, max, step, value) => ({ id, label, min, max, step, value });
    const tick = (id, label, value) => ({ type: 'checkbox', id, label, value });
    this.controls = [
      { type: 'separator', label: 'Star labels' },
      { type: 'select', id: 'pointMode', label: 'Long label shape',
        options: [['auto', 'Auto'], ['straight', '1 line'], ['wrap', '2 lines'], ['ring', 'Ring']], value: 'ring' },
      num('longLabelPx', 'Ring when wider than', 0, 300, 5, 90),
      num('maxWidth', 'Max label width', 80, 260, 5, 150),
      num('labelScale', 'Text size', 0.6, 2, 0.05, 1),
      num('labelWeight', 'Weight', 50, 1000, 50, 300),
      num('labelOpacity', 'Opacity', 0.1, 1, 0.05, 0.85),
      { type: 'separator', label: 'Rings' },
      num('ringRadius', 'Ring radius', 20, 90, 1, 44),
      num('ringArcTop', 'Max arc, top', 60, 360, 5, 160),
      num('ringArcBottom', 'Max arc, bottom', 60, 360, 5, 200),
      tick('ringBlob', 'Blob separators', true),
      num('ringBlobSize', 'Blob size', 1, 5, 0.1, 2.4),
      tick('ringMeaning', 'Split by meaning', true),
      tick('ringInner', 'Inner continuation', true),
      num('ringBand', 'Band background', 0, 0.4, 0.01, 0.11),
      num('ringRim', 'Band rim', 0, 1, 0.05, 0.25),
      { type: 'separator', label: 'Region seal' },
      { type: 'select', id: 'regionMode', label: 'Shape', options: [['ring', 'Ring'], ['wrap', '2 lines'], ['straight', '1 line']], value: 'ring' },
      num('regionSize', 'Size', 0.5, 3, 0.05, 1.3),
      num('regionWeight', 'Weight', 50, 1000, 50, 300),
      num('regionOpacity', 'Opacity', 0.05, 1, 0.05, 0.4),
      { type: 'separator', label: 'Placement' },
      tick('collide', 'Avoid collisions', true),
      tick('screenConstant', 'Constant size on screen', true),
      tick('showStars', 'Draw stars', true),
      num('exposure', 'Star exposure', 0.2, 3, 0.05, 1),
    ];
  }

  onControl(id, val) {
    const c = id && this.controls.find(k => k.id === id);
    if (c) c.value = val;
  }
}
SYS.MODELS.push(new AnnularLabelModel());
