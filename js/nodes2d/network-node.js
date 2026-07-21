/**
 * scroll-cell.js
 *
 * Unified cell renderer for both grid and tree multiscrollers.
 * Internally uses tree-path cursors (arrays) in all modes.
 *
 * CellConfig encapsulates the behavioural differences between
 * grid and tree layouts. A configured instance is passed to the
 * ScrollCellNode constructor; the node is then registered with
 * the scene registry under whatever name(s) you need.
 *
 * Usage:
 *   sceneRegistry.registerNodeClass('ms-cell',
 *     createCellClass(new CellConfig()));
 *   sceneRegistry.registerNodeClass('grid-scroll-cell',
 *     createCellClass(new CellConfig({ grid: true })));
 */

import { sceneRegistry } from '../omni-support/scene.js';
import { ColorEngine, TextUtils } from '../utilities/color-engine.js';
import { GeometryUtils } from '../../js/utilities2/line-geometry.js'

// ── NetworkNode ─────────────────────────────────────────────

class NetworkNode {

  static config = null;

  static draw2d(ctxMix, node, params) {
    const T = ctxMix.T;
    if (!T) return;

    const defaults = {
      showNodes: 1, showText: 1, radius: 20,
      fill: '#994', outline: '#551', innerFont: '', strength: 50,
    };
    const p = { ...defaults, ...params };
    const v = node.value || {};
    const zoom = T.sx;
    const screen = T.toScreen({ x: v.x || 0, y: v.y || 0 });

    const ctx = ctxMix.directCtx();

    if (p.showNodes && p.radius >= 1) {
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, p.radius * zoom, 0, Math.PI * 2);
      ctx.fillStyle = p.fill;
      ctx.fill();
      ctx.strokeStyle = p.outline;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (p.showText) {
      const suffix = Math.floor((Math.min(50, p.strength ?? 50) * 255 / 50))
        .toString(16).padStart(2, '0');

      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (p.innerFont && p.radius >= 1) {
        ctx.font = GeometryUtils.resizedFont(p.innerFont, p.radius);
        const fontDisplace = (parseInt(ctx.font.match(/\d+/), 10) || 16) / 8;
        const displayText = v.emoji || v.symbol || v.name?.substr(0, 2) || 'X';
        ctx.fillText(displayText, screen.x, screen.y + fontDisplace * zoom);
      }

      ctx.fillStyle = '#000000' + suffix;
      ctx.font = '12px Arial';
      ctx.fillText(v.name || '', screen.x, screen.y + p.radius * zoom + 15);
    }

    ctx.restore();
  }

  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    const T  = ctxMix.T;
    if (!pt || !T) return;

    const v = node.value || {};
    const screen = T.toScreen({ x: v.x || 0, y: v.y || 0 });
    const r = (params.radius || 20) * T.sx;

    const dx = pt.x - screen.x, dy = pt.y - screen.y;
    if (dx * dx + dy * dy > (r + 5) ** 2) return;

    const Ts = T.clone();
    ctxMix.hitResult = {
      node,
      interactions: {
        applyDrag(screenX, screenY) {
          const local = Ts.toLocal({ x: screenX - dx, y: screenY - dy });
          node.value.x = local.x;
          node.value.y = local.y;
        },
      },
    };
  }
}

sceneRegistry.registerNodeClass('net-node', NetworkNode );

