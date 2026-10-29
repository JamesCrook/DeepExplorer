import { drawWigglyLine } from '../2d-support/wiggly-line.js';
export {
  kStageArrowShaft,
  kStageDragging,
  kStageOutlineEarly,
  kStageFillAndTextEarly,
  kStageOutline,
  kStageFillAndText,
  kStageArrowHead,
  kStageHots,
  transformXy,
  antiTransformXy,
  getTextDimensions,
  adjustTextDimensions,
  scalingInfo,
  drawText,
  svgWigglyLine,
  drawEndShape,
  drawEndShapes,
  getEndShape,
  drawStyledLine,
  drawScorpioLabel,
  drawTaper,
  drawLineLabelAndText,
  getExtraSpaceLeft,
  drawBackground,
  drawMindMapLabel,
  thetaOfConnection,
  drawAngle,
  drawQuad,
  getBondData,
  makeTaper,
};

/* ─────────────────────────────────────────────────────────────────────────────
workhorse-drawing — how the mind-map nodes draw: tapered bonds, styled lines
with end shapes, rotated labels and text, angle arcs and quads, and the
background. Scorpio's 2023 workhorse.js, rewritten for (ctx, obj, params).

Uses Shape (end shapes, Scorpio labels) without importing it, so those
throw if called; 2d-support/workhorse.js has the working originals.
──────────────────────────────────────────────────────────────────────────── */

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS (were globals in utils.js)
// ═══════════════════════════════════════════════════════════════

const kStageArrowShaft       = 1;
const kStageDragging         = 2;
const kStageOutlineEarly     = 3;
const kStageFillAndTextEarly = 4;
const kStageOutline          = 5;
const kStageFillAndText      = 6;
const kStageArrowHead        = 9;
const kStageHots             = 10;


// ═══════════════════════════════════════════════════════════════
//  COORDINATE HELPERS
// ═══════════════════════════════════════════════════════════════

/** Transform a point by rotation + scale around centre (350,200). */
function transformXy(obj, params) {
  if (!params) return;
  const scale = params.transformSize ?? 1;
  const theta = params.transformRotate ?? 0;
  const centre = new Vector2D(350, 200);
  const v = new Vector2D(obj.x, obj.y).sub(centre).rot(theta).mul(scale).add(centre);
  obj.x = v.x;
  obj.y = v.y;
}

/** Inverse of transformXy. */
function antiTransformXy(obj, params) {
  if (!params) return;
  const scale = params.transformSize ?? 1;
  const theta = params.transformRotate ?? 0;
  const centre = new Vector2D(350, 200);
  const v = new Vector2D(obj.x, obj.y).sub(centre).mul(1 / scale).rot(-theta).add(centre);
  obj.x = v.x;
  obj.y = v.y;
}


// ═══════════════════════════════════════════════════════════════
//  TEXT MEASUREMENT  (pure utility — no node dependency)
// ═══════════════════════════════════════════════════════════════

function getTextDimensions(ctx, text) {
  const lines = text.split(/<br>/);
  const lineHeight = ctx.measureText('M').width * 1.2;
  const y = lineHeight * lines.length + 5;
  const x = lines.reduce((acc, val) => Math.max(acc, ctx.measureText(val).width), 0);
  return { x, y };
}

function adjustTextDimensions(box, params) {
  let gx = params.xGranularity || params.sizeGranularity;
  if (gx && box.x > 12) box.x = Math.ceil(box.x / gx) * gx;
  let gy = params.yGranularity || params.sizeGranularity;
  if (gy && box.x > 12) box.y = Math.ceil(box.y / gy) * gy;
  box.x *= params.xMagnify || 1;
  box.y *= params.yMagnify || 1;
  return box;
}

function scalingInfo(params) {
  const s = (params.transformSize ?? 1) * 100;
  if (s > 50)  return { font: 1,   opaque: 1 };
  if (s < 40)  return { font: 0.7, opaque: 0.2 };
  const t = (s - 40) / 10;
  return { font: 0.7 + t * 0.3, opaque: 0.2 + t * 0.8 };
}


// ═══════════════════════════════════════════════════════════════
//  TEXT DRAWING  (shared by AtomNode, BondNode, MindMapNode)
// ═══════════════════════════════════════════════════════════════

/**
 * Draws rotated, aligned text along a taper/label path.
 *
 * Old signature:  drawText(A, obj, d)
 * New:            drawText(ctx, obj, params)
 */
function drawText(ctx, obj, params) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = obj.rgbCurrentText || '#f00';

  const scaling = scalingInfo(params);
  const fontSize = params.fontSize || obj.r;
  ctx.font = (fontSize * scaling.font) + 'px Arial';
  ctx.globalAlpha = scaling.opaque;

  const align = /*firstValid*/(obj.align ??  0.5);
  const lines = obj.value.split(/<br>/);
  const lineHeight = ctx.measureText('M').width * 1.2;

  const t = obj.textAt;
  let v = t.v0.mul(1 - align).add(t.v1.mul(align));
  let slope = t.v1.sub(t.v0).slope();

  const vTextOffset = new Vector2D(0, 6 + (params.fontYAdjust || 0));

  if (obj.disp) v = v.add(obj.disp);

  slope = slope + 5 * Math.PI;
  slope = Math.PI * ((slope / Math.PI + 0.5) % 1 - 0.5);
  v = v.add(vTextOffset.mul(1).rot(-slope));
  ctx.translate(v.x, v.y);
  ctx.rotate(slope);
  ctx.translate(-v.x, -v.y);
  v.y -= lineHeight * 0.5 * (lines.length - 1);

  for (let i = 0; i < lines.length; i++) {
    const width = ctx.measureText(lines[i]).width * align;
    ctx.fillText(lines[i], v.x - width, v.y + lineHeight * i);
  }
  ctx.restore();
}


// ═══════════════════════════════════════════════════════════════
//  LINE / TAPER / LABEL DRAWING
// ═══════════════════════════════════════════════════════════════

/**
 * Draw a wiggly (wavy) line segment.
 * Pure canvas helper — no node dependency.
 */


function svgWigglyLine(n, d, bend) {
  let str = '';
  for (let i = 0; i < n; i++) {
    const phase = (((i + 2) % 3) - 1);
    const t = (i + 1 + 0.6 * phase) / n;
    const b = 2.5 * t * (1 - t) * bend;
    str += (i % 3 === 0) ? ' C ' : ' ';
    str += 100 * t + ' ' + (d * phase + b);
  }
  return str.trim();
}


// ═══════════════════════════════════════════════════════════════
//  END-SHAPE DRAWING  (shared by BondNode, taper drawing)
// ═══════════════════════════════════════════════════════════════

function drawEndShape(ctx, v, v2, code) {
  if (!code) return;
  ctx.save();

  const s = new Shape();
  const t = new Shape();
  t.addPoint(v);
  t.addPoint(v2);
  t.scaling = 1;

  const edge = ShapeData.LeftEdges[code];
  const fn = edge && edge.fn;
  if (fn) fn(1, t, s);

  s.addPoint(v2);
  s.drawInner(ctx, { pathWithEnds: true });
  ctx.stroke();
  ctx.restore();
}

function drawEndShapes(ctx, v, perp, along, endSize, lineWidth, codes) {
  if (!codes) return;
  let v0 = v;
  ctx.beginPath();
  for (const code of codes) {
    const edge = ShapeData.LeftEdges[code];
    if (edge) {
      v0 = v.add(along.mul(-lineWidth / 2 + endSize * edge.mid));
    }
    drawEndShape(ctx, v0.sub(perp), v0.add(perp), code);
    v = v.sub(along.mul(lineWidth * 2.5));
  }
}

function getEndShape(codes) {
  if (!codes) return '(';
  for (const code of codes) {
    if (ShapeData.LeftEdges[code]) return code;
  }
  return '(';
}


// ═══════════════════════════════════════════════════════════════
//  drawStyledLine  (bond lines with multiplicity and wiggles)
// ═══════════════════════════════════════════════════════════════

/**
 * Draws a styled line between two endpoints.
 * Old: drawStyledLine(A, obj, d)
 * New: drawStyledLine(ctx, obj, params)
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} obj  — taper-like object with lineAt, bend, multiplicity, etc.
 * @param {object} params — merged style params
 */
function drawStyledLine(ctx, obj, params) {
  if (!obj.lineAt) return;

  let { v0, v1 } = obj.lineAt;
  const style = params;

  let disp = v1.sub(v0).normalized();
  let bend = 0;
  let theta = 0;

  if (style.bend)   bend = style.bend;
  if (obj.bend)     bend = obj.bend;
  if (bend)         theta = Math.atan((bend * 2) / 100);
  if (obj.taperIs === 'label') theta = 0;

  if (style.lineExtend) {
    const l = style.lineExtend * 0.5;
    v0 = v0.sub(disp.mul(l).rot(theta));
    v1 = v1.add(disp.mul(l).rot(-theta));
  }

  setSolid(ctx, style, 1, v0, v1, style.colourScheme);

  const endSize   = style.endSize || 15;
  const lineWidth = style.linkWidth || 2;
  const rgb       = style.fill || 'rgba(110,110,110,1.0)';

  let multiplicity = obj.multiplicity || 1;
  let wiggleSize   = 0;
  if (obj.lineType1 === '==') multiplicity = 2;
  if (obj.lineType1 === '~~') wiggleSize = 1;

  disp = disp.normalized().perp();

  ctx.save();
  ctx.beginPath();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = rgb;

  const along = v1.sub(v0);
  const l2 = along.length();
  const wiggleCount = wiggleSize ? Math.floor(l2 / (5 * wiggleSize)) : 0;
  const bendNorm = (obj.bend || 0) / 100;

  for (let i = 0; i < multiplicity; i++) {
    const d2 = disp.mul((2 * i - multiplicity + 1) * lineWidth);
    const u0 = v0.add(d2);
    const u1 = v1.add(d2);
    ctx.moveTo(u0.x, u0.y);
    drawWigglyLine(ctx, u0, u1, wiggleCount, bendNorm);
  }
  ctx.stroke();

  const perpScaled = disp.mul(endSize);
  const alongNorm  = along.mul(1 / l2);
  const thetaEnd   = Math.atan(bendNorm * 2);

  ctx.lineWidth    = lineWidth;
  ctx.strokeStyle  = rgb;

  drawEndShapes(ctx, v0, perpScaled.rot(thetaEnd),
    alongNorm.rot(thetaEnd), endSize, lineWidth, obj.lineEndShape1);
  drawEndShapes(ctx, v1, perpScaled.mul(-1).rot(-thetaEnd),
    alongNorm.rot(-thetaEnd), -endSize, -lineWidth, obj.lineEndShape2);

  ctx.restore();
}


// ═══════════════════════════════════════════════════════════════
//  drawScorpioLabel  (shaped taper label with warts/bevels)
// ═══════════════════════════════════════════════════════════════

function drawScorpioLabel(ctx, obj, style, va, vb, vc, vd) {
  let s = new Shape();
  s.addPoints(va, vb, vc, vd);
  const wartList = new Shape();

  wartList.addEdges(
    obj.endShape1, obj.topEdge,
    obj.endShape2, obj.botEdge,
  );
  s = s.addWarts(wartList);
  s = s.reduce();
  if (obj.bevel) s = s.bevelCorners(obj.bevel);
  s.draw(ctx, style);
}


// ═══════════════════════════════════════════════════════════════
//  drawTaper  (shaped bond/label with fill, multiplicity, wiggle)
// ═══════════════════════════════════════════════════════════════

/**
 * Old: drawTaper(A, obj, d) — large multi-purpose draw function.
 * New: drawTaper(ctx, obj, params, hotsCtx)
 *
 * `hotsCtx` is passed only during hotspot drawing; otherwise null.
 */
function drawTaper(ctx, obj, params, hotsCtx) {
  const isHotspot = !!hotsCtx;

  let style = { outline: '#225533', fill: '#55AA77', width: 4 };

  if (isHotspot) {
    if (!obj.hotspotColour) return;
    style = { fill: obj.hotspotColour };
    ctx = hotsCtx;
  } else {
    // Old code split outline-only and fill-only across stages.
    // In the new lifecycle, draw2d does fill+outline together.
    style.colourScheme = params.colourScheme;
    style.lineWidth    = params.lineWidth || 6;
    style.rgbText      = params.rgbText;
  }

  const bLabel = obj.taperIs === 'label';
  const src = bLabel ? obj.textAt : obj.lineAt;
  let { v0, v1, r0, r1 } = src;

  if (obj.disp) {
    v0 = v0.add(obj.disp);
    v1 = v1.add(obj.disp);
  }

  let disp  = v1.sub(v0).normalized();
  const dperp = disp.perp();
  const dperp0 = dperp.mul(r0);
  const dperp1 = dperp.mul(r1);

  let theta = 0;
  const bend = (!bLabel && (obj.bend || params.bend)) || 0;
  if (bend) theta = Math.atan((bend * 2) / 100);

  if (!obj.label && params.lineExtend) {
    const le = params.lineExtend * 0.5;
    v0 = v0.sub(disp.mul(le).rot(theta));
    v1 = v1.add(disp.mul(le).rot(-theta));
  }

  const va = v0.add(dperp0.rot(theta));
  const vb = v1.add(dperp1.rot(-theta));
  const vc = v1.sub(dperp1.rot(-theta));
  const vd = v0.sub(dperp0.rot(theta));

  if (!isHotspot) {
    setColourScheme(ctx, style, obj, v0, v1);
    obj.rgbCurrentText = style.rgbCurrentText;
    if (obj.styled) {
      style.fill    = '#a0a0a0';
      style.outline = '#c0c0c0';
      style.sheen   = '#707070';
      style.gradient = null;
      obj.rgbCurrentText = '#d0d0d0';
    }
  }

  const proxyObj = {};
  let multiplicity = 1;
  let wiggleSize   = 0;

  if (bLabel) {
    proxyObj.endShape1 = obj.endShape1 || '(';
    proxyObj.endShape2 = obj.endShape2 || ')';
  } else {
    proxyObj.endShape1 = getEndShape(obj.lineEndShape1);
    proxyObj.endShape2 = getEndShape(obj.lineEndShape2);
    multiplicity = obj.multiplicity || 1;
    if (obj.lineType1 === '==') multiplicity = 2;
    if (obj.lineType1 === '~~') wiggleSize = 1;
  }

  const along = v1.sub(v0);
  const l = along.length();
  const wiggleCount = wiggleSize ? Math.floor(l / (15 * wiggleSize)) : 0;

  if (wiggleCount) {
    const n = 3 * wiggleCount;
    const dd = 1000 / l;
    setInOutBend('bend',     svgWigglyLine(n, dd, bend));
    setInOutBend('antibend', svgWigglyLine(n, dd, -bend));
    proxyObj.topEdge = 'bend';
    proxyObj.botEdge = 'antibend';
    proxyObj.bevel   = false;
  } else if (bend) {
    setInOutBend('bend',     `C 25 ${bend} 75 ${bend} 100 0`);
    setInOutBend('antibend', `C 25 ${-bend} 75 ${-bend} 100 0`);
    proxyObj.topEdge = 'bend';
    proxyObj.botEdge = 'antibend';
    proxyObj.bevel   = false;
  } else {
    proxyObj.topEdge = (obj.inStem  && 'InStem')  || 'straight';
    proxyObj.botEdge = (obj.outStem && 'OutStem') || 'straight';
    proxyObj.bevel   = params.bevel;
  }

  const da   = vd.sub(va);
  const db   = vc.sub(vb);
  const nTot = 2 * multiplicity - 1;

  for (let i = 0; i < multiplicity; i++) {
    const vva = va.add(da.mul((2 * i) / nTot));
    const vvb = vb.add(db.mul((2 * i) / nTot));
    const vvc = vvb.add(db.mul(1 / nTot));
    const vvd = vva.add(da.mul(1 / nTot));
    drawScorpioLabel(ctx, proxyObj, style, vva, vvb, vvc, vvd);
  }
}


// ═══════════════════════════════════════════════════════════════
//  drawLineLabelAndText  (bond line + label in one pass)
// ═══════════════════════════════════════════════════════════════

/**
 * Old: drawLineLabelAndText(A, taper, d)
 * New: drawLineLabelAndText(ctx, taper, params)
 */
function drawLineLabelAndText(ctx, taper, params) {
  taper.align = 0.5;
  const align = /*firstValid*/(taper.align ??  0.5);

  ctx.save();
  ctx.textAlign = 'left';

  const fontSize = params.fontSize || 12;
  ctx.font = fontSize + 'px Arial';

  const mWidth = ctx.measureText('M').width;
  let box = getTextDimensions(ctx, taper.str);
  box = adjustTextDimensions(box, params);
  taper.height = /*firstValid*/((taper.height) ?? ( box.y / mWidth));

  const extraSpaceLeft  = (mWidth * taper.height) * getExtraSpaceLeft(taper.endShape1);
  const extraSpaceRight = (mWidth * taper.height) * getExtraSpaceLeft(taper.endShape2);

  let textPad = Math.min(20, box.x / 3);
  textPad = /*firstValid*/((params.pad) ?? ( textPad));
  if (isDefined(taper.pad)) textPad = taper.pad * mWidth;
  let textWidth = box.x + textPad;

  taper.textAdjust = (align - 1) * extraSpaceLeft + align * extraSpaceRight;
  const corrector = mWidth * (0.8 * taper.height - 0.2);
  taper.textAdjust += corrector * (0.5 - align);

  textWidth = Math.max(textWidth, extraSpaceLeft + extraSpaceRight);
  textWidth = Math.max(0.001, textWidth + Math.min(0, textPad));

  if (isDefined(taper.width)) {
    textWidth = Math.max(0.001, taper.width * mWidth);
  }

  let unitVec;
  const tLine = taper.lineAt;
  unitVec = tLine
    ? tLine.v1.sub(tLine.v0).normalized()
    : new Vector2D(1, 0);

  const tText = taper.textAt;

  const leftAdj  = unitVec.mul((-0.5) * textWidth);
  const rightAdj = unitVec.mul(( 0.5) * textWidth);

  tText.v0 = tText.v0.add(leftAdj);
  tText.v1 = tText.v1.add(rightAdj);

  const leftAdj2  = unitVec.mul( extraSpaceLeft);
  const rightAdj2 = unitVec.mul(-extraSpaceRight);

  const reducedHeight = taper.height - 0.4;
  tText.r0 = reducedHeight * fontSize / 2 + 2;
  tText.r1 = reducedHeight * fontSize / 2 + 2;

  taper.value = taper.str;
  taper.style = { gradient: true };

  if (taper.makeLine) {
    taper.lineAt.v0 = taper.lineAt.v0.add(tText.v0);
    taper.lineAt.v1 = taper.lineAt.v1.add(tText.v1);
  }

  tText.v0 = tText.v0.add(leftAdj2);
  tText.v1 = tText.v1.add(rightAdj2);
  taper.taperIs = 'link';

  taper.disp = null;

  if (params.defaultLinkType === 'Wide') {
    drawTaper(ctx, taper, params);
  } else {
    drawStyledLine(ctx, taper, params);
  }
  taper.taperIs = 'label';

  if (taper.lineAt && taper.bend) {
    const tl = taper.lineAt;
    taper.disp = tl.v1.sub(tl.v0).perp().mul(taper.bend / 200);
  }

  taper.label = true;
  if (taper.drawLabel) drawTaper(ctx, taper, params);
  if (taper.drawText) {
    const vAdj = taper.textAt.v1.sub(taper.textAt.v0).normalized(taper.textAdjust);
    taper.textAt.v0 = taper.textAt.v0.add(vAdj);
    taper.textAt.v1 = taper.textAt.v1.add(vAdj);
    taper.rgbCurrentText = taper.rgbCurrentText || params.rgbText;
    drawText(ctx, taper, params);
  }

  ctx.restore();
}


function getExtraSpaceLeft(code) {
  const type = ShapeData.LeftEdges[code];
  return type ? type.space : 0.0;
}


// ═══════════════════════════════════════════════════════════════
//  BACKGROUND DRAWING
// ═══════════════════════════════════════════════════════════════

/**
 * Old: drawBackground(A, obj, d) — handles image or solid-colour bg.
 * New: drawBackground(ctxMix, node, params)
 */
function drawBackground(ctxMix, node, params) {
  const ctx = ctxMix.ctx;
  const bg = node.value?.background;
  if (!bg) return;

  const viewport = ctxMix.viewport;

  // If the background is a cached image, draw it centered.
  if (ctxMix.backgroundImg) {
    const img = ctxMix.backgroundImg;
    const xExtra = constrain(0, viewport.width - img.width, viewport.width);
    const yExtra = constrain(0, viewport.height - img.height, 80);
    ctx.drawImage(img, xExtra / 2, yExtra / 2);
    return;
  }

  // Test whether bg is a valid CSS colour.
  const probe = document.createElement('div');
  probe.style.color = 'rgb(10, 10, 11)';
  probe.style.color = bg;

  if (probe.style.color === 'rgb(10, 10, 11)') {
    // Not a colour — it is an image URL.  Request it asynchronously.
    // EXTERNAL: image-loading is managed by the host framework.
    // ctxMix.requestBackground?.(bg);
    return;
  }

  // Valid colour — fill.
  ctx.beginPath();
  ctx.fillStyle = bg;
  ctx.rect(0, 0, viewport.width, viewport.height);
  ctx.fill();
}


// ═══════════════════════════════════════════════════════════════
//  MIND-MAP LABEL DRAWING  (single atom label)
// ═══════════════════════════════════════════════════════════════

/**
 * Old: drawMindMapLabel(A, obj, d)
 * Now a utility called from AtomNode.draw2d.
 */
function drawMindMapLabel(ctx, atom, params) {
  if (atom.hide) return;

  const taper = parseLabelString(atom.value);
  const v  = new Vector2D(atom.x, atom.y);
  const dv = new Vector2D(1, 0);
  transformXy(v, params);

  taper.label  = true;
  taper.styled = atom.styled;
  taper.l1 = atom.level + 1;
  taper.l2 = atom.level;

  if (taper.drawLine) {
    taper.makeLine = 100;
    taper.lineAt = { v0: dv.mul(-1), v1: dv.mul(1), r0: 4, r1: 4 };
  }
  taper.textAt = { v0: v.sub(dv), v1: v.add(dv), r0: 4, r1: 4 };

  drawLineLabelAndText(ctx, taper, params);
}


// ═══════════════════════════════════════════════════════════════
//  ANGLE ARC DRAWING
// ═══════════════════════════════════════════════════════════════

function thetaOfConnection(obj, con, params) {
  const a = obj.atoms[1];
  const b = obj.atoms[2 * con];
  const thetaAdj = Math.atan(2 * obj.bends[con] / 100);
  return Math.atan2(b.y - a.y, b.x - a.x) - thetaAdj;
}

function drawAngle(ctx, obj, params) {
  const centre = new new Vector2D(obj.atoms[1].x, obj.atoms[1].y);
  transformXy(centre, params);

  let theta0 = thetaOfConnection(obj, 0) - (params.transformRotate ?? 0);
  let theta1 = thetaOfConnection(obj, 1) - (params.transformRotate ?? 0);

  const dAngle = Math.abs(43 + 2 * (theta0 - theta1) / Math.PI) % 4;
  const isRightAngle = dAngle < 0.03;
  let rgb = obj.colour || '#e0000040';

  ctx.save();
  ctx.beginPath();

  const r = 30;
  if (isRightAngle) {
    ctx.moveTo(centre.x, centre.y);
    ctx.lineTo(centre.x + r * Math.cos(theta0), centre.y + r * Math.sin(theta0));
    ctx.lineTo(
      centre.x + r * Math.cos(theta0) + r * Math.cos(theta1),
      centre.y + r * Math.sin(theta0) + r * Math.sin(theta1));
    ctx.lineTo(centre.x + r * Math.cos(theta1), centre.y + r * Math.sin(theta1));
    ctx.lineTo(centre.x, centre.y);
    rgb = '#f0900040';
  } else {
    ctx.moveTo(centre.x, centre.y);
    ctx.arc(centre.x, centre.y, r, theta0, theta1, true);
    ctx.moveTo(centre.x, centre.y);
  }

  ctx.fillStyle = rgb;
  ctx.fill();

  ctx.beginPath();
  if (isRightAngle) {
    ctx.moveTo(centre.x + r * Math.cos(theta0), centre.y + r * Math.sin(theta0));
    ctx.lineTo(
      centre.x + r * Math.cos(theta0) + r * Math.cos(theta1),
      centre.y + r * Math.sin(theta0) + r * Math.sin(theta1));
    ctx.lineTo(centre.x + r * Math.cos(theta1), centre.y + r * Math.sin(theta1));
  } else {
    ctx.arc(centre.x, centre.y, r, theta0, theta1, true);
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = textColourToContrastWithRgb(rgb);
  ctx.stroke();
  ctx.restore();
}


// ═══════════════════════════════════════════════════════════════
//  QUAD DRAWING
// ═══════════════════════════════════════════════════════════════

function drawQuad(ctx, obj, style) {
  setColourScheme(ctx, style, obj, new Vector2D(10, 10), new Vector2D(690, 390));
  const s = new Shape();
  for (const atom of obj.atoms) {
    s.addPoint(new Vector2D(atom.x, atom.y));
  }
  s.draw(ctx, style);
}


// ═══════════════════════════════════════════════════════════════
//  getBondData  (extract endpoints from a bond)
// ═══════════════════════════════════════════════════════════════

function getBondData(bond, params, r) {
  let a = bond.a1;
  const v0 = new Vector2D(a.x, a.y);
  const r0 = r || a.size || a.r;
  const l1 = a.level;

  a = bond.a2;
  const v1 = (a.ast && a.ast.box) ? a.ast.box.midpoint() : new Vector2D(a.x, a.y);
  const r1 = r || a.size || a.r;
  const l2 = a.level;

  transformXy(v0, params);
  transformXy(v1, params);

  return [v0, v1, r0, r1, l1, l2];
}


// ═══════════════════════════════════════════════════════════════
//  makeTaper  (build taper object from a bond)
// ═══════════════════════════════════════════════════════════════

function makeTaper(bond, params) {
  const taper = parseLabelString(bond.value || '--');
  taper.extensionLength = /*firstValid*/((params.lineExtend) ?? ( -12));

  const r = bond.linkWidth || params.linkWidth;
  const [v0, v1, r0, r1, l1, l2] = getBondData(bond, params, r);

  taper.v0 = v0;
  taper.v1 = v1;
  taper.lineAt = { v0, v1, r0, r1 };

  const mid = v0.add(v1).mul(0.5);
  taper.textAt = { v0: mid, v1: mid, r0: 2, r1: 2 };

  taper.l1 = l1;
  taper.l2 = l2;
  taper.styled = bond.styled;
  taper.label  = false;
  taper.bend   = bond.bend;
  taper.multiplicity   = bond.multiplicity;
  taper.hotspotColour  = bond.hotspotColour;
  taper.taperIs = 'link';

  return taper;
}
