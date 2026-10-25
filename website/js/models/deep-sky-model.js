import { SYS } from '../omni-support/sys.js';
import { makeArray } from '../2d-support/make-array.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
import { HUBBLE, fieldStarData, mulberry32 } from '../2d-support/sky-gl.js';
import '../nodes2d/sky-nodes.js';   // 'star', 'field-star', 'deep-sky'
export { DeepSkyModel };

/* A small sky: galaxies of each Hubble type, the nebula family, a dark cloud
   in front of a nursery so absorption shows, named stars, and a field. */
class DeepSkyModel {
  get name() { return 'Deep Sky · Stars & Galaxies'; }
  get displayType() { return '2d'; }
  get background() { return '#05070d'; }

  constructor() {
    this.visible = true;
    const gal = (label, x, y, r, rot, axis, seed, hubble, extra = {}) =>
      ({ type: 'spiral', label, x, y, r, rot, axis, seed, hubble, ...HUBBLE[hubble], ...extra });
    const neb = (type, label, x, y, r, rot, axis, seed, extra = {}) => ({ type, label, x, y, r, rot, axis, seed, ...extra });
    const DEEP = [
      gal('Concord · Sc spiral', -250, -110, 95, 30, 0.75, 21, 'Sc'),
      gal('Harmonedra · SBb barred', 240, 160, 85, -25, 0.55, 11, 'SBb'),
      gal('Ainjel · Sa edge-on', 260, -200, 72, -15, 0.22, 22, 'Sa'),
      gal('E5 elliptical', -40, 270, 40, 20, 0.6, 31, 'E5'),
      gal('Sd four-arm', 430, 330, 30, 50, 0.85, 41, 'Sd'),
      neb('irregular', 'Emellanic Cloud · irregular', -360, 230, 70, -20, 0.75, 4),
      neb('emission', 'Spike nursery · emission', 30, -20, 115, 20, 0.85, 8),
      neb('dark', 'Occluder · dark nebula', 55, -35, 55, 30, 0.7, 14),
      neb('reflection', 'q-legacy · reflection', -70, -280, 62, 0, 1, 9),
      neb('planetary', 'Planetary nebula', 130, 300, 24, 37, 0.85, 40),
      neb('remnant', 'Compost · supernova remnant', 430, -10, 48, 0, 1, 12),
    ].map(v => SYS.makeNode('deep-sky', {
      ...v, tooltip: { name: v.label.split(' · ')[0], detail: v.label.split(' · ')[1] || v.type, extra: `r ${v.r}` },
    }));

    const STARS = [
      ['Molam', 1, 'B', -70, -280], ['Polaris D+', 2, 'B', 70, 25], ['Catalase', 1.2, 'M', 370, 250],
      ['Seqrius', 1.5, 'B', -430, -260], ['Stellum', 2.6, 'G', -130, 30], ['Twilight zone', 3.2, 'G', 170, -80],
      ['Scorpiax', 3.5, 'M', 360, -360], ['Krebs world', 4.2, 'G', -250, 350], ['tRNA table', 5, 'G', 300, 380],
      ['NADH · nova', 4.5, 'N', -420, -40],
    ].map(([label, mag, cls, x, y]) => SYS.makeNode('star', {
      label, mag, cls, x, y, nova: cls === 'N',
      tooltip: { name: label, detail: `magnitude ${mag} · class ${cls}`, extra: cls === 'N' ? 'a find' : '' },
    }));

    const rng = mulberry32(4242);
    const gals = DEEP.filter(n => n.value.type === 'spiral' || n.value.type === 'irregular').map(n => n.value);
    const field = fieldStarData(rng, gals, 650, 560);
    const fieldNode = makeArray('field-star', field, { getValue: (mix, n, p, i) => field[i], selectable: false });

    const group = SYS.makeNode('group', {}, [fieldNode, ...DEEP, ...STARS]);
    this.sceneRoot = makeZoomableCamera(group, { centerOrigin: true, zoom: 0.5 });

    const num = (id, label, min, max, step, value) => ({ id, label, min, max, step, value });
    this.controls = [
      { type: 'separator', label: 'Stars' },
      num('exposure', 'Exposure', 0.2, 3, 0.05, 1),
      num('starCore', 'Core size', 0.4, 4, 0.05, 2.1),
      num('spikeLen', 'Spike length', 0, 120, 1, 25),
      num('spikeGain', 'Spike brightness', 0, 2, 0.05, 0.9),
      num('couple', 'Spike zoom coupling', 0, 1, 0.05, 0.25),
      num('novaR', 'Nova shell', 6, 40, 1, 15),
      { type: 'separator', label: 'Galaxies' },
      num('galGain', 'Brightness', 0, 4, 0.05, 1.6),
      num('discScale', 'Disc scale', 0.4, 2, 0.05, 1),
      num('clump', 'Clumping', 0, 1.5, 0.05, 0.7),
      num('dust', 'Dust lanes', 0, 1.5, 0.05, 0.7),
      num('knots', 'Star-forming knots', 0, 2, 0.05, 0.6),
      num('warm', 'Bulge warmth', 0, 1, 0.05, 0.3),
      { type: 'separator', label: 'Nebulae' },
      num('nebGain', 'Brightness', 0, 4, 0.05, 1.6),
      { type: 'select', id: 'palette', label: 'Palette', options: [['0', 'Natural'], ['1', 'Hubble'], ['2', 'Tint']], value: '0' },
      num('nebScale', 'Noise scale', 0.5, 5, 0.1, 2.2),
      num('warp', 'Domain warp', 0, 2, 0.05, 0.9),
      num('contrast', 'Contrast', 0.5, 3, 0.05, 1.4),
      num('filament', 'Filaments', 0, 1, 0.05, 0.35),
      num('oiii', 'OIII (teal)', 0, 2, 0.05, 0.8),
      num('illum', 'Central illumination', 0, 3, 0.05, 1.2),
      num('shell', 'Shell width', 0, 1, 0.05, 0.4),
      num('lobes', 'Planetary lobes', 0, 1, 0.05, 0.35),
      num('rRagged', 'Remnant raggedness', 0, 2, 0.05, 1),
      { type: 'separator', label: 'Dark & detail' },
      num('darkGain', 'Dark absorption', 0, 1, 0.05, 0.85),
      num('darkThresh', 'Dark threshold', 0.2, 0.9, 0.01, 0.55),
      num('rim', 'Warm rim', 0, 1, 0.05, 0.3),
      num('resolve', 'Resolve into stars', 0, 3, 0.05, 1.2),
      num('deepDetail', 'Detail (octave bias)', -3, 3, 0.25, 0),
    ];
  }

  // Keep the panel's values when it is rebuilt for another pane and back.
  onControl(id, val) {
    const c = id && this.controls.find(k => k.id === id);
    if (c) c.value = val;
  }
}
SYS.MODELS.push(new DeepSkyModel());
