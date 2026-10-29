/*
The mind-map family, from Scorpio's workhorse.js: `mind-map` holds `atom`s and
draws the `bond`s between them; `ruler`, `chem` and `tree2` came along. One file
each, their drawing helpers in workhorse-drawing.js. Importing this file
registers all six and re-exports what the old single file exported.

Migrated from Registrar.js.workhorse_js (an IIFE of registerMethod() calls) to
ES-module node classes with static methods.

─── Migration map ──────────────────────────────────────────────

  OLD registerMethod call                 NEW node class
  ───────────────────────────             ──────────────
  reg("MindMap", 0,0, layout, draw)  →   MindMapNode
  reg("Atom",    0,0, layout, draw)  →   AtomNode
  reg("Bond",    0,0, layout, draw)  →   BondNode
  reg("Chem",    0,0, layout, draw)  →   ChemNode        (stub)
  reg("Tree2",   0,0, layout, draw)  →   Tree2Node       (stub)
  reg("Ruler",   create,0, lay, draw)→   RulerNode

─── Architecture notes ─────────────────────────────────────────

  Old (A, obj, d) triple  →  New (ctxMix, node, params):
    A.BackingCanvas.ctx   →  ctxMix.ctx
    A.HotspotsCanvas.ctx  →  ctxMix.hotsCtx  (or separate hit_test)
    A.Status.time         →  ctxMix.time  (or params.time)
    A.Porthole             →  ctxMix.viewport
    obj                   →  node.value   (leaf data)
    obj.atoms / bonds     →  node.subtree (children)
    d.stage checks        →  lifecycle hooks (before_draw2d, draw2d, hit_test)
    d.transform           →  params  (slider-driven)
    d.lineStyle, etc.     →  params  (slider-driven)
    getCtx(A, obj, d)     →  ctxMix.ctx
    hotspot stage          →  hit_test()

─── External dependencies (not in this file) ───────────────────

  These were globals in the old codebase.  Each must be migrated
  to its own module or imported from a shared utility module.
  They are imported here as stubs — replace paths as you migrate.

    Vector2d, Shape, ShapeData
    parseLabelString, setSolid, setColourScheme, rgbOfAtom
    anglesFromAtoms, bondsFromAtoms, quadsFromAtoms, minEnergy2
    layoutMolecule, drawMolecule, layoutTree2
    layoutAtom, layoutBond
    readMindMap, writeMindMap, readGeometry, readMolecule, ...
    Jatex, RR  (drawTaper is in workhorse-drawing.js)
*/

import './mind-map-node.js';   // 'mind-map'  container: atoms, with bonds and angles derived from them
import './atom-node.js';       // 'atom'      a labelled circle, sub-diagram or jatex block
import './bond-node.js';       // 'bond'      tapered, labelled connector between atoms
import './ruler-node.js';      // 'ruler'     tick marks and numbers along a line
import './chem-node.js';       // 'chem'      stub
import './tree2-node.js';      // 'tree2'     stub

export { MindMapNode } from './mind-map-node.js';
export { AtomNode } from './atom-node.js';
export { BondNode } from './bond-node.js';
export { RulerNode } from './ruler-node.js';
export { ChemNode } from './chem-node.js';
export { Tree2Node } from './tree2-node.js';
export { drawWigglyLine } from '../2d-support/wiggly-line.js';
export {
  transformXy, antiTransformXy, drawLineLabelAndText, drawScorpioLabel, drawText,
  drawTaper, drawStyledLine, getTextDimensions, adjustTextDimensions, getBondData, makeTaper,
} from './workhorse-drawing.js';
