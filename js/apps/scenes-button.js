/**
 * scenes-button.js
 *
 * Addable declaration for button-node objects in OmniScene.
 * Registers a "Button Grid" addable that creates a single layer
 * of draggable button-nodes with full bevel / lighting controls.
 */

import { MiniAstNode, ADDABLES } from '../omni-support/scene.js';
import { createItemFields }      from '../omni-support/item-fields.js';
import { createLayerOps }        from '../omni-support/layer-ops.js';
import '../nodes2d/button-node.js';

// ═══════════════════════════════════════════════════════
//  SLIDER SECTIONS
// ═══════════════════════════════════════════════════════

const SURFACE_SLIDERS = [
  { id: 'fill',           label: 'fill',            type: 'color',  default: '#e0ddd4' },
  { id: 'color',          label: 'text color',      type: 'color',  default: '#2a2a2a' },
  { id: 'cornerRadius',   label: 'corner radius',   min: 0,   max: 40,   step: 1,    default: 12 },
  { id: 'borderWidth',    label: 'border width',    min: 0,   max: 8,    step: 0.5,  default: 2.5 },
];

const BEVEL_SLIDERS = [
  { id: 'bevel',          label: 'bevel',           min: -1,  max: 1,    step: 1,    default: 1 },
  { id: 'bevelStrength',  label: 'bevel strength',  min: 0,   max: 1,    step: 0.01, default: 0.38 },
  { id: 'lightAngle',     label: 'light angle',     min: 0,   max: 360,  step: 1,    default: 315 },
  { id: 'lightIntensity', label: 'light intensity', min: 0,   max: 1,    step: 0.01, default: 0.55 },
];

const SHADOW_SLIDERS = [
  { id: 'shadowBlur',     label: 'shadow blur',     min: 0,   max: 30,   step: 1,    default: 6 },
  { id: 'shadowOffsetX',  label: 'shadow X',        min: -10, max: 10,   step: 0.5,  default: 2 },
  { id: 'shadowOffsetY',  label: 'shadow Y',        min: -10, max: 10,   step: 0.5,  default: 3 },
  { id: 'shadowColor',    label: 'shadow color',    type: 'color',  default: '#00000047' },
];

const TYPOGRAPHY_SLIDERS = [
  { id: 'fontSize',       label: 'font size',       min: 8,   max: 72,   step: 1,    default: 32 },
  { id: 'subOffset',      label: 'sub offset',      min: -10, max: 20,   step: 1,    default: 0 },
];

const INTERACTION_SLIDERS = [
  { id: 'hoverScale',     label: 'hover scale',     min: 1,   max: 1.3,  step: 0.01, default: 1.08 },
  { id: 'hoverLift',      label: 'hover lift',      min: -8,  max: 0,    step: 0.5,  default: -2 },
  { id: 'pressScale',     label: 'press scale',     min: 0.85, max: 1,   step: 0.01, default: 0.96 },
  { id: 'pressDepth',     label: 'press depth',     min: 0,   max: 4,    step: 0.5,  default: 1 },
];

function buttonBuildUI() {
  return [
    { group: 'Surface',     id: 'surface',     abbrev: 'Srf', sliders: SURFACE_SLIDERS },
    { group: 'Bevel',       id: 'bevel',       abbrev: 'Bvl', sliders: BEVEL_SLIDERS },
    { group: 'Shadow',      id: 'shadow',      abbrev: 'Shd', sliders: SHADOW_SLIDERS },
    { group: 'Typography',  id: 'typography',  abbrev: 'Typ', sliders: TYPOGRAPHY_SLIDERS },
    { group: 'Interaction', id: 'interaction', abbrev: 'Int', sliders: INTERACTION_SLIDERS },
  ];
}

// ═══════════════════════════════════════════════════════
//  PRESETS
// ═══════════════════════════════════════════════════════

const BUTTON_PRESETS = {
  'Default': {
    fill: '#e0ddd4', color: '#2a2a2a', cornerRadius: 12, borderWidth: 2.5,
    bevel: 1, bevelStrength: 0.38, lightAngle: 315, lightIntensity: 0.55,
    shadowBlur: 6, shadowOffsetX: 2, shadowOffsetY: 3, shadowColor: '#00000047',
    fontSize: 32, subOffset: 0,
  },
  'Kanji Stone': {
    fill: '#d6d2c8', color: '#333333', cornerRadius: 10, borderWidth: 3,
    bevel: 1, bevelStrength: 0.45, lightAngle: 315, lightIntensity: 0.6,
    shadowBlur: 8, shadowOffsetX: 2, shadowOffsetY: 4, shadowColor: '#00000055',
    fontSize: 36, subOffset: 0,
  },
  'Kanji Inset': {
    fill: '#c8c4ba', color: '#444444', cornerRadius: 10, borderWidth: 3,
    bevel: -1, bevelStrength: 0.48, lightAngle: 315, lightIntensity: 0.6,
    shadowBlur: 4, shadowOffsetX: 1, shadowOffsetY: 2, shadowColor: '#00000040',
    fontSize: 36, subOffset: 0,
  },
  'Flat': {
    fill: '#e0ddd4', color: '#2a2a2a', cornerRadius: 12, borderWidth: 1,
    bevel: 0, bevelStrength: 0, lightAngle: 315, lightIntensity: 0,
    shadowBlur: 4, shadowOffsetX: 1, shadowOffsetY: 2, shadowColor: '#00000030',
    fontSize: 32, subOffset: 0,
  },
  'Ocean': {
    fill: '#2980b9', color: '#ffffff', cornerRadius: 14, borderWidth: 2.5,
    bevel: 1, bevelStrength: 0.35, lightAngle: 300, lightIntensity: 0.5,
    shadowBlur: 8, shadowOffsetX: 2, shadowOffsetY: 4, shadowColor: '#0d47a166',
    fontSize: 32, subOffset: 0,
  },
  'Ember': {
    fill: '#c0392b', color: '#ffffff', cornerRadius: 8, borderWidth: 2,
    bevel: 1, bevelStrength: 0.3, lightAngle: 315, lightIntensity: 0.5,
    shadowBlur: 10, shadowOffsetX: 2, shadowOffsetY: 4, shadowColor: '#7f1d1d66',
    fontSize: 32, subOffset: 0,
  },
  'Night': {
    fill: '#2c3e50', color: '#ecf0f1', cornerRadius: 12, borderWidth: 2.5,
    bevel: 1, bevelStrength: 0.3, lightAngle: 270, lightIntensity: 0.45,
    shadowBlur: 10, shadowOffsetX: 3, shadowOffsetY: 4, shadowColor: '#00000077',
    fontSize: 32, subOffset: 0,
  },
  'Pill': {
    fill: '#27ae60', color: '#ffffff', cornerRadius: 40, borderWidth: 2,
    bevel: 1, bevelStrength: 0.32, lightAngle: 315, lightIntensity: 0.5,
    shadowBlur: 6, shadowOffsetX: 2, shadowOffsetY: 3, shadowColor: '#00000040',
    fontSize: 24, subOffset: 0,
  },
  'Big Shadow': {
    fill: '#e0ddd4', color: '#2a2a2a', cornerRadius: 16, borderWidth: 3,
    bevel: 1, bevelStrength: 0.42, lightAngle: 330, lightIntensity: 0.6,
    shadowBlur: 20, shadowOffsetX: 4, shadowOffsetY: 8, shadowColor: '#00000055',
    fontSize: 36, subOffset: 0,
  },
};


// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

/** Resolve the selected button-node in a button layer. */
function resolveButtonNode(layer, app) {
  const buf = app?._selectionBuffer || [];
  for (const entry of buf) {
    if (entry.node?.token === 'button-node' && layer.subtree?.includes(entry.node)) {
      return entry.node;
    }
  }
  const pts = (layer.subtree || []).filter(n => n.token === 'button-node');
  return pts.length ? pts[pts.length - 1] : null;
}


// ═══════════════════════════════════════════════════════
//  TWIG PROTOCOL — button nodes
// ═══════════════════════════════════════════════════════

const buttonOps = createLayerOps({
  itemToken: 'button-node',
  getContainer: (layer) => layer,

  createItem(layer, index, _app) {
    const counter  = layer.value._uidCounter || index;
    const gridName = layer.value.gridName || '1';
    const uid      = 'btn' + gridName.toLowerCase() + counter;
    layer.value._uidCounter = counter + 1;

    // Spiral placement so new buttons don't stack
    const angle  = counter * 2.399;
    const radius = 40 + counter * 20;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    return new MiniAstNode('button-node', [], {
      uid, name: '◻', label: '◻', sub: '',
      x, y, width: 72, height: 72,
      color: null, badge: null, disabled: false,
    });
  },

  getDisplayName: (item) => item.value?.label || item.value?.name || '?',
});


// ═══════════════════════════════════════════════════════
//  ADDABLE
// ═══════════════════════════════════════════════════════

const BUTTON_ADDABLE = {
  id:    'button-grid',
  label: 'Button Grid',

  /**
   * Returns a single layer populated with an initial set of
   * button-nodes laid out in a row.
   */
  create(app) {
    const gridName = app?._nextNetworkName?.() || '1';
    const lo       = 'btn' + gridName.toLowerCase();

    // seed buttons — a small row of kanji
    const seed = [
      { label: '山', sub: 'やま' },
      { label: '川', sub: 'かわ' },
      { label: '火', sub: 'ひ'   },
      { label: '水', sub: 'みず' },
    ];

    const spacing = 90;
    const startX  = -((seed.length - 1) * spacing) / 2;

    const nodes = seed.map((s, i) =>
      new MiniAstNode('button-node', [], {
        uid:      `${lo}${i}`,
        name:     s.label,
        label:    s.label,
        sub:      s.sub,
        x:        startX + i * spacing,
        y:        0,
        width:    72,
        height:   72,
        color:    null,           // null → uses layer fill
        badge:    null,
        disabled: false,
      })
    );

    const nodeFields = createItemFields({
      id: 'button-props', label: 'Button', abbrev: 'Btn',
      fields: [
        { key: 'label',    label: 'Label',    type: 'text',   placeholder: '字' },
        { key: 'sub',      label: 'Sub',      type: 'text',   placeholder: 'reading' },
        { key: 'badge',    label: 'Badge',    type: 'text',   placeholder: '' },
        { key: 'color',    label: 'Color',    type: 'color',  default: '#e0ddd4' },
        { key: 'width',    label: 'Width',    type: 'number', default: 72, min: 24, max: 200 },
        { key: 'height',   label: 'Height',   type: 'number', default: 72, min: 24, max: 200 },
        { key: 'disabled', label: 'Disabled', type: 'toggle', default: false },
      ],
      resolve: resolveButtonNode,
    });

    const layer = new MiniAstNode('layer', nodes, {
      name:         `Buttons ${gridName}`,
      layerType:    'button-grid',
      visible:      true,
      center:       false,
      gridName:     gridName,
      _uidCounter:  nodes.length,
      _nameCounter: nodes.length,
      params:       { ...BUTTON_PRESETS['Default'] },
    });

    layer.inst = {
      buildUI:       buttonBuildUI,
      presets:       BUTTON_PRESETS,
      selectionSize: 1,
      refCount:      0,
      itemFields:    nodeFields,
      // Twig protocol
      addItem:       buttonOps.addItem,
      removeItem:    buttonOps.removeItem,
      selectionInfo: buttonOps.selectionInfo,
    };

    return [layer];
  },
};


// ═══════════════════════════════════════════════════════
//  REGISTER
// ═══════════════════════════════════════════════════════

ADDABLES.push(BUTTON_ADDABLE);