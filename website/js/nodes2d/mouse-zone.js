import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { HIGHLIGHT } from '../2d-support/paint.js';
export { MouseButtonNode, mouseGeometry };

function mouseGeometry(ctxMix, node, params) {
  const { W, H } = ctxMix.getWH(ctxMix, node, params);
  const pad = 30;
  const mh = Math.max(10, H - pad * 2);
  const scale = mh / 280;
  const mw = 160 * scale;
  
  return { mw, mh, ox: (W - mw) / 2, oy: (H - mh) / 2, scale };
}

function buildMouseBodyPath(ctx, mw, mh) {
  const pts = [
    [mw * 0.3, 0], [mw * 0.7, 0], [mw * 0.9, mh * 0.2], [mw, mh * 0.6],
    [mw * 0.8, mh], [mw * 0.2, mh], [0, mh * 0.6], [mw * 0.1, mh * 0.2]
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const xc = (pts[i][0] + pts[i + 1][0]) / 2;
    const yc = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], xc, yc);
  }
  ctx.quadraticCurveTo(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]);
  ctx.closePath();
}

function buildZonePath(ctx, index, mw, mh, scale) {
  ctx.beginPath();
  if (index === 0) {
    const pts = [[mw * 0.05, mh * 0.05], [mw * 0.48, mh * 0.02], [mw * 0.45, mh * 0.4], [mw * 0.05, mh * 0.4]];
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.quadraticCurveTo(pts[1][0], pts[1][1] - (mh * 0.05), pts[1][0], pts[1][1]);
    ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.quadraticCurveTo(pts[3][0], pts[3][1] + (mh * 0.02), pts[3][0], pts[3][1]);
  } else if (index === 1) {
    const pts = [[mw * 0.52, mh * 0.02], [mw * 0.95, mh * 0.05], [mw * 0.95, mh * 0.4], [mw * 0.55, mh * 0.4]];
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.quadraticCurveTo(pts[1][0], pts[1][1] - (mh * 0.05), pts[1][0], pts[1][1]);
    ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.quadraticCurveTo(pts[3][0], pts[3][1] + (mh * 0.02), pts[3][0], pts[3][1]);
  } else if (index === 2) {
    if (ctx.roundRect) ctx.roundRect(mw * 0.47, mh * 0.1, mw * 0.06, mh * 0.15, 5 * scale);
    else ctx.rect(mw * 0.47, mh * 0.1, mw * 0.06, mh * 0.15);
  } else if (index === 3) {
    if (ctx.roundRect) ctx.roundRect(mw * 0.48, mh * 0.28, mw * 0.04, mh * 0.06, 3 * scale);
    else ctx.rect(mw * 0.48, mh * 0.28, mw * 0.04, mh * 0.06);
  } else if (index === 4) {
    ctx.moveTo(0, mh * 0.4);
    ctx.lineTo(mw * 0.1, mh * 0.4);
    ctx.lineTo(mw * 0.08, mh * 0.55);
    ctx.lineTo(-mw * 0.02, mh * 0.55);
  } else if (index === 5) {
    ctx.moveTo(-mw * 0.02, mh * 0.57);
    ctx.lineTo(mw * 0.08, mh * 0.57);
    ctx.lineTo(mw * 0.06, mh * 0.7);
    ctx.lineTo(-mw * 0.04, mh * 0.68);
  }
  ctx.closePath();
}

class MouseButtonNode {
  static getCount(data) {
    return data.length;
  }

  static drawBackground(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const { W, H } = ctxMix.getWH(ctxMix, node, params);
    const pad = 30;
    const mh = Math.max(10, H - pad * 2);
    const scale = mh / 280;
    const mw = 160 * scale;
    const ox = (W - mw) / 2;
    const oy = (H - mh) / 2;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 30 * scale;
    ctx.shadowOffsetY = 10 * scale;
    buildMouseBodyPath(ctx, mw, mh);
    const bodyGrad = ctx.createLinearGradient(0, 0, mw, mh);
    bodyGrad.addColorStop(0, '#2d3342');
    bodyGrad.addColorStop(1, '#111317');
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#3a3830';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#0a0b0e';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(mw * 0.45, mh * 0.05, mw * 0.1, mh * 0.35, 10 * scale);
    else ctx.rect(mw * 0.45, mh * 0.05, mw * 0.1, mh * 0.35);
    ctx.fill();
    ctx.fillStyle = 'rgba(232,184,64,0.1)';
    ctx.beginPath();
    ctx.arc(mw * 0.5, mh * 0.75, mw * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const ctx = ctxMix.ctx;
    const lo = v;

    ctx.save();
    ctx.translate(lo.ox, lo.oy);
    buildZonePath(ctx, v.shape, lo.mw, lo.mh, v.scale);
    const isActive = v.selected || v.hovered;

    if (v.shape === 0 || v.shape === 1) {
      const gradient = ctx.createLinearGradient(0, 0, 0, lo.mh * 0.4);
      if (v.selected) {
        gradient.addColorStop(0, HIGHLIGHT);
        gradient.addColorStop(1, '#806020');
      } else if (v.hovered) {
        gradient.addColorStop(0, '#B0A070');
        gradient.addColorStop(1, '#504838');
      } else {
        gradient.addColorStop(0, '#2d3342');
        gradient.addColorStop(1, '#1e232d');
      }
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = isActive ? '#fff' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (v.shape === 2 || v.shape === 3) {
      ctx.fillStyle = v.selected ? HIGHLIGHT : v.hovered ? '#B0A070' : (v.shape === 2 ? '#334155' : '#475569');
      ctx.fill();
      if (v.shape === 2) {
        ctx.fillStyle = '#1e293b';
        for (let i = 0; i < 4; i++) ctx.fillRect(lo.mw * 0.47, lo.mh * (0.12 + i * 0.03), lo.mw * 0.06, lo.mh * 0.01);
      }
    } else {
      ctx.fillStyle = v.selected ? HIGHLIGHT : v.hovered ? '#B0A070' : '#2a2f3a';
      ctx.fill();
    }
    ctx.restore();
  }

  static drawOverlay(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const lo = mouseGeometry(ctxMix, node, params);

    ctx.save();
    ctx.translate(lo.ox, lo.oy);
    const centers = [
      [lo.mw * 0.25, lo.mh * 0.22], [lo.mw * 0.75, lo.mh * 0.22],
      [lo.mw * 0.50, lo.mh * 0.175], [lo.mw * 0.50, lo.mh * 0.31],
      [lo.mw * 0.04, lo.mh * 0.47], [lo.mw * 0.02, lo.mh * 0.63]
    ];

    for (let i = 0; i < centers.length; i++) {
      ctx.beginPath();
      ctx.arc(centers[i][0], centers[i][1], 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232,50,50,0.8)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  static hit_test(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const pt = ctxMix.hitPoint;
    const lo = v;
    if (!pt) return;

    /* isPointInPath reads device coordinates, and during hit_test the context
       still carries whatever transform the last draw left on it.  Pin the
       transform to identity so the path and the world-space hit point are
       measured in the same units, whatever the camera is doing. */
    const ctx = ctxMix.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(lo.ox, lo.oy);
    buildZonePath(ctx, v.shape, lo.mw, lo.mh, v.scale);
    const inside = ctx.isPointInPath(pt.x, pt.y);
    ctx.restore();

    if (inside) ctxMix.hitResult = { node };
  }
}
SYS.NODE_CLASSES.push({ name: 'mouse-button', cls: MouseButtonNode });;
