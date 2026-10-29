import { SYS } from '../omni-support/sys.js';
import { Geo } from '../2d-support/geo.js';
import { PipKinds } from '../2d-support/pip-kind.js';
import { Values } from '../omni-support/values.js';
import { pointCentreXY } from '../2d-support/node-geometry.js';
export { DragPointNode };

// `drag-point` — a draggable point
/* ─────────────────────────────────────────────────────────────────────────────
`drag-point` — a draggable point, one class for both worlds (it replaces drag-point-node-zones.js)

Coordinates (the 2D contract, D3 in docs/twin-merge-plan.md):
  - The point's position is its value, read through the resolver
    (getCentreXY -> res.getValue), in local coordinates.  Writes go through
    Values.setValue, so a flyweight proto works.
  - res.T maps local to the space the node draws and hit-tests in.  The Omni
    canvas pushes a real T and provides directCtx() (screen space); a Zones
    pane leaves T as the identity from Values and draws on its transformed
    ctx.  So one code path serves both.
  - Hit tests compare T.toScreen(position) with ctxMix.screenHitPoint when the
    harness keeps one (Omni), else ctxMix.hitPoint (Zones, already local).

Looks (params.dragPointLook), kept per world until they are converged:
  'pin'      — Omni (default): cyan, shadowed, white rim, name label and emoji;
               radius params.pointRadius (6) in screen pixels at any zoom.
  'junction' — Zones (set by demo-harness2-d.js): dark #334 with #556 rim;
               radius value.r (5) in drawing units, so it zooms with the pane.
A value's color wins in both; r and stroke are honoured by 'junction' only,
and the selection ring shows ctxMix.highlighted ('pin') or value.selected /
hovered ('junction'), exactly as the two classes did.
──────────────────────────────────────────────────────────────────────────── */

// Each look reproduces its old class exactly (checked by recording canvas calls).
const LOOKS = {
  pin:      { radius: (v, p) => p.pointRadius || 6, fill: (v, p) => v.color || p.pointColor || '#4fc3f7',
              stroke: () => '#ffffffaa', shadow: true, labels: true, hitPad: 5,
              ringed: (mix, node, v) => !!mix.highlighted?.has(node),
              ring: { pad: 4, width: 2, color: '#ffffff', dashFirst: false } },
  junction: { radius: (v) => v.r || DragPointNodeRadius(), fill: (v) => v.color || '#334',
              stroke: (v) => v.stroke || '#556', shadow: false, labels: false, hitPad: 7,
              ringed: (mix, node, v) => !!(v.selected || v.hovered),
              ring: { pad: 5, width: 1.5, color: '#fff', dashFirst: true } },
};
const lookOf = (params) => LOOKS[params?.dragPointLook] || LOOKS.pin;
function DragPointNodeRadius() { return DragPointNode.RADIUS; }

class DragPointNode {
  static RADIUS = 5;
  static meta = {
    zOrder: 1,
    pipKind: PipKinds.JUNCTION,
    spawnOverrides: (wp) => ({ x: wp.x, y: wp.y, r: 5, color: '#334', stroke: '#556' }),
    editableFields: (node) => [
      { key: 'r', label: 'Radius', type: 'number', value: node.value.r || 5 },
      { key: 'color', label: 'Color', type: 'color', value: node.value.color || '#334' },
      { key: 'stroke', label: 'Outline', type: 'color', value: node.value.stroke || '#556' },
    ],
  };

  // ── Geometry (local coordinates, through the resolver) ──

  static getCentreXY = pointCentreXY;
  static getPips(res, node, params) {
    const { x, y } = DragPointNode.getCentreXY(res, node, params);
    return [{ x, y, out: 0 }];
  }
  static setPipPos(res, node, params) {
    if (params.idx === 0) res.setValue(res, node, params, { x: params.x, y: params.y });
  }

  // ── Draw ───────────────────────────────────────────────

  static draw2d(ctxMix, node, params) {
    const T = ctxMix.T;
    if (!T) return;
    const look = lookOf(params);
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const s = T.toScreen(DragPointNode.getCentreXY(ctxMix, node, params));
    const r = look.radius(v, params);

    // Omni draws in screen space (directCtx saves); a Zones pane on its own ctx.
    const ctx = ctxMix.directCtx ? ctxMix.directCtx() : (ctxMix.ctx.save(), ctxMix.ctx);

    if (look.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1; }
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Geo.TAU);
    ctx.fillStyle = look.fill(v, params); ctx.fill();
    if (look.shadow) ctx.shadowColor = 'transparent';
    ctx.strokeStyle = look.stroke(v); ctx.lineWidth = 1.5; ctx.stroke();

    if (look.ringed(ctxMix, node, v)) {
      const g = look.ring;
      ctx.beginPath(); ctx.arc(s.x, s.y, r + g.pad, 0, Geo.TAU);
      if (g.dashFirst) ctx.setLineDash([3, 3]);
      ctx.strokeStyle = g.color; ctx.lineWidth = g.width;
      if (!g.dashFirst) ctx.setLineDash([3, 3]);
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (look.labels && v.name) {
      ctx.fillStyle = '#ffffffcc'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(v.name, s.x, s.y - r - 3);
    }
    if (look.labels && v.emoji) {
      ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = (2 * r - 1) + 'px Arial';
      const fd = r / 6;
      ctx.fillText(v.emoji, s.x + fd * 0.33, s.y + fd);
    }
    ctx.restore();
  }

  // ── Hit test ───────────────────────────────────────────

  static hit_test(ctxMix, node, params) {
    // Compared with T.toScreen, so it must be in the space T maps into: the
    // untouched screen point where the harness keeps one (an enclosing
    // container may have rewritten hitPoint), else hitPoint.
    const pt = ctxMix.screenHitPoint ?? ctxMix.hitPoint;
    const T  = ctxMix.T;
    if (!pt || !T) return;
    const look = lookOf(params);
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const s = T.toScreen(DragPointNode.getCentreXY(ctxMix, node, params));
    const dx = pt.x - s.x, dy = pt.y - s.y;
    if (dx * dx + dy * dy > (look.radius(v, params) + look.hitPad) ** 2) return;

    const Ts = T.clone();
    ctxMix.hitResult = {
      node,
      interactions: {
        // Writes go through the channel, never to the value read above: that
        // may be a copy, and assigning to it would reach nothing.
        applyDrag(x, y) {
          const local = Ts.toLocal({ x: x - dx, y: y - dy });
          Values.setValue(Values, node, params, { x: local.x, y: local.y });
        },
      },
    };
  }
}

SYS.STOCK?.push(SYS.makeNode('drag-point', { x: 0, y: 0, r: 5, label: 'Junction' }));

SYS.NODE_CLASSES.push({ name: 'drag-point', cls: DragPointNode });
