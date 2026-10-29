import { SYS } from '../omni-support/sys.js';
import { drawBackground, drawAngle } from './workhorse-drawing.js';
import { BondNode } from './bond-node.js';
export { MindMapNode };

// `mind-map` — atoms joined by tapered bonds
/* ─────────────────────────────────────────────────────────────────────────────
`mind-map` — a diagram of labelled atoms joined by tapered bonds: the container
that draws the background, the bonds and the angles between them, then its atom
children. Bonds, angles and quads come from the atoms (bondsFromAtoms,
anglesFromAtoms, quadsFromAtoms), not from children.

BROKEN: before_draw2d calls anglesFromAtoms, minEnergy2, bondsFromAtoms and
quadsFromAtoms, which this file does not import (only the last two exist, in
2d-support/workhorse.js), so drawing a mind-map throws. See
docs/twin-merge-plan.md.
──────────────────────────────────────────────────────────────────────────── */
//
// AST shape:
//   mind-map  (value: { background?, size?, rotate?, angleStyle?,
//                       bondLineStyle?, bondLabelStyle?,
//                       atomLabelStyle?, atomLineStyle?, ... })
//     atom    (value: { x, y, value, level, ... })
//     atom    (value: { ... })
//     ...
//
//   Bonds, angles, and quads are derived from atoms (via
//   bondsFromAtoms, anglesFromAtoms, quadsFromAtoms) rather than
//   being separate subtree children — preserving the original
//   architecture.  A future refactor could make them child nodes.

class MindMapNode {

  /**
   * Draw background, angles, bonds, and quads.
   * Children (atoms) will draw themselves in draw2d after this.
   *
   * Old: drawMindMap(A, obj, d) — the monolithic draw function.
   */
  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    ctxMix.flyweight._atomIndex = 0;

    // ── Derive transform params from node value ──────────
    const val = node.value || {};
    const transformSize   = /*firstValid*/((val.size) ?? ( 100)) / 100;
    const transformRotate = /*firstValid*/((val.rotate) ?? ( 0)) * Math.PI / 180;

    // Merge into params for child use.
    const p = {
      ...params,
      transformSize,
      transformRotate,
      ...val.bondLineStyle,
      ...val.bondLabelStyle,
    };
    ctxMix.flyweight._mindMapParams = p;

    // ── Background ───────────────────────────────────────
    drawBackground(ctxMix, node, params);

    // ── Angles (early fill pass) ─────────────────────────
    const angles = val.angles || [];
    anglesFromAtoms(val);
    for (const angle of angles) {
      drawAngle(ctx, angle, { ...p });
    }

    // ── Bonds ────────────────────────────────────────────
    minEnergy2(ctxMix, val);
    bondsFromAtoms(val);
    const bonds = val.bonds || [];
    for (const bond of bonds) {
      BondNode._drawBondDirect(ctx, bond, p);
    }

    // ── Quads (texture-mapped shapes) ────────────────────
    quadsFromAtoms(val);
    const quads = val.quads || [];
    for (const quad of quads) {
      // EXTERNAL: mayRequestDisplayableImage / getImageSource
      // managed by the host framework's image loader.
      if (quad.status === 'arrived' && ctxMix.getImageSource) {
        const imgSrc = ctxMix.getImageSource(quad);
        // RR.drawTexture delegated to NurbNode (see nurb-node.js)
      }
    }
  }

  /** Restore after children have drawn. */
  static after_draw2d(ctxMix, node, params) {
    // Nothing to restore currently.
    // If before_draw2d pushed a ctx.save(), balance it here.
  }

  /** Set flyweight cursor before each child draws. */
  static before_child_draw2d(ctxMix, node, params, child) {
    const idx = ctxMix.flyweight._atomIndex++;
    ctxMix.flyweight.cursor = [idx];
    // Pass the derived params down.
    ctxMix.flyweight._mindMapParams =
      ctxMix.flyweight._mindMapParams || params;
  }

  /**
   * Hit-testing for the mind-map as a whole.
   * Individual atom hit-testing is in AtomNode.hit_test.
   */
  static before_hit_test(ctxMix, node, params) {
    ctxMix.flyweight._atomIndex = 0;
    // Store transform for child hit_test use.
    const val = node.value || {};
    ctxMix.flyweight._mindMapTransform = {
      size:   /*firstValid*/((val.size) ?? ( 100)) / 100,
      rotate: /*firstValid*/((val.rotate) ?? ( 0)) * Math.PI / 180,
    };
  }

  static before_child_hit_test(ctxMix, node, params, child) {
    const idx = ctxMix.flyweight._atomIndex++;
    ctxMix.flyweight.cursor = [idx];
  }
}

SYS.NODE_CLASSES.push({ name: 'mind-map', cls: MindMapNode });
