/**
 * scorpio-nodes.js
 *
 * Scene-graph node classes migrated from scorpiodiagrams.js.
 *
 * ─── Migration map ──────────────────────────────────────────────
 *
 *   OLD registerMethod call                      NEW node class
 *   ──────────────────────────────               ──────────────
 *   reg("default",  create, size, layout, draw)  DefaultNode  (container fallback)
 *   reg("HStack",   0,0, layoutContainer, draw)  HStackNode
 *   reg("VStack",   0,0, layoutContainer, draw)  VStackNode
 *   reg("Overlay",  0,0, layoutContainer, draw)  OverlayNode
 *   reg("Transform",0,0, layoutTransform, draw)  TransformNode
 *   reg("Image",    create,0, layout, draw)      ImageNode
 *   reg("Tile",     create,0, layout, draw)      TileNode
 *   reg("Text",     0,0, layout, draw)           TextNode
 *   reg("Circle",   0,0, layout, draw)           CircleNode
 *   reg("Rectangle",0,0, layout, draw)           RectangleNode
 *   reg("Spacer",   0,0, layout, draw)           SpacerNode
 *   reg("Chart",    0,0, layout, draw)           ChartNode
 *   reg("Graph",    0,0, layout, draw)           GraphNode
 *   reg("Bugle",    0,0, layout, draw)           BugleNode
 *   reg("Sankey",   0,0, layout, draw)           SankeyNode
 *   reg("Parliament",0,0,layout, draw)           ParliamentNode
 *   reg("Path",     0,0,0, draw)                 PathNode
 *   reg("Tree",     0,0,0, draw)                 TreeNode
 *   reg("Arrows",   0,size,layout, draw)         ArrowsNode
 *   reg("Spline",   0,size,layout, draw)         SplineNode
 *   reg("Draggable",create,0,0, draw)            DraggableNode
 *   reg("Drag2",    create,0,0, draw)            Drag2Node
 *   reg("Prog",     create,size,layout, 0)       ProgNode
 *
 * Architecture:
 *   Old (A, obj, d)  →  New (ctxMix, node, params)
 *   A.BackingCanvas.ctx  →  ctxMix.ctx
 *   A.HotspotsCanvas.ctx → separate hit_test pass
 *   getBox(obj)          →  node.value pos/rect
 *   d.stage gating       →  lifecycle hooks
 *   obj.content children →  node.subtree
 */

import { sceneRegistry } from '../omni-support/scene.js';

import {
  getBox, getXy, applyObjectSettingsToContext, mayUpdateObjectStyle,
  drawStar, drawSpot, drawCentredRect, drawUpTriangle,
  drawLeftL, drawRightL, drawGlyph, drawRoundRect,
  getLineBetweenPoints, getTrimmedLineBetweenObjects,
  drawAnEnd, drawPointedArrowHead, drawFlatArrowHead,
  getImageSource, fractionalLatitudeFromX,
  kStageFillAndText, kStageHots, kStageOutline,
  kStageArrowShaft, kStageArrowHead, kStageDragging,
} from '../utilities/scorpio-drawing-utils.js';

// EXTERNAL — fix paths once migrated:
// import { Vector2d }                from '../2d-support/vector2d.js';
// import { constrain, firstValid, isDefined,
//          makeLabelReplacerFn }     from '../utilities/utils.js';
// import { apportionSpaceInT }      from '../utilities/chart-helpers.js';
// import { mayUpdateSpotStyle, mayUpdateSpotShape,
//          xyOfIndexSnakey }         from '../utilities/utils.js';


// ═══════════════════════════════════════════════════════════════
//  LAYOUT HELPERS  (pure functions, no node dependency)
// ═══════════════════════════════════════════════════════════════

function setCellLayout(node, x, y, xw, yh) {
  node.value.pos  = { x, y };
  node.value.rect = { x: xw, y: yh };
}

function increaseMargin(node, m) {
  const v = node.value;
  const { x, y, xw, yh } = getBox(v);
  setCellLayout(node, x + m, y + m, xw - 2 * m, yh - 2 * m);
}

/**
 * Container layout: divide space among children based on sizing.wants.
 * Replaces layoutContainer(A, obj, d).
 */
function layoutChildren(node, params) {
  const children = node.subtree || [];
  if (children.length === 0) return;

  const v = node.value;
  const { x, y, xw, yh } = getBox(v);
  const type = v.type || node.nodeClass;

  // Sum of wants.
  const k = children.reduce((sum, c) => sum + (c.value?.sizing?.wants ?? 1), 0);
  let wantsSoFar = 0;

  for (const child of children) {
    const want = child.value?.sizing?.wants ?? 1;
    switch (type) {
      case 'h-stack':
        setCellLayout(child, x + (wantsSoFar / k) * xw, y, xw * (want / k), yh);
        break;
      case 'v-stack':
        setCellLayout(child, x, y + (wantsSoFar / k) * yh, xw, yh * (want / k));
        break;
      default: // overlay
        setCellLayout(child, x, y, xw, yh);
        break;
    }
    wantsSoFar += want;
  }
}


// ═══════════════════════════════════════════════════════════════
//  CONTAINER NODES: HStack, VStack, Overlay
// ═══════════════════════════════════════════════════════════════
//
//  These have no draw2d of their own — they just contain children.
//  Layout is done in before_draw2d; children are walked automatically.

class HStackNode {
  static before_draw2d(ctxMix, node, params) {
    layoutChildren(node, params);
  }
}

class VStackNode {
  static before_draw2d(ctxMix, node, params) {
    layoutChildren(node, params);
  }
}

class OverlayNode {
  static before_draw2d(ctxMix, node, params) {
    layoutChildren(node, params);
  }
}


// ═══════════════════════════════════════════════════════════════
//  TRANSFORM NODE  (8 rigid transformations)
// ═══════════════════════════════════════════════════════════════

class TransformNode {
  static before_draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const v   = node.value;
    const op  = v.transOp || 0;
    const { x, y, xw, yh } = getBox(v);

    // Swap pos for ops 4-7 (width↔height) before child layout.
    if (op >= 4) {
      v.pos  = { x: y, y: x };
      v.rect = { x: yh, y: xw };
    }
    layoutChildren(node, params);
    if (op >= 4) {
      v.pos  = { x, y };
      v.rect = { x: xw, y: yh };
    }

    ctx.save();
    switch (op) {
      case 1: ctx.transform(-1,  0,  0, -1, 2*x + xw, 2*y + yh); break;
      case 2: ctx.transform(-1,  0,  0,  1, 2*x + xw, 0);         break;
      case 3: ctx.transform( 1,  0,  0, -1, 0,         2*y + yh); break;
      case 4: ctx.transform( 0,  1,  1,  0, 0,         0);         break;
      case 5: ctx.transform( 0, -1, -1,  0, 2*x + xw, 2*y + yh); break;
      case 6: ctx.transform( 0,  1, -1,  0, 2*x + xw, 0);         break;
      case 7: ctx.transform( 0, -1,  1,  0, 0,         2*y + yh); break;
      default: break; // identity
    }
  }

  static after_draw2d(ctxMix, node, params) {
    ctxMix.ctx?.restore();
  }
}


// ═══════════════════════════════════════════════════════════════
//  DEFAULT NODE  (container fallback)
// ═══════════════════════════════════════════════════════════════

class DefaultNode {
  static before_draw2d(ctxMix, node, params) {
    layoutChildren(node, params);
  }
  // draw2d intentionally empty — default draws nothing.
}


// ═══════════════════════════════════════════════════════════════
//  RECTANGLE NODE
// ═══════════════════════════════════════════════════════════════

class RectangleNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const v = node.value;
    let { x, y, xw, yh } = getBox(v);

    if (ctxMix.styles) mayUpdateObjectStyle(ctxMix.styles, v);
    if (v.style === 'chosen') {
      v.colour       = 'rgb(255,250,235)';
      v.borderColour = 'rgb(145,125,0)';
      v.cornerRadius = 8;
    }

    // Chooser expansions.
    const xwText = xw;
    const yhText = yh;
    if (v.drawExtra) {
      if (yh < 50) yh += 10; else xw += 10;
    }

    ctx.save();
    ctx.beginPath();
    applyObjectSettingsToContext(ctx, v);

    if (v.id && v.id === ctxMix.highlight) ctx.fillStyle = 'rgb(167,203,250)';

    if (v.cornerRadius) {
      drawRoundRect(ctx, { pos: { x, y }, rect: { x: xw, y: yh }, cornerRadius: v.cornerRadius });
    } else {
      ctx.rect(x, y, xw, yh);
    }

    // Fill + outline in one pass (old code split across kStageOutline / kStageFillAndText).
    ctx.fill();
    ctx.stroke();

    // Label.
    const frac = v.chartBox ? 0.14 : 0.5;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,1.0)';
    ctx.fillText(v.value || '', x + xwText * frac, y + yhText * frac + 6);

    if (v.chartBox) {
      // EXTERNAL: drawPlotLegends — inlined below for independence.
    }
    ctx.restore();
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const v = node.value;
    if (!v.hotspotColour) return;
    const { x, y, xw, yh } = getBox(v);
    if (pt.x >= x && pt.x <= x + xw && pt.y >= y && pt.y <= y + yh) {
      ctxMix.hitResult = { cursor: null, interactions: {} };
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  CIRCLE NODE
// ═══════════════════════════════════════════════════════════════

class CircleNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const v = node.value;
    const { x, y, xw, yh } = getBox(v);
    const r = Math.min(xw, yh) / 2;
    if (r < 0) return;

    ctx.save();
    ctx.beginPath();
    applyObjectSettingsToContext(ctx, v);
    ctx.arc(x + xw / 2, y + yh / 2, r, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,1.0)';
    ctx.fillText(v.value || '', x + xw / 2, y + yh / 2 + 6);
    ctx.restore();
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const v = node.value;
    if (!v.hotspotColour) return;
    const { x, y, xw, yh } = getBox(v);
    const cx = x + xw / 2, cy = y + yh / 2;
    const r = Math.min(xw, yh) / 2;
    const dx = pt.x - cx, dy = pt.y - cy;
    if (dx * dx + dy * dy <= r * r) {
      ctxMix.hitResult = { cursor: null, interactions: {} };
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  TEXT NODE
// ═══════════════════════════════════════════════════════════════

class TextNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const v = node.value;
    const { x, y, xw, yh } = getBox(v);

    ctx.save();
    ctx.beginPath();
    applyObjectSettingsToContext(ctx, v);

    if (v.cornerRadius) drawRoundRect(ctx, v);
    else ctx.rect(x, y, xw, yh);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(0,0,0,1.0)';
    const textWidth  = ctx.measureText(v.value || '').width;
    const textHeight = ctx.measureText('M').width;

    const xPercent = isDefined(v.xPos) ? v.xPos : 0.50;
    const yPercent = isDefined(v.yPos) ? v.yPos : 0.50;
    ctx.fillText(v.value || '',
      x + (xw - textWidth) * xPercent,
      y + (yh - textHeight) * yPercent + textHeight);
    ctx.restore();
  }
}


// ═══════════════════════════════════════════════════════════════
//  IMAGE NODE
// ═══════════════════════════════════════════════════════════════

class ImageNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const v = node.value;
    if (v.status !== 'arrived') {
      // Fallback to rectangle while loading.
      RectangleNode.draw2d(ctxMix, node, params);
      return;
    }
    if (v.hot && v.hot.status !== 'arrived') {
      RectangleNode.draw2d(ctxMix, node, params);
      return;
    }

    // Spherical projection.
    if (v.spherical) {
      ImageNode._drawSphere(ctxMix, node, params);
      return;
    }

    // Texture-warped image.
    if (v.warped) {
      // EXTERNAL: RR.drawTexture — delegated to NurbNode.
      return;
    }

    let { x, y, xw, yh } = getBox(v);
    const img = v.img;

    const from = { x: 0, y: 0, xw: img.width, yh: img.height };

    // Aspect-ratio preserving rescale.
    if (v.stretch === 'yes') {
      // fill, ignoring aspect ratio
    } else if (v.stretch === 'no') {
      // crop or center — TODO
    } else {
      if (img.width * yh < img.height * xw) {
        x  += xw * 0.5;
        xw  = img.width * yh / img.height;
        x  -= xw * 0.5;
      } else {
        y  += yh * 0.5;
        yh  = img.height * xw / img.width;
        y  -= yh * 0.5;
      }
    }

    if (isDefined(v.opacity)) ctx.globalAlpha = v.opacity;
    ctx.drawImage(img, from.x, from.y, from.xw, from.yh, x, y, xw, yh);
    ctx.globalAlpha = 1.0;
  }

  /** Sphere projection — pixel-by-pixel remapping. */
  static _drawSphere(ctxMix, node, params) {
    // EXTERNAL: drawSphere(A, obj, S) — needs getImageSource + pixel loop.
    // Stub: the full pixel-remapping code should be migrated here
    // from the original drawSphere function (lines 1904-2006).
    console.warn('ImageNode._drawSphere: not yet fully migrated');
  }
}


// ═══════════════════════════════════════════════════════════════
//  TILE NODE  (rectangle + overlaid image)
// ═══════════════════════════════════════════════════════════════

class TileNode {
  static draw2d(ctxMix, node, params) {
    RectangleNode.draw2d(ctxMix, node, params);
    increaseMargin(node, 10);
    ImageNode.draw2d(ctxMix, node, params);
    increaseMargin(node, -10);
  }
}


// ═══════════════════════════════════════════════════════════════
//  SPACER NODE  (invisible — occupies space)
// ═══════════════════════════════════════════════════════════════

class SpacerNode {
  // draw2d intentionally empty.
}


// ═══════════════════════════════════════════════════════════════
//  CHART NODE  (bar chart with iterated sub-draws)
// ═══════════════════════════════════════════════════════════════

class ChartNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const v = node.value;
    if (!v.values) return;

    const T = {};
    T.obj     = v;
    T.colours = ['rgba(105,205,105,1.0)', 'rgba(105,105,205,1.0)'];
    T.linesAt = v.linesAt || 200;
    T.minY    = isDefined(v.minY) ? v.minY : 0;
    T.maxY    = isDefined(v.maxY) ? v.maxY : 2600;

    if (v.display && v.display[1]?.startsWith('#')) T.colours[1] = v.display[1];

    T.subber  = makeLabelReplacerFn(v);
    T.values  = v.values;
    T.rows    = v.values.length;

    if (v.stemCol) T.stemCol = v.stemCol;
    if (v.rotate)  T.rotate  = v.rotate;
    if (v.textAlign) T.textAlign = v.textAlign;

    T.spacer = v.spacer;
    if (!T.spacer) T.width = 8;

    T.x0 = v.pos.x;
    T.y0 = v.pos.y;
    T.xw = v.rect.x;
    T.yh = v.rect.y;

    apportionSpaceInT(ctxMix, T);

    // Iterate and draw sub-items (bars, lines, etc.)
    ChartNode._drawSpacedItems(ctx, T, v);
  }

  static _drawSpacedItems(ctx, T, v) {
    for (let j = 0; j < (T.cols || 1); j++) {
      T.j  = j;
      T.ix = j;
      for (let i = 0; i < T.rows; i++) {
        T.i = i;
        const subtype = v.subtype?.[j] || 'Bar';
        ChartNode._drawSubItem(ctx, subtype, T);
      }
    }
  }

  /** Dispatch to the right chart sub-draw. */
  static _drawSubItem(ctx, subtype, T) {
    // EXTERNAL: spacedDrawFunctions lookup.
    // In the old code this dispatched to drawBar, drawSpan, drawLines,
    // drawEvent, drawGraphLabel, etc.
    // Stub — wire up once each sub-draw is migrated.
  }
}


// ═══════════════════════════════════════════════════════════════
//  GRAPH NODE  (waveform / line plot)
// ═══════════════════════════════════════════════════════════════

class GraphNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;
    const v = node.value;

    // EXTERNAL: drawGraph delegates to drawLinePlot / fillMinMaxPlot
    // using ruler references for scaling.
    // The full implementation (lines 2947–2968) needs ruler integration.
    console.warn('GraphNode.draw2d: not yet fully migrated');
  }
}


// ═══════════════════════════════════════════════════════════════
//  BUGLE NODE  (spindle diagram shapes)
// ═══════════════════════════════════════════════════════════════

class BugleNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const v = node.value;
    const { x, y, xw, yh } = getBox(v);

    // Background rectangle.
    v.colour = '#e3a14e';
    RectangleNode.draw2d(ctxMix, node, params);

    if (!v.widths || !v.alignments) return;

    const dy0 = (yh - v.widths[0]) * v.alignments[0];
    const dy1 = (yh - v.widths[1]) * v.alignments[1];
    const k = 60;

    // Top edge.
    ctx.beginPath();
    ctx.moveTo(x, y + dy0);
    for (let i = 0; i <= k; i++) {
      const t = i / k;
      const s = t * t * (3 - 2 * t);
      // EXTERNAL: RR.bulge, RR.tBlend
      const b = 0; // RR.bulge(v.bulge, v.bulgeX, t);
      const a = 0.5; // RR.tBlend(v.alignments[0], v.alignments[1], t);
      ctx.lineTo(x + xw * t, y + dy0 + (dy1 - dy0) * s - b * a);
    }
    // Bottom edge (reversed).
    for (let i = k; i >= 0; i--) {
      const t = i / k;
      const s = t * t * (3 - 2 * t);
      const b = 0;
      const a = 0.5;
      ctx.lineTo(x + xw * t,
        y + dy0 + v.widths[0] +
        (dy1 - dy0 + v.widths[1] - v.widths[0]) * s + b * (1 - a));
    }
    ctx.closePath();
    ctx.fillStyle = '#ae7041';
    ctx.fill();

    // Bevelled gradient overlay.
    ctx.beginPath();
    const grd = ctx.createLinearGradient(x, y, x, y + yh);
    grd.addColorStop(0,      '#e3e38060');
    grd.addColorStop(0.1,    '#e3e31008');
    grd.addColorStop(0.5,    '#e3e31000');
    grd.addColorStop(0.5001, '#00000020');
    grd.addColorStop(0.95,   '#00000038');
    grd.addColorStop(1,      '#00008050');
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, xw, yh);
  }
}


// ═══════════════════════════════════════════════════════════════
//  SANKEY NODE  (placeholder — delegates to rectangle)
// ═══════════════════════════════════════════════════════════════

class SankeyNode {
  static draw2d(ctxMix, node, params) {
    RectangleNode.draw2d(ctxMix, node, params);
  }
}


// ═══════════════════════════════════════════════════════════════
//  PARLIAMENT NODE  (hemicycle / phyllotaxis layout)
// ═══════════════════════════════════════════════════════════════

class ParliamentNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const v = node.value;
    const { x, y, xw, yh } = getBox(v);

    const phi = 0.618 * Math.PI * 2;
    const start = 40;
    const n = 220 + start;
    const overhangAngle = 20;

    for (let i = start; i < n; i++) {
      const r     = 0.4 * yh * Math.sqrt(i / n);
      const theta = i * phi;
      const sx    = -r * Math.cos(theta) + x + xw / 2;
      const sy    = -r * Math.sin(theta) + y + yh / 2;
      const angle = (180 * theta / Math.PI + overhangAngle) % 360;

      ctx.fillStyle = (angle > 180 + 2 * overhangAngle) ? '#993333' : '#3333AA';
      drawSpot(ctx, { x: sx, y: sy, r: 5 });
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  PATH NODE  (snake-style item layout)
// ═══════════════════════════════════════════════════════════════

class PathNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const v = node.value;
    if (!v.values) return;

    const { x, y, xw: xwRaw, yh: yhRaw } = getBox(v);
    const margin = 9;
    const width  = 15;
    const factor = 1.1;

    const xw = xwRaw - 2 * margin - width;
    const yh = yhRaw - 2 * margin - width;

    const rows = v.values.length;
    let n = Math.ceil(Math.sqrt(rows * factor * xw / yh)) + 1;
    let m = Math.ceil(rows / n);
    const unused = n * m - rows;
    if (n < m) m -= Math.floor(unused / n);
    else       n -= Math.floor(unused / m);

    const T = {
      rows, n, m, width,
      r0:       v.baseSize || 0,
      x0:       x + margin + width / 2,
      y0:       y + margin + width / 2,
      xSpacing: xw / ((n - 1) || 1),
      ySpacing: yh / ((m - 1) || 1),
      fn:       xyOfIndexSnakey,
      style:    v.style || 0,
    };

    PathNode._drawSnakeyPath(ctx, v, T, ctxMix);
  }

  static _drawSnakeyPath(ctx, v, T, ctxMix) {
    const values = v.values;
    const animateTime = 11 * Math.log(values.length + 5);
    const frac = Math.min(animateTime, ctxMix.time || 20) / animateTime;
    const maxv = Math.floor(frac * T.rows);
    T.maxv = maxv;

    // Draw snake body segments.
    T.isPath = true;
    T.x = 0; T.y = 0;
    for (let i = 0; i < maxv; i++) {
      T.item = values[i];
      T.i    = i;
      T.style = mayUpdateSpotStyle(T.item, T.style, ctxMix);
      T.shape = mayUpdateSpotShape(T.item, T.shape || 0);
      PathNode._drawSnakeSegment(ctx, T);
    }

    // Draw spots.
    T.isPath = false;
    for (let i = 0; i < T.rows; i++) {
      T.item = values[i];
      T.i    = i;
      T.style = mayUpdateSpotStyle(T.item, T.style, ctxMix);
      T.shape = mayUpdateSpotShape(T.item, T.shape || 0);
      PathNode._drawSnakeSpotShape(ctx, T);
    }
  }

  static _drawSnakeSegment(ctx, T) {
    const widths = [5, 6, 9];
    const lines  = ['rgb(150,150,150)', 'rgb(156,3,0)', 'rgb(15,0,181)'];
    ctx.beginPath();
    ctx.lineWidth   = widths[T.style] || 5;
    ctx.strokeStyle = lines[T.style] || lines[0];
    ctx.moveTo(T.x, T.y);

    const S = T.fn(T.i, T);
    if (T.i === 0) {
      ctx.moveTo(S.x, S.y);
    } else if (T.theta !== undefined) {
      ctx.arc(S.x, S.y, T.ySpacing / 2, T.theta, T.theta + Math.PI, T.thetaDirection);
      S.y += T.ySpacing / 2;
    } else {
      ctx.lineTo(S.x, S.y);
    }
    if (!isDefined(T.item?.snakeStyle)) ctx.stroke();
    T.x = S.x;
    T.y = S.y;
  }

  static _drawSnakeSpotShape(ctx, T) {
    // EXTERNAL: drawSnakeSpotShape — dispatches based on T.shape.
    // Draws spots/rects/heads at snake positions.
    // Stub — wire up once the spot shapes are fully migrated.
    const S = T.fn(T.i, T);
    const r = T.r0 + 5;
    ctx.fillStyle = 'rgba(156,3,0,0.8)';
    drawSpot(ctx, { x: S.x, y: S.y, r, doStroke: true });
  }
}


// ═══════════════════════════════════════════════════════════════
//  TREE NODE  (reuses PathNode)
// ═══════════════════════════════════════════════════════════════

class TreeNode {
  static draw2d(ctxMix, node, params) {
    PathNode.draw2d(ctxMix, node, params);
  }
}


// ═══════════════════════════════════════════════════════════════
//  ARROWS NODE  (inter-object connector lines)
// ═══════════════════════════════════════════════════════════════

class ArrowsNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const v      = node.value;
    const arrows = v.content;
    if (!arrows || !Array.isArray(arrows)) return;

    const objectLookup = ctxMix.objectLookup;

    // Draw shaft + head in one pass (old code split across stages 1 and 9).
    for (let i = 0; i < arrows.length; i += 2) {
      const obj1 = objectLookup?.(arrows[i]);
      const obj2 = objectLookup?.(arrows[i + 1]);
      if (!obj1?.pos || !obj2?.pos) continue;

      const S = getTrimmedLineBetweenObjects(obj1, obj2);

      // Shaft.
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0,0,0,1.0)';
      ctx.lineWidth   = 3;
      ctx.moveTo(S[0].x, S[0].y);
      ctx.lineTo(S[1].x, S[1].y);
      ctx.stroke();

      // Head.
      const headStyle = v.head || 'pointed';
      drawAnEnd(ctx, { x: S[1].x, y: S[1].y, theta: S[1].theta, style: headStyle });
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  SPLINE NODE  (Catmull-Rom lipid membrane splines)
// ═══════════════════════════════════════════════════════════════

class SplineNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const v = node.value;
    const arrows = v.content;
    if (!arrows || !Array.isArray(arrows)) return;

    // EXTERNAL: Catmull-Rom evaluation via RR.catEval, RR.catmulLength,
    // RR.getNextSequenceCoord, drawLipid, drawSplineSegment.
    // Stub — the spline evaluation and lipid-drawing loop
    // (lines 2191–2241) needs RR helpers to be migrated first.
    console.warn('SplineNode.draw2d: not yet fully migrated');
  }
}


// ═══════════════════════════════════════════════════════════════
//  DRAGGABLE NODE
// ═══════════════════════════════════════════════════════════════

class DraggableNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const v = node.value;
    const { x, y, xw, yh } = getBox(v);

    if (!isDefined(v.offset)) {
      v.offset = { x: xw / 2, y: yh / 2 };
    }

    const sx = x + v.offset.x;
    const sy = y + v.offset.y;
    const S  = {
      x: sx, y: sy,
      r: (v.r || 8) + 4,
      w: 12, h: 12,
      theta: 0.3,
      doStroke: true,
    };

    ctx.fillStyle   = v.colour       || 'rgb(205,192,67)';
    ctx.strokeStyle = v.borderColour || 'rgb(120,97,46)';
    drawGlyph(ctx, v, S);
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;

    const v = node.value;
    const { x, y, xw, yh } = getBox(v);
    if (!isDefined(v.offset)) return;

    const sx = x + v.offset.x;
    const sy = y + v.offset.y;
    const r  = (v.r || 8) + 4;
    const dx = pt.x - sx, dy = pt.y - sy;

    if (dx * dx + dy * dy > r * r) return;

    ctxMix.hitResult = {
      cursor: null,
      interactions: {
        applyDrag(mx, my) {
          v.offset.x = mx - x;
          v.offset.y = my - y;
        },
      },
    };
  }
}


// ═══════════════════════════════════════════════════════════════
//  DRAG2 NODE  (ruler dragger handles)
// ═══════════════════════════════════════════════════════════════

class Drag2Node {
  static draw2d(ctxMix, node, params) {
    // Drag2 draws only as a hotspot in the old code.
    // Visible drawing is commented out in the original.
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const v = node.value;
    if (!v.hotspotColour) return;

    const { x, y, xw, yh } = getBox(v);
    if (pt.x >= x && pt.x <= x + xw && pt.y >= y && pt.y <= y + yh) {
      ctxMix.hitResult = {
        cursor: null,
        interactions: {
          applyDrag(mx, my) {
            if (v.dragFn) v.dragFn(node, { x: mx - v.pos.x, y: my - v.pos.y });
          },
        },
      };
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  PROG NODE  (code execution — no drawing)
// ═══════════════════════════════════════════════════════════════

class ProgNode {
  // No draw2d — Prog nodes execute code, they don't render.
  // EXTERNAL: createProg(A, obj, data) registered click/zoom actions.
}


// ═══════════════════════════════════════════════════════════════
//  REGISTRATION
// ═══════════════════════════════════════════════════════════════

sceneRegistry.registerNodeClass('default',    DefaultNode);
sceneRegistry.registerNodeClass('h-stack',    HStackNode);
sceneRegistry.registerNodeClass('v-stack',    VStackNode);
sceneRegistry.registerNodeClass('overlay',    OverlayNode);
sceneRegistry.registerNodeClass('transform',  TransformNode);
sceneRegistry.registerNodeClass('image',      ImageNode);
sceneRegistry.registerNodeClass('tile',       TileNode);
sceneRegistry.registerNodeClass('text',       TextNode);
sceneRegistry.registerNodeClass('circle',     CircleNode);
sceneRegistry.registerNodeClass('rectangle',  RectangleNode);
sceneRegistry.registerNodeClass('spacer',     SpacerNode);
sceneRegistry.registerNodeClass('chart',      ChartNode);
sceneRegistry.registerNodeClass('graph',      GraphNode);
sceneRegistry.registerNodeClass('bugle',      BugleNode);
sceneRegistry.registerNodeClass('sankey',     SankeyNode);
sceneRegistry.registerNodeClass('parliament', ParliamentNode);
sceneRegistry.registerNodeClass('path',       PathNode);
sceneRegistry.registerNodeClass('tree',       TreeNode);
sceneRegistry.registerNodeClass('arrows',     ArrowsNode);
sceneRegistry.registerNodeClass('spline',     SplineNode);
sceneRegistry.registerNodeClass('draggable',  DraggableNode);
sceneRegistry.registerNodeClass('drag2',      Drag2Node);
sceneRegistry.registerNodeClass('prog',       ProgNode);


// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════

export {
  DefaultNode, HStackNode, VStackNode, OverlayNode, TransformNode,
  ImageNode, TileNode, TextNode, CircleNode, RectangleNode,
  SpacerNode, ChartNode, GraphNode, BugleNode, SankeyNode,
  ParliamentNode, PathNode, TreeNode, ArrowsNode, SplineNode,
  DraggableNode, Drag2Node, ProgNode,

  // Layout helpers (used by scene builders).
  setCellLayout, increaseMargin, layoutChildren,
};
