/**
 * utils.mjs
 *
 * General-purpose utilities migrated from utils.js.
 * Polyfills removed (startsWith, endsWith, trimStart, trimEnd,
 * replaceCharAt) — all natively supported in modern browsers.
 *
 * Grouped:
 *   1. Value helpers
 *   2. Colour utilities
 *   3. Number formatting
 *   4. Math / random
 *   5. Date parsing
 *   6. Drawing-stage constants
 *   7. Box / coordinate helpers
 *   8. Chart / snake layout helpers
 */


// ═══════════════════════════════════════════════════════════════
//  1.  VALUE HELPERS
// ═══════════════════════════════════════════════════════════════

/** Returns first defined (not undefined) value. */
export function firstValid(a, b) {
  return isDefined(a) ? a : b;
}

export function isDefined(x) {
  return x !== undefined;
}

/** Global replaceAll (for pre-ES2021 compat or escaped patterns). */
export function replaceAll(str, find, replace) {
  return str.replace(new RegExp(find, 'g'), replace);
}

/** Clamp value between low and high. */
export function constrain(low, value, high) {
  return Math.max(low, Math.min(value, high));
}


// ═══════════════════════════════════════════════════════════════
//  2.  COLOUR UTILITIES
// ═══════════════════════════════════════════════════════════════

export function rgbOfColourTuple(v) {
  return `rgba(${v[0]},${v[1]},${v[2]},${v[3]})`;
}

export function rgbOfJsonString(string) {
  return rgbOfColourTuple(colourTupleOfJsonString(string));
}

export function colourTupleOfJsonString(string) {
  return JSON.parse(string);
}

export function colourTupleOfRgb(rgb) {
  let t = (rgb.split('(')[1] || '0,0,0').split(')')[0].split(',');
  return t.map(Number);
}

/** Convert r, g, b to hex string. */
export function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** Convert hex string to { r, g, b }. */
export function hexToRgb(hex) {
  const shorthand = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthand, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}

/** Blend two hex colours by factor t (0→a, 1→b). */
export function colourBlend(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  t = firstValid(t, 0.5);
  return rgbToHex(
    Math.floor(ca.r + t * (cb.r - ca.r)),
    Math.floor(ca.g + t * (cb.g - ca.g)),
    Math.floor(ca.b + t * (cb.b - ca.b)),
  );
}

/** Choose black or white text to contrast with a colour tuple. */
export function textColourToContrastWithColourTuple(c) {
  return (c[0] + c[1] + c[2]) > 380 ? 'black' : 'white';
}

export function textColourToContrastWithRgb(rgb) {
  return textColourToContrastWithColourTuple(colourTupleOfRgb(rgb));
}


// ═══════════════════════════════════════════════════════════════
//  3.  NUMBER FORMATTING
// ═══════════════════════════════════════════════════════════════

/** Right-align a number in n characters. */
export function fmt(num, n, d) {
  d = d || 1;
  return ('                          ' + Math.floor(num / d)).slice(-n);
}

/** Compact format with K/M/G/T suffixes. */
export function fmt2(num, d) {
  d = d || 1;
  let mul = ' ';
  num = num / d;
  if (num > 100000) { num /= 1000; mul = 'K'; }
  if (num > 100000) { num /= 1000; mul = 'M'; }
  if (num > 100000) { num /= 1000; mul = 'G'; }
  if (num > 100000) { num /= 1000; mul = 'T'; }
  return ('                          ' + Math.floor(num)).slice(-6) + mul;
}


// ═══════════════════════════════════════════════════════════════
//  4.  MATH / RANDOM
// ═══════════════════════════════════════════════════════════════

export function rand(n) {
  return Math.floor(Math.random() * n);
}

/** Float (0–1) to byte (0–255). */
export function fToB(f) {
  return Math.floor(f * 255) & 0xFF;
}


// ═══════════════════════════════════════════════════════════════
//  5.  DATE PARSING
// ═══════════════════════════════════════════════════════════════

/**
 * Rough date → minutes. For plotting only (not calendar-accurate).
 * @param {string} date — format "07-Nov-2020"
 * @returns {number} time in seconds
 */
export function minutesFromDate(date) {
  const d = date.split('-');
  const months = 'Jan.Feb.Mar.Apr.May.Jun.Jul.Aug.Sep.Oct.Nov.Dec.';
  const day   = Number(d[0]);
  const month = months.indexOf(d[1] + '.') / 4;
  const year  = Number(d[2]);
  return (day + (356 / 12) * month + 356 * year) * 24 * 60 * 60;
}

export function stringOfCoord(coord, mul) {
  mul = mul || 1;
  return `(${Math.floor(coord.x * mul)},${Math.floor(coord.y * mul)})`;
}


// ═══════════════════════════════════════════════════════════════
//  6.  DRAWING-STAGE CONSTANTS
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
//  7.  BOX / COORDINATE HELPERS
// ═══════════════════════════════════════════════════════════════

export function getXy(obj) {
  return { x: obj.x, y: obj.y };
}

export function getBox(obj) {
  return { x: obj.pos.x, y: obj.pos.y, xw: obj.rect.x, yh: obj.rect.y };
}

export function makeLabelReplacerFn(obj) {
  return function (i, str) {
    for (let j = 0; j < obj.titles.length; j++) {
      const field = '%' + obj.titles[j].toLowerCase();
      str = replaceAll(str, field, obj.values[i][j]);
    }
    return str;
  };
}


// ═══════════════════════════════════════════════════════════════
//  8.  CHART / SNAKE LAYOUT HELPERS
// ═══════════════════════════════════════════════════════════════

// Fudge factors (to become proper params later).
export const fudgeLineMargin = 5;
export const fudgeLineDrop   = 13;
export const fudgeBarDrop    = 12.5;
export const fudgeStarDrop   = 6;
export const fudgeLabelDrop  = 4;
export const fudgeLabelMargin = 2;

export function apportionHorizontalSpaceInT(T) {
  let spaceAvailable = T.xw - 2 * T.margin;
  if (T.width) {
    spaceAvailable -= T.width * T.rows * T.drawnCols;
    T.spacer = spaceAvailable / (T.rows - 1);
  } else {
    T.spacer = T.spacer || 4;
    spaceAvailable -= (T.rows - 1) * T.spacer;
    T.width = spaceAvailable / (T.rows * T.drawnCols);
  }
  T.xScaler = T.width * T.drawnCols + T.spacer;
}

export function apportionVerticalSpaceInT(time, T) {
  T.yScalerMax = T.yh / (T.maxY - T.minY);
  T.yScaler    = (Math.min(20, time || 0) / 20) * T.yScalerMax;
  T.yh += T.margin - 10;
}

export function apportionSpaceInT(ctxMix, T) {
  T.rows = T.rows || T.values.length;
  if (T.obj.display) T.cols = T.cols || T.obj.display.length;
  T.cols      = T.cols || T.values[0].length;
  T.drawnCols = T.obj.display ? T.obj.display.length - 1 : 1;
  T.margin    = 30;

  apportionVerticalSpaceInT(ctxMix?.time, T);
  apportionHorizontalSpaceInT(T);
}

export function xyOfIndexSnakey(i, T) {
  let row = Math.floor(i / T.n);
  let col = i - row * T.n;
  if (row % 2) col = T.n - col - 1;

  let x = T.x0 + col * T.xSpacing;
  let y = T.y0 + row * T.ySpacing;

  if (T.isPath) {
    T.theta = undefined;
    if (i === 0) {
      x -= T.xSpacing * 0.75;
    } else if (i % T.n === 0) {
      T.theta = (3 * Math.PI / 2);
      y -= T.ySpacing / 2;
      T.thetaDirection = (row % 2) === 0;
    }
  }
  return { x, y, row, theta: (row % 2 === 0) ? 0 : Math.PI };
}

/**
 * Optionally update the spot style from the item's snakeStyle.
 */
export function mayUpdateSpotStyle(item, style, ctxMix) {
  if (isDefined(item.snakeStyle)) {
    style = item.snakeStyle;
    if (isDefined(ctxMix?.brightObjects)) {
      if (item.category !== ctxMix.brightObjects) style = 0;
    }
  }
  return style;
}

export function mayUpdateSpotShape(item, shape) {
  if (isDefined(item.snakeShape)) shape = item.snakeShape;
  return shape;
}
