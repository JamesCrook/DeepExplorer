import { SYS, sceneRegistry } from '../omni-support/sys.js';
export { RamachandranChartNode, RC_DEFAULTS };

/* ─────────────────────────────────────────────────────────────────────────────
Ramachandran-specific chart nodes — read dimensions from ctxMix.getWH()
──────────────────────────────────────────────────────────────────────────── */
const REGION_SETS = {
  general: {
    favored: [
      { label: 'β',   cx: -119, cy:  133, rx: 53, ry: 38, rot: -0.61 },
      { label: 'α',   cx:  -66, cy:  -42, rx: 32, ry: 26, rot: -0.17 },
      { label: 'Lα',  cx:   58, cy:   42, rx: 21, ry: 19, rot:  0.17 },
    ],
    allowed: [
      { cx: -105, cy:  135, rx: 78, ry: 56, rot: -0.52 },
      { cx:  -66, cy:  -42, rx: 50, ry: 40, rot: -0.17 },
      { cx:   58, cy:   42, rx: 35, ry: 30, rot:  0.17 },
      { cx:  -85, cy:    5, rx: 22, ry: 55, rot:  0.30 }, 
    ],
  },
  glycine: {
    favored: [
      { label: 'β',   cx: -119, cy:  133, rx: 53, ry: 38, rot: -0.61 },
      { label: 'α',   cx:  -66, cy:  -42, rx: 32, ry: 26, rot: -0.17 },
      { label: 'Lα',  cx:   58, cy:   42, rx: 32, ry: 26, rot:  0.17 },
      { label: 'Lβ',  cx:  119, cy: -133, rx: 53, ry: 38, rot:  0.61 },
    ],
    allowed: [
      { cx: -105, cy:  135, rx: 78, ry: 56, rot: -0.52 },
      { cx:  -66, cy:  -42, rx: 50, ry: 40, rot: -0.17 },
      { cx:   58, cy:   42, rx: 50, ry: 40, rot:  0.17 },
      { cx:  105, cy: -135, rx: 78, ry: 56, rot:  0.52 },
    ],
  },
  proline: {
    favored: [
      { label: 'β', cx: -63, cy:  148, rx: 13, ry: 32, rot: 0 },
      { label: 'α', cx: -63, cy:  -30, rx: 13, ry: 28, rot: 0 },
    ],
    allowed: [
      { cx: -63, cy:  148, rx: 20, ry: 42, rot: 0 },
      { cx: -63, cy:  -30, rx: 20, ry: 40, rot: 0 },
    ],
  },
  preProline: {
    favored: [
      { label: 'β', cx: -125, cy:  148, rx: 48, ry: 26, rot: -0.35 },
      { label: 'α', cx:  -63, cy:  -30, rx: 26, ry: 20, rot: -0.17 },
    ],
    allowed: [
      { cx: -125, cy:  148, rx: 68, ry: 40, rot: -0.35 },
      { cx:  -63, cy:  -30, rx: 42, ry: 33, rot: -0.17 },
    ],
  },
};

const RC_DEFAULTS = Object.freeze({
  aspectRatio:      1,
  bgFill:           '#1c1c24',
  borderColor:      '#3a3a4c',
  borderWidth:      1.5,
  cornerRadius:     6,
  showRegions:      true,
  regionSet:        'general',
  favoredFill:      'rgba(80, 180, 120, 0.35)',
  favoredStroke:    'rgba(80, 180, 120, 0.60)',
  allowedFill:      'rgba(80, 180, 120, 0.12)',
  allowedStroke:    'rgba(80, 180, 120, 0.30)',
  regionLineWidth:  1.5,
  showRegionLabels: true,
  regionLabelColor: 'rgba(200, 220, 200, 0.7)',
  regionLabelSize:  18,
  showGrid:         true,
  gridStep:         30,
  gridColor:        'rgba(255, 255, 255, 0.05)',
  gridLineWidth:    1,
  axisColor:        'rgba(255, 255, 255, 0.25)',
  axisLineWidth:    1.5,
  showTicks:        true,
  tickStep:         60,
  tickLength:       5,
  tickLabelColor:   '#889',
  tickLabelSize:    10,
  axisTitleColor:   '#aab',
  axisTitleSize:    14,
  showDiagonal:     false,
  diagonalColor:    'rgba(255, 255, 255, 0.08)',
});

class RamachandranChartNode {

  static _geom(ctxMix, p) {
    const { W, H } = ctxMix.getWH();
    const ASPECT_RATIO = p.aspectRatio || 1.0;

    const fitW = Math.min(W, H * ASPECT_RATIO);
    const fitH = Math.min(W / ASPECT_RATIO, H);

    const left = -fitW / 2;
    const top = -fitH / 2;

    return { fitW, fitH, left, top };
  }

  static phiPsiToScreen(phi, psi, g) {
    const nx = (phi + 180) / 360;
    const ny = (180 - psi) / 360; 
    return {
      x: g.left + nx * g.fitW,
      y: g.top + ny * g.fitH
    };
  }

  static screenToPhiPsi(sx, sy, g) {
    const nx = (sx - g.left) / g.fitW;
    const ny = (sy - g.top) / g.fitH;
    return {
      phi: nx * 360 - 180,
      psi: 180 - ny * 360
    };
  }

  static _drawEllipseRegion(ctx, region, g) {
    const srx = Math.abs(region.rx * (g.fitW / 360));
    const sry = Math.abs(region.ry * (g.fitH / 360));
    if (srx < 0.5 || sry < 0.5) return;

    for (const dPsi of [0, 360, -360]) {
      const shifted = RamachandranChartNode.phiPsiToScreen(region.cx, region.cy + dPsi, g);
      ctx.beginPath();
      ctx.ellipse(shifted.x, shifted.y, srx, sry, -(region.rot || 0), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  static draw2d(ctxMix, node, params) {
    const p = { ...RC_DEFAULTS, ...params };
    const g = RamachandranChartNode._geom(ctxMix, p);
    const ctx = ctxMix.ctx;
    const { left, top, fitW, fitH } = g;

    ctx.save();
    ctx.fillStyle = p.bgFill;
    const cr = p.cornerRadius || 0;
    if (cr > 0 && ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(left, top, fitW, fitH, cr); ctx.fill();
    } else {
      ctx.fillRect(left, top, fitW, fitH);
    }

    ctx.save();
    ctx.beginPath();
    if (cr > 0 && ctx.roundRect) ctx.roundRect(left, top, fitW, fitH, cr);
    else ctx.rect(left, top, fitW, fitH);
    ctx.clip();

    if (p.showRegions) {
      const regions = REGION_SETS[p.regionSet] || REGION_SETS.general;

      ctx.fillStyle = p.allowedFill; ctx.strokeStyle = p.allowedStroke; ctx.lineWidth = p.regionLineWidth || 1;
      for (const reg of regions.allowed) RamachandranChartNode._drawEllipseRegion(ctx, reg, g);

        ctx.fillStyle = p.favoredFill; ctx.strokeStyle = p.favoredStroke; ctx.lineWidth = p.regionLineWidth || 1;
      for (const reg of regions.favored) RamachandranChartNode._drawEllipseRegion(ctx, reg, g);
    }

    if (p.showGrid) {
      const step = p.gridStep || 30;
      ctx.strokeStyle = p.gridColor; ctx.lineWidth = p.gridLineWidth || 1;
      for (let deg = -180 + step; deg < 180; deg += step) {
        if (deg === 0)
          continue;
        const vTop = RamachandranChartNode.phiPsiToScreen(deg, 180, g);
        const vBot = RamachandranChartNode.phiPsiToScreen(deg, -180, g);
        ctx.beginPath(); ctx.moveTo(vTop.x, vTop.y); ctx.lineTo(vBot.x, vBot.y); ctx.stroke();

        const hLt = RamachandranChartNode.phiPsiToScreen(-180, deg, g);
        const hRt = RamachandranChartNode.phiPsiToScreen(180, deg, g);
        ctx.beginPath(); ctx.moveTo(hLt.x, hLt.y); ctx.lineTo(hRt.x, hRt.y); ctx.stroke();
      }
    }

    if (p.showDiagonal) {
      const d0 = RamachandranChartNode.phiPsiToScreen(-180, 180, g);
      const d1 = RamachandranChartNode.phiPsiToScreen(180, -180, g);
      ctx.strokeStyle = p.diagonalColor; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(d0.x, d0.y); ctx.lineTo(d1.x, d1.y); ctx.stroke();
    }

    ctx.strokeStyle = p.axisColor; ctx.lineWidth = p.axisLineWidth || 1.5;

    const ax0t = RamachandranChartNode.phiPsiToScreen(0, 180, g);
    const ax0b = RamachandranChartNode.phiPsiToScreen(0, -180, g);
    ctx.beginPath(); ctx.moveTo(ax0t.x, ax0t.y); ctx.lineTo(ax0b.x, ax0b.y); ctx.stroke();

    const ax0l = RamachandranChartNode.phiPsiToScreen(-180, 0, g);
    const ax0r = RamachandranChartNode.phiPsiToScreen(180, 0, g);
    ctx.beginPath(); ctx.moveTo(ax0l.x, ax0l.y); ctx.lineTo(ax0r.x, ax0r.y); ctx.stroke();

    if (p.showRegionLabels) {
      const regions = REGION_SETS[p.regionSet] || REGION_SETS.general;
      const rlSize = p.regionLabelSize || 18;
      ctx.font = `700 italic ${rlSize.toFixed(1)}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      for (const reg of regions.favored) {
        if (!reg.label)
          continue;
        const ls = RamachandranChartNode.phiPsiToScreen(reg.cx, reg.cy, g);
        ctx.fillText(reg.label, ls.x + 1.5, ls.y + 1.5);
      }
      ctx.fillStyle = p.regionLabelColor;
      for (const reg of regions.favored) {
        if (!reg.label)
          continue;
        const ls = RamachandranChartNode.phiPsiToScreen(reg.cx, reg.cy, g);
        ctx.fillText(reg.label, ls.x, ls.y);
      }
    }

    ctx.restore(); 

    if (p.borderWidth > 0) {
      ctx.strokeStyle = p.borderColor; ctx.lineWidth = p.borderWidth;
      if (cr > 0 && ctx.roundRect) {
        ctx.beginPath(); ctx.roundRect(left, top, fitW, fitH, cr); ctx.stroke();
      } else {
        ctx.strokeRect(left, top, fitW, fitH);
      }
    }

    if (p.showTicks) {
      const step = p.tickStep || 60;
      const tLen = p.tickLength || 5;
      const tSize = p.tickLabelSize || 10;

      ctx.strokeStyle = p.axisColor; ctx.lineWidth = 1;
      ctx.fillStyle = p.tickLabelColor; ctx.font = `${tSize.toFixed(1)}px monospace`;

      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let deg = -180; deg <= 180; deg += step) {
        const tp = RamachandranChartNode.phiPsiToScreen(deg, -180, g);
        ctx.beginPath(); ctx.moveTo(tp.x, tp.y); ctx.lineTo(tp.x, tp.y + tLen); ctx.stroke();
        ctx.fillText(deg + '°', tp.x, tp.y + tLen + 3);
      }

      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let deg = -180; deg <= 180; deg += step) {
        const tp = RamachandranChartNode.phiPsiToScreen(-180, deg, g);
        ctx.beginPath(); ctx.moveTo(tp.x, tp.y); ctx.lineTo(tp.x - tLen, tp.y); ctx.stroke();
        ctx.fillText(deg + '°', tp.x - tLen - 4, tp.y);
      }
    }

    const atSize = p.axisTitleSize || 14;
    ctx.fillStyle = p.axisTitleColor; ctx.font = `italic 600 ${atSize.toFixed(1)}px system-ui, sans-serif`;

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const phiPos = RamachandranChartNode.phiPsiToScreen(0, -180, g);
    ctx.fillText('φ (phi)', phiPos.x, phiPos.y + 24);

    ctx.save();
    const psiPos = RamachandranChartNode.phiPsiToScreen(-180, 0, g);
    ctx.translate(psiPos.x - 34, psiPos.y);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ψ (psi)', 0, 0);
    ctx.restore();
  }
}

SYS.NODE_CLASSES.push({ name: 'ramachandran-chart', cls: RamachandranChartNode });;
