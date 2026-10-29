import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { HIGHLIGHT } from '../2d-support/paint.js';
export { ChromosomeBandNode, chrGeometry };

// `chromosome-band` — one cytoband of a chromosome, clipped to the chromosome's outline

const STAIN_COLORS = { gneg:'#E8E0D0', gpos25:'#B0A890', gpos50:'#808068', gpos75:'#505040', gpos100:'#282820', acen:'#B84430', gvar:'#A0A090', stalk:'#707060' };

function chromosomePath(ctx, cx, topY, botY, cenY, armW, cenW, capR) {
  ctx.beginPath(); ctx.moveTo(cx-armW, topY+capR);
  ctx.quadraticCurveTo(cx-armW,topY,cx,topY); ctx.quadraticCurveTo(cx+armW,topY,cx+armW,topY+capR);
  ctx.lineTo(cx+armW,cenY-8); ctx.quadraticCurveTo(cx+cenW,cenY,cx+armW,cenY+8);
  ctx.lineTo(cx+armW,botY-capR); ctx.quadraticCurveTo(cx+armW,botY,cx,botY);
  ctx.quadraticCurveTo(cx-armW,botY,cx-armW,botY-capR); ctx.lineTo(cx-armW,cenY+8);
  ctx.quadraticCurveTo(cx-cenW,cenY,cx-armW,cenY-8); ctx.lineTo(cx-armW,topY+capR); ctx.closePath();
}

// Shared geometry, asked for by the model when it makes each band's value.
function chrGeometry(ctxMix, node, params, data) {
  const { W, H } = ctxMix.getWH(ctxMix, node, params);
  return chrLayout(W, H, data);
}

function chrLayout(W,H,data) {
  const margin=30, chrH=Math.max(1,H-margin*2), cx=W/2, topY=margin, botY=margin+chrH;
  const scale=chrH/data.length, cenY=topY+((data.cenStart+data.cenEnd)/2)*scale;
  const armW=Math.max(1,Math.min(28,W*0.14)), cenW=armW*0.35, capR=armW*0.7;
  return { cx, topY, botY, chrH, scale, cenY, armW, cenW, capR };
}

class ChromosomeBandNode {
  static getCount(data) { return data.bands.length; }
  /* A clip that brackets the bands, so it is a ClipNode path rather than a
     background that draws — the save/restore pair is structural. */
  static clipPath(ctxMix, node, params) {
    const { W, H } = ctxMix.getWH(ctxMix, node, params);
    const lo = chrLayout(W, H, node.value.data);
    chromosomePath(ctxMix.ctx, lo.cx, lo.topY, lo.botY, lo.cenY, lo.armW, lo.cenW, lo.capR);
  }
  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const ctx = ctxMix.ctx;
    const band=v;
    if(v.selected) ctx.fillStyle=v.hovered?'#E8B840':HIGHLIGHT;
    else if(v.hovered) ctx.fillStyle='#504838';
    else ctx.fillStyle=STAIN_COLORS[band.stain]||'#E8E0D0';
    ctx.fillRect(v.cx-60,v.y1,120,Math.max(v.y2-v.y1,0.5));
  }
  /* The restore that used to live here is the ClipNode's now: this only
     draws the outline and the label over the finished bands. */
  static drawOverlay(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    const { W, H } = ctxMix.getWH(ctxMix, node, params);
    const lo = chrLayout(W, H, node.value.data);
    ctx.strokeStyle='#504838'; ctx.lineWidth=1;
    chromosomePath(ctx,lo.cx,lo.topY,lo.botY,lo.cenY,lo.armW,lo.cenW,lo.capR); ctx.stroke();
    ctx.fillStyle='#B84430'; ctx.beginPath(); ctx.arc(lo.cx,lo.cenY,lo.armW*0.28,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#908878'; ctx.font='600 12px monospace'; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('chr1',lo.cx,lo.botY+8);
  }
  static hit_test(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const pt = ctxMix.hitPoint; if (!pt) return;
    if(v.stain==='acen') return;
    if(pt.y<v.y1||pt.y>v.y2) return; if(Math.abs(pt.x-v.cx)>v.armW+2) return;
    ctxMix.hitResult={node};
  }
}

SYS.NODE_CLASSES.push({ name: 'chromosome-band', cls: ChromosomeBandNode });;
