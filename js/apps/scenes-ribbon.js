// ═══════════════════════════════════════════════════════
//  RIBBON SCENES + ADDABLE — v2
// ═══════════════════════════════════════════════════════
//
// Changes from v1:
//   - Twig protocol: addItem, removeItem, selectionInfo on layer.inst
//   - Per-point itemFields (name, color) via createItemFields
//   - Points can be added/removed via the action bar
//   - Uses createLayerOps helper from layer-ops.js
//
import { MiniAstNode, SCENES, ADDABLES, sceneRegistry } from '../omni-support/scene.js';
import { createItemFields } from '../omni-support/item-fields.js';
import { findByToken, createLayerOps } from '../omni-support/layer-ops.js';
import '../nodes2d/ribbon-node.js';

const PT_COLORS = [
  '#4fc3f7', '#81c784', '#ffb74d', '#f06292',
  '#ba68c8', '#4db6ac', '#fff176', '#a1887f',
];


// ═══════════════════════════════════════════════════════
//  SHARED SLIDER DEFINITIONS
// ═══════════════════════════════════════════════════════

const RIBBON_CORE_SLIDERS = [
  { id: 'ribbonWidth', label: 'width',   min: 1, max: 80, step: 1,    default: 24 },
  { id: 'ribbonAngle', label: 'angle',   min: 0, max: 45, step: 1,    default: 15 },
  { id: 'splineMode',  label: 'spline',  min: 0, max: 1,  step: 1,    default: 0 },
  { id: 'fillOpacity', label: 'opacity', min: 0, max: 1,  step: 0.01, default: 0.7 },
  { id: 'strokeWidth', label: 'outline', min: 0, max: 6,  step: 0.1,  default: 1.5 },
  { id: 'endJoin',     label: 'loop',    min: 0, max: 1,  step: 1,    default: 0 },
];

const FEATURES_SLIDERS = [
  { id: 'showSegments',   label: 'segments',    min: 0, max: 1, step: 1,   default: 1 },
  { id: 'showFill',       label: 'fill',        min: 0, max: 1, step: 1,   default: 0 },
  { id: 'showRibbonFill', label: 'ribbon fill', min: 0, max: 1, step: 1,   default: 0 },
  { id: 'showBars',       label: 'bars',        min: 0, max: 1, step: 1,   default: 0 },
  { id: 'showTangents',   label: 'tangents',    min: 0, max: 1, step: 1,   default: 0 },
  { id: 'polygonWidth',   label: 'polygon',     min: 0, max: 4, step: 0.1, default: 0 },
];

const POINTS_SLIDERS = [
  { id: 'showPoints',  label: 'visible', min: 0, max: 1,  step: 0.01, default: 1 },
  { id: 'pointRadius', label: 'radius',  min: 2, max: 20, step: 1,    default: 8 },
  { id: 'showLabels',  label: 'labels',  min: 0, max: 1,  step: 1,    default: 1 },
];

const ZOOM_SLIDER = { id: 'zoom', label: 'zoom', min: 0.1, max: 4, step: 0.01, default: 1 };

function ribbonSections({ zoom = false } = {}) {
  const sections = [
    { group: 'Ribbon',   id: 'ribbon',   abbrev: 'Rib',  sliders: RIBBON_CORE_SLIDERS },
    { group: 'Features', id: 'features', abbrev: 'Ftr',  sliders: FEATURES_SLIDERS },
    { group: 'Points',   id: 'points',   abbrev: 'Pts',  sliders: POINTS_SLIDERS },
  ];
  if (zoom) {
    sections.push({ group: 'View', id: 'view', abbrev: 'View', sliders: [ZOOM_SLIDER] });
  }
  return sections;
}


// ═══════════════════════════════════════════════════════
//  PRESETS + DEFAULTS
// ═══════════════════════════════════════════════════════

const RIBBON_PRESETS = {
  'Ribbon': { ribbonWidth: 24, ribbonAngle: 15, splineMode: 0, showSegments: 1, showFill: 0, showBars: 0, showTangents: 0, showRibbonFill: 0, endJoin: 0, polygonWidth: 0, showPoints: 1, pointRadius: 8, showLabels: 1, fillOpacity: 0.7, strokeWidth: 1.5 },
  'Wire':   { ribbonWidth: 4,  ribbonAngle: 20, splineMode: 0, showSegments: 1, showFill: 0, showBars: 0, showTangents: 1, showRibbonFill: 0, endJoin: 0, polygonWidth: 1, showPoints: 1, pointRadius: 6, showLabels: 1, fillOpacity: 0.3, strokeWidth: 1 },
  'Tube':   { ribbonWidth: 50, ribbonAngle: 10, splineMode: 0, showSegments: 0, showFill: 0, showBars: 0, showTangents: 0, showRibbonFill: 1, endJoin: 0, polygonWidth: 0, showPoints: 1, pointRadius: 10, showLabels: 0, fillOpacity: 0.85, strokeWidth: 2 },
  'Spline': { ribbonWidth: 28, ribbonAngle: 12, splineMode: 1, showSegments: 1, showFill: 0, showBars: 0, showTangents: 0, showRibbonFill: 0, endJoin: 0, polygonWidth: 0, showPoints: 1, pointRadius: 8, showLabels: 1, fillOpacity: 0.6, strokeWidth: 1.5 },
  'Debug':  { ribbonWidth: 20, ribbonAngle: 15, splineMode: 0, showSegments: 1, showFill: 1, showBars: 1, showTangents: 1, showRibbonFill: 0, endJoin: 0, polygonWidth: 1, showPoints: 1, pointRadius: 8, showLabels: 1, fillOpacity: 0.5, strokeWidth: 1 },
  'Loop':   { ribbonWidth: 20, ribbonAngle: 15, splineMode: 0, showSegments: 1, showFill: 1, showBars: 0, showTangents: 0, showRibbonFill: 0, endJoin: 1, polygonWidth: 0, showPoints: 1, pointRadius: 8, showLabels: 1, fillOpacity: 0.6, strokeWidth: 1.5 },
};

const RIBBON_DEFAULTS = { ...RIBBON_PRESETS['Ribbon'], ribbonColor: '#4fc3f7', ribbonOutline: '#ffffff44' };


// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function makeRibbonPoints(pts, uidPrefix = 'rp') {
  return pts.map((p, i) =>
    new MiniAstNode('ribbon-point', [], {
      uid: p.uid || `${uidPrefix}${i}`,
      x: p.x, y: p.y,
      name: p.name || String.fromCharCode(65 + i),
      color: p.color || PT_COLORS[i % PT_COLORS.length],
      emoji: p.emoji || null,
    }));
}

/** Find the ribbon node inside a layer's subtree. */
function findRibbon(layer) {
  return findByToken(layer, 'ribbon');
}


// ═══════════════════════════════════════════════════════
//  TWIG PROTOCOL — ribbon points
// ═══════════════════════════════════════════════════════

/**
 * Default ops for ribbon layers via createLayerOps.
 * Items are ribbon-point nodes inside the ribbon container.
 */
const ribbonOps = createLayerOps({
  itemToken: 'ribbon-point',

  getContainer: findRibbon,

  createItem(layer, index, _app) {
    const ribbon = findRibbon(layer);
    const pts    = ribbon?.subtree || [];
    const lastPt = pts[pts.length - 1];

    // Place new point offset from the last one
    const x = (lastPt?.value?.x ?? 0) + 60;
    const y = (lastPt?.value?.y ?? 0);

    // Stable uid from layer counter
    const counter = layer.value._uidCounter || pts.length;
    layer.value._uidCounter = counter + 1;

    return new MiniAstNode('ribbon-point', [], {
      uid:   `rp${counter}`,
      x, y,
      name:  String.fromCharCode(65 + (index % 26)),
      color: PT_COLORS[index % PT_COLORS.length],
      emoji: null,
    });
  },

  getDisplayName: (item) => item.value?.name || '?',
});


// ═══════════════════════════════════════════════════════
//  ITEM FIELDS — per-point editing (name, color)
// ═══════════════════════════════════════════════════════

/** Resolve the selected ribbon-point from the selection buffer. */
function resolveRibbonPoint(layer, app) {
  const ribbon = findRibbon(layer);
  if (!ribbon) return null;
  const buf = app?._selectionBuffer || [];
  for (let i = buf.length - 1; i >= 0; i--) {
    const entry = buf[i];
    if (entry.node?.token === 'ribbon-point' &&
        ribbon.subtree?.includes(entry.node)) {
      return entry.node;
    }
  }
  return null;
}

function createRibbonItemFields() {
  return createItemFields({
    id: 'point-props', label: 'Point', abbrev: 'Pt',
    fields: [
      { key: 'name',  label: 'Name',  type: 'text', placeholder: 'Name' },
      { key: 'emoji', label: 'Emoji', type: 'text', placeholder: 'emoji' },
      { key: 'color', label: 'Color', type: 'color', default: '#4fc3f7' },
    ],
    resolve: resolveRibbonPoint,
  });
}


// ═══════════════════════════════════════════════════════
//  STANDALONE SCENES
// ═══════════════════════════════════════════════════════

function ribbonBuildUI() {
  return ribbonSections({ zoom: true });
}

function createRibbonScene(points, name) {
  const ribbon    = new MiniAstNode('ribbon', makeRibbonPoints(points));
  const layer     = new MiniAstNode('layer', [ribbon], {
    name, visible: true, center: true,
    params: { ...RIBBON_DEFAULTS, panX: 0, panY: 0 },
  });
  layer.inst = { buildUI: ribbonBuildUI, presets: RIBBON_PRESETS };
  return new MiniAstNode('scene-root', [layer]);
}

function scurve() {
  return [
    { x: -250, y: 30 }, { x: -140, y: -100 }, { x: -30, y: 60 },
    { x: 80, y: -70 },  { x: 190, y: 90 },    { x: 300, y: -20 },
  ];
}

function circlePoints(n, r = 160) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r), name: String(i + 1) };
  });
}

function wavePoints(n, amp = 80, spread = 44) {
  const half = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round((i - half) * spread), y: Math.round(Math.sin(i * 0.8) * amp), name: String(i + 1),
  }));
}

SCENES.push(
  { id: 'ribbon-s',      label: 'S-Curve (6pt)', group: 'Ribbon', hasLayers: false, create: () => createRibbonScene(scurve(), 'S-Curve') },
  { id: 'ribbon-circle', label: 'Circle (8pt)',  group: 'Ribbon', hasLayers: false, create: () => createRibbonScene(circlePoints(8), 'Circle') },
  { id: 'ribbon-wave',   label: 'Wave (14pt)',   group: 'Ribbon', hasLayers: false, create: () => createRibbonScene(wavePoints(14), 'Wave') },
);


// ═══════════════════════════════════════════════════════
//  RIBBON ADDABLE (draggable points, no handle-frame)
// ═══════════════════════════════════════════════════════

const DEFAULT_ADDABLE_PTS = [
  { x: -120, y:  30 },
  { x:  -40, y: -50 },
  { x:   40, y:  40 },
  { x:  120, y: -20 },
];

function ribbonAddableBuildUI() {
  return ribbonSections({ zoom: false });
}

const RIBBON_ADDABLE = {
  id:            'ribbon-full',
  label:         'Ribbon',
  selectionSize: 1,
  refCount:      0,
  buildUI:       ribbonAddableBuildUI,
  presets:       RIBBON_PRESETS,

  /** Create a single ribbon item with default control points. */
  createItem(index = 0) {
    const offset = index * 30;
    const pts = DEFAULT_ADDABLE_PTS.map(p => ({ x: p.x + offset, y: p.y + offset }));
    return new MiniAstNode('ribbon', makeRibbonPoints(pts));
  },

  /** Create a new layer containing one ribbon. */
  create() {
    const itemFields = createRibbonItemFields();

    const layer = new MiniAstNode('layer', [this.createItem(0)], {
      name:      'Ribbon',
      layerType: 'ribbon-full',
      visible:   true,
      _uidCounter: 4,
      params:    { ...RIBBON_DEFAULTS },
    });
    layer.inst = {
      buildUI:       ribbonAddableBuildUI,
      presets:       RIBBON_PRESETS,
      selectionSize: 1,
      refCount:      0,
      itemFields:    itemFields,
      // Twig protocol
      addItem:       ribbonOps.addItem,
      removeItem:    ribbonOps.removeItem,
      selectionInfo: ribbonOps.selectionInfo,
    };
    return layer;
  },
};

ADDABLES.push(RIBBON_ADDABLE);
