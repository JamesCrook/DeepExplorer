import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { PipKinds } from '../2d-support/pip-kind.js';
import { Values } from '../omni-support/values.js';
import { DeepRender, StarRender, magWeight } from '../2d-support/sky-gl.js';
export { DeepSkyNode, FieldStarNode, StarNode };

/* ─────────────────────────────────────────────────────────────────────────────
Sky nodes — ordinary scene-graph leaves over sky-gl.

  star        a named star: value { x, y, mag, cls (B G M N), color?, nova?, label }
  field-star  an unnamed star for flyweight arrays: value { x, y, w, c }.  It has
              no hit_test, so a field of a thousand never steals a click.
  deep-sky    a galaxy or nebula: value { x, y, r, rot, axis, type, seed, ... }

star declares itself a junction, so in the stock-strip arena edges attach to
stars and join them into constellations.  deep-sky has no pip: it is a body.
──────────────────────────────────────────────────────────────────────────── */

class StarNode {
  static meta = {
    zOrder: 1,
    pipKind: PipKinds.JUNCTION,
    spawnOverrides: (wp) => ({ x: wp.x, y: wp.y }),
    editableFields: (node) => [
      { key: 'label', label: 'Name', type: 'text', value: node.value.label || '' },
      { key: 'mag', label: 'Magnitude', type: 'number', value: node.value.mag ?? 3 },
      { key: 'cls', label: 'Class B/G/M/N', type: 'text', value: node.value.cls || 'G' },
    ],
  };
  static getCentreXY(res, node, params) {
    const v = res.getValue(res, node, params) || {};
    return { x: v.x || 0, y: v.y || 0 };
  }
  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const mag = v.mag ?? 3;
    const s = StarRender.draw(ctxMix.ctx, v.x || 0, v.y || 0,
      { weight: v.weight ?? magWeight(mag), mag, cls: v.cls, color: v.color, nova: v.nova || v.cls === 'N' }, params);
    if (!s) return;
    (node.state ||= {}).hitR = (Math.max(6, s.coreR) + 4) / s.z;
    if (v.selected || v.hovered) {
      const ctx = ctxMix.ctx;
      ctx.save();
      ctx.beginPath(); ctx.arc(v.x || 0, v.y || 0, (s.coreR + 7) / s.z, 0, Math.PI * 2);
      ctx.setLineDash([3 / s.z, 3 / s.z]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / s.z; ctx.stroke();
      ctx.restore();
    }
  }
  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const dx = pt.x - (v.x || 0), dy = pt.y - (v.y || 0), R = node.state?.hitR ?? 12;
    if (dx * dx + dy * dy > R * R) return;
    ctxMix.hitResult = { node, interactions: {
      applyDrag(wx, wy) { Values.setValue(Values, node, params, { x: wx - dx, y: wy - dy }); return node; },
    } };
  }
}

class FieldStarNode {
  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    if (!v) return;
    StarRender.draw(ctxMix.ctx, v.x, v.y, { weight: v.w, mag: 9, rgb: v.c, knee: 6 }, params);
  }
}

class DeepSkyNode {
  static meta = {
    zOrder: 0.5,
    // No pip: a galaxy is a body, not a point, so a star dropped into a
    // nebula sits in it rather than merging with it as two junctions would.
    spawnOverrides: (wp) => ({ x: wp.x, y: wp.y, r: 50 }),
    editableFields: (node) => [
      { key: 'label', label: 'Name', type: 'text', value: node.value.label || '' },
      { key: 'type', label: 'Type', type: 'text', value: node.value.type || 'spiral' },
      { key: 'r', label: 'Radius', type: 'number', value: node.value.r ?? 50 },
      { key: 'rot', label: 'Rotation°', type: 'number', value: node.value.rot ?? 0 },
      { key: 'axis', label: 'Axis ratio', type: 'number', value: node.value.axis ?? 1 },
      { key: 'seed', label: 'Seed', type: 'number', value: node.value.seed ?? 1 },
      { key: 'gain', label: 'Gain', type: 'number', value: node.value.gain ?? 1 },
      { key: 'arms', label: 'Arms', type: 'number', value: node.value.arms ?? 2 },
      { key: 'pitch', label: 'Pitch°', type: 'number', value: node.value.pitch ?? 15 },
      { key: 'bulge', label: 'Bulge', type: 'number', value: node.value.bulge ?? 0.4 },
    ],
  };
  static getCentreXY(res, node, params) {
    const v = res.getValue(res, node, params) || {};
    return { x: v.x || 0, y: v.y || 0 };
  }
  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    DeepRender.draw(ctxMix.ctx, v, params);
    if (v.selected || v.hovered) {
      const ctx = ctxMix.ctx, r = v.r || 40, z = Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(v.x || 0, v.y || 0, r * 1.05, r * 1.05 * (v.axis ?? 1), (v.rot || 0) * Math.PI / 180, 0, Math.PI * 2);
      ctx.setLineDash([4 / z * 2, 4 / z * 2]); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2 / z; ctx.stroke();
      ctx.restore();
    }
  }
  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const v = ctxMix.getValue(ctxMix, node, params) || {};
    const r = v.r || 40, axis = Math.max(0.05, v.axis ?? 1), rot = (v.rot || 0) * Math.PI / 180;
    const dx = pt.x - (v.x || 0), dy = pt.y - (v.y || 0);
    const lx = Math.cos(rot) * dx + Math.sin(rot) * dy, ly = -Math.sin(rot) * dx + Math.cos(rot) * dy;
    // A thin edge-on disc is still easy to grab.
    const ry = Math.max(r * axis, 8);
    if ((lx / (r * 0.9)) ** 2 + (ly / ry) ** 2 > 1) return;
    ctxMix.hitResult = { node, interactions: {
      applyDrag(wx, wy) { Values.setValue(Values, node, params, { x: wx - dx, y: wy - dy }); return node; },
    } };
  }
}

sceneRegistry.registerNodeClass('star', StarNode);
sceneRegistry.registerNodeClass('field-star', FieldStarNode);
sceneRegistry.registerNodeClass('deep-sky', DeepSkyNode);

SYS.STOCK.push(
  SYS.makeNode('star',     { x: 0, y: 0, mag: 1.4, cls: 'B', label: 'Star' }),
  SYS.makeNode('deep-sky', { x: 0, y: 0, r: 22, type: 'spiral', rot: 30, axis: 0.6, seed: 21, hubble: 'Sc', label: 'Galaxy' }),
  SYS.makeNode('deep-sky', { x: 0, y: 0, r: 24, type: 'emission', rot: 10, axis: 0.85, seed: 8, label: 'Nebula' }),
);
SYS.CONTROLS.push(
  { type: 'separator', label: 'Sky' },
  { id: 'exposure', label: 'Star exposure', min: 0.2, max: 3, step: 0.05, value: 1 },
  { id: 'spikeLen', label: 'Spike length', min: 0, max: 120, step: 1, value: 25 },
  { id: 'galGain', label: 'Galaxy brightness', min: 0, max: 4, step: 0.05, value: 1.6 },
  { id: 'nebGain', label: 'Nebula brightness', min: 0, max: 4, step: 0.05, value: 1.6 },
);
