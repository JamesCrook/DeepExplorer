import { sceneRegistry } from '../omni-support/sys.js';
export { TreeRingNode, ringGeometry, treeRingData };

function ringGeometry(ctxMix, node, params, data) {
  const { W, H } = ctxMix.getWH(ctxMix, node, params);
  const maxR = Math.max(0.1, Math.min(W, H) / 2 - 16);
  
  return { cx: W / 2, cy: H / 2, maxR, scale: maxR / data.totalR };
}


function ringLayout(W, H, data, idx) {
  const ring = data.rings[idx];
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.max(0.1, Math.min(W, H) / 2 - 16);
  const scale = maxR / data.totalR;
  
  return {
    cx,
    cy,
    innerR: ring.innerR * scale,
    outerR: ring.outerR * scale,
    ring,
    maxR,
    scale
  };
}

class TreeRingNode {
  /* Shared geometry when used as a flyweight under a plate.  A ring used on
     its own in an ordinary model finds no plate and falls back to its own
     value, which carries everything a single ring needs. */

  /* The geometry of this one ring.  Under a plate it scales with the whole
     trunk; standing alone in an ordinary model it scales to its own extent,
     so a TreeRingNode can be dropped into any scene. */
  static _ring(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const { W, H } = ctxMix.getWH(ctxMix, node, params);
    // Under an array the model supplies the trunk's scale; alone, the ring
    // scales to its own extent, so a TreeRingNode drops into any scene.
    const maxR = v.maxR ?? Math.max(0.1, Math.min(W, H) / 2 - 16);
    const scale = v.scale ?? maxR / (v.outerR || 1);
    
    return {
      cx: v.cx ?? W / 2,
      cy: v.cy ?? H / 2,
      maxR,
      scale,
      ring: v,
      innerR: v.innerR2 ?? (v.innerR || 0) * scale,
      outerR: v.outerR2 ?? (v.outerR || 0) * scale
    };
  }

  static getCount(data) {
    return data.rings.length;
  }

  static getHitOrder(data, count) {
    const o = [];
    for (let i = count - 1; i >= 0; i--) o.push(i);
    return o;
  }

  static drawBackground(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const { W, H } = ctxMix.getWH(ctxMix, node, params);
    const lo = ringLayout(W, H, node.value.data, 0);
    
    ctx.fillStyle = '#3a2818';
    ctx.beginPath();
    ctx.arc(lo.cx, lo.cy, lo.maxR + 4, 0, Math.PI * 2);
    ctx.fill();
  }

  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const ctx = ctxMix.ctx;
    const { W, H } = ctxMix.getWH(ctxMix, node, params);
    const lo = TreeRingNode._ring(ctxMix, node, params);
    const L = lo.ring.lightness || 0.5;
    
    let earlyCol;
    let lateCol;
    
    if (v.selected) {
      earlyCol = '#E8B840';
      lateCol = '#B08020';
    } else if (v.hovered) {
      earlyCol = '#907850';
      lateCol = '#685838';
    } else {
      earlyCol = `rgb(${140 + L * 80 | 0},${110 + L * 65 | 0},${60 + L * 40 | 0})`;
      lateCol = `rgb(${90 + L * 50 | 0},${65 + L * 35 | 0},${30 + L * 25 | 0})`;
    }
    
    ctx.beginPath();
    ctx.arc(v.cx, lo.cy, lo.outerR, 0, Math.PI * 2);
    ctx.arc(v.cx, lo.cy, lo.innerR, 0, Math.PI * 2, true);
    ctx.closePath();
    
    if (lo.outerR - lo.innerR > 1) {
      const g = ctx.createRadialGradient(v.cx, lo.cy, lo.innerR, v.cx, lo.cy, lo.outerR);
      g.addColorStop(0, earlyCol);
      g.addColorStop(1, lateCol);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = lateCol;
    }
    
    ctx.fill();
  }

  static drawOverlay(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const { W, H } = ctxMix.getWH(ctxMix, node, params);
    const lo = ringLayout(W, H, node.value.data, 0);
    const pithR = (node.value.data.rings[0]?.innerR || 3) * lo.maxR / node.value.data.totalR;
    
    ctx.fillStyle = '#6a4828';
    ctx.beginPath();
    ctx.arc(lo.cx, lo.cy, pithR, 0, Math.PI * 2);
    ctx.fill();
  }

  static hit_test(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const pt = ctxMix.hitPoint;
    
    if (!pt) return;
    
    const { W, H } = ctxMix.getWH(ctxMix, node, params);
    const lo = TreeRingNode._ring(ctxMix, node, params);
    const dx = pt.x - lo.cx;
    const dy = pt.y - lo.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist >= lo.innerR && dist <= lo.outerR) {
      ctxMix.hitResult = { node };
    }
  }
}

function treeRingData(count) {
  const rings = [];
  let r = 5;
  
  for (let i = 0; i < count; i++) {
    const base = 2.5 + Math.sin(i * 0.7) * 1.2 + Math.cos(i * 1.3) * 0.8;
    const width = Math.max(0.8, base + (((i * 137) % 17) / 17 - 0.5) * 2);
    const lightness = 0.3 + (((i * 53) % 23) / 23) * 0.5;
    const year = 2026 - count + i;
    let note = '';
    
    if (width < 1.5) note = 'drought year';
    else if (width > 4) note = 'strong growth';
    
    rings.push({ innerR: r, outerR: r + width, width, year, lightness, note });
    r += width;
  }
  
  return { rings, totalR: r };
}

sceneRegistry.registerNodeClass('tree-ring', TreeRingNode);
