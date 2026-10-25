import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { Geo } from '../2d-support/geo.js';
import { PipKinds } from '../2d-support/pip-kind.js';
import { Values } from '../omni-support/values.js';
export { PippedPolygonNode };
class PippedPolygonNode {
  static meta = {
    zOrder: 1,
    pipKind: PipKinds.TILE,
    coneParams: (node) => ({ n: node.value.n || 4, tilt: node.value.tilt || 0 }),
    spawnOverrides: (wp) => ({ x: wp.x, y: wp.y, r: SYS.R }),
  };
  static getCentreXY(res, node, params) {
    const v = res.getValue(res, node, params) || {};
    return { x: v.x || 0, y: v.y || 0 };
  }
  static getPips(res, node, params) {
    const v = res.getValue(res, node, params);
    return Geo.pips(v.n, v.x || 0, v.y || 0, v.r, v.tilt);
  }
  static getVerts(res, node, params) {
    const v = res.getValue(res, node, params);
    return Geo.verts(v.n, v.x || 0, v.y || 0, v.r, v.tilt);
  }
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx, v = ctxMix.getValue(ctxMix, node, params);
    const verts = PippedPolygonNode.getVerts(ctxMix, node, params);
    const pal = (params.colors || {})[v.n] || { fill: '#888', stroke: '#666' };

    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
      ctx.closePath();
    ctx.fillStyle = v.color || pal.fill; ctx.fill();
    ctx.strokeStyle = pal.stroke; ctx.lineWidth = 2; ctx.stroke();

    if (v.selected || v.hovered) {
      ctx.beginPath();
      ctx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
        ctx.closePath();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    if (!Geo.ptInPoly(pt.x, pt.y, PippedPolygonNode.getVerts(ctxMix, node, params))) return;
    const { x, y } = PippedPolygonNode.getCentreXY(ctxMix, node, params);
    const dx = pt.x - x, dy = pt.y - y;
    ctxMix.hitResult = {
      node, interactions: {
        applyDrag(wx, wy) { Values.setValue(Values, node, params, { x: wx - dx, y: wy - dy }); },
      },
    };
  }
}

SYS.STOCK?.push( SYS.makeNode('pipped-polygon', { x: 0, y: 0, r: SYS.R*0.55, n: 4, tilt: Math.PI / 4, label: 'Square' }))

sceneRegistry.registerNodeClass('pipped-polygon', PippedPolygonNode);
