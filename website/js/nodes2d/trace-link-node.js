// `trace-link` — a link between two points, optionally bent into an arc, for the algorithm traces
/**
 * A link between two points, optionally bent into an arc, used by the
 * algorithm traces (apps/scenes-run.js).  A leaf with no logic: the model
 * writes its value, and draw2d only draws it.
 *
 *   value = { x1, y1, x2, y2, color, bend, inset }
 *
 * Points and inset are local units; inset pulls both ends in, so a link stops
 * short of the cells it joins.  bend is the arc angle in radians (0 = straight).
 * Line width comes from params.linkWidth and does not zoom.
 */

import { WarpedPolygon } from './warped-polygon.js';
import { Vector2D } from '../2d-support/vector2d.js';
import { SYS } from '../omni-support/sys.js';

class TraceLinkNode {
  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const T = ctxMix.T;
    const a = T.toScreen({ x: v.x1 ?? 0, y: v.y1 ?? 0 });
    const b = T.toScreen({ x: v.x2 ?? 0, y: v.y2 ?? 0 });
    let p = new Vector2D(a.x, a.y), q = new Vector2D(b.x, b.y);
    const inset = (v.inset ?? 0) * T.uniformScale;
    if (inset > 0 && p.distanceTo(q) > 2 * inset) {
      const step = q.sub(p).normalize().scale(inset);
      p = p.add(step);
      q = q.sub(step);
    }
    const bend = v.bend ?? 0;
    const ctx = ctxMix.directCtx ? ctxMix.directCtx() : (ctxMix.ctx.save(), ctxMix.ctx);
    WarpedPolygon.renderCtx(ctx, [{
      type: 'link', corners: [p, q], bends: [bend, -bend], color: v.color ?? '#333',
    }], params);
    ctx.restore();
  }
}

SYS.NODE_CLASSES.push({ name: 'trace-link', cls: TraceLinkNode });

export { TraceLinkNode };
