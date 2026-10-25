/**
 * scene-shapes.js
 *
 * Addable declarations — one per object type OmniScene can add
 * to a scene.
 *
 * Each addable declares:
 *   selectionSize  — buffer depth needed for its operations (1, 2, 3…)
 *   refCount       — how many external references needed to ADD an item
 *                    (0 = provides own points, 2 = needs two node refs, etc.)
 *
 */

import { MiniAstNode, SCENES, ADDABLES } from '../omni-support/scene.js';
import { createItemFields } from '../omni-support/item-fields.js';


// ═══════════════════════════════════════════════════════
//  RECTANGLE — two draggable corners
// ═══════════════════════════════════════════════════════

function rectBuildUI(/* layer */) {
  return [
    {
      group: 'Rectangle', sliders: [
        { id: 'fillOpacity',    label: 'Opacity', min: 0, max: 1,  step: 0.01, default: 0.8 },
        { id: 'roundedCorners', label: 'Corners', min: 0, max: 40, step: 1,    default: 0   },
        { id: 'pointRadius',    label: 'Handles', min: 2, max: 15, step: 1,    default: 5   },
      ],
    },
  ];
}

const RECT_PRESETS = {
  'Blue':    { fillOpacity: 0.8, roundedCorners: 0,  color: '#4466aa' },
  'Pill':    { fillOpacity: 0.9, roundedCorners: 30, color: '#4ecdc4' },
  'Red':     { fillOpacity: 0.7, roundedCorners: 0,  color: '#ff6b6b' },
  'Ghost':   { fillOpacity: 0.2, roundedCorners: 8,  color: '#ffffff' },
};

const RECT_ADDABLE = {
  id:            'rect',
  label:         'Rectangle',
  selectionSize: 1,
  refCount:      0,
  buildUI:       rectBuildUI,
  presets:       RECT_PRESETS,

  createItem(index = 0) {
    const offset = index * 30;
    return new MiniAstNode('handle-frame', [
      new MiniAstNode('drag-point', [], { x: -60 + offset, y: -40 + offset, name: '⌜', color: '#ffffffaa' }),
      new MiniAstNode('drag-point', [], { x:  60 + offset, y:  40 + offset, name: '⌟', color: '#ffffffaa' }),
    ]);
  },

  create() {
    const frame = this.createItem(0);
    const layer = new MiniAstNode('layer', [frame], {
      name:      'Rectangle',
      layerType: 'rect',
      visible:   true,
      params: { color: '#4466aa', fillOpacity: 0.8, roundedCorners: 0, pointRadius: 5 },
    });
    layer.inst = {
      buildUI: rectBuildUI, presets: RECT_PRESETS,
      selectionSize: 1, refCount: 0,
    };
    return layer;
  },
};

// ═══════════════════════════════════════════════════════
//  COMPOSED LISTS
// ═══════════════════════════════════════════════════════

ADDABLES.push(RECT_ADDABLE);
