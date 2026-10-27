import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { HIGHLIGHT } from '../2d-support/paint.js';
export { BGAPinNode, ROW_LETTERS, pinLayout };

/* The same number as HEATMAP_ASPECT_RATIO, deliberately not shared: the two
   templates happen to agree today and neither should learn about the other. */
const BGA_ASPECT_RATIO = 500 / 700;
const ROW_LETTERS = 'ABCDEFGHJKLMNPRTUVWY';
const BGA_COLORS = {
  power: '#c0392b',
  ground: '#2c3e50',
  signal: '#27ae60',
  nc: '#3a3828'
};

function pinLayout(W, H, data, v) {
  const cols = data.cols;
  const row = v.row;
  const col = v.col;
  const margin = 30;
  
  const spacing = Math.min((W - margin * 2) / cols, (H - margin * 2) / data.rows);
  const gridW = spacing * cols;
  const gridH = spacing * data.rows;
  
  const ox = (W - gridW) / 2 + spacing / 2;
  const oy = (H - gridH) / 2 + spacing / 2;
  
  return {
    cx: ox + col * spacing,
    cy: oy + row * spacing,
    r: spacing * 0.32,
    row,
    col,
    pin: v.pin,
    name: v.name,
    spacing,
    gridW,
    gridH,
    ox: ox - spacing / 2,
    oy: oy - spacing / 2
  };
}

class BGAPinNode {
  static getCount(data) {
    return data.rows * data.cols;
  }

  static drawBackground(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const { W, H } = ctxMix.getWH(ctxMix, node, params);
    const lo = pinLayout(W, H, node.value.data, 0);
    const pad = lo.spacing * 0.45;
    
    ctx.fillStyle = '#1a1918';
    ctx.strokeStyle = '#333028';
    ctx.lineWidth = 1;
    
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(lo.ox - pad, lo.oy - pad, lo.gridW + pad * 2, lo.gridH + pad * 2, 6);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(lo.ox - pad, lo.oy - pad, lo.gridW + pad * 2, lo.gridH + pad * 2);
      ctx.strokeRect(lo.ox - pad, lo.oy - pad, lo.gridW + pad * 2, lo.gridH + pad * 2);
    }
    
    ctx.fillStyle = '#5a5448';
    ctx.beginPath();
    ctx.arc(lo.ox - pad / 2, lo.oy - pad / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const ctx = ctxMix.ctx;
    const lo = v;
    
    if (!lo.pin) return;
    
    let fill = BGA_COLORS[lo.pin.type] || '#555';
    
    if (v.selected) {
      fill = HIGHLIGHT;
    } else if (v.hovered) {
      fill = '#B0A070';
    }
    
    ctx.beginPath();
    ctx.arc(v.cx, lo.cy, lo.r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    
    if (!v.selected) {
      const g = ctx.createRadialGradient(v.cx - lo.r * 0.3, lo.cy - lo.r * 0.3, 0, v.cx, lo.cy, lo.r);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  static hit_test(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const pt = ctxMix.hitPoint;
    
    if (!pt) return;
    
    const lo = v;
    if (!lo.pin) return;
    
    const dx = pt.x - v.cx;
    const dy = pt.y - lo.cy;
    
    if (dx * dx + dy * dy <= lo.r * lo.r) {
      ctxMix.hitResult = { node };
    }
  }
}

SYS.NODE_CLASSES.push({ name: 'bga-pin', cls: BGAPinNode });;
