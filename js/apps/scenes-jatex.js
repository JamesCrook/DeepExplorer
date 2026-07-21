// ═══════════════════════════════════════════════════════
//  JATEX SCENE
// ═══════════════════════════════════════════════════════
import { MiniAstNode, SCENES, ADDABLES } from '../omni-support/scene.js';
import { JatexNode as JatexNodeClass } from '../nodes2d/jatex-node.js';
import { createItemFields } from '../omni-support/item-fields.js';
import '../nodes2d/sizing-nodes.js';


// ── Shared slider definitions ────────────────────────────

const JATEX_ALIGN_SLIDERS = [
  { id: 'valign',   label: 'valign',   min: 0, max: 1, step: 0.01, default: 0.5 },
  { id: 'halign',   label: 'halign',   min: 0, max: 1, step: 0.01, default: 0.5 },
  { id: 'baseline', label: 'baseline', min: 0, max: 1, step: 0.01, default: 0.5 },
];

const JATEX_ALIGN_DEFAULTS = { valign: 0.5, halign: 0.5, baseline: 0.5 };

const DEFAULT_JATEX_TEXT = '\\frac{\\nabla\\times\\twisty\\nabla\\capacitor\\transistor\\battery\\nabla}{\\times\\capacitor\\tile\\transistor}';


// ── Shared helpers ───────────────────────────────────────

/** Create a wired jatex AST node. */
function createJatexAstNode(text) {
  const jatex = new MiniAstNode('jatex', [], text != null ? { text } : null);
  if (JatexNodeClass?._wire) JatexNodeClass._wire(jatex);
  return jatex;
}

/** Walk subtree depth-first and return the first node matching a token. */
function findByToken(root, token) {
  if (root.token === token) return root;
  for (const child of (root.subtree || [])) {
    const hit = findByToken(child, token);
    if (hit) return hit;
  }
  return null;
}

/** Return the jatex child of a handle-frame. */
function jatexChildOf(hf) {
  return hf?.subtree?.find(n => n.token === 'jatex') ?? null;
}

/** onChange handler shared by scene and addable jatex fields. */
function onJatexTextChange(node, key, value, _app) {
  if (key === 'text' && JatexNodeClass?._rewire) {
    JatexNodeClass._rewire(node, value);
  }
}

/**
 * Resolve the jatex AST node to edit from a layer of handle-frames.
 * Priority: selected handle-frame → fallback to last handle-frame.
 */
function resolveJatexAddable(layer, app) {
  const buf = app?._selectionBuffer || [];
  for (const entry of buf) {
    const item = entry.item || entry.node;
    // Direct handle-frame match
    if (item?.token === 'handle-frame' && layer.subtree?.includes(item)) {
      const j = jatexChildOf(item);
      if (j) return j;
    }
    // Drag-point inside a handle-frame in this layer
    for (const hf of (layer.subtree || [])) {
      if (hf.token === 'handle-frame' && hf.subtree?.includes(entry.node)) {
        const j = jatexChildOf(hf);
        if (j) return j;
      }
    }
  }
  // Fallback: last handle-frame in layer
  const items = (layer.subtree || []).filter(n => n.token === 'handle-frame');
  return items.length ? jatexChildOf(items[items.length - 1]) : null;
}


// ═══════════════════════════════════════════════════════
//  SCENE MODE — zoom-pan, rotate + zoom, single jatex
// ═══════════════════════════════════════════════════════

function jatexBuildUI() {
  return [{
    group: 'Jatex', id: 'jatex', abbrev: 'Jtx',
    sliders: [
      { id: 'rotateJatex', label: 'rotate', min: 0, max: 6.283, step: 0.01, default: 0 },
      ...JATEX_ALIGN_SLIDERS,
      { id: 'zoom', label: 'zoom', min: 0.25, max: 2, step: 0.01, default: 1 },
    ],
  }];
}

const JATEX_PRESETS = {
  'Standard': { fillOpacity: 1, strokeWidth: 0, zoom: 1, rotateJatex: 0, ...JATEX_ALIGN_DEFAULTS },
};

// Module-level fields editor for the scene (textarea height persists across scene switches)
const jatexSceneFields = createItemFields({
  id: 'jatex-input', label: 'JaTeX Input', abbrev: 'In',
  fields: [{ key: 'text', type: 'textarea', placeholder: 'Enter JaTeX…' }],
  resolve: (layer, _app) => findByToken(layer, 'jatex'),
  onChange: onJatexTextChange,
});

function createJatexScene() {
  if (!JatexNodeClass) return null;
  const zoomScale = new MiniAstNode('zoom-pan', [createJatexAstNode()]);
  const layer = new MiniAstNode('layer', [zoomScale], {
    name: 'Jatex', visible: true,
    params: { zoom: 1, panX: 50, panY: 50, rotateJatex: 0,
              ...JATEX_ALIGN_DEFAULTS, fillOpacity: 1, strokeWidth: 0 },
  });
  layer.inst = {
    buildUI:    jatexBuildUI,
    presets:    JATEX_PRESETS,
    itemFields: jatexSceneFields,
  };
  return new MiniAstNode('scene-root', [layer]);
}


// ═══════════════════════════════════════════════════════
//  ADDABLE MODE — handle-frames, no zoom/rotate
// ═══════════════════════════════════════════════════════

const JATEX_ADDABLE_PRESETS = {
  'Standard': { ...JATEX_ALIGN_DEFAULTS },
};

function jatexAddableBuildUI() {
  return [{
    group: 'Jatex', id: 'jatex', abbrev: 'Jtx',
    sliders: [
      ...JATEX_ALIGN_SLIDERS,
      { id: 'pointRadius', label: 'Handles', min: 2, max: 15, step: 1, default: 5 },
    ],
  }];
}

const JATEX_ADDABLE = {
  id:            'jatex',
  label:         'JaTeX',
  selectionSize: 1,
  refCount:      0,
  buildUI:       jatexAddableBuildUI,
  presets:       JATEX_ADDABLE_PRESETS,

  /** Create a single handle-frame item (for adding to an existing layer). */
  createItem(index = 0) {
    const offset = index * 30;
    return new MiniAstNode('handle-frame', [
      new MiniAstNode('drag-point', [], { x: -120 + offset, y: -60 + offset, name: '⌜', color: '#ffffffaa' }),
      new MiniAstNode('drag-point', [], { x:  120 + offset, y:  60 + offset, name: '⌟', color: '#ffffffaa' }),
      createJatexAstNode(DEFAULT_JATEX_TEXT),
    ]);
  },

  /** Create a new layer containing one jatex handle-frame. */
  create() {
    const fields = createItemFields({
      id: 'jatex-input', label: 'JaTeX Input', abbrev: 'In',
      fields: [{ key: 'text', type: 'textarea', placeholder: 'Enter JaTeX…' }],
      resolve: resolveJatexAddable,
      onChange: onJatexTextChange,
    });

    const layer = new MiniAstNode('layer', [this.createItem(0)], {
      name:      'JaTeX',
      layerType: 'jatex',
      visible:   true,
      params:    { ...JATEX_ALIGN_DEFAULTS, pointRadius: 5 },
    });
    layer.inst = {
      buildUI:       jatexAddableBuildUI,
      presets:        JATEX_ADDABLE_PRESETS,
      selectionSize: 1,
      refCount:      0,
      itemFields:    fields,
    };
    return layer;
  },
};

ADDABLES.push(JATEX_ADDABLE);

SCENES.push({
  id: 'jatex', label: 'Jatex Display', group: 'Jatex', hasLayers: false,
  phases: ['measure', 'layout', 'draw2d'],
  create: createJatexScene,
});
