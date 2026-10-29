import { SYS } from '../omni-support/sys.js';
export { Tree2Node };

/* ─────────────────────────────────────────────────────────────────────────────
`tree2` — STUB: a tree drawn with the molecule renderer, waiting for
drawMolecule to be migrated. Draws nothing and warns.
──────────────────────────────────────────────────────────────────────────── */
class Tree2Node {

  static draw2d(ctxMix, node, params) {
    // EXTERNAL: drawMolecule(A, obj, d)  — same as ChemNode
    // TODO: import and call the migrated molecule renderer.
    console.warn('Tree2Node.draw2d: drawMolecule not yet migrated');
  }
}

SYS.NODE_CLASSES.push({ name: 'tree2', cls: Tree2Node });
