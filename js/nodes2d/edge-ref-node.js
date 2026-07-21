/**
 * edge-ref-node.js — edge that references two drag-point nodes
 *
 * value.fromNode / value.toNode — live references to drag-point MiniAstNodes
 * value.from / value.to — stable uid strings (for display / serialisation)
 *
 * Place in: nodes2d/edge-ref-node.js
 */

import { sceneRegistry } from '../omni-support/scene.js';
import { Vector2D } from '../2d-support/vector2d.js';
import { WarpedPolygon } from '../nodes2d/warped-polygon.js';

class EdgeRefNode {

  static draw2d(ctxMix, node, params) {
    const T = ctxMix.T;
    if (!T) return;
    const v  = node.value || {};
    const fn = v.fromNode, tn = v.toNode;
    if (!fn || !tn) return;

    const zoom = T.sx;
    const s0 = T.toScreen({ x: fn.value?.x || 0, y: fn.value?.y || 0 });
    const s1 = T.toScreen({ x: tn.value?.x || 0, y: tn.value?.y || 0 });

    const selected = ctxMix.highlighted?.has(node);
    const width = ((params.pathWidth || 2) + (selected ? 2 : 0)) * zoom;
    const strokeWidth = (params.strokeWidth ?? 1) * zoom;
    const p0 = new Vector2D(s0.x, s0.y);
    const p1 = new Vector2D(s1.x, s1.y);
    const bend = params.bend ?? 0;
    const perp1 = p1.sub(p0).perp().rot(bend / 2).normalize(width);
    const perp2 = p1.sub(p0).perp().rot(-bend / 2).normalize(width);
    const corners = [p0.sub(perp1), p0.add(perp1), p1.add(perp2), p1.sub(perp2)];
    const bends = [-3.14, bend, -3.14, -bend];
    const pathD = WarpedPolygon.path(corners, bends);
    const path2D = new Path2D(pathD);

    const ctx = ctxMix.directCtx();

    ctx.globalAlpha = params.fillOpacity ?? 0.7;
    ctx.fillStyle   = params.pathColor || '#ffffffaa';
    ctx.fill(path2D);

    if (strokeWidth > 0) {
      ctx.globalAlpha = 1;
      ctx.lineWidth   = strokeWidth;
      ctx.lineCap     = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.stroke(path2D);
    }

    ctx.restore();
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    const T  = ctxMix.T;
    if (!pt || !T) return;
    const v  = node.value || {};
    const fn = v.fromNode, tn = v.toNode;
    if (!fn || !tn) return;

    const s0 = T.toScreen({ x: fn.value?.x || 0, y: fn.value?.y || 0 });
    const s1 = T.toScreen({ x: tn.value?.x || 0, y: tn.value?.y || 0 });

    // Point-to-segment distance in screen space
    const dx = s1.x - s0.x, dy = s1.y - s0.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1) return;

    const t = Math.max(0, Math.min(1,
      ((pt.x - s0.x) * dx + (pt.y - s0.y) * dy) / lenSq));

    // Exclude zones near endpoints so node hit-test wins
    const len     = Math.sqrt(lenSq);
    const exclude = ((params.pointRadius || 6) + 5) / len;
    if (t < exclude || t > 1 - exclude) return;

    const px = s0.x + t * dx, py = s0.y + t * dy;
    const dist = Math.sqrt((pt.x - px) ** 2 + (pt.y - py) ** 2);

    const threshold = Math.max(params.pathWidth || 2, 4) + 5;
    if (dist > threshold) return;

    ctxMix.hitResult = { node, cursor: node };
  }
}

sceneRegistry.registerNodeClass('edge-ref', EdgeRefNode);

export { EdgeRefNode };