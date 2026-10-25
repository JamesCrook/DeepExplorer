import { sceneRegistry } from '../omni-support/sys.js';
import { PipKinds } from '../2d-support/pip-kind.js';
export { RamachandranPointNode };
class RamachandranPointNode {

// New Style: Metadata tells the system how to interact with this node
  static meta = {
    pipKind: PipKinds.JUNCTION,
    zOrder: 1,
    spawnOverrides: (wp) => ({ x: wp.x, y: wp.y, text: 'residue' }),
    editableFields: (node) => [
      { key: 'name', label: 'Name', type: 'text', value: node.value.name || '' },
      { key: 'color', label: 'Color', type: 'color', value: node.value.color || '#882' },
    ],
  };

  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    if (!v) return;

    const ctx = ctxMix.ctx;
//v.isHovered = true;
    ctx.beginPath(); ctx.arc(v.x, v.y, v.radius, 0, Math.PI * 2);

    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.fillStyle = v.color || '#4fc3f7'; ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = v.isHovered ? '#fff' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = v.isHovered ? 2 : 1.5; ctx.stroke();

    if (v.isHovered && v.name) {
      ctx.fillStyle = '#fff'; ctx.font = `11px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(v.name, v.x, v.y - v.radius - 4);
      ctx.fillText(v.name, v.x, v.y - v.radius - 4);
    }
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;

    const v = ctxMix.getValue(ctxMix, node, params);
    if (!v) return;

    const dx = pt.x - v.x, dy = pt.y - v.y;

    if (dx * dx + dy * dy <= v.hitRadiusSq) {
      ctxMix.hitResult = {
        node: ctxMix.getNode(ctxMix, node, params), 
        pointIndex: v.index,
        phi: v.phi, 
        psi: v.psi, 
        name: v.name,
        interactions: { 
          applyDrag: v.applyDrag // Ensure you pass the function reference, don't invoke it
        }
      };
    }
  }
}

sceneRegistry.registerNodeClass('ramachandran-point', RamachandranPointNode);
