// wiggly-line.js — a wavy line, optionally bowed, appended to the current path
/**
 *   drawWigglyLine(ctx, v0, v1, wiggleCount, bend)
 *     v0, v1        Vector2D ends; the path is assumed to be at v0 already.
 *     wiggleCount   number of half-waves; <= 1 draws a single smooth bow.
 *     bend          bow, as a fraction of the length, perpendicular to v0→v1.
 *   applyBend(bender, p, t)
 *     the bow's offset at fraction t (a parabola, zero at both ends).
 *
 * Shared by 2d-support/workhorse.js, nodes2d/workhorse-nodes.js and
 * nodes2d/jatex-twisty-node.js, which each had a copy.
 */

function applyBend(bender, p, t) {
  return p.add(bender.mul(2 * t * (1 - t)));
}

function drawWigglyLine(ctx, v0, v1, wiggleCount, bend) {
  const along = v1.sub(v0);
  const bender = along.perp(bend);

  if (wiggleCount <= 1) {
    const b = bender.mul(2 * 0.3333);
    const p = v0.add(along.mul(0.3)).add(b);
    const q = v1.sub(along.mul(0.3)).add(b);
    ctx.bezierCurveTo(p.x, p.y, q.x, q.y, v1.x, v1.y);
    return;
  }

  const seg = along.mul(1 / wiggleCount);
  const disp = seg.perp(0.3);
  for (let j = 0; j < wiggleCount; j++) {
    const m = v0.add(seg.mul(j + 0.5).add(disp.mul((j % 2) ? -1 : 1)));
    const r = v0.add(seg.mul(j + 1));
    const mBent = applyBend(bender, m, (j + 0.5) / wiggleCount);
    const rBent = applyBend(bender, r, (j + 1) / wiggleCount);
    ctx.quadraticCurveTo(mBent.x, mBent.y, rBent.x, rBent.y);
  }
}

export { drawWigglyLine, applyBend };
