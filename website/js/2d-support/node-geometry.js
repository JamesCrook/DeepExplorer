// node-geometry.js — small geometry helpers that many 2D node classes shared as identical private copies
/**
 *   pointCentreXY(res, node, params)   a node whose value is a point: its x, y
 *                                       (local units).  The getCentreXY of
 *                                       drag-point, button-node, word-node,
 *                                       ring-label, the sky nodes and the
 *                                       pipped buttons and polygons.
 *   bboxFromCorners(corners)           axis-aligned box {x, y, w, h} of four
 *                                       corner points.
 *   layoutInline(ctxMix, node, params) a layout phase: place node.box at the
 *                                       running ctxMix.layout.x and advance it
 *                                       by the box width (the jatex leaves).
 *
 * A class adopts one as a static field, e.g.  static getCentreXY = pointCentreXY;
 * The registry files layoutInline as a 'layout' handler, because its first
 * parameter is ctxMix; the others are not phases.
 */

function pointCentreXY(res, node, params) {
  const v = res.getValue(res, node, params) || {};
  return { x: v.x || 0, y: v.y || 0 };
}

function bboxFromCorners(corners) {
  let x0 = corners[0].x, y0 = corners[0].y, x1 = x0, y1 = y0;
  for (let i = 1; i < 4; i++) {
    const c = corners[i];
    if (c.x < x0) x0 = c.x;
    if (c.y < y0) y0 = c.y;
    if (c.x > x1) x1 = c.x;
    if (c.y > y1) y1 = c.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function layoutInline(ctxMix, node, params) {
  node.box.move(ctxMix.layout.x, ctxMix.layout.y);
  ctxMix.layout.x += node.box.width();
}

export { pointCentreXY, bboxFromCorners, layoutInline };
