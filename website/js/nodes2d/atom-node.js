import { SYS } from '../omni-support/sys.js';
import { kStageHots, transformXy, drawText, drawMindMapLabel } from './workhorse-drawing.js';
export { AtomNode };

// `atom` — one labelled node of a mind-map
/* ─────────────────────────────────────────────────────────────────────────────
`atom` — one labelled node of a mind-map: a circle or label box at value.x, y,
or a sub-diagram or jatex block in its place. Hit-testable and draggable.
──────────────────────────────────────────────────────────────────────────── */
//
// AST shape:
//   atom  (value: { x, y, value, level, r, hide?, subdiagram?,
//                   jatex?, styled?, hotspotColour?, ... })

class AtomNode {

  /**
   * Draws an atom label (molecule-style circle or mind-map label).
   *
   * Old: the atom-drawing dispatch at the end of drawMindMap,
   *      plus drawAtom(A, obj, d) and drawMindMapLabel(A, obj, d).
   */
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const atom = node.value;
    if (!atom) return;

    // Use the merged params from MindMapNode if available.
    const p = ctxMix.flyweight?._mindMapParams || params;

    if (atom.isJref) return;

    if (atom.subdiagram) {
      AtomNode._drawSubDiagram(ctxMix, atom, p);
    } else if (atom.jatex) {
      AtomNode._drawJatex(ctxMix, atom, p);
    } else if (params.moleculeMode) {
      AtomNode._drawAtomCircle(ctx, atom, p);
    } else {
      drawMindMapLabel(ctx, atom, p);
    }
  }

  /** Molecule-style filled circle with letter. */
  static _drawAtomCircle(ctx, atom, params) {
    const centre = new new Vector2D(atom.x, atom.y);
    transformXy(centre, params);

    const taper = {};
    taper.value = atom.value || 'P';
    taper.textAt = { v0: centre, v1: centre };
    taper.colour = rgbOfAtom(atom.value);

    ctx.save();
    ctx.beginPath();
    const r = params.fixedRadius || atom.r;
    ctx.arc(centre.x, centre.y, r, 0, Math.PI * 2, true);
    const rgb = taper.colour || 'rgba(200,0,0,0.3)';
    ctx.fillStyle = rgb;
    ctx.fill();
    ctx.lineWidth = 0.5;
    taper.rgbCurrentText = textColourToContrastWithRgb(rgb);
    ctx.strokeStyle = taper.rgbCurrentText;
    ctx.stroke();
    drawText(ctx, taper, params);
    ctx.restore();
  }

  /** Sub-diagram drawn from another annotator. */
  static _drawSubDiagram(ctxMix, atom, params) {
    // EXTERNAL: RR.getNamedAnnotator — returns another scene's canvas.
    // In the new architecture this would be a cross-scene reference.
    // Stub: fall back to label.
    drawMindMapLabel(ctxMix.ctx, atom, params);
  }

  /** Jatex (LaTeX-like) rendering. */
  static _drawJatex(ctxMix, atom, params) {
    // EXTERNAL: Jatex.parse(A, obj, d)
    // Stub — needs Jatex module import.
  }

  /**
   * Hit-test: check if the pointer is within the atom's clickable area.
   *
   * Old: hotspot colour was drawn to a separate canvas in kStageHots.
   * New: geometric hit-test returns interaction handlers.
   */
  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;

    const atom = node.value;
    if (!atom) return;

    const t = ctxMix.flyweight?._mindMapTransform || {};
    const centre = new new Vector2D(atom.x, atom.y);
    // Apply same transform that draw2d uses.
    const scale = t.size ?? 1;
    const theta = t.rotate ?? 0;
    const ctr   = new Vector2D(350, 200);
    const sc = centre.sub(ctr).rot(theta).mul(scale).add(ctr);

    const hitRadius = (atom.r || 12) * scale + 6;
    const dx = pt.x - sc.x;
    const dy = pt.y - sc.y;
    if (dx * dx + dy * dy > hitRadius * hitRadius) return;

    ctxMix.hitResult = {
      cursor: ctxMix.flyweight?.cursor
        ? [...ctxMix.flyweight.cursor] : null,
      interactions: {
        applyDrag(sx, sy) {
          // Inverse-transform screen coords back to model coords.
          const v = new Vector2D(sx, sy).sub(ctr).mul(1 / scale).rot(-theta).add(ctr);
          node.value.x = v.x;
          node.value.y = v.y;
        },
        applySelect(cursor) {
          // Future: selection highlighting, info-card display.
        },
      },
    };
  }
}

SYS.NODE_CLASSES.push({ name: 'atom', cls: AtomNode });
