// ═══════════════════════════════════════════════════════════════
//  WORKHORSE SCENES + ADDABLES
// ═══════════════════════════════════════════════════════════════
//
//  Parallel to scenes-ribbon.js.
//  Replaces the old registerReadWrite() calls and the implicit
//  scene creation that happened via readMindMap, readMolecule, etc.
//
//  ─── Migration map ────────────────────────────────────────────
//
//    OLD registerReadWrite call              NEW scene factory
//    ──────────────────────────              ──────────────────
//    reg("MindMap",    readMindMap, write)   SCENES 'mind-map'
//    reg("Geometry",   readGeometry, write)  SCENES 'geometry'
//    reg("Molecule",   readMolecule, write)  SCENES 'molecule'
//    reg("Snake",      readSnake, write)     SCENES 'snake'
//    reg("Quads",      readQuads, write)     SCENES 'quads'
//    reg("Flowchart",  readFlowchart, write) SCENES 'flowchart'
//    reg("LineArt",    readLineArt, write)   SCENES 'line-art'
//    reg("GenericDiagram", read..., write)   SCENES 'generic-diagram'
//    reg("Annotated",  readAnnotated, write) SCENES 'annotated'
//    reg("CodeTiles",  readCodeTiles, write) SCENES 'code-tiles'
//    reg("SceneGraph", readSceneGraph,write) SCENES 'scene-graph'
//    reg("Rainbow",    readRainbow, write)   SCENES 'rainbow'
//    reg("StarMap",    readStarMap, write)   SCENES 'star-map'
//    reg("Sankey",     readSankey, write)    SCENES 'sankey'
//
//  Each old read function parsed a text spec into an obj with
//  atoms[], bonds[], quads[], etc.  In the new architecture that
//  parsing stays in a separate parser module; the scene factory
//  here just builds the MiniAstNode tree from the parsed result.

import { MiniAstNode, SCENES, ADDABLES, sceneRegistry } from '../omni-support/scene.js';
import '../nodes2d/workhorse-nodes.js';  // registers mind-map, atom, bond, ruler, chem, tree2


// ═══════════════════════════════════════════════════════════════
//  SHARED SLIDER DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const TRANSFORM_SLIDERS = [
  { id: 'transformSize',   label: 'size',     min: 10, max: 200, step: 1,    default: 100 },
  { id: 'transformRotate', label: 'rotate',   min: 0,  max: 360, step: 1,    default: 0 },
];

const BOND_LINE_SLIDERS = [
  { id: 'linkWidth',    label: 'link width', min: 0.5, max: 10,  step: 0.5,  default: 2 },
  { id: 'lineExtend',   label: 'extend',     min: -20, max: 40,  step: 1,    default: -12 },
  { id: 'lineWidth',    label: 'line width', min: 0.5, max: 10,  step: 0.5,  default: 6 },
  { id: 'endSize',      label: 'end size',   min: 5,   max: 30,  step: 1,    default: 15 },
  { id: 'bevel',        label: 'bevel',      min: 0,   max: 20,  step: 1,    default: 0 },
];

const LABEL_SLIDERS = [
  { id: 'fontSize',     label: 'font size',  min: 6,  max: 48,  step: 1,    default: 12 },
  { id: 'fixedRadius',  label: 'atom radius', min: 4, max: 30,  step: 1,    default: 0 },
  { id: 'pad',          label: 'padding',    min: -5, max: 30,  step: 1,    default: 0 },
];

const DISPLAY_SLIDERS = [
  { id: 'moleculeMode', label: 'molecule',   min: 0,  max: 1,   step: 1,    default: 0 },
  { id: 'showAngles',   label: 'angles',     min: 0,  max: 1,   step: 1,    default: 0 },
  { id: 'showBonds',    label: 'bonds',      min: 0,  max: 1,   step: 1,    default: 1 },
];

const ZOOM_SLIDER = { id: 'zoom', label: 'zoom', min: 0.1, max: 4, step: 0.01, default: 1 };

function mindMapSections({ zoom = false } = {}) {
  const sections = [
    { group: 'Transform', id: 'transform', abbrev: 'Tfm',  sliders: TRANSFORM_SLIDERS },
    { group: 'Bonds',     id: 'bonds',     abbrev: 'Bnd',  sliders: BOND_LINE_SLIDERS },
    { group: 'Labels',    id: 'labels',    abbrev: 'Lbl',  sliders: LABEL_SLIDERS },
    { group: 'Display',   id: 'display',   abbrev: 'Dsp',  sliders: DISPLAY_SLIDERS },
  ];
  if (zoom) {
    sections.push({ group: 'View', id: 'view', abbrev: 'View', sliders: [ZOOM_SLIDER] });
  }
  return sections;
}


// ═══════════════════════════════════════════════════════════════
//  PRESETS
// ═══════════════════════════════════════════════════════════════

const MINDMAP_PRESETS = {
  'Default':  {
    transformSize: 100, transformRotate: 0,
    linkWidth: 2, lineExtend: -12, lineWidth: 6, endSize: 15, bevel: 0,
    fontSize: 12, fixedRadius: 0, pad: 0,
    moleculeMode: 0, showAngles: 0, showBonds: 1,
    zoom: 1,
  },
  'Molecule': {
    transformSize: 100, transformRotate: 0,
    linkWidth: 3, lineExtend: 0, lineWidth: 2, endSize: 10, bevel: 0,
    fontSize: 10, fixedRadius: 14, pad: 0,
    moleculeMode: 1, showAngles: 1, showBonds: 1,
    zoom: 1,
  },
  'Large': {
    transformSize: 150, transformRotate: 0,
    linkWidth: 4, lineExtend: -8, lineWidth: 8, endSize: 20, bevel: 3,
    fontSize: 16, fixedRadius: 0, pad: 4,
    moleculeMode: 0, showAngles: 0, showBonds: 1,
    zoom: 1,
  },
  'Geometry': { 
    zoom: 1},
  'Snake': { 
    zoom: 1},
  'Quads': { 
    zoom: 1},
  'Flowchart': { 
    zoom: 1},
  'Line Art': { 
    zoom: 1},
  'Generic Diagram': { 
    zoom: 1},
  'Annotated': { 
    zoom: 1},
  'Code Tiles': { 
    zoom: 1},
  'Scene Graph': { 
    zoom: 1},
  'Rainbow': { 
    zoom: 1},
  'Star Map': { 
    zoom: 1},
  'Sankey': { 
    zoom: 1},
};

const MINDMAP_DEFAULTS = { ...MINDMAP_PRESETS['Default'] };


// ═══════════════════════════════════════════════════════════════
//  HELPERS: Build MiniAstNode tree from parsed data
// ═══════════════════════════════════════════════════════════════

/**
 * Build atom child nodes from a parsed atom list.
 *
 * @param {Array} atoms — [ { x, y, value, level, r, ... }, ... ]
 * @returns {MiniAstNode[]}
 */
function makeAtomNodes(atoms) {
  return atoms.map((a) => new MiniAstNode('atom', [], { ...a }));
}

/**
 * Build a mind-map scene tree.
 *
 * This is the new equivalent of what readMindMap() + layoutMindMap()
 * produced in the old system.  The parsed data (atoms, bonds, quads,
 * angles, styles) goes into the root node's value; atoms also become
 * subtree children so the scene-graph walker calls AtomNode.draw2d.
 *
 * @param {object} parsed — output of the spec parser, containing
 *   atoms[], bonds[], quads[], angles[], bondLineStyle, atomLabelStyle, etc.
 * @param {string} name — layer name
 */
function createMindMapScene(name) {
  // const atomNodes = makeAtomNodes(parsed.atoms || []);
  const mindMap = new MiniAstNode('mind-map', [], {
    // Pass through the full parsed object so that
    // MindMapNode.before_draw2d can access bonds, quads, angles, etc.
  });

  const layer = new MiniAstNode('layer', [mindMap], {
    name:    name || 'Mind Map',
    visible: true,
    params:  { ...MINDMAP_DEFAULTS },
  });

  layer.inst = {
    buildUI: () => mindMapSections({ zoom: true }),
    presets: MINDMAP_PRESETS,
  };

  return new MiniAstNode('scene-root', [layer]);
}


// ═══════════════════════════════════════════════════════════════
//  SCENE FACTORIES
// ═══════════════════════════════════════════════════════════════
//
// Each entry corresponds to one old registerReadWrite() call.
// The `create` function receives the parsed spec data.
//
// EXTERNAL: the actual read functions (readMindMap, readGeometry, etc.)
// live in the parser module.  Import them and wire up once migrated.
//
//   import { readMindMap, readGeometry, ... } from '../parsers/mind-map-parser.js';

SCENES.push(
  {
    id:        'mind-map',
    label:     'Mind Map',
    group:     'Workhorse',
    hasLayers: false,
    // create(parsed) — called by the host with the parsed spec.
    create:    () => createMindMapScene('Mind Map'),
    // EXTERNAL: reader parses the text spec into { atoms, bonds, ... }.
    // reader: readMindMap,
    // EXTERNAL: writer serialises back to text spec.
    // writer: writeMindMap,
  },
);


// ═══════════════════════════════════════════════════════════════
//  MIND-MAP ADDABLE  (for adding mind-maps to a Canvas Scene)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_ATOMS = [
  { x: 200, y: 150, value: 'Central Idea', level: 0, r: 14 },
  { x: 100, y:  80, value: 'Branch A',     level: 1, r: 10 },
  { x: 300, y:  80, value: 'Branch B',     level: 1, r: 10 },
  { x: 200, y: 260, value: 'Branch C',     level: 1, r: 10 },
];

const DEFAULT_BONDS = [
  { points: [0, 1], value: '--' },
  { points: [0, 2], value: '--' },
  { points: [0, 3], value: '--' },
];

const MINDMAP_ADDABLE = {
  id:            'mind-map',
  label:         'Mind Map',
  selectionSize: 1,
  refCount:      0,
  buildUI:       () => mindMapSections({ zoom: false }),
  presets:       MINDMAP_PRESETS,

  createItem(index = 0) {
    const offset = index * 40;
    const atoms = DEFAULT_ATOMS.map(a => ({
      ...a, x: a.x + offset, y: a.y + offset,
    }));
    const bonds = DEFAULT_BONDS.map(b => ({ ...b }));

    return new MiniAstNode('mind-map',
      makeAtomNodes(atoms),
      { atoms, bonds, quads: [], angles: [] },
    );
  },

  create() {
    const layer = new MiniAstNode('layer', [this.createItem(0)], {
      name:      'Mind Map',
      layerType: 'mind-map',
      visible:   true,
      params:    { ...MINDMAP_DEFAULTS },
    });
    layer.inst = {
      buildUI:       () => mindMapSections({ zoom: false }),
      presets:       MINDMAP_PRESETS,
      selectionSize: 1,
      refCount:      0,
    };
    return layer;
  },
};

ADDABLES.push(MINDMAP_ADDABLE);