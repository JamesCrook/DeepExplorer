// poly-draw.js — polygons given as [[x, y], …] arrays
/**
 *   fillPoly(ctx, pts), strokePoly(ctx, pts)   closed path, filled or stroked
 *   scalePts(pts, w, h)                        unit coordinates to w × h
 *
 * Shared by nodes2d/heatmap-node.js (Omni) and nodes2d/heatmap-zone.js (Zones),
 * which had identical copies.
 */

function fillPoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

function strokePoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.stroke();
}

function scalePts(pts, w, h) {
  return pts.map(p => [p[0] * w, p[1] * h]);
}

export { fillPoly, strokePoly, scalePts };
