import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { Utils } from '../omni-support/utils.js';
export { FractureConeNode };
class FractureConeNode {
  static draw2d(ctxMix, node, params) {
    const target = node.inst?.target;
    const drag = target?.state?.raftDrag;
    if (!drag || !drag.cone || drag.phase !== 'preLock') return;

    const ctx = ctxMix.ctx;
    const at = drag.node.state?.dragOrigin;
    if (!at) return;

    // draw the actual cone
    ctx.save();
    ctx.globalAlpha = 0.20;
    ctx.beginPath();
    ctx.moveTo(at.x, at.y);
    ctx.arc(at.x, at.y, 240, 
      drag.cone.centerAngle - drag.cone.halfSpan, 
      drag.cone.centerAngle + drag.cone.halfSpan);
    ctx.closePath();
    ctx.fillStyle = '#6699ee';
    ctx.fill();

    // draw obver the raft of items.
    // This is not that helpful.
    for (const t of drag.previewGroup || []) {
      const from = t.state?.dragOrigin;
      if (!from)
        continue;
      ctx.globalAlpha = 0.30;
      const cls = Utils.classOfNode(t);
      const verts = cls.getVerts ? cls.getVerts(ctxMix, { value: { ...t.value, x: from.x, y: from.y } }, params) : [];
      if (verts.length > 0) {
        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
          ctx.closePath();
        ctx.fillStyle = '#229922';
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

SYS.NODE_CLASSES.push({ name: 'fracture-cone', cls: FractureConeNode });;
