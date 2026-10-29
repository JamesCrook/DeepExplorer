import { SYS } from '../omni-support/sys.js';
import { drawLineLabelAndText, makeTaper } from './workhorse-drawing.js';
import { MindMapNode } from './mind-map-node.js';
export { BondNode };

// `bond` — a tapered, labelled connector between two atoms of a mind-map
/* ─────────────────────────────────────────────────────────────────────────────
For now the mind-map draws bonds itself, from atom indices, through
BondNode._drawBondDirect; draw2d is there for when bonds become children.
──────────────────────────────────────────────────────────────────────────── */
//
// Bonds are currently derived from atom indices (not subtree
// children), so BondNode.draw2d is called directly from
// MindMapNode.before_draw2d via _drawBondDirect.
//
// If bonds become subtree children in a future refactor,
// draw2d can be used directly by the scene-graph walker.

class BondNode {

  /** Direct draw call (not via scene-graph walk). */
  static _drawBondDirect(ctx, bond, params) {
    const taper = makeTaper(bond, params);
    drawLineLabelAndText(ctx, taper, params);
  }

  /**
   * Scene-graph draw2d (for when bonds are subtree children).
   */
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const bond = node.value;
    if (!bond) return;

    const p = ctxMix.flyweight?._mindMapParams || params;
    BondNode._drawBondDirect(ctx, bond, p);
  }
}

SYS.NODE_CLASSES.push({ name: 'bond', cls: BondNode });
