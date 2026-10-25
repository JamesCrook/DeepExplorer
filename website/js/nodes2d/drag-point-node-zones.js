import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { Geo } from '../2d-support/geo.js';
import { PipKinds } from '../2d-support/pip-kind.js';
import { Values } from '../omni-support/values.js';
export { DragPointNode };
class DragPointNode {
  static RADIUS = 5;
  static meta = {
    zOrder: 1,
    pipKind: PipKinds.JUNCTION,
    spawnOverrides: (wp) => ({ x: wp.x, y: wp.y, r: 5, color: '#334', stroke: '#556' }),
    editableFields: (node) => [
      { key: 'r', label: 'Radius', type: 'number', value: node.value.r || 5 },
      { key: 'color', label: 'Color', type: 'color', value: node.value.color || '#334' },
      { key: 'stroke', label: 'Outline', type: 'color', value: node.value.stroke || '#556' },
    ],
  };

  static getCentreXY(res, node, params) {
    const v = res.getValue(res, node, params) || {};
    return { x: v.x || 0, y: v.y || 0 };
  }
  static getPips(res, node, params) {
    const { x, y } = DragPointNode.getCentreXY(res, node, params);
    return [{ x, y, out: 0 }];
  }
  static setPipPos(res, node, params) {
    if (params.idx === 0) res.setValue(res, node, params, { x: params.x, y: params.y });
  }

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx, v = ctxMix.getValue(ctxMix, node, params);
    const r = v.r || DragPointNode.RADIUS;
    const {x, y} = DragPointNode.getCentreXY(ctxMix, node, params);

    ctx.beginPath(); ctx.arc(x, y, r, 0, Geo.TAU);
    ctx.fillStyle = v.color || '#334'; ctx.fill();
    ctx.strokeStyle = v.stroke || '#556'; ctx.lineWidth = 1.5; ctx.stroke();

    if (v.selected || v.hovered) {
      ctx.beginPath(); ctx.arc(x, y, r+5, 0, Geo.TAU);
      ctx.setLineDash([3, 3]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.stroke(); ctx.setLineDash([]);
    }
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const v = ctxMix.getValue(ctxMix, node, params);
    const {x, y} = DragPointNode.getCentreXY(ctxMix, node, params);
    const dx = pt.x - x, dy = pt.y - y;
    const r = v.r || DragPointNode.RADIUS;
    if (dx * dx + dy * dy > (r + 7) ** 2) return;
    const ox = dx, oy = dy;
    // Writes go through the channel, never to the value read above: that may
    // be a copy, and assigning to it would reach nothing.
    ctxMix.hitResult = {
      node, interactions: {
        applyDrag(wx, wy) { Values.setValue(Values, node, params, { x: wx - ox, y: wy - oy }); },
      },
    };
  }
}

SYS.STOCK?.push( SYS.makeNode('drag-point',     { x: 0, y: 0, r: 5, label: 'Junction' }))

sceneRegistry.registerNodeClass('drag-point', DragPointNode);
