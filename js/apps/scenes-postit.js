/**
 * scenes-postit.js
 *
 * Addable declaration for post-it notes.
 * Each post-it is a handle-frame (draggable, resizable) containing
 * a postit-node (visual background) containing a jatex child (text).
 *
 * Tree:
 *   handle-frame  (draggable: true)
 *     drag-point  ⌜
 *     drag-point  ⌟
 *     postit-node
 *       jatex
 */

import { MiniAstNode, ADDABLES } from '../omni-support/scene.js';
import { createItemFields }      from '../omni-support/item-fields.js';
import { findByToken }           from '../omni-support/layer-ops.js';
import { JatexNode }             from '../nodes2d/jatex-node.js';
import '../nodes2d/postit-node.js';
import '../nodes2d/ribbon-node.js';

// ═══════════════════════════════════════════════════════
//  SLIDER SECTIONS
// ═══════════════════════════════════════════════════════

const NOTE_SLIDERS = [
  { id: 'noteColor',      label: 'color',       type: 'color', default: '#ffeaa7' },
  { id: 'foldSize',       label: 'fold',         min: 0,   max: 30,  step: 1,    default: 15 },
  { id: 'pinSize',        label: 'pin size',     min: 0,   max: 15,  step: 1,    default: 0 },
  { id: 'pinColor',       label: 'pin color',    type: 'color', default: '#e74c3c' },
  { id: 'pointRadius',    label: 'handles',      min: 2,   max: 15,  step: 1,    default: 5 },
];

const LINE_Y_SLIDERS = [
  { id: 'lineSpacingY',   label: 'H spacing',    min: 0,   max: 100, step: 1,    default: 25 },
  { id: 'lineWidthY',     label: 'H width',      min: 0,   max: 3,   step: 0.2,  default: 0.4 },
];

const LINE_X_SLIDERS = [
  { id: 'lineSpacingX',   label: 'V spacing',    min: 0,   max: 100, step: 1,    default: 0 },
  { id: 'lineWidthX',     label: 'V width',      min: 0,   max: 3,   step: 0.2,  default: 0 },
];

const LINE_COLOR_SLIDERS = [
  { id: 'lineColor',      label: 'line color',   type: 'color', default: '#00000018' },
];

const SHADOW_SLIDERS = [
  { id: 'noteShadowBlur', label: 'shadow blur',  min: 0,   max: 20,  step: 1,    default: 8 },
  { id: 'noteShadowOffX', label: 'shadow X',     min: -10, max: 10,  step: 0.5,  default: 2 },
  { id: 'noteShadowOffY', label: 'shadow Y',     min: -10, max: 10,  step: 0.5,  default: 3 },
];

function postitBuildUI() {
  return [
    { group: 'Note',       id: 'note',      abbrev: 'Not', sliders: NOTE_SLIDERS },
    { group: 'H Lines',    id: 'hlines',    abbrev: 'HLn', sliders: LINE_Y_SLIDERS },
    { group: 'V Lines',    id: 'vlines',    abbrev: 'VLn', sliders: LINE_X_SLIDERS },
    { group: 'Line Color', id: 'linecol',   abbrev: 'LCl', sliders: LINE_COLOR_SLIDERS },
    { group: 'Shadow',     id: 'shadow',    abbrev: 'Shd', sliders: SHADOW_SLIDERS },
  ];
}

// ═══════════════════════════════════════════════════════
//  PRESETS
// ═══════════════════════════════════════════════════════

const POSTIT_PRESETS = {
  'Classic Yellow': {
    noteColor: '#ffeaa7', foldSize: 15, pinSize: 0,
    lineSpacingY: 25, lineWidthY: 0.4, lineSpacingX: 0, lineWidthX: 0,
    lineColor: '#00000018', noteShadowBlur: 8, noteShadowOffX: 2, noteShadowOffY: 3,
  },
  'Pink': {
    noteColor: '#fab1a0', foldSize: 12, pinSize: 0,
    lineSpacingY: 20, lineWidthY: 0.3, lineSpacingX: 0, lineWidthX: 0,
    lineColor: '#00000015', noteShadowBlur: 8, noteShadowOffX: 2, noteShadowOffY: 3,
  },
  'Blue': {
    noteColor: '#74b9ff', foldSize: 12, pinSize: 0,
    lineSpacingY: 22, lineWidthY: 0.3, lineSpacingX: 0, lineWidthX: 0,
    lineColor: '#00000018', noteShadowBlur: 8, noteShadowOffX: 2, noteShadowOffY: 3,
  },
  'Green': {
    noteColor: '#55efc4', foldSize: 10, pinSize: 0,
    lineSpacingY: 24, lineWidthY: 0.3, lineSpacingX: 0, lineWidthX: 0,
    lineColor: '#00000015', noteShadowBlur: 8, noteShadowOffX: 2, noteShadowOffY: 3,
  },
  'Lined': {
    noteColor: '#ffeaa7', foldSize: 15, pinSize: 0,
    lineSpacingY: 18, lineWidthY: 0.6, lineSpacingX: 0, lineWidthX: 0,
    lineColor: '#0000ff20', noteShadowBlur: 8, noteShadowOffX: 2, noteShadowOffY: 3,
  },
  'Grid': {
    noteColor: '#fffef2', foldSize: 0, pinSize: 0,
    lineSpacingY: 20, lineWidthY: 0.3, lineSpacingX: 20, lineWidthX: 0.3,
    lineColor: '#00000012', noteShadowBlur: 6, noteShadowOffX: 1, noteShadowOffY: 2,
  },
  'Graph Paper': {
    noteColor: '#fffef2', foldSize: 0, pinSize: 0,
    lineSpacingY: 10, lineWidthY: 0.2, lineSpacingX: 10, lineWidthX: 0.2,
    lineColor: '#0066aa18', noteShadowBlur: 6, noteShadowOffX: 1, noteShadowOffY: 2,
  },
  'Pinned': {
    noteColor: '#ffeaa7', foldSize: 0, pinSize: 8,
    lineSpacingY: 25, lineWidthY: 0.4, lineSpacingX: 0, lineWidthX: 0,
    lineColor: '#00000018', noteShadowBlur: 10, noteShadowOffX: 2, noteShadowOffY: 4,
  },
  'Plain': {
    noteColor: '#ffeaa7', foldSize: 12, pinSize: 0,
    lineSpacingY: 0, lineWidthY: 0, lineSpacingX: 0, lineWidthX: 0,
    lineColor: '#00000018', noteShadowBlur: 8, noteShadowOffX: 2, noteShadowOffY: 3,
  },
};


// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function resolvePostitNode(layer, app) {
  const buf = app?._selectionBuffer || [];
  // Match handle-frame (the direct layer child)
  for (const entry of buf) {
    const n = entry.node;
    if (n?.token === 'handle-frame' && layer.subtree?.includes(n)) {
      return n;
    }
  }
  // Also match if a drag-point inside a handle-frame was selected
  for (const entry of buf) {
    const n = entry.item || entry.node;
    if (n?.token === 'handle-frame' && layer.subtree?.includes(n)) {
      return n;
    }
  }
  const items = (layer.subtree || []).filter(n => n.token === 'handle-frame');
  return items.length ? items[items.length - 1] : null;
}

/** Default jatex text for new post-its. */
const DEFAULT_TEXTS = [
  '\\nabla\\times\\nabla',
  '\\alpha\\beta\\gamma',
  '\\int\\Sigma\\infty',
  '\\lambda\\delta\\omega',
  '\\Phi\\Psi\\Omega',
];


// ═══════════════════════════════════════════════════════
//  ADDABLE
// ═══════════════════════════════════════════════════════

function makePostit(uid, x, y, text) {
  const jatex = new MiniAstNode('jatex', [], { text });
  JatexNode._wire(jatex);

  const postit = new MiniAstNode('postit-node', [jatex], {});

  return new MiniAstNode('handle-frame', [
    new MiniAstNode('drag-point', [], {
      x: x - 60, y: y - 60, name: '⌜', color: '#00000033',
    }),
    new MiniAstNode('drag-point', [], {
      x: x + 60, y: y + 60, name: '⌟', color: '#00000033',
    }),
    postit,
  ], { draggable: true, stretchContent: true });
}

const POSTIT_ADDABLE = {
  id:    'postit',
  label: 'Post-it',

  createItem(index = 0) {
    const angle  = index * 2.399;
    const radius = 50 + index * 35;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const text = DEFAULT_TEXTS[index % DEFAULT_TEXTS.length];
    return makePostit('pst' + index, x, y, text);
  },

  create(app) {
    const name = app?._nextNetworkName?.() || '1';

    // ── JaTeX sub-layer (no handle-frame — postit controls sizing) ──
    const jatex = new MiniAstNode('jatex', [], { text: DEFAULT_TEXTS[0] });
    JatexNode._wire(jatex);

    const jatexFields = createItemFields({
      id: 'jatex-input', label: 'JaTeX Input', abbrev: 'In',
      fields: [{ key: 'text', type: 'textarea', placeholder: 'Enter JaTeX…' }],
      resolve: (layer) => findByToken(layer, 'jatex'),
      onChange: (node, key, value) => {
        if (key === 'text' && JatexNode?._rewire) JatexNode._rewire(node, value);
      },
    });

    const jatexLayer = new MiniAstNode('layer', [jatex], {
      name:      'JaTeX',
      layerType: 'jatex',
      visible:   true,
      params:    { valign: 0.5, halign: 0.5, baseline: 0.5 },
    });
    jatexLayer.inst = {
      buildUI: () => [{
        group: 'Jatex', id: 'jatex', abbrev: 'Jtx',
        sliders: [
          { id: 'valign',   label: 'valign',   min: 0, max: 1, step: 0.01, default: 0.5 },
          { id: 'halign',   label: 'halign',   min: 0, max: 1, step: 0.01, default: 0.5 },
          { id: 'baseline', label: 'baseline', min: 0, max: 1, step: 0.01, default: 0.5 },
        ],
      }],
      presets:       { Standard: { valign: 0.5, halign: 0.5, baseline: 0.5 } },
      selectionSize: 1,
      refCount:      0,
      itemFields:    jatexFields,
    };

    // ── Postit visual with jatex sub-layer inside ──
    const postit = new MiniAstNode('postit-node', [jatexLayer], {});

    const hf = new MiniAstNode('handle-frame', [
      new MiniAstNode('drag-point', [], {
        x: -60, y: -60, name: '⌜', color: '#00000033',
      }),
      new MiniAstNode('drag-point', [], {
        x: 60, y: 60, name: '⌟', color: '#00000033',
      }),
      postit,
    ], { draggable: true, stretchContent: true });

    // ── Postit layer fields (for the postit itself, not the jatex) ──
    const nodeFields = createItemFields({
      id: 'postit-props', label: 'Post-it', abbrev: 'Pst',
      fields: [
        { key: 'name', label: 'Name', type: 'text', placeholder: 'Post-it' },
      ],
      resolve: resolvePostitNode,
    });

    const layer = new MiniAstNode('layer', [hf], {
      name:         `Post-it ${name}`,
      layerType:    'postit',
      visible:      true,
      center:       false,
      _uidCounter:  1,
      _nameCounter: 1,
      params:       { ...POSTIT_PRESETS['Classic Yellow'], pointRadius: 5 },
    });

    layer.inst = {
      buildUI:       postitBuildUI,
      presets:       POSTIT_PRESETS,
      selectionSize: 1,
      refCount:      0,
      itemFields:    nodeFields,
      addables:      ['jatex', 'chart', 'ribbon-full'],
      /** Sub-layers go inside the postit-node so they move with it. */
      getContentParent(layer) {
        const hf = layer.subtree?.find(n => n.token === 'handle-frame');
        if (!hf) return layer;
        return hf.subtree?.find(n => n.token === 'postit-node') || layer;
      },
    };

    return [layer];
  },
};

ADDABLES.push(POSTIT_ADDABLE);