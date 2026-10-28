/**
 * scorpio-infrastructure.js
 *
 * Framework core and data pipeline migrated from scorpiodiagrams.js.
 * This file contains everything that does NOT map to a scene-graph node class:
 *
 *   - Text formatting (anchor tags, sanitisation, wiki link parsing)
 *   - Style system (mayUpdateObjectStyle, applyObjectSettingsToContext)
 *   - Ruler interaction (zoom, drag, dragger creation)
 *   - Chart sub-draw functions (drawBar, drawSpan, drawDonut, etc.)
 *   - Graph / line-plot drawing
 *   - Sphere pixel-remapping
 *   - Drag system (click, newPos, onLockInMove)
 *   - Data loading pipeline (obeyCode, obeyMediaWikiLines, requestSpec, etc.)
 *   - Framework orchestration (drawDiagram, visit, animation)
 *   - JSON structure conversion (convertJsonStructure, doChoose)
 *
 * ── Architecture note ────────────────────────────────────────
 *
 *   The old drawDiagram function iterated stages 0–10 calling
 *   drawCells → visit → drawThing[type].  In the new architecture,
 *   the scene-graph walker (GenericScene.renderAny) replaces this
 *   loop, calling before_draw2d / draw2d / after_draw2d on each node.
 *
 *   The stage-gated code (kStageOutline, kStageFillAndText, kStageHots)
 *   has been collapsed into single-pass lifecycle hooks in the node
 *   classes (scorpio-nodes.js).  The functions below are kept for:
 *     - Legacy compatibility during incremental migration
 *     - Code that genuinely isn't node-level (data loading, rulers, etc.)
 *
 *   EXTERNAL dependencies are marked with // EXTERNAL: comments.
 */

// ── Imports (uncomment and fix paths once migrated) ──────────
// import { Vector2d }       from '../2d-support/vector2d.js';
// import { Shape, ShapeData } from './shape-node.js';
// import { constrain, firstValid, isDefined,
//          makeLabelReplacerFn, minutesFromDate,
//          fudgeBarDrop, fudgeLineDrop, fudgeLineMargin,
//          fudgeLabelDrop, fudgeLabelMargin, fudgeStarDrop,
//          apportionSpaceInT }  from '../utilities/utils.js';

import {
  getBox, getXy,
  applyObjectSettingsToContext, mayUpdateObjectStyle,
  drawStar, drawSpot, drawCentredRect,
  drawRoundRect, drawAnEnd, drawGlyph,
  getLineBetweenPoints, getTrimmedLineBetweenObjects,
  getImageSource, fractionalLatitudeFromX,
  kStageFillAndText, kStageHots, kStageOutline, kStageDragging,
  kStageArrowShaft, kStageArrowHead,
} from './scorpio-drawing-utils.js';


// ═══════════════════════════════════════════════════════════════
//  1.  TEXT FORMATTING
// ═══════════════════════════════════════════════════════════════

/** Anchor tag from "Pathway:WP2376". */
export function anchorTagFromWikipathwayName(str) {
  if (str.indexOf('Pathway:') === 0) {
    return `<a href='https://www.wikipathways.org/index.php/${str}' target='_blank'>${str.substr(8)}</a>`;
  }
  return str;
}

/** Anchor tag from "PMCID: 19825". */
export function anchorTagFromPmcid(str) {
  if (str.indexOf('PMCID: ') === 0) {
    const id = str.substr(7);
    return `<a href='https://www.ncbi.nlm.nih.gov/pmc/articles/${id}/' target='_blank'>${id}</a>`;
  }
  return str;
}

/** Doxygen-style class-name link. */
export function anchorTagFromDoxygennedClassName(word) {
  let url = word.replace(/([A-Z])/g, (m) => '_' + m[0].toLowerCase());
  url = 'https://doxy.audacityteam.org/class' + url + '.html';
  return `<a href='${url.toLowerCase()}'>${word}</a>`;
}

/** Prefix bare filename with the configured image source path. */
export function urlOfFilename(file, imageSrc) {
  return (imageSrc || '') + file;
}

/** Auto-link class names (CamelCase words → Doxygen links). */
export function formatClassNames(text, autolink) {
  if (!autolink) return text;
  return text.replace(
    /([a-zA-Z0-9_]+[A-Z]+[A-Za-z0-9_]*)/g,
    (match) => anchorTagFromDoxygennedClassName(match),
  );
}

/** Wiki-style external links: [https://foo bar] → <a href>. */
export function formatWikiExternalLinks(text) {
  const parts = text.split('[http');
  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    let item = parts[i];
    item = item.replace(' ', "'>"); // first space → close href
    item = item.replace(']', '</a>');
    result += "<a href='http" + item;
  }
  return result;
}

/**
 * Sanitise HTML for safe insertion via innerHTML.
 * TODO: implement proper whitelist-based sanitisation.
 */
export function sanitiseHtml(html) {
  html = formatWikiExternalLinks(html);
  return html;
}


// ═══════════════════════════════════════════════════════════════
//  2.  STYLE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Ghosted style — translucent black, no outline.
 */
export function setGhostedStyle(ctx, S, intensity) {
  ctx.fillStyle = 'rgba(0,0,0,' + (intensity || 0.4) + ')';
  S.doStroke = false;
}

/**
 * Return the appropriate canvas context.
 * Old: getCtx(A, obj, d) — chose between backing and hotspot canvas.
 * New: callers should use ctxMix.ctx directly.  Kept for legacy.
 */
export function getCtx(ctxMix, d) {
  if (d?.ctx)           return d.ctx;
  if (d?.isHotspot)     return ctxMix.hotsCtx;
  return ctxMix.ctx;
}


// ═══════════════════════════════════════════════════════════════
//  3.  RULER INTERACTION
// ═══════════════════════════════════════════════════════════════
//
// These functions manage the interactive ruler widget's
// draggable handles, zoom, and coordinate mapping.
// They operate on the ruler object directly and
// will be called from RulerNode or from the drag system.

export function rulerIxOfX(obj, x) {
  return obj.atStart + (x - obj.pos.x) * obj.itemsPerPixel;
}

export function xOfRulerIx(obj, ix) {
  return (ix - obj.atStart) / obj.itemsPerPixel + obj.pos.x;
}

export function computeMidDraggerIx(obj) {
  const mid = obj.content[1];
  const midx = mid.offset.x + mid.pos.x;
  obj.centerIx = rulerIxOfX(obj, midx);
}

export function setItemsPerPixel(obj, itemsPerPixel) {
  if (obj.minScale && itemsPerPixel < obj.minScale) return;
  if (obj.maxScale && itemsPerPixel > obj.maxScale) return;

  const mid = obj.content[1];
  const startIx = obj.centerIx - mid.offset.x * itemsPerPixel;
  const endIx   = obj.centerIx + (obj.rect.x - mid.offset.x) * itemsPerPixel;

  obj.atStart = constrain(-70, startIx, 2000);
  obj.atEnd   = constrain(-70, endIx,   2000);
  const shift = Math.max(startIx - obj.atStart, endIx - obj.atEnd);
  obj.atStart = startIx - shift;
  obj.atEnd   = endIx   - shift;
}

export function replaceMidDragger(obj) {
  const mid   = obj.content[1];
  const left  = obj.content[0];
  const right = obj.content[2];
  const inset = mid.inset;

  obj.itemsPerPixel = (obj.atEnd - obj.atStart) / obj.rect.x;
  const newpos = xOfRulerIx(obj, obj.centerIx);
  mid.offset.x = constrain(inset, newpos - mid.pos.x, obj.rect.x - inset);
  mid.offset.x = constrain(left.offset.x + 40, mid.offset.x, right.offset.x - 40);
  computeMidDraggerIx(obj);
}

export function repositionMidDragger(obj) {
  const mid   = obj.content[1];
  const left  = obj.content[0];
  const right = obj.content[2];
  mid.offset.x = constrain(left.offset.x + 33, mid.offset.x, right.offset.x - 33);
  computeMidDraggerIx(obj);
}

export function zoomRuler(obj, delta) {
  if (!obj) return;
  let ipp = (obj.atEnd - obj.atStart) / obj.rect.x;
  const k = 1.07;
  ipp = delta > 0 ? ipp * k : ipp / k;
  computeMidDraggerIx(obj);
  setItemsPerPixel(obj, ipp);
}

export function setCentreDraggerX(ruler, x) {
  if (!ruler) return;
  const mid = ruler.content[1];
  if (ruler.flip === 6) mid.yCenter = x;
  else mid.offset.x = x - mid.pos.x;
}

export function setCentreDraggerY(ruler, y) {
  if (!ruler) return;
  const mid = ruler.content[1];
  if (ruler.flip === 6) mid.offset.x = y - mid.pos.x;
  else mid.yCentre = y;
}


// ── Ruler drag callbacks ─────────────────────────────────────

export function draggingRuler(obj, dd) {
  dd.y = constrain(20, dd.y, 20);
  dd.x = constrain(20 + obj.pos.x, dd.x, obj.pos.x + obj.rect.x - 20);

  const mid  = obj.content[1];
  const midx = mid.offset.x + mid.pos.x;
  const dx   = dd.x - midx;
  if (Math.abs(dx) < 0) return;

  const ipp = (obj.dragIx - obj.centerIx) / dx;
  if (ipp <= 0 || ipp < 0.002) return;

  setItemsPerPixel(obj, ipp);
  replaceMidDragger(obj);
}

export function draggingMarker(obj, dd) {
  const parent = obj.parent;
  dd.y = constrain(0, dd.y, obj.wobble);
  dd.x = constrain(0, dd.x, parent.rect.x);

  if (dd.y >= Math.max(1, obj.wobble)) return;

  let dx = obj.offset.x - dd.x;
  dx *= parent.itemsPerPixel * obj.gearing;
  dx = constrain(-70 - parent.atStart, dx, 2000 - parent.atEnd);
  parent.atStart += dx;
  parent.atEnd   += dx;

  if (obj.glyph === 'Mid') return;
  repositionMidDragger(parent);
}


// ═══════════════════════════════════════════════════════════════
//  4.  CHART SUB-DRAW FUNCTIONS
// ═══════════════════════════════════════════════════════════════
//
// These are the per-item draw functions dispatched by ChartNode.
// They operate on a "T" context object with computed spacing.

function rulerIndexFromX(x, ruler) {
  // EXTERNAL: tBlend
  return ruler.atStart + (ruler.atEnd - ruler.atStart) * (x / ruler.rect.x);
}

function scaledYofItem(i, obj) {
  const { x, y, xw, yh } = getBox(obj);
  // EXTERNAL: RR.graphFn
  const fn = typeof RR !== 'undefined' ? RR.graphFn : (ii) => Math.sin(ii * 0.1);
  return y + (fn(i, obj.perturb) * yh / 2) + yh / 2;
}

export function setSpanFromT(span, T) {
  if (span.vStart === undefined) {
    span.vStart = T.values[T.i][T.ix]     - T.minY;
    span.vEnd   = T.values[T.i][T.ix + 1] - T.minY;
  } else {
    span.vEnd = T.values[T.i][T.ix] - T.minY;
  }
  const yEnd   = span.vEnd   * T.yScaler;
  const yStart = span.vStart * T.yScaler;
  const x  = T.margin + T.x0 + T.i * T.xScaler;
  const x0 = x + (T.ix - 1) * T.width;
  const y0 = T.yh - T.margin + T.y0 + (fudgeBarDrop || 12.5);

  span.colour = T.colours[T.ix % 2];
  span.pos    = { x: x0,       y: y0 - yEnd };
  span.rect   = { x: T.width,  y: yEnd - yStart };
}

/** Bar from baseline to value. */
export function drawBar(ctx, T) {
  const span = { vStart: 0 };
  setSpanFromT(span, T);
  _drawSpanObject(ctx, span);
}

/** Bar from value to value. */
export function drawSpan(ctx, T) {
  const span = { vStart: undefined };
  setSpanFromT(span, T);
  _drawSpanObject(ctx, span);
  if (T.stemCol && T.ix === 1) {
    drawStem(ctx, T);
  }
}

function _drawSpanObject(ctx, span) {
  ctx.fillStyle = span.colour || 'rgba(105,205,105,1.0)';
  ctx.beginPath();
  ctx.rect(span.pos.x, span.pos.y, span.rect.x, span.rect.y);
  ctx.fill();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'black';
  ctx.stroke();
}

/** L-shaped stem line (for chronograms). */
export function drawStem(ctx, T) {
  const i  = T.i;
  const ix = T.ix;
  const x  = T.margin + T.x0 + i * T.xScaler;
  const vEnd   = T.values[i][ix] - T.minY;
  const vStart = vEnd - T.values[i][T.stemCol];
  const yEnd   = vEnd   * T.yScaler;
  const yStart = vStart * T.yScaler;

  ctx.fillStyle = T.colours[ix % 2];
  const x0 = x + (ix - 1) * T.width;
  const y0 = T.yh - T.margin + T.y0 + (fudgeBarDrop || 12.5);

  ctx.beginPath();
  ctx.rect(x0 + T.width / 2 - 1, y0 - yEnd, 2, -yStart + yEnd);
  const k = T.values[i][T.stemCol + 1];
  if (k !== 0) ctx.rect(x0 + T.width / 2 + 1, y0 - yStart, k * T.xScaler, 2);
  ctx.fill();
}

/** Plotted rectangle (spot on a curve). */
export function drawPlottedRect(ctx, T) {
  const vx = T.values[T.i][T.ix];
  const x  = T.margin + T.x0 + T.i * T.xScaler;
  const y  = vx * T.yScaler;
  ctx.beginPath();
  ctx.rect(
    x + (T.ix - 1) * T.width,
    T.yh - (T.margin + y) + T.y0,
    T.width, T.width);
  ctx.fillStyle = T.ix !== 1 ? 'rgba(105,205,105,1.0)' : 'rgba(105,105,205,1.0)';
  ctx.fill();
  ctx.stroke();
}

/** Horizontal grid lines behind a graph. */
export function drawLines(ctx, T) {
  if (T.i !== 0) return;
  const rect = T.obj.rect;
  const x  = T.margin + T.x0 - (fudgeLineMargin || 5);
  const xw = rect.x - 2 * T.margin + 2 * (fudgeLineMargin || 5);
  const y0 = T.yh - T.margin + T.y0 + (fudgeLineDrop || 13);

  ctx.fillStyle   = 'rgba(105,205,105,1.0)';
  ctx.lineWidth   = 0.5;
  ctx.strokeStyle = 'black';

  for (let i = 0; i <= T.maxY; i += T.linesAt) {
    let yy = y0 - i * T.yScalerMax;
    yy = Math.floor(yy) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + xw, yy);
    ctx.stroke();

    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = '10px Arial';
    ctx.fillStyle = 'rgba(15,35,165,1.0)';
    ctx.fillText(i, x - (fudgeLabelMargin || 2), yy + (fudgeLabelDrop || 4));
    ctx.restore();
  }
}

/** Graph label on x-axis. */
export function drawGraphLabel(ctx, T) {
  if (T.ix > 1) return;

  const x = T.margin + T.x0 + T.i * T.xScaler + (T.width * (T.cols || 1)) * 0.5 + 8;
  let shiftTextY = -T.margin;
  let shiftTextX = 0;
  if (T.textAlign === 'left') { shiftTextY *= -0.35; shiftTextX = 12; }

  ctx.save();
  ctx.translate(
    x + (T.ix - 1) * T.width + shiftTextX,
    T.yh - T.margin + T.y0 + shiftTextY);
  ctx.rotate(T.rotate || -Math.PI / 4);
  ctx.textAlign = T.textAlign || 'right';
  ctx.font = '12px Arial';
  ctx.fillStyle = 'rgba(15,35,165,1.0)';
  ctx.fillText(T.values[T.i][0], 0, 0);
  ctx.restore();
}

/** Donut / pie chart. */
export function drawDonut(ctx, T) {
  if (T.i !== 0) return;

  const pos  = T.obj.pos;
  const rect = T.obj.rect;
  const cx = pos.x + rect.x / 2;
  const cy = pos.y + rect.y / 2;
  const r  = Math.min(rect.x, rect.y) / 2;
  const r2 = r * 0.70;

  let total = 0;
  for (let j = 0; j < T.values.length; j++) total += T.values[j][1];

  const frac = Math.PI * 2 / total;
  let t1 = 2.0 * Math.PI * 0.75;

  for (let j = 0; j < T.values.length; j++) {
    const t0 = t1;
    t1 = t0 + frac * T.values[j][1];

    // EXTERNAL: Shape.drawPolar for proper warted arcs.
    // Simplified fallback: plain arc.
    ctx.beginPath();
    ctx.arc(cx, cy, r, t0, t1);
    ctx.arc(cx, cy, r2, t1, t0, true);
    ctx.closePath();
    ctx.fillStyle = T.colours?.[j % 2] || 'rgba(105,205,105,1.0)';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Plot legends (scale markings on a waveform chart). */
export function drawPlotLegends(ctx, obj) {
  const { x, y, xw, yh } = getBox(obj);
  const indent = 40;

  ctx.beginPath();
  ctx.moveTo(x + indent, y + yh / 2);
  ctx.lineTo(x + xw,     y + yh / 2);
  ctx.moveTo(x + indent, y + yh);
  ctx.lineTo(x + indent, y);
  ctx.stroke();

  ctx.font      = '11px Arial';
  ctx.textAlign = 'right';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  for (let i = -1; i <= 1; i += 0.5) {
    const dy  = (Math.abs(i) > 0.6) ? i * 8 : 0;
    const ady = Math.abs(dy) * 0.4;
    const yy  = y + yh / 2 - yh * 0.5 * i;
    ctx.fillText(i.toFixed(1), x + 30 - ady, 5 + yy + dy);
    ctx.moveTo(x + indent - 8 - ady, yy + dy);
    ctx.lineTo(x + indent - 4, yy + dy);
    ctx.lineTo(x + indent, yy);
    ctx.lineTo(x + indent + 6, yy);
  }
  ctx.stroke();
}

/**
 * The spacedDrawFunctions dispatch table.
 * ChartNode._drawSubItem should call into this.
 */
export const spacedDrawFunctions = {
  bar:    drawBar,
  label:  drawGraphLabel,
  pie:    drawDonut,
  spot:   drawPlottedRect,
  lines:  drawLines,
  spans:  drawSpan,
  // event:  drawEvent,  // needs minutesFromDate — wire up once migrated
};


// ═══════════════════════════════════════════════════════════════
//  5.  GRAPH / LINE PLOT
// ═══════════════════════════════════════════════════════════════

/** Min/max infill plot. */
export function fillMinMaxPlot(ctx, obj, ruler) {
  const { x: x0, y: y0, xw, yh } = getBox(obj);
  const pixelsPerItem = xw / (ruler.atEnd - ruler.atStart);
  const xStart = ruler.atStart * pixelsPerItem;

  const maxy = [], miny = [];
  let bucket = 0;
  for (let i = ruler.atStart; i < ruler.atEnd; i++) {
    const y1 = scaledYofItem(i, obj);
    bucket = Math.floor(i * pixelsPerItem - xStart);
    if (isDefined(maxy[bucket])) {
      maxy[bucket] = Math.max(y1, maxy[bucket]);
      miny[bucket] = Math.min(y1, miny[bucket]);
    } else {
      maxy[bucket] = y1;
      miny[bucket] = y1;
    }
  }
  ctx.fillStyle = 'rgb(20,20,200)';
  ctx.beginPath();
  ctx.moveTo(x0, maxy[0]);
  for (let i = 1; i <= bucket; i++) if (isDefined(maxy[i])) ctx.lineTo(x0 + i, maxy[i] + 1.5);
  for (let i = bucket; i >= 0; i--) if (isDefined(miny[i])) ctx.lineTo(x0 + i, miny[i] - 1.5);
  ctx.closePath();
  ctx.fill();
}

/** Line plot (per-item resolution). */
export function drawLinePlot(ctx, obj, ruler) {
  const { x: x0, y: y0, xw, yh } = getBox(obj);
  const pixelsPerItem = xw / (ruler.atEnd - ruler.atStart);
  const xStart = ruler.atStart * pixelsPerItem;

  ctx.strokeStyle = obj.colour || 'rgb(20,20,200)';
  ctx.lineWidth   = constrain(1, pixelsPerItem * 0.2, 4);

  const delta = pixelsPerItem < 1 ? 0.2 : 0.1;
  ctx.beginPath();
  ctx.moveTo(x0, scaledYofItem(Math.floor(ruler.atStart), obj));
  for (let i = Math.floor(ruler.atStart / delta) * delta;
       i < Math.floor(2 + ruler.atEnd / delta) * delta;
       i += delta) {
    const xx = (i * pixelsPerItem - xStart) + x0;
    ctx.lineTo(xx, scaledYofItem(i, obj));
  }
  ctx.stroke();

  // Spots at high zoom.
  if (pixelsPerItem > 30) {
    const alpha = constrain(0, (pixelsPerItem - 30) / 150, 1);
    ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
    for (let i = Math.floor(ruler.atStart / delta) * delta;
         i < Math.floor(2 + ruler.atEnd / delta) * delta;
         i += delta) {
      const xx = (i * pixelsPerItem - xStart) + x0;
      drawSpot(ctx, { x: xx, y: scaledYofItem(i, obj), r: 2, doStroke: false });
    }
  }
}

/** Line plot (per-pixel resolution). */
export function drawLineMinMaxPlot(ctx, obj, ruler) {
  const { x, y, xw, yh } = getBox(obj);
  ctx.strokeStyle = 'rgb(20,20,200)';
  ctx.lineWidth   = 1;
  let y1 = scaledYofItem(rulerIndexFromX(x, ruler), obj);
  for (let i = 1; i < xw; i++) {
    const y2 = scaledYofItem(rulerIndexFromX(x + i, ruler), obj);
    ctx.beginPath();
    ctx.moveTo(x + i, Math.min(y1, y2) - 0.5);
    ctx.lineTo(x + i, Math.max(y1, y2) + 0.5);
    ctx.stroke();
    y1 = y2;
  }
}


// ═══════════════════════════════════════════════════════════════
//  6.  SPHERE PIXEL-REMAPPING
// ═══════════════════════════════════════════════════════════════

/**
 * Draws an equirectangular image as a rotating sphere.
 * Old: drawSphere(A, obj, S)
 * New: drawSphere(ctx, obj, imageSource, time)
 */
export function drawSphere(ctx, obj, imageSource, time) {
  if (!imageSource) return;

  const xx = obj.pos.x;
  const yy = obj.pos.y;
  const xw = Math.floor(obj.rect.x);
  const yh = Math.floor(obj.rect.y);

  const img     = imageSource.img;
  const srcData = imageSource.srcData;
  const rotate  = img.width - ((time * 3) % img.width);

  // Pre-compute asin offsets.
  let offsets = imageSource.offsets || [];
  if (offsets.length !== img.width) {
    offsets = [];
    for (let i = 0; i < img.width; i++) {
      offsets.push(Math.floor(Math.asin(i / img.width) * img.width / (2 * Math.PI)) * 4);
    }
    imageSource.offsets = offsets;
  }

  const w  = Math.floor(xw / 2);
  const h1 = Math.floor(yh / 2);
  const h  = Math.min(h1, w);

  // Animated distortion.
  const spinStart = 0;
  const frac = Math.max(0, Math.min(40, time - spinStart)) / 40;
  let adjustedOffsets;
  if (frac === 1) {
    adjustedOffsets = offsets;
  } else {
    adjustedOffsets = [];
    for (let i = 0; i < img.width; i++) {
      const p = i / (1.4 * Math.PI);
      adjustedOffsets.push(4 * Math.floor(p + frac * (offsets[i] / 4 - p)));
    }
  }

  const dstData = ctx.getImageData(xx + (w - h), yy + (h1 - h), h * 2, h * 2);
  const src = srcData.data;
  const dst = dstData.data;

  for (let y = -h; y < h; y++) {
    let dx = Math.floor(Math.sqrt(h * h - y * y));
    const srcLine = Math.floor(fractionalLatitudeFromX(y / h) * img.height);
    const srcBase = (srcLine * img.width + rotate) * 4;
    dx = h + frac * (dx - h);

    let index = Math.floor((y + h) * dstData.width + h - dx) * 4;
    const rescaler = (img.width - 1) / dx;

    for (let x = -dx; x < dx; x++) {
      const offset = adjustedOffsets[Math.floor(Math.abs(x) * rescaler)];
      const srcIndex = x < 0 ? srcBase - offset : srcBase + offset;
      if (src[srcIndex + 3] < 128) {
        dst[index++] = 10; dst[index++] = 10; dst[index++] = 110; dst[index++] = 180;
      } else {
        dst[index++] = src[srcIndex]; dst[index++] = src[srcIndex + 1];
        dst[index++] = src[srcIndex + 2]; dst[index++] = src[srcIndex + 3];
      }
    }
  }
  ctx.putImageData(dstData, xx + (w - h), yy + (h1 - h));
}


// ═══════════════════════════════════════════════════════════════
//  7.  DRAG SYSTEM
// ═══════════════════════════════════════════════════════════════
//
// These functions manage click-to-drag interaction for Draggable
// and Drag2 nodes.  In the new architecture most of this is
// replaced by hit_test → applyDrag, but the ruler's complex
// multi-dragger interaction still uses these.

/**
 * Compute proposed new position during a drag.
 * Old: newPos(A, obj, e)
 * New: newPos(dragState, obj, transform)
 *
 * @param {object} dragState — { click: {x,y}, move: {x,y}, dragObj }
 * @param {object} obj — the object being dragged
 * @param {object} transform — optional { size, rotate }
 */
export function newPos(dragState, obj, transform) {
  const offset = obj.offset || obj;
  const d = {};
  if (!dragState.click || dragState.dragObj !== obj) return d;
  if (!dragState.move) {
    dragState.move  = { x: 0, y: 0 };
    dragState.click = { x: 0, y: 0 };
  }

  if (obj.flip === 6) {
    d.y = offset.y + dragState.move.x - dragState.click.x;
    d.x = offset.x + dragState.move.y - dragState.click.y;
    return d;
  }

  d.x = offset.x + dragState.move.x - dragState.click.x;
  d.y = offset.y + dragState.move.y - dragState.click.y;
  return d;
}

/**
 * Lock in a drag step so subsequent deltas are relative to the new position.
 * Old: onLockInMove(A, obj, d, e)
 */
export function onLockInMove(dragState, obj, d) {
  const offset = obj.offset || obj;
  if (!dragState.click || dragState.dragObj !== obj) return;

  if (obj.flip === 6) {
    dragState.click.x += d.y - offset.y;
    dragState.click.y += d.x - offset.x;
    offset.x = d.x;
    offset.y = d.y;
    return;
  }
  obj.placed = true;
  dragState.click.x += d.x - offset.x;
  dragState.click.y += d.y - offset.y;
  offset.x = d.x;
  offset.y = d.y;
}

export function onDraggableClicked(dragState, obj) {
  if (!dragState.click) return;
  dragState.dragObj = obj;
}

export function onRulerClicked(dragState, obj) {
  if (!dragState.click) return;
  dragState.dragObj = obj;
  if (obj.flip === 6)
    obj.offset = { x: dragState.click.y, y: dragState.click.x };
  else
    obj.offset = { x: dragState.click.x, y: dragState.click.y };
  obj.dragIx = rulerIxOfX(obj, obj.offset.x);
  computeMidDraggerIx(obj);
}


// ═══════════════════════════════════════════════════════════════
//  8.  DATA LOADING PIPELINE
// ═══════════════════════════════════════════════════════════════
//
// These functions load text specs from files or wiki pages,
// parse them, build the scene-graph object tree, and trigger
// layout + draw.  In the new architecture, the text spec is
// parsed into a MiniAstNode tree by the scene factories in
// scenes-workhorse.js / scenes-scorpio.js.

/**
 * Execute an imperative command sequence.
 * Old: obeyCode(A, code)
 * New: obeyCode(ctx, code)
 *   where ctx holds { objectLookup, triggerRedraw, ... }
 */
export function obeyCode(ctx, code) {
  let activeObject = {};
  for (let i = 0; i < code.length;) {
    const command = code[i++];

    if (command === 'setCaption') {
      ctx.setCaption?.(code[i++]);
    } else if (command === 'setCreditsTip') {
      ctx.addInfoHotspot?.();
      ctx.addInfoCard?.(code[i++]);
    } else if (command === 'chooseItem') {
      activeObject = ctx.objectLookup?.(code[i++]) || {};
    } else if (command === 'clickObject') {
      activeObject = ctx.objectLookup?.(code[i++]) || {};
      activeObject.onClick?.(ctx, activeObject);
    } else if (command === 'setTip') {
      activeObject.card = code[i++];
    } else if (command === 'setBright') {
      ctx.brightObjects = code[i++];
    } else if (command === 'setClickAsCentre') {
      activeObject = ctx.objectLookup?.(code[i++]) || {};
      setCentreDraggerX(activeObject, ctx.mousePos?.x);
      setCentreDraggerY(activeObject, ctx.mousePos?.y);
      ctx.triggerRedraw?.();
    } else if (command === 'zoom') {
      activeObject = ctx.objectLookup?.(code[i++]) || {};
      zoomRuler(activeObject, ctx.zoomDelta);
      ctx.triggerRedraw?.();
    } else if (command === 'highlight') {
      ctx.highlight = code[i++];
    } else if (command === 'loadSpec') {
      const spec = code[i++];
      const remaining = code.slice(i);
      ctx.requestSpec?.(spec, (data) => {
        ctx.handleNewData?.(data);
        obeyCode(ctx, remaining);
      });
      return;
    } else if (command === 'loadImage') {
      activeObject.src = code[i++];
      ctx.requestImage?.(activeObject);
    } else if (command === 'Spec') {
      const parsed = parseFilename(code[i++]);
      ctx.requestSpec?.(parsed.name, null, parsed.num);
    } else if (command === 'DoSpec') {
      const parsed = parseFilename(code[i++]);
      ctx.requestSpec?.(parsed.name, ctx.addNewInfoCards, parsed.num);
    } else if (command === 'Image') {
      ctx.setNewImage?.(code[i++]);
    } else if (command === 'Goto') {
      const parsed = parseFilename(code[i++]);
      window.location.href = parsed.name;
      return;
    }
    // Unknown commands are silently skipped.
  }
}

/** Parse "filename#3" → { name: "filename", num: 3 }. */
export function parseFilename(location) {
  const parts = location.split('#');
  return {
    name: parts[0],
    num:  parts[1] ? Number(parts[1]) : 1,
  };
}


/**
 * Process wiki-formatted spec lines.
 * Old: obeyMediaWikiLines(A, lines)
 * This is kept mostly intact — it parses ADD:DATA=, IMAGE, CREDITS,
 * NEXTOBJECT, CLICK LOAD SPEC, etc. directives.
 *
 * @param {object} ctx — framework context with objectLookup, rootObject, etc.
 * @param {string[]} lines — the <pre>-split spec lines
 */
export function obeyMediaWikiLines(ctx, lines) {
  let obj;

  for (let i = 0; i < lines.length; i++) {
    const item = lines[i];

    const detail = item.split('TIP=</pre>')[1] || item.split('card=</pre>')[1];
    let file = (item.split('[[File:')[1] || '').split(']]')[0] || '';
    let spec = (item.split('[[')[1] || '').split(']]')[0];
    spec = (spec || '').split('|')[0];

    // ── ADD: — inject JSON object structure ──────────────
    if (item.startsWith('ADD:')) {
      let root = ctx.objectLookup?.(fieldValue('NAME', item)) || ctx.rootObject;
      root.type    = root.type || 'VStack';
      root.content = root.content || [];

      const data = fieldValue('DATA', item);
      let json;
      try { json = JSON.parse(data); } catch (e) { console.error('JSON parse error:', e, data); continue; }

      const container = Array.isArray(json) ? json : [json];
      if (Array.isArray(json)) ctx.doTopLevelInstructions?.(json[0]);
      for (const item of container) {
        convertJsonStructure(ctx, '', item);
        root.content.push(item);
      }
    }

    // ── IMAGE — attach an image source to a named object ─
    if (item.startsWith('IMAGE')) {
      obj = ctx.objectLookup?.(fieldValue('NAME', item));
      if (!obj) continue;
      ctx.lastImage = obj;
      if (obj.src !== file) obj.src = file;
    }

    // ── HOTSPOTS — attach hotspot image ──────────────────
    if (item.startsWith('HOTSPOTS')) {
      obj = ctx.lastImage;
      if (!obj) continue;
      if (!obj.hot) obj.hot = {};
      if (obj.hot.src !== file) obj.hot.src = file;
    }

    // ── CREDITS — set caption and info ───────────────────
    if (item.startsWith('CREDITS')) {
      ctx.caption = fieldValue('CAPTION', item);
      ctx.setCaption?.(ctx.caption);
      ctx.addInfoHotspot?.();
      if (detail) ctx.addInfoCard?.(detail);
    }

    // ── NEXTOBJECT — modify properties of next object ────
    if (item.startsWith('NEXTOBJECT:')) {
      const objectList = ctx.rootObject?.objectList;
      if (!objectList) continue;
      const n = ctx.rootObject.itemIndex++;
      obj = objectList[n];
      if (!obj) continue;
      const colour = fieldValue('colour', item);
      if (colour) obj.colour = colour;
      const border = fieldValue('borderColour', item);
      if (border) obj.borderColour = border;
      const cr = fieldValue('cornerRadius', item);
      if (cr && !isNaN(Number(cr))) obj.cornerRadius = Number(cr);
      if (detail) obj.card = detail;
    }

    // ── CLICK LOAD SPEC — set click action ───────────────
    if (item.startsWith('CLICK LOAD SPEC')) {
      const f = ('X' + spec).split('Toolbox/')[1] || fieldValue('SPEC', item);
      if (obj) obj.clickDo = ['Spec', f];
    }
    if (item.startsWith('CLICK DO')) {
      const f = ('X' + spec).split('Toolbox/')[1] || fieldValue('SPEC', item);
      if (obj) obj.clickDo = ['DoSpec', f];
    }
    if (item.startsWith('CLICK GOTO')) {
      let f = item.split('GOTO=</pre>')[1] || '';
      f = ('X' + f).split('[')[1] || '';
      f = f.split(' ')[0] || f.split(']')[0] || '';
      if (obj) obj.clickDo = ['Goto', f];
    }

    // ── DO — immediate chooser change ────────────────────
    if (item.startsWith('DO')) {
      const target = ctx.objectLookup?.(fieldValue('CHOOSER_NAME', item));
      if (target) {
        const val = fieldValue('VALUE', item);
        if (val) target.choice = JSON.parse(val);
      }
      const bright = fieldValue('BRIGHT_OBJECTS', item);
      if (bright) ctx.brightObjects = bright;
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  9.  JSON STRUCTURE CONVERSION
// ═══════════════════════════════════════════════════════════════

/**
 * Convert user-friendly JSON format to the internal scene-graph format.
 * { "Geshi": "dominos" }  →  { type: "Geshi", value: "dominos", content: [], id: "dominos" }
 *
 * Old: convertJsonStructure(A, indent, layout)
 * New: convertJsonStructure(ctx, indent, layout)
 */
export function convertJsonStructure(ctx, indent, layout) {
  for (const key in layout) {
    if (!layout.hasOwnProperty(key)) continue;
    if (key.charAt(0) !== key.charAt(0).toUpperCase()) continue;

    if (Array.isArray(layout[key])) {
      layout.content = layout[key];
    } else {
      layout.content = [];
      layout.value = layout[key];
    }
    layout.type = key;
    delete layout[key];
    break;
  }

  if (!layout.id && layout.value && typeof layout.value === 'string') {
    layout.id = layout.value.substr(0, 10);
  }
  if (layout.id) {
    layout.id = layout.id.substr(0, 10);
    ctx.addObject?.(layout);
  }

  if (layout.content && Array.isArray(layout.content)) {
    for (const child of layout.content) {
      convertJsonStructure(ctx, indent + '   ', child);
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  10.  CHOOSER  (tab-like widget)
// ═══════════════════════════════════════════════════════════════

/**
 * Apply chooser styling to a parent with tabs.
 * Old: doChoose(A, parentObj, item)
 */
export function doChoose(ctx, parentObj, item) {
  if (!parentObj.content || !Array.isArray(parentObj.content)) return;
  item--;
  const n = parentObj.content.length;
  for (let i = 0; i < n; i++) {
    const obj = parentObj.content[i];
    obj.colour       = (i === item) ? 'rgb(255,250,235)' : 'rgb(255,230,205)';
    obj.borderColour = (i === item) ? 'rgb(145,125,0)'   : 'rgb(215,155,0)';
    obj.cornerRadius = 8;
    obj.drawEarly    = (i !== item);
    obj.drawExtra    = true;

    if (ctx.dataArriving) continue;
    if (i === item && parentObj.chosen !== item) {
      parentObj.chosen = item;
      if (obj.clickDo) {
        obeyCode(ctx, obj.clickDo);
      }
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  11.  FIELD VALUE PARSER
// ═══════════════════════════════════════════════════════════════

/**
 * Extract a field value from a spec line.
 * e.g. fieldValue("SPEC", "CLICK LOAD SPEC SPEC=foo") → "foo"
 */
export function fieldValue(field, line) {
  const parts = line.split(field + '=');
  if (parts.length < 2) return null;
  let val = parts[1].split('</pre>')[0];
  val = val.split(' ')[0] || val;
  return val || null;
}


// ═══════════════════════════════════════════════════════════════
//  12.  IMAGE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Request an image and set up onload/onerror handlers.
 * Old: mayRequestImage(A, parent, obj)
 * New: requestImageLoad(obj, imageSrc, onArrive)
 */
export function requestImageLoad(obj, imageSrc, onArrive) {
  if (!obj || !obj.src) return;

  const file = urlOfFilename(obj.src, imageSrc);
  if (obj.previous_image === file) return;

  obj.status = 'asked';
  obj.file   = file;
  obj.img    = document.createElement('img');

  obj.img.onload = () => {
    obj.status = 'arrived';
    console.log(obj.file + ' arrived');
    onArrive?.();
  };
  obj.img.onerror = () => {
    obj.status = 'failed';
  };

  console.log('Requesting... ' + obj.file);
  obj.img.crossOrigin = 'anonymous';
  obj.previous_image  = file;
  obj.img.src         = file;
}


// ═══════════════════════════════════════════════════════════════
//  13.  FILE LOADING  (XHR)
// ═══════════════════════════════════════════════════════════════

/**
 * Load a text file via XHR.
 * Old: fileActionLoader(A, data, action, url, section, fn)
 * New: fetchTextFile(url) → Promise<string>
 */
export function fetchTextFile(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (this.readyState === 4) {
        if (this.status === 200) resolve(this.responseText);
        else reject(new Error(`HTTP ${this.status} loading ${url}`));
      }
    };
    xhr.open('GET', url, true);
    xhr.send();
  });
}

/**
 * Request a spec file, choosing the right URL format.
 * Old: requestSpec/requestFile with callback
 * New: returns a Promise
 */
export function requestSpec(source, diagramSrc, fromWiki) {
  const nMillis = Date.now();
  let url;
  if (fromWiki === 'yes') {
    url = `https://wiki.audacityteam.org/wiki/Toolbox/${source}?action=raw&time=${nMillis}`;
  } else {
    url = `${diagramSrc || ''}${source}.txt?time=${nMillis}`;
  }
  return fetchTextFile(url);
}


// ═══════════════════════════════════════════════════════════════
//  14.  LEGACY VISIT / DISPATCH  (for incremental migration)
// ═══════════════════════════════════════════════════════════════
//
// The old system dispatched create/size/layout/draw via lookup
// tables keyed by obj.type.  In the new architecture the
// scene-graph walker calls static methods on registered node
// classes.  This legacy layer is kept so that old-format data
// can still be processed during the migration period.

/**
 * Visit an old-format object tree using a dispatch table.
 *
 * @param {object} how   — { TypeName: fn, default: fn }
 * @param {object} ctx   — framework context
 * @param {object} what  — the object to visit
 * @param {object} data  — extra visitor data
 */
export function visit(how, ctx, what, data) {
  const fn = how[what.type] || how.default;
  if (fn) fn.call(how, ctx, what, data);
}
