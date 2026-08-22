import { sceneRegistry } from '../omni-support/scene.js';
import { Transform }     from '../omni-support/transform.js';

// ═══════════════════════════════════════════════════════
//  DRAG POINT — migrated to T + directCtx
// T is a Transform
//
//  draw2d: uses directCtx() to draw at T.toScreen positions.
//    Point radius and labels are zoom-independent (fixed screen px).
//  hit_test: compares screen hitPoint against T.toScreen.
//    applyDrag uses T.toLocal to convert back.
// ═══════════════════════════════════════════════════════

class DragPointNode {

  static draw2d(ctxMix, node, params) {
    const T = ctxMix.T;
    if (!T) return;
    const v = node.value || {};
    const s = T.toScreen({ x: v.x || 0, y: v.y || 0 });
    const r = params.pointRadius || 6;
    const color = v.color || params.pointColor || '#4fc3f7';

    const ctx = ctxMix.directCtx();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 1.5; ctx.stroke();

    if (ctxMix.highlighted?.has(node)) {
      ctx.beginPath(); ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (v.name) {
      ctx.fillStyle = '#ffffffcc'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(v.name, s.x, s.y - r - 3);
    }
    if (v.emoji) {
      ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = (2 * r - 1) + 'px Arial';
      const fd = r / 6;
      ctx.fillText(v.emoji, s.x + fd * 0.33, s.y + fd);
    }
    ctx.restore();
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    const T  = ctxMix.T;
    if (!pt || !T) return;
    const v = node.value || {};
    const s = T.toScreen({ x: v.x || 0, y: v.y || 0 });
    const dx = pt.x - s.x, dy = pt.y - s.y;
    if (dx * dx + dy * dy > ((params.pointRadius || 6) + 5) ** 2) return;

    const Ts = T.clone();
    ctxMix.hitResult = {
      node,
      interactions: {
        applyDrag(screenX, screenY) {
          const local = Ts.toLocal({ x: screenX - dx, y: screenY - dy });
          node.value.x = local.x;
          node.value.y = local.y;
        },
      },
    };
  }
}

sceneRegistry.registerNodeClass('drag-point', DragPointNode);
