import { SYS } from '../omni-support/sys.js';
import { AtomNode } from './atom-node.js';
export { ChemNode };

/* ─────────────────────────────────────────────────────────────────────────────
`chem` — STUB: a molecule drawing, waiting for drawMolecule to be migrated.
Draws nothing and warns.
──────────────────────────────────────────────────────────────────────────── */
//
// EXTERNAL: layoutMolecule, drawMolecule are defined elsewhere.
// Once migrated, ChemNode.draw2d should call the molecule renderer.

class ChemNode {

  static draw2d(ctxMix, node, params) {
    // EXTERNAL: drawMolecule(A, obj, d)
    // TODO: import and call the migrated molecule renderer.
    console.warn('ChemNode.draw2d: drawMolecule not yet migrated');
  }

  static hit_test(ctxMix, node, params) {
    // Molecule hit-testing — same pattern as AtomNode.
  }
}

SYS.NODE_CLASSES.push({ name: 'chem', cls: ChemNode });
