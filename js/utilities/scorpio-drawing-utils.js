/**
 * scorpio-drawing-utils.js
 *
 * Shared drawing primitives extracted from scorpiodiagrams.js.
 * These are small canvas-level helpers that multiple node classes use.
 * They have NO dependency on the scene-graph system.
 *
 * Migrated from: Registrar.js.scorpiodiagrams_js IIFE
 */

// ── Imports (uncomment and fix paths once migrated) ──────────
// import { Vector2d }       from '../2d-support/vector2d.js';
// import { constrain, firstValid, isDefined }
//                           from '../utilities/utils.js';


// ═══════════════════════════════════════════════════════════════
//  CONSTANTS  (drawing stages — kept for legacy compat)
// ═══════════════════════════════════════════════════════════════

export const kStageArrowShaft       = 1;
export const kStageDragging         = 2;
export const kStageOutlineEarly     = 3;
export const kStageFillAndTextEarly = 4;
export const kStageOutline          = 5;
export const kStageFillAndText      = 6;
export const kStageArrowHead        = 9;
export const kStageHots             = 10;


// ═══════════════════════════════════════════════════════════════
//  OBJECT PROPERTY HELPERS
// ═══════════════════════════════════════════════════════════════

/** Extract pos/rect as {x, y, xw, yh}. */
export function getBox(obj) {
  return {
    x:  obj.pos.x,
    y:  obj.pos.y,
    xw: obj.rect.x,
    yh: obj.rect.y,
  };
}

export function getXy(obj) {
  return { x: obj.x, y: obj.y };
}

/** Apply object colours and lineWidth to a context. */
export function applyObjectSettingsToContext(ctx, obj) {
  ctx.font = '16px Arial';
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth   = firstValid(obj.lineWidth, 3);
  ctx.fillStyle   = firstValid(obj.colour,       'rgba(255,255,255,1.0)');
  ctx.strokeStyle = firstValid(obj.borderColour, 'rgba( 55, 55,155,1.0)');
}

/**
 * Where an object contains styling information, update from it.
 * Where it doesn't, inherit from the Styles.dict system.
 */
export function mayUpdateObjectStyle(styles, obj) {
  if (isDefined(obj.style) && isFinite(obj.style)) {
    styles.current = obj.style;
  }
  const styleRec = styles.dict[styles.current] || {};
  obj.colour       = firstValid(obj.colour,       styleRec.colour);
  obj.borderColour = firstValid(obj.borderColour, styleRec.borderColour);
  obj.cornerRadius = firstValid(obj.cornerRadius, styleRec.cornerRadius);

  styleRec.colour       = firstValid(obj.colour,       'rgb(255,255,255)');
  styleRec.borderColour = firstValid(obj.borderColour, 'rgb(80,80,200)');
  styleRec.cornerRadius = firstValid(obj.cornerRadius, 0);
  styleRec.head         = firstValid(obj.head,         false);
  styles.dict[styles.current] = styleRec;
}


// ═══════════════════════════════════════════════════════════════
//  SMALL DRAWING SHAPES  (star, spot, rect, triangle, L-shapes)
// ═══════════════════════════════════════════════════════════════

export function drawStar(ctx, S) {
  const n = 10;
  const r = S.r || 3.5;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const theta = Math.PI * 2 * (i / n) + S.theta;
    const r0 = (i % 2 === 0) ? r : 2.5 * r;
    const xx = S.x + r0 * Math.cos(theta);
    const yy = S.y + r0 * Math.sin(theta);
    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  }
  ctx.fill();
  ctx.lineWidth = 0.5;
  if (!isDefined(S.doStroke) || S.doStroke) ctx.stroke();
}

export function drawSpot(ctx, S) {
  ctx.beginPath();
  ctx.arc(S.x, S.y, S.r, 0, 2 * Math.PI, false);
  ctx.closePath();
  ctx.fill();
  if (!isDefined(S.doStroke) || S.doStroke) ctx.stroke();
}

export function drawCentredRect(ctx, S) {
  ctx.beginPath();
  ctx.rect(S.x - S.w / 2, S.y - S.h / 2, S.w, S.h);
  ctx.closePath();
  ctx.fill();
  if (!isDefined(S.doStroke) || S.doStroke) ctx.stroke();
}

export function drawUpTriangle(ctx, S) {
  const k = 3;
  ctx.beginPath();
  ctx.moveTo(S.x, S.y);
  ctx.lineTo(S.x - S.w / 2, S.y + S.h);
  ctx.lineTo(S.x - S.w / 2, S.y + S.h + k);
  ctx.lineTo(S.x + S.w / 2, S.y + S.h + k);
  ctx.lineTo(S.x + S.w / 2, S.y + S.h);
  ctx.closePath();
  ctx.fill();
  if (!isDefined(S.doStroke) || S.doStroke) ctx.stroke();
}

export function drawLeftL(ctx, S) {
  const k = 5;
  ctx.beginPath();
  ctx.moveTo(S.x, S.y);
  ctx.lineTo(S.x, S.y + S.h + k);
  ctx.lineTo(S.x + S.w, S.y + S.h + k);
  ctx.lineTo(S.x + S.w, S.y + S.h);
  ctx.lineTo(S.x + S.w - k / 2, S.y + S.h);
  ctx.lineTo(S.x + k, S.y + k / 2);
  ctx.lineTo(S.x + k, S.y);
  ctx.closePath();
  ctx.fill();
  if (!isDefined(S.doStroke) || S.doStroke) ctx.stroke();
}

export function drawRightL(ctx, S) {
  const k = 5;
  ctx.beginPath();
  ctx.moveTo(S.x, S.y);
  ctx.lineTo(S.x, S.y + S.h + k);
  ctx.lineTo(S.x - S.w, S.y + S.h + k);
  ctx.lineTo(S.x - S.w, S.y + S.h);
  ctx.lineTo(S.x - S.w + k / 2, S.y + S.h);
  ctx.lineTo(S.x - k, S.y + k / 2);
  ctx.lineTo(S.x - k, S.y);
  ctx.closePath();
  ctx.fill();
  if (!isDefined(S.doStroke) || S.doStroke) ctx.stroke();
}

/** Dispatch to the right glyph draw function. */
export function drawGlyph(ctx, obj, S) {
  if (obj.glyph === 'L')   return drawLeftL(ctx, S);
  if (obj.glyph === 'Mid') return drawUpTriangle(ctx, S);
  if (obj.glyph === 'R')   return drawRightL(ctx, S);
  if (obj.glyph === 'Spot') return drawSpot(ctx, S);
  return drawStar(ctx, S);
}


// ═══════════════════════════════════════════════════════════════
//  ROUND RECTANGLE
// ═══════════════════════════════════════════════════════════════

export function drawRoundRect(ctx, obj) {
  const { x, y, xw: w, yh: h } = getBox(obj);
  let r = obj.cornerRadius || 1;
  if (w < 0 || h < 0) return;
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}


// ═══════════════════════════════════════════════════════════════
//  LINE / ARROW GEOMETRY
// ═══════════════════════════════════════════════════════════════

/**
 * Line between two points, with length and angle.
 * Returns [{x, y, l, theta}, {x, y, l, theta}].
 */
export function getLineBetweenPoints(pt1, pt2) {
  const vx = pt2.x - pt1.x;
  const vy = pt2.y - pt1.y;
  const l  = Math.sqrt(vx * vx + vy * vy);
  return [
    { x: pt1.x, y: pt1.y, l, theta: Math.atan2(vy, vx) + Math.PI },
    { x: pt2.x, y: pt2.y, l, theta: Math.atan2(vy, vx) },
  ];
}

/** How much to trim a line to land on the boundary of an object. */
export function getTrimmedLineExtent(obj, vx, vy) {
  if (obj.type === 'Draggable') return 1;
  if (obj.type === 'Circle') {
    const r = Math.min(obj.rect.y, obj.rect.x) / 2;
    return r / Math.sqrt(vx * vx + vy * vy);
  }
  if (Math.abs(vx) * obj.rect.y > Math.abs(vy) * obj.rect.x) {
    return obj.rect.x / (2 * Math.abs(vx));
  }
  return obj.rect.y / (2 * Math.abs(vy));
}

/** Line between two objects, trimmed to their boundaries. */
export function getTrimmedLineBetweenObjects(obj1, obj2) {
  let x1 = obj1.pos.x + obj1.rect.x / 2;
  let x2 = obj2.pos.x + obj2.rect.x / 2;
  let y1 = obj1.pos.y + obj1.rect.y / 2;
  let y2 = obj2.pos.y + obj2.rect.y / 2;

  if (isDefined(obj1.offset)) { x1 = obj1.offset.x + obj1.pos.x; y1 = obj1.offset.y + obj1.pos.y; }
  if (isDefined(obj2.offset)) { x2 = obj2.offset.x + obj2.pos.x; y2 = obj2.offset.y + obj2.pos.y; }

  const vx = x2 - x1;
  const vy = y2 - y1;
  const m = getTrimmedLineExtent(obj2, vx, vy);
  const n = getTrimmedLineExtent(obj1, vx, vy);
  const l = Math.sqrt(vx * vx + vy * vy);

  return [
    { x: x1 + n * vx, y: y1 + n * vy, l, theta: Math.atan2(vy, vx) + Math.PI },
    { x: x2 - m * vx, y: y2 - m * vy, l, theta: Math.atan2(vy, vx) },
  ];
}


// ═══════════════════════════════════════════════════════════════
//  ARROW HEAD SHAPES
// ═══════════════════════════════════════════════════════════════

export function drawPointedArrowHead(ctx) {
  ctx.moveTo(-11, -5);
  ctx.lineTo(0, 0);
  ctx.lineTo(-11, 5);
  ctx.lineTo(-7, 0);
  ctx.closePath();
  ctx.fill();
}

export function drawFlatArrowHead(ctx) {
  const [k, p, u, z] = [7, 3, 1.5, 15];
  ctx.moveTo(-z, u);  ctx.lineTo(-p, u);  ctx.lineTo(-p, k);
  ctx.lineTo(0, k);   ctx.lineTo(0, -k);  ctx.lineTo(-p, -k);
  ctx.lineTo(-p, -u); ctx.lineTo(-z, -u);
  ctx.closePath();
  ctx.fill();
}

export function drawAnEnd(ctx, S) {
  const d = S.d || 4;
  const style = S.style || 'pointed';
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = 'rgba(0,0,0,1.0)';
  ctx.lineWidth = 1;
  ctx.translate(S.x, S.y);
  ctx.rotate(S.theta);
  ctx.translate(d, 0);
  if (style === 'flat') drawFlatArrowHead(ctx);
  else                  drawPointedArrowHead(ctx);
  ctx.restore();
}


// ═══════════════════════════════════════════════════════════════
//  IMAGE SOURCE HELPER
// ═══════════════════════════════════════════════════════════════

/**
 * Prepare pixel data from an image element.
 * Returns the imageSource object with .srcData populated.
 *
 * Old: getImageSource(A, obj, S) — used for sphere and texture warping.
 */
export function getImageSource(obj, isHotspot) {
  const imageSource = isHotspot ? obj.hot : obj;
  if (!imageSource) return null;

  const img = imageSource.img;
  let ctx2 = imageSource.ctx;

  if (!ctx2 || !imageSource.canvas ||
      imageSource.canvas.width !== img.width ||
      imageSource.canvas.height !== img.height) {
    imageSource.canvas        = document.createElement('canvas');
    imageSource.canvas.width  = img.width;
    imageSource.canvas.height = img.height;
    imageSource.ctx           = imageSource.canvas.getContext('2d', { willReadFrequently: true });
    ctx2 = imageSource.ctx;
  }
  if (!imageSource.srcData) {
    ctx2.clearRect(0, 0, img.width, img.height);
    ctx2.drawImage(img, 0, 0, img.width, img.height);
    imageSource.srcData = ctx2.getImageData(0, 0, img.width, img.height);
  }
  return imageSource;
}


// ═══════════════════════════════════════════════════════════════
//  MAPPING UTILITY
// ═══════════════════════════════════════════════════════════════

/** Projected x (−1..+1) → fractional latitude (0..1). */
export function fractionalLatitudeFromX(x) {
  return Math.acos(-x) / Math.PI;
}
