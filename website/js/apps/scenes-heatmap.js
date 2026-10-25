/**
 * scenes-heatmap.js
 *
 * Heatmap scene definition + addable for OmniScene.
 *
 *   Scene  — full-canvas body heatmap (phases: draw2d only)
 *   Addable — resizable heatmap inside a handle-frame on the Canvas
 *             (phases: measure, layout, draw2d via the Canvas scene)
 *
 * Place in: apps/scenes-heatmap.js
 */

import { MiniAstNode, SCENES, ADDABLES } from '../omni-support/scene.js';
import { BODY_REGIONS, COLORMAPS, REGION_COUNT }
  from '../nodes2d/heatmap-node.js';
import '../nodes2d/sizing-nodes.js';


// ═══════════════════════════════════════════════════════
//  SHARED SLIDER DEFINITIONS
// ═══════════════════════════════════════════════════════

const CMAP_OPTIONS = Object.keys(COLORMAPS).map(k => ({
  value: k,
  label: k.charAt(0).toUpperCase() + k.slice(1),
}));

function heatmapCoreSliders() {
  return [
    { id: 'blur',    label: 'Blur radius', min: 0, max: 60,  step: 1, default: 18 },
    { id: 'opacity', label: 'Opacity',     min: 0, max: 100, step: 1, default: 70,
      format: v => Math.round(v) + '%' },
  ];
}

function heatmapSparkleSliders() {
  return [
    { id: 'sparkleCount', label: 'Count', min: 0,   max: 3000, step: 50,  default: 500 },
    { id: 'sparkleSize',  label: 'Size',  min: 0.5, max: 5,    step: 0.5, default: 1.5 },
    {
      id: 'sparkleStyle', label: 'Style',
      type: 'button-row', default: 'dot',
      options: [
        { value: 'dot',   label: '•' },
        { value: 'plus',  label: '+' },
        { value: 'cross', label: '×' },
        { value: 'ring',  label: '○' },
      ],
    },
    {
      id: 'sampling', label: 'Sampling',
      type: 'button-row', default: 'random',
      options: [
        { value: 'random',    label: 'Random' },
        { value: 'poisson',   label: 'Poisson' },
        { value: 'fibonacci', label: 'Fibonacci' },
      ],
    },
  ];
}

function heatmapRegionSliders() {
  return BODY_REGIONS.map((r, i) => ({
    id: 'region_' + i, label: r.name,
    min: 0, max: 1, step: 0.05, default: r.val,
  }));
}

/** Build the default params object (shared by scene + addable). */
function heatmapDefaultParams() {
  const p = {
    blur: 18, opacity: 70,
    sparkleCount: 500, sparkleSize: 1.5,
    sparkleStyle: 'dot', sampling: 'random',
    cmap: 'inferno',
  };
  for (let i = 0; i < REGION_COUNT; i++) {
    p['region_' + i] = BODY_REGIONS[i].val;
  }
  return p;
}

/**
 * Build the colormap select + heatmap / sparkle / region groups.
 * `extraSliders` are appended to the Heatmap group (e.g. pointRadius).
 */
function heatmapSections(layer, extraHeatSliders) {
  const currentCmap = layer.value.params.cmap || 'inferno';
  return [
    {
      group: 'Colormap', id: 'heatmap-cmap', abbrev: 'Cmap',
      type: 'select', selectId: 'cmapSel',
      options: CMAP_OPTIONS.map(o => ({ ...o, selected: o.value === currentCmap })),
      onChange: (val, controls) => {
        layer.value.params.cmap = val;
        controls.render();
      },
    },
    {
      group: 'Heatmap', id: 'heatmap-heat', abbrev: 'Heat',
      sliders: [...heatmapCoreSliders(), ...(extraHeatSliders || [])],
    },
    {
      group: 'Sparkles', id: 'heatmap-sparkles', abbrev: 'Sprk',
      sliders: heatmapSparkleSliders(),
    },
    {
      group: 'Regions', id: 'heatmap-regions', abbrev: 'Reg',
      sliders: heatmapRegionSliders(),
    },
  ];
}


// ═══════════════════════════════════════════════════════
//  PRESETS
// ═══════════════════════════════════════════════════════

const HEATMAP_PRESETS = {
  'Default': { blur: 18, opacity: 70, sparkleCount: 500,  sparkleSize: 1.5 },
  'Sharp':   { blur: 4,  opacity: 85, sparkleCount: 200,  sparkleSize: 1.0 },
  'Diffuse': { blur: 45, opacity: 50, sparkleCount: 1000, sparkleSize: 2.0 },
  'Minimal': { blur: 20, opacity: 40, sparkleCount: 0,    sparkleSize: 1.5 },
};


// ═══════════════════════════════════════════════════════
//  STANDALONE SCENE
// ═══════════════════════════════════════════════════════

function heatmapSceneBuildUI(layer) {
  return heatmapSections(layer);
}

function createHeatmapScene() {
  const heatmap = new MiniAstNode('heatmap', []);
  //const frame    = new MiniAstNode('frame', [heatmap]);
  const zoomable = new MiniAstNode('zoom-pan', [heatmap]);
  const layer = new MiniAstNode('layer', [zoomable], {
    name: 'Heatmap', visible: true, 
    params: heatmapDefaultParams(),
  });
  layer.inst = { buildUI: heatmapSceneBuildUI, presets: HEATMAP_PRESETS };

  const root = new MiniAstNode('scene-root', [layer]);
  root.value = { bg: '#10131a' };
  return root;
}

SCENES.push({
  id:        'heatmap',
  label:     'Body Heatmap',
  group:     'Heatmap',
  hasLayers: false,
  phases:    ['draw2d'],
  create:    createHeatmapScene,
});


// ═══════════════════════════════════════════════════════
//  ADDABLE (for Canvas scene — handle-frame resizable)
// ═══════════════════════════════════════════════════════

const HANDLE_SLIDER = { id: 'pointRadius', label: 'Handles', min: 2, max: 15, step: 1, default: 5 };

function heatmapAddableBuildUI(layer) {
  return heatmapSections(layer, [HANDLE_SLIDER]);
}

const HEATMAP_ADDABLE_PRESETS = {
  'Default': { blur: 18, opacity: 70, sparkleCount: 500, sparkleSize: 1.5 },
  'Sharp':   { blur: 4,  opacity: 85, sparkleCount: 200, sparkleSize: 1.0 },
};

const HEATMAP_ADDABLE = {
  id:            'heatmap',
  label:         'Heatmap',
  selectionSize: 1,
  refCount:      0,
  buildUI:       heatmapAddableBuildUI,
  presets:       HEATMAP_ADDABLE_PRESETS,

  /** Create a single handle-frame item (for adding to an existing layer). */
  createItem(index = 0) {
    const offset = index * 30;
    return new MiniAstNode('handle-frame', [
      new MiniAstNode('drag-point', [], { x: -150 + offset, y: -210 + offset, name: '⌜', color: '#ffffffaa' }),
      new MiniAstNode('drag-point', [], { x:  150 + offset, y:  210 + offset, name: '⌟', color: '#ffffffaa' }),
      new MiniAstNode('heatmap', []),
    ]);
  },

  /** Create a new layer containing one heatmap handle-frame. */
  create() {
    const params = { ...heatmapDefaultParams(), pointRadius: 5 };
    const layer = new MiniAstNode('layer', [this.createItem(0)], {
      name:      'Heatmap',
      layerType: 'heatmap',
      visible:   true,
      params,
    });
    layer.inst = {
      buildUI: heatmapAddableBuildUI, presets: HEATMAP_ADDABLE_PRESETS,
      selectionSize: 1, refCount: 0,
    };
    return layer;
  },
};

ADDABLES.push(HEATMAP_ADDABLE);