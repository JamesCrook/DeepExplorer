/**
 * trace-cell-node.js — `trace-cell`
 *
 * A round cell with an optional label, used by the algorithm traces
 * (apps/scenes-run.js).  A leaf with no logic: the model writes its value,
 * and draw2d only draws it.
 *
 *   value = { x, y, size, color, label }
 *
 * x, y and size are local units.  D3 contract: the value comes through the
 * resolver, position and scale come from T, drawing goes to directCtx (screen
 * space) where the pane provides it.  Stroke widths come from params
 * (strokeWidth, topWidth) and do not zoom.
 */

import { WarpedPolygon } from './warped-polygon.js';
import { Vector2D } from '../2d-support/vector2d.js';
import { SYS } from '../omni-support/sys.js';

class TraceCellNode {
  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const T = ctxMix.T;
    const c = T.toScreen({ x: v.x ?? 0, y: v.y ?? 0 });
    // Two corners on the diagonal, both edges bent by -PI, make a circle whose
    // diameter is the diagonal: 0.707 * 0.9 keeps neighbouring cells apart.
    const d = (v.size ?? 20) * T.uniformScale * 0.707 * 0.9;
    const geoms = [{
      type: 'warpedpoly',
      corners: [new Vector2D(c.x + d / 2, c.y + d / 2), new Vector2D(c.x - d / 2, c.y - d / 2)],
      bends: [-Math.PI, -Math.PI],
      color: v.color ?? '#333',
    }];
    if (v.label) geoms.push({ type: 'label', x: c.x, y: c.y, text: v.label, fontSize: params.fontSize });

    const ctx = ctxMix.directCtx ? ctxMix.directCtx() : (ctxMix.ctx.save(), ctxMix.ctx);
    WarpedPolygon.renderCtx(ctx, geoms, params);
    ctx.restore();
  }
}

SYS.NODE_CLASSES.push({ name: 'trace-cell', cls: TraceCellNode });

export { TraceCellNode };
