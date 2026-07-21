/**
 * scenes-frame.js  — v4
 *
 * Fixes from v3:
 *   - Added createItem(count) so the + button creates new frames
 *     at offset positions (golden-angle spiral).
 */

import { MiniAstNode, ADDABLES } from '../omni-support/scene.js';
import { createItemFields }      from '../omni-support/item-fields.js';
import '../nodes2d/frame-node.js';
import '../nodes2d/button-node.js';
import '../nodes2d/ribbon-node.js';

// ═══════════════════════════════════════════════════════
//  SLIDER SECTIONS
// ═══════════════════════════════════════════════════════

const EDGE_SLIDERS = [
  { id: 'edgeCount',        label: 'count',         min: 3,   max: 60,  step: 1,    default: 24 },
  { id: 'edgeDepth',        label: 'depth',          min: 0,   max: 20,  step: 0.5,  default: 6 },
  { id: 'edgeSections',     label: 'sections',       min: 1,   max: 8,   step: 1,    default: 4 },
  { id: 'edgeCurviness',    label: 'curviness',      min: 0,   max: 1,   step: 0.01, default: 0.8 },
  { id: 'edgeFlats',        label: 'flats',           min: 0,   max: 1,   step: 0.01, default: 0.0 },
  { id: 'edgeRegularity',   label: 'regularity',     min: 0,   max: 1,   step: 0.01, default: 1.0 },
  { id: 'edgeCornerRadius', label: 'corner radius',   min: 0,   max: 60,  step: 1,    default: 0 },
  { id: 'edgeSeed',         label: 'seed',             min: 0,   max: 99,  step: 1,    default: 0 },
];

const FRAME_SURFACE_SLIDERS = [
  { id: 'frameFill',        label: 'fill',         type: 'color', default: '#faf8f2' },
  { id: 'frameStroke',      label: 'stroke',       type: 'color', default: '#b8b4a8' },
  { id: 'frameStrokeWidth', label: 'stroke width', min: 0,   max: 6,   step: 0.5,  default: 1.5 },
  { id: 'framePadding',     label: 'padding',      min: 0,   max: 40,  step: 1,    default: 12 },
];

const FRAME_SHADOW_SLIDERS = [
  { id: 'frameShadowBlur',    label: 'shadow blur', min: 0,  max: 30, step: 1,   default: 8 },
  { id: 'frameShadowOffsetX', label: 'shadow X',    min: -10, max: 10, step: 0.5, default: 2 },
  { id: 'frameShadowOffsetY', label: 'shadow Y',    min: -10, max: 10, step: 0.5, default: 3 },
  { id: 'frameShadowColor',   label: 'shadow color', type: 'color', default: '#00000038' },
];

function frameBuildUI() {
  return [
    { group: 'Edge',    id: 'edge',    abbrev: 'Edg', sliders: EDGE_SLIDERS },
    { group: 'Frame',   id: 'frame',   abbrev: 'Frm', sliders: FRAME_SURFACE_SLIDERS },
    { group: 'Shadow',  id: 'shadow',  abbrev: 'Shd', sliders: FRAME_SHADOW_SLIDERS },
  ];
}

// ═══════════════════════════════════════════════════════
//  PRESETS
// ═══════════════════════════════════════════════════════

const FRAME_PRESETS = {
  'Postage Stamp': {
    edgeCount: 28, edgeDepth: 5, edgeSections: 6, edgeCurviness: 1.0,
    edgeFlats: 0.55, edgeRegularity: 1.0, edgeCornerRadius: 4, edgeSeed: 0,
    frameFill: '#faf8f2', frameStroke: '#b8b4a8', frameStrokeWidth: 1.5, framePadding: 14,
    frameShadowBlur: 8, frameShadowOffsetX: 2, frameShadowOffsetY: 3, frameShadowColor: '#00000038',
  },
  'Wax Seal': {
    edgeCount: 18, edgeDepth: 9, edgeSections: 5, edgeCurviness: 0.9,
    edgeFlats: 0, edgeRegularity: 0.0, edgeCornerRadius: 30, edgeSeed: 42,
    frameFill: '#c0392b', frameStroke: '#922b21', frameStrokeWidth: 1, framePadding: 18,
    frameShadowBlur: 12, frameShadowOffsetX: 2, frameShadowOffsetY: 4, frameShadowColor: '#00000055',
  },
  'Zigzag': {
    edgeCount: 36, edgeDepth: 5, edgeSections: 1, edgeCurviness: 0.0,
    edgeFlats: 0, edgeRegularity: 1.0, edgeCornerRadius: 0, edgeSeed: 0,
    frameFill: '#fce4ec', frameStroke: '#e91e63', frameStrokeWidth: 1, framePadding: 10,
    frameShadowBlur: 6, frameShadowOffsetX: 1, frameShadowOffsetY: 2, frameShadowColor: '#00000030',
  },
  'Battlements': {
    edgeCount: 16, edgeDepth: 10, edgeSections: 2, edgeCurviness: 0.0,
    edgeFlats: 0.45, edgeRegularity: 1.0, edgeCornerRadius: 0, edgeSeed: 0,
    frameFill: '#d5c4a1', frameStroke: '#8b7355', frameStrokeWidth: 2, framePadding: 14,
    frameShadowBlur: 10, frameShadowOffsetX: 3, frameShadowOffsetY: 5, frameShadowColor: '#00000044',
  },
  'Torn Paper': {
    edgeCount: 50, edgeDepth: 4, edgeSections: 3, edgeCurviness: 0.5,
    edgeFlats: 0, edgeRegularity: 0.1, edgeCornerRadius: 2, edgeSeed: 17,
    frameFill: '#fffef9', frameStroke: '#e0ddd4', frameStrokeWidth: 0.5, framePadding: 10,
    frameShadowBlur: 6, frameShadowOffsetX: 1, frameShadowOffsetY: 2, frameShadowColor: '#00000025',
  },
  'Doily': {
    edgeCount: 20, edgeDepth: 14, edgeSections: 6, edgeCurviness: 1.0,
    edgeFlats: 0.35, edgeRegularity: 1.0, edgeCornerRadius: 12, edgeSeed: 0,
    frameFill: '#ffffff', frameStroke: '#ddd', frameStrokeWidth: 1, framePadding: 18,
    frameShadowBlur: 6, frameShadowOffsetX: 1, frameShadowOffsetY: 2, frameShadowColor: '#00000020',
  },
  'Cloud': {
    edgeCount: 12, edgeDepth: 16, edgeSections: 7, edgeCurviness: 1.0,
    edgeFlats: 0.3, edgeRegularity: 0.65, edgeCornerRadius: 20, edgeSeed: 33,
    frameFill: '#ecf0f1', frameStroke: '#bdc3c7', frameStrokeWidth: 1.5, framePadding: 22,
    frameShadowBlur: 14, frameShadowOffsetX: 2, frameShadowOffsetY: 4, frameShadowColor: '#00000030',
  },
  'Gear': {
    edgeCount: 18, edgeDepth: 8, edgeSections: 2, edgeCurviness: 0.0,
    edgeFlats: 0.5, edgeRegularity: 1.0, edgeCornerRadius: 8, edgeSeed: 0,
    frameFill: '#95a5a6', frameStroke: '#7f8c8d', frameStrokeWidth: 2, framePadding: 12,
    frameShadowBlur: 8, frameShadowOffsetX: 2, frameShadowOffsetY: 3, frameShadowColor: '#00000044',
  },
  'Pill Scallop': {
    edgeCount: 32, edgeDepth: 4, edgeSections: 6, edgeCurviness: 1.0,
    edgeFlats: 0.5, edgeRegularity: 1.0, edgeCornerRadius: 60, edgeSeed: 0,
    frameFill: '#e8f5e9', frameStroke: '#66bb6a', frameStrokeWidth: 2, framePadding: 16,
    frameShadowBlur: 8, frameShadowOffsetX: 2, frameShadowOffsetY: 3, frameShadowColor: '#00000030',
  },
  'Ticket': {
    edgeCount: 24, edgeDepth: 6, edgeSections: 5, edgeCurviness: 0.9,
    edgeFlats: 0.65, edgeRegularity: 1.0, edgeCornerRadius: 6, edgeSeed: 0,
    frameFill: '#fff8e1', frameStroke: '#f9a825', frameStrokeWidth: 1.5, framePadding: 14,
    frameShadowBlur: 6, frameShadowOffsetX: 1, frameShadowOffsetY: 2, frameShadowColor: '#00000030',
  },
  'Hexagonal': {
    edgeCount: 20, edgeDepth: 7, edgeSections: 3, edgeCurviness: 0.0,
    edgeFlats: 0.1, edgeRegularity: 1.0, edgeCornerRadius: 4, edgeSeed: 0,
    frameFill: '#e3f2fd', frameStroke: '#42a5f5', frameStrokeWidth: 1.5, framePadding: 12,
    frameShadowBlur: 8, frameShadowOffsetX: 2, frameShadowOffsetY: 3, frameShadowColor: '#00000035',
  },
};


// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function resolveFrameNode(layer, app) {
  const buf = app?._selectionBuffer || [];
  for (const entry of buf) {
    if (entry.node?.token === 'stamp-frame' && layer.subtree?.includes(entry.node)) {
      return entry.node;
    }
  }
  const frames = (layer.subtree || []).filter(n => n.token === 'stamp-frame');
  return frames.length ? frames[frames.length - 1] : null;
}

/** Pick from a rotating set of kanji for new frames. */
const KANJI_SETS = [
  [{ l: '山', s: 'やま' }, { l: '川', s: 'かわ' }, { l: '火', s: 'ひ'   }],
  [{ l: '月', s: 'つき' }, { l: '日', s: 'ひ'   }, { l: '木', s: 'き'   }],
  [{ l: '風', s: 'かぜ' }, { l: '雨', s: 'あめ' }, { l: '雪', s: 'ゆき' }],
  [{ l: '花', s: 'はな' }, { l: '鳥', s: 'とり' }, { l: '魚', s: 'うお' }],
  [{ l: '空', s: 'そら' }, { l: '海', s: 'うみ' }, { l: '森', s: 'もり' }],
];


// ═══════════════════════════════════════════════════════
//  ADDABLE
// ═══════════════════════════════════════════════════════

const FRAME_ADDABLE = {
  id:    'frame',
  label: 'Frame',

  /**
   * Create a new stamp-frame for the + button.
   * Called by addItemToLayer(layer) with count = existing items.
   */
  createItem(count) {
    const uid = 'frm' + count;

    // Spiral offset so new frames don't stack
    const angle  = count * 2.399;      // golden angle
    const radius = 60 + count * 40;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    // Rotate through kanji sets
    const kanji   = KANJI_SETS[count % KANJI_SETS.length];
    const spacing = 80;
    const startX  = -((kanji.length - 1) * spacing) / 2;

    const children = kanji.map((k, i) =>
      new MiniAstNode('button-node', [], {
        uid:    `${uid}b${i}`,
        name:   k.l,
        label:  k.l,
        sub:    k.s,
        x:      startX + i * spacing,
        y:      0,
        width:  64,
        height: 64,
      })
    );

    return new MiniAstNode('stamp-frame', children, {
      uid:    `${uid}f`,
      name:   `Frame ${count + 1}`,
      x, y,
      width:  kanji.length * spacing + 60,
      height: 110,
    });
  },

  /** Initial layer creation (from the Add bar). */
  create(app) {
    const frameName = app?._nextNetworkName?.() || '1';

    // Create initial button-grid sub-layer via the addable
    const bgDef    = ADDABLES.find(a => a.id === 'button-grid');
    const bgResult = bgDef?.create(app);
    const bgLayer  = bgResult
      ? (Array.isArray(bgResult) ? bgResult[0] : bgResult)
      : null;

    const frame = new MiniAstNode('stamp-frame',
      bgLayer ? [bgLayer] : [],
      {
        uid:    'frm' + frameName.toLowerCase() + 'f0',
        name:   `Frame ${frameName}`,
        x:      0,
        y:      0,
        width:  300,
        height: 110,
      });

    const nodeFields = createItemFields({
      id: 'frame-props', label: 'Frame', abbrev: 'Frm',
      fields: [
        { key: 'name',   label: 'Name',   type: 'text',   placeholder: 'Frame' },
        { key: 'color',  label: 'Color',  type: 'color',  default: '#faf8f2' },
        { key: 'width',  label: 'Width',  type: 'number', default: 300, min: 60, max: 800 },
        { key: 'height', label: 'Height', type: 'number', default: 110, min: 40, max: 600 },
      ],
      resolve: resolveFrameNode,
    });

    const layer = new MiniAstNode('layer', [frame], {
      name:         `Frame ${frameName}`,
      layerType:    'frame',
      visible:      true,
      center:       false,
      _uidCounter:  1,
      _nameCounter: 1,
      params:       { ...FRAME_PRESETS['Postage Stamp'] },
    });

    layer.inst = {
      buildUI:       frameBuildUI,
      presets:       FRAME_PRESETS,
      selectionSize: 1,
      refCount:      0,
      itemFields:    nodeFields,
      addables:      ['button-grid', 'chart', 'ribbon-full'],
      /** Sub-layers go inside the stamp-frame so they move with it. */
      getContentParent(layer) {
        return layer.subtree?.find(n => n.token === 'stamp-frame') || layer;
      },
    };

    return [layer];
  },
};

ADDABLES.push(FRAME_ADDABLE);