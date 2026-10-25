import { MiniAstNode, SCENES, ADDABLES, sceneRegistry } from '../omni-support/scene.js';
import { OmniChartModel }   from './omni-chart-model.js';
import { CSVData }          from '../data/csv-data.js';
import { TreeOfData }       from '../utilities2/tree-of-data.js';
import '../nodes2d/sizing-nodes.js';

import { beveragesTree } from '../data/drinks-data.js';
import { kangxiCharacters } from '../data/k-data.js';

const SAMPLE_OPTIONS = [
  { value: 'sales',    label: 'Product Sales' },
  { value: 'footfall', label: 'Location Footfall' },
  { value: 'drinks',   label: 'Beverages (tree)' },
  { value: 'kanji',    label: 'Kanji (tree)' },
];


// ═══════════════════════════════════════════════════════
//  SHARED SLIDER DEFINITIONS
// ═══════════════════════════════════════════════════════

const DATA_SLIDERS = [
  { id: 'numProducts',  label: 'products',     min: 1, max: 5,   step: 1,    default: 3 },
  { id: 'focusProduct', label: 'focus',         min: 1, max: 5,   step: 1,    default: 1 },
  { id: 'normalize',    label: 'normalize',     min: 0, max: 1,   step: 0.01, default: 0 },
  { id: 'useValue',     label: 'useValue',      min: 0, max: 1,   step: 0.01, default: 1 },
  { id: 'showValue',    label: 'showValue',     min: 0, max: 1,   step: 0.1,  default: 0 },
  { id: 'reverseRows',  label: 'Reverse Rows',  min: 0, max: 1,   step: 0.01, default: 0 },
  { id: 'reverseCols',  label: 'Reverse Cols',  min: 0, max: 1,   step: 0.01, default: 0 },
];

const CHART_CORE_SLIDERS = [
  { id: 'bend',        label: 'bend',        min: 0,    max: 6.283, step: 0.01, default: 0 },
  { id: 'rotateChart', label: 'rotateChart',  min: 0,    max: 6.283, step: 0.01, default: 0 },
  { id: 'baseline',    label: 'baseline',     min: 0,    max: 1,     step: 0.01, default: 0.5 },
  { id: 'gridiness',   label: 'gridiness',    min: 0,    max: 1,     step: 0.01, default: 0 },
];

const ZOOM_SLIDER = { id: 'zoom', label: 'zoom', min: 0.25, max: 2, step: 0.01, default: 1 };

const STACK_SLIDERS = [
  { id: 'bendStack',   label: 'bendStack',    min: 0, max: 1,     step: 0.01, default: 0 },
  { id: 'rotateStack', label: 'rotateStack',  min: 0, max: 6.283, step: 0.01, default: 0 },
  { id: 'alignment',   label: 'alignment',    min: 0, max: 1,     step: 0.01, default: 0 },
  { id: 'selfLevel',   label: 'selfLevel',    min: 0, max: 1,     step: 0.01, default: 1 },
  { id: 'stack',       label: 'stack',         min: 0, max: 1,     step: 0.01, default: 1 },
];

const SEGMENT_SLIDERS = [
  { id: 'segmentWidth',   label: 'segmentWidth',   min: 0, max: 1,   step: 0.01, default: 0.8 },
  { id: 'segmentGap',     label: 'segmentGap',     min: 0, max: 0.5, step: 0.01, default: 0.08 },
  { id: 'neighborliness', label: 'neighborliness', min: 0, max: 1,   step: 0.01, default: 1 },
  { id: 'curviness',      label: 'curviness',      min: 0, max: 1,   step: 0.01, default: 0 },
];

const DISPLAY_SLIDERS = [
  { id: 'colorTarget',    label: 'Color target',    min: 0, max: 1, step: 0.01, default: 0 },
  { id: 'smoothGradient', label: 'Smooth gradient',  min: 0, max: 1, step: 0.01, default: 1 },
  { id: 'blobMode',       label: 'Blob mode',        min: 0, max: 1, step: 0.01, default: 0 },
  { id: 'decimalPlaces',  label: 'Decimal places',   min: 0, max: 6, step: 1,    default: 2, format: 'int' },
  { id: 'tiltText',       label: 'Tilt Text',        min: 0, max: 1, step: 0.01, default: 1 },
  { id: 'textAlign',      label: 'Text align',       min: 0, max: 1, step: 0.01, default: 0.5 },
  { id: 'indexOverlay',   label: 'Index overlay',    min: 0, max: 1, step: 0.01, default: 0 },
];

const STYLE_SLIDERS = [
  { id: 'flash',          label: 'flash',          min: 0, max: 1,  step: 0.01, default: 0.5 },
  { id: 'fillOpacity',    label: 'fillOpacity',    min: 0, max: 1,  step: 0.01, default: 1 },
  { id: 'strokeWidth',    label: 'strokeWidth',    min: 0, max: 3,  step: 0.1,  default: 0 },
  { id: 'topWidth',       label: 'topWidth',       min: 0, max: 5,  step: 0.1,  default: 0 },
  { id: 'roundedCorners', label: 'roundedCorners', min: 0, max: 20, step: 0.2,  default: 0 },
];

const HANDLE_SLIDER = { id: 'pointRadius', label: 'Handles', min: 2, max: 15, step: 1, default: 5 };


// ═══════════════════════════════════════════════════════
//  CSV LOADER — shared by scene and addable
// ═══════════════════════════════════════════════════════

/** Walk the layer tree to find the chart container (chart-frame or chart-box). */
function findChartContainer(node) {
  if (!node) return null;
  if (node.type === 'chart-frame' || node.type === 'chart-box') return node;
  for (const child of (node.subtree || [])) {
    const hit = findChartContainer(child);
    if (hit) return hit;
  }
  return null;
}

function buildCsvLoader(lyr, app) {
  const frag = document.createDocumentFragment();

  const drop = document.createElement('div');
  drop.className = 'file-drop';
  drop.innerHTML = '<div class="file-drop-icon">📄</div>Drop CSV file or click';
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv,.txt';
  input.style.display = 'none';
  drop.onclick = () => input.click();

  const load = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = new CSVData(e.target.result);
        const ast = OmniChartModel.makeChartFromCsv(csv);
        const container = findChartContainer(lyr);
        if (container) { container.subtree = [ast]; app.render(); }
      } catch (err) { console.error('CSV error:', err); }
    };
    reader.readAsText(file);
  };

  input.onchange = () => { if (input.files[0]) load(input.files[0]); };
  drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('dragover');
    if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]);
  });

  frag.appendChild(drop);
  frag.appendChild(input);
  return frag;
}


// ═══════════════════════════════════════════════════════
//  CHART SECTIONS — composable UI builder
// ═══════════════════════════════════════════════════════

function chartSections({ loader = false, zoom = false, handles = false } = {}) {
  const sections = [];

  if (loader) {
    sections.push({
      group: 'Load Data', id: 'load', abbrev: 'Load',
      type: 'custom',
      build: (groupEl, lyr, app) => groupEl.appendChild(buildCsvLoader(lyr, app)),
    });
  }

  sections.push(
    { group: 'Data',    id: 'data',    abbrev: 'Dat', sliders: DATA_SLIDERS },
    { group: 'Chart',   id: 'chart',   abbrev: 'Chr', sliders: zoom ? [...CHART_CORE_SLIDERS, ZOOM_SLIDER] : CHART_CORE_SLIDERS },
    { group: 'Stack',   id: 'stack',   abbrev: 'Stk', sliders: STACK_SLIDERS },
    { group: 'Segment', id: 'segment', abbrev: 'Seg', sliders: SEGMENT_SLIDERS },
    { group: 'Display', id: 'display', abbrev: 'Dis', sliders: DISPLAY_SLIDERS },
    { group: 'Style',   id: 'style',   abbrev: 'Sty', sliders: handles ? [...STYLE_SLIDERS, HANDLE_SLIDER] : STYLE_SLIDERS },
  );

  return sections;
}


// ═══════════════════════════════════════════════════════
//  PRESETS + DEFAULTS
// ═══════════════════════════════════════════════════════

const CHART_PRESETS = {
  'Stacked': {
    bend: 0, bendStack: 0, gridiness: 0, rotateStack: 0, rotateChart: 0,
    segmentWidth: 0.8, segmentGap: 0.08, selfLevel: 0, neighborliness: 0,
    stack: 1, baseline: 0.5, alignment: 0, curviness: 0, normalize: 0,
    roundedCorners: 0,
    fillOpacity: 0.8, strokeWidth: 2.0, topWidth: 0, useValue: 1, showValue: 0,
  },
  'Annotated': {
    bend: 0, bendStack: 0, gridiness: 0, rotateStack: 3.14, rotateChart: 0,
    segmentWidth: 1, segmentGap: 0.02, selfLevel: 0, neighborliness: 0,
    stack: 1, baseline: 0.5, alignment: 0, curviness: 1, normalize: 0, flash: 0.5,
    textAlign: 0, tiltText: 1, roundedCorners: 4,
    fillOpacity: 0.6, strokeWidth: 2.0, topWidth: 0, useValue: 1, showValue: 1,
  },
  'Line Chart': {
    bend: 0, bendStack: 0, gridiness: 0, rotateStack: 0, rotateChart: 0,
    segmentWidth: 1, segmentGap: 0, selfLevel: 0, neighborliness: 1,
    stack: 0, baseline: 0.5, alignment: 0, curviness: 0, normalize: 0,
    fillOpacity: 0.06, strokeWidth: 0, topWidth: 2.5,
  },
  'Stream Graph': {
    bend: 0, bendStack: 0, gridiness: 0, rotateStack: 0, rotateChart: 0, segmentWidth: 1, segmentGap: 0,
    selfLevel: 0, neighborliness: 1, stack: 1, baseline: 0.5, alignment: 0, curviness: 0,
    normalize: 0, fillOpacity: 0.9, strokeWidth: 0, topWidth: 0,
  },
  'Area Chart': {
    bend: 0, bendStack: 0, gridiness: 0, rotateStack: 0, rotateChart: 0, segmentWidth: 1, segmentGap: 0,
    selfLevel: 0, neighborliness: 1, stack: 1, baseline: 0.5, alignment: 0, curviness: 0,
    normalize: 0, fillOpacity: 0.7, strokeWidth: 0, topWidth: 1,
  },
  'Bar Chart': {
    bend: 0, bendStack: 0, gridiness: 0, rotateStack: 0, rotateChart: 0, segmentWidth: 0.92, segmentGap: 0,
    selfLevel: 0, neighborliness: 0, stack: 0, baseline: 0.5, alignment: 0, curviness: 0,
    normalize: 0, fillOpacity: 0.1, strokeWidth: 1, topWidth: 3,
  },
  'Horizontal Bar': {
    bend: 0, bendStack: 0, gridiness: 0, rotateStack: 0, rotateChart: 1.5708, segmentWidth: 0.8, segmentGap: 0.08,
    selfLevel: 0, neighborliness: 0, stack: 1, baseline: 0.5, alignment: 0, curviness: 0,
    normalize: 0, fillOpacity: 1, strokeWidth: 0, topWidth: 0,
  },
  'Spider': {
    bend: 6.283, bendStack: 0, gridiness: 0, rotateStack: 0, rotateChart: 0,
    segmentWidth: 1.0, segmentGap: 0.02, selfLevel: 0, neighborliness: 1,
    stack: 1, baseline: 0.5, alignment: 0, curviness: 0, normalize: 0,
    fillOpacity: 0.15, strokeWidth: 0.5, topWidth: 2,
  },
  'Radial Bar': {
    bend: 6.283, bendStack: 0, gridiness: 0, rotateStack: 0, rotateChart: 0, segmentWidth: 1.0, segmentGap: 0.02,
    selfLevel: 0, neighborliness: 0, stack: 1, baseline: 0.5, alignment: 0, curviness: 1,
    normalize: 0, fillOpacity: 0.8, strokeWidth: 0.5, topWidth: 0,
  },
  'Tree Ring': {
    bend: 6.283, bendStack: 0, gridiness: 0, rotateStack: 0, rotateChart: 0, segmentWidth: 1.0, segmentGap: 0.0,
    selfLevel: 0, neighborliness: 1, stack: 1, baseline: 0.5, alignment: 0, curviness: 1,
    normalize: 0, fillOpacity: 0.6, strokeWidth: 1.5, topWidth: 0,
  },
  'Swirl': {
    bend: 6.283, bendStack: 0.8, gridiness: 0, rotateStack: 5.6, rotateChart: 0, segmentWidth: 0.5, segmentGap: 0.0,
    selfLevel: 0, neighborliness: 1, stack: 1, baseline: 0.5, alignment: 0, curviness: 1,
    normalize: 1, fillOpacity: 0.5, strokeWidth: 1.2, topWidth: 0,
  },
  'Radial Line': {
    bend: 6.283, bendStack: 0, gridiness: 0, rotateStack: 0, rotateChart: 0, segmentWidth: 1.0, segmentGap: 0.02,
    selfLevel: 0, neighborliness: 1, stack: 0, baseline: 0.5, alignment: 0, curviness: 0,
    normalize: 0, fillOpacity: 0, strokeWidth: 0.5, topWidth: 2.0,
  },
  'Donut Row': {
    bend: 0, bendStack: 1, gridiness: 0, rotateStack: 0, rotateChart: 0, segmentWidth: 0.5, segmentGap: 0.15,
    selfLevel: 1, neighborliness: 0, stack: 1, baseline: 0.5, alignment: 0.5, curviness: 1,
    normalize: 1, fillOpacity: 1, strokeWidth: 0, topWidth: 0,
  },
  'Donut Ring': {
    bend: 6.283, bendStack: 1, gridiness: 0, rotateStack: 0, rotateChart: 0,
    segmentWidth: 0.5, segmentGap: 0.15, selfLevel: 1, neighborliness: 0,
    stack: 1, baseline: 0.5, alignment: 0.5, curviness: 1, normalize: 1,
    fillOpacity: 1, strokeWidth: 0, topWidth: 0,
  },
  'Donut Chart': {
    bend: 0, bendStack: 1, gridiness: 1, rotateStack: 0, rotateChart: 0, segmentWidth: 0.5, segmentGap: 0.15,
    selfLevel: 1, neighborliness: 0, stack: 1, baseline: 0.5, alignment: 0.5, curviness: 1,
    normalize: 1, fillOpacity: 1, strokeWidth: 0, topWidth: 0,
  },
  'Pie Chart': {
    bend: 0, bendStack: 1, gridiness: 1, rotateStack: 0, rotateChart: 0, segmentWidth: 1, segmentGap: 0,
    selfLevel: 1, neighborliness: 0, stack: 1, baseline: 0.5, alignment: 0.5, curviness: 1,
    normalize: 1, fillOpacity: 0.5, strokeWidth: 1, topWidth: 0,
  },
  'Grid': {
    bend: 0, bendStack: 0, gridiness: 0, rotateStack: 0, rotateChart: 0, segmentWidth: 0.8, segmentGap: 0.08,
    selfLevel: 0, neighborliness: 0, stack: 1, baseline: 0.5, alignment: 0, curviness: 0,
    normalize: 0, fillOpacity: 1, strokeWidth: 0, topWidth: 0, useValue: 0, showValue: 1,
  },
};

const CHART_DEFAULTS = {
  bend: 0, bendStack: 0, gridiness: 0, rotateStack: 0, rotateChart: 0,
  segmentWidth: 0.8, segmentGap: 0.08, selfLevel: 0, neighborliness: 0,
  stack: 1, baseline: 0.5, alignment: 0, curviness: 0, normalize: 0,
  fillOpacity: 1, strokeWidth: 0, topWidth: 0,
  useValue: 1, showValue: 0, focusProduct: 1, numProducts: 3,
  roundedCorners: 0,
};


// ═══════════════════════════════════════════════════════
//  STANDALONE SCENE
// ═══════════════════════════════════════════════════════

function chartBuildUI(layer) {
  return chartSections({ loader: true, zoom: true });
}

function createChartScene(numCategories = 6, sampleType = 'sales') {
  let root;
  if (sampleType === 'drinks') {
    root = OmniChartModel.makeTreeChartAst(
      new TreeOfData(beveragesTree), [
        { label: 'Types',      level: 0, cursor: [0],       sameParent: true },
        { label: 'Categories', level: 1, cursor: [0, 0],    sameParent: false },
        { label: 'Items',      level: 2, cursor: [0, 0, 0], sameParent: false },
      ]);
  } else if (sampleType === 'kanji') {
    root = OmniChartModel.makeTreeChartAst(
      new TreeOfData(kangxiCharacters), [
        { label: 'Types',      level: 0, cursor: [0],       sameParent: true },
        { label: 'Categories', level: 1, cursor: [0, 0],    sameParent: false },
        { label: 'Items',      level: 2, cursor: [0, 0, 0], sameParent: false },
      ]);
  } else {
    root = OmniChartModel.makeChartAst(numCategories, sampleType);
  }
  const frame     = new MiniAstNode('frame', [root]);
  const zoomScale = new MiniAstNode('zoom-pan', [frame]);
  const layer     = new MiniAstNode('layer', [zoomScale], {
    name: 'Chart', visible: true,
    params: { ...CHART_DEFAULTS, panX: 0, panY: 0 },
  });
  layer.inst = { buildUI: chartBuildUI, presets: CHART_PRESETS };
  return new MiniAstNode('scene-root', [layer]);
}



SCENES.push(
  { id: 'chart-sales', label: 'Product Sales', group: 'Chart', hasLayers: false, create: () => createChartScene(6, 'sales'), preset: 'Default'},
  { id: 'chart-foot',  label: 'Footfall',      group: 'Chart', hasLayers: false, create: () => createChartScene(6, 'footfall'), preset: 'Default' },
  { id: 'drinks',      label: 'Drinks',        group: 'Chart', hasLayers: false, create: () => 
    createChartScene(6, 'drinks'), preset: 'Annotated' },
  { id: 'kanji',       label: 'Kanji',         group: 'Chart', hasLayers: false, create: () => createChartScene(6, 'kanji'), preset: 'Annotated' },
);


// ═══════════════════════════════════════════════════════
//  CHART ADDABLE (handle-frame resizable)
// ═══════════════════════════════════════════════════════

function chartAddableBuildUI(layer) {
  return chartSections({ loader: true, zoom: false, handles: true });
}

const CHART_ADDABLE = {
  id:            'chart',
  label:         'Chart',
  selectionSize: 1,
  refCount:      0,
  buildUI:       chartAddableBuildUI,
  presets:       CHART_PRESETS,

  /** Create a single handle-frame item containing a chart. */
  createItem(index = 0) {
    const chartAst = OmniChartModel.makeChartAst(6, 'sales');
    const frame = new MiniAstNode('box', [chartAst]);

    const offset = index * 30;
    return new MiniAstNode('handle-frame', [
      new MiniAstNode('drag-point', [], { x: -200 + offset, y: -150 + offset, name: '⌜', color: '#ffffffaa' }),
      new MiniAstNode('drag-point', [], { x:  200 + offset, y:  150 + offset, name: '⌟', color: '#ffffffaa' }),
      frame,
    ]);
  },

  /** Create a new layer containing one chart handle-frame. */
  create() {
    const layer = new MiniAstNode('layer', [this.createItem(0)], {
      name:      'Chart',
      layerType: 'chart',
      visible:   true,
      params:    { ...CHART_DEFAULTS, pointRadius: 5 },
    });
    layer.inst = {
      buildUI: chartAddableBuildUI, presets: CHART_PRESETS,
      selectionSize: 1, refCount: 0,
    };
    return layer;
  },
};

ADDABLES.push(CHART_ADDABLE);