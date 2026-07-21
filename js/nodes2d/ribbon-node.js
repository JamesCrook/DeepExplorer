/**
 * ribbon-node.js
 *
 * Scene-graph node classes for ribbons.
 *
 * RibbonNode       — parent node whose subtree contains ribbon-point children.
 *                    Applies a center-origin translate so model (0,0) maps to
 *                    screen center (matching OmniChart conventions).
 *                    Draws the ribbon path in before_draw2d so that child
 *                    handles render on top.
 *
 * RibbonPointNode  — leaf node for a single control point.
 *                    Draws a draggable handle circle in draw2d.
 *                    Implements hit_test with an applyDrag interaction that
 *                    updates the AST node's value.x / value.y in place.
 *
 * AST shape:
 *
 *   ribbon (value: null)
 *     ribbon-point (value: { x, y, name?, color? })
 *     ribbon-point (value: { x, y, name?, color? })
 *     ...
 *
 * Usage:
 *   import './ribbon-node.js';          // registers with sceneRegistry
 *   import { RibbonNode, RibbonPointNode } from './ribbon-node.js';
 */

/*
# ESSENTIALS

Provides a 2D Biarc Ribbon through chosen points.

The node also has some ribbon decorations, such as tangents, regular tick marks and
circles for control points.
*/ 


import { sceneRegistry } from '../omni-support/scene.js';
import { Ribbon } from '../../js/2d-support/ribbon2d.js';
import { RibbonPath } from '../../js/utilities2/line-geometry.js';

// ── Fallback ribbon drawing ──────────────────────────────────

/**
 * Simple polyline fallback when RibbonPath is not available.
 */
function drawFallbackRibbon(ctx, points, params) {
  if (points.length < 2) return;

  const width = params.ribbonWidth ?? 20;
  const alpha = params.fillOpacity ?? 0.6;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = a.color || params.ribbonColor || '#4fc3f7';
    ctx.stroke();
  }

  const strokeW = params.strokeWidth ?? 1;
  if (strokeW > 0.01) {
    ctx.lineWidth = strokeW;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = params.ribbonOutline || '#fff4';
    ctx.stroke();
  }

  ctx.restore();
}


// ── RibbonPointNode ──────────────────────────────────────────


// ribbon point nodes are draggable. Migrated to T + directCtx:
// draw2d draws at T.toScreen positions in screen space,
// hit_test compares screen hitPoint against T.toScreen.
class RibbonPointNode {

  static draw2d(ctxMix, node, params) {
    const T = ctxMix.T;
    if (!T) return;

    const showPoints = params.showPoints ?? 1;
    if (showPoints < 0.01) return;

    const s = T.toScreen({ x: node.value?.x ?? 0, y: node.value?.y ?? 0 });
    const radius = params.pointRadius ?? 8;
    const color = node.value?.color || params.pointColor || '#4fc3f7';

    const ctx = ctxMix.directCtx();
    ctx.globalAlpha = showPoints;

    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;

    ctx.beginPath();
    ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffffffcc';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (node.value?.name && (params.showLabels ?? 1) > 0.5) {
      ctx.fillStyle = '#ffffffcc';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(node.value.name, s.x, s.y - radius - 4);
    }

    ctx.restore();
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    const T  = ctxMix.T;
    if (!pt || !T) return;

    const wx = node.value?.x ?? 0;
    const wy = node.value?.y ?? 0;
    const s  = T.toScreen({ x: wx, y: wy });
    const hitRadius = (params.pointRadius ?? 8) + 6;

    const dx = pt.x - s.x;
    const dy = pt.y - s.y;
    if (dx * dx + dy * dy > hitRadius * hitRadius) return;

    const Ts = T.clone();

    ctxMix.hitResult = {
      node,
      cursor: ctxMix.flyweight?.cursor
        ? [...ctxMix.flyweight.cursor] : null,
      interactions: {
        applyDrag(sx, sy) {
          const local = Ts.toLocal({ x: sx - dx, y: sy - dy });
          node.value.x = local.x;
          node.value.y = local.y;
        },
        applySelect(cursor) { },
      },
    };
  }
}


// ── RibbonNode ───────────────────────────────────────────────
//
// Draws the ribbon path on directCtx using T-transformed screen
// points. No self-centering — positioning is handled by T
// (LayerNode centering for standalone scenes, container shift
// for addable mode).
//
// Child ribbon-points also use directCtx + T independently.

class RibbonNode {

  static before_draw2d(ctxMix, node, params) {
    ctxMix.flyweight._ribbonPointIndex = 0;

    const T = ctxMix.T;
    if (!T) return;

    const zoom = T.sx;

    // ── Collect points and transform to screen coords ─────
    const children = node.subtree || [];
    if (children.length < 2) return;

    const points = children.map(child => {
      const s = T.toScreen({ x: child.value?.x ?? 0, y: child.value?.y ?? 0 });
      return {
        x: s.x, y: s.y,
        name:  child.value?.name,
        color: child.value?.color,
      };
    });

    // ── Apply gradient if requested ───────────────────────
    if (params.ribbonGradient && typeof Colours !== 'undefined') {
      const colors = Colours.interpolateGradient(params.ribbonGradient, points.length);
      points.forEach((p, i) => { p.color = colors[i]; });
    }

    // ── Build style (pixel dimensions scaled by zoom) ─────
    const style = {
      width:             (params.ribbonWidth   ?? 20)  * zoom,
      angle:              params.ribbonAngle   ?? 12,
      straightEdgeWidth: (params.polygonWidth  ?? 0)   * zoom,
      fill:               params.ribbonColor   || '#4fc3f7',
      outline:            params.ribbonOutline || '#ffffff44',
      lineWidth:         (params.strokeWidth   ?? 1)   * zoom,
      globalAlpha:        params.fillOpacity   ?? 0.6,
      startEndType:       params.startEndType  || ']',
      endEndType:         params.endEndType    || ']',
      startSlant:         0,
      endSlant:           0,
      radius:             params.pointRadius   ?? 8,
      features: {
        endJoin:    (params.endJoin       ?? 0) > 0.5,
        endControl: (params.endControl   ?? 0) > 0.5,
        fill:       (params.showFill     ?? 0) > 0.5,
        bars:       (params.showBars     ?? 0) > 0.5,
        tangents:   (params.showTangents ?? 0) > 0.5,
        segments:   (params.showSegments ?? 1) > 0.5,
        ribbonFill: (params.showRibbonFill ?? 0) > 0.5,
        spline:     (params.splineMode   ?? 0) > 0.5,
      },
    };

    // ── Draw on directCtx (screen space) ──────────────────
    if (RibbonPath && Ribbon) {
      const ribbonPath = new RibbonPath()
        .withType(style.features.spline ? 'spline' : 'biarc')
        .withNodes(points)
        .withEndJoin(style.features.endJoin)
        .withEndControls(style.features.endControl)
        .build();

      const ctx = ctxMix.directCtx();
      const ribbon = new Ribbon({ path: null, style });
      ribbon.setCtx(ctx);

      if (style.features.fill)       ribbon.drawFillFromPath(ribbonPath);
      if (style.features.segments)    ribbon.drawSegmentsFromPath(ribbonPath, style);
      if (style.features.ribbonFill)  ribbon.drawFilledRibbonFromPath(ribbonPath, style);

      if (style.straightEdgeWidth > 0) {
        ribbon.drawPolygonFromPath(ribbonPath, {
          width: style.straightEdgeWidth,
          color: style.outline,
        });
      }
      if (style.features.tangents)  ribbon.drawTangentsFromPath(ribbonPath);
      if (style.features.bars)      ribbon.drawBarsFromPath(ribbonPath);

      ctxMix.flyweight._ribbonPath = ribbonPath;
      ctx.restore();
    } else {
      const ctx = ctxMix.directCtx();
      drawFallbackRibbon(ctx, points, params);
      ctx.restore();
    }
  }

  static after_draw2d(ctxMix, node, params) {
    // No cascaded ctx save/restore needed — drawing used directCtx
  }

  static before_child_draw2d(ctxMix, node, params, child) {
    const idx = ctxMix.flyweight._ribbonPointIndex++;
    ctxMix.flyweight.cursor = [idx];
  }

  static before_hit_test(ctxMix, node, params) {
    ctxMix.flyweight._ribbonPointIndex = 0;
    // T flows through unchanged — no centering push needed.
    // (Legacy ctxMix.transform / panZoom no longer used by
    // RibbonPointNode — it reads T directly.)
  }

  static before_child_hit_test(ctxMix, node, params, child) {
    const idx = ctxMix.flyweight._ribbonPointIndex++;
    ctxMix.flyweight.cursor = [idx];
  }
}


// ── Registration ─────────────────────────────────────────────

sceneRegistry.registerNodeClass('ribbon',       RibbonNode);
sceneRegistry.registerNodeClass('ribbon-point',  RibbonPointNode);

export { RibbonNode, RibbonPointNode };