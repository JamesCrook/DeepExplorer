/**
 * The Haemoglobin and ATP Synthase animations: rules in the subject's own names, generic nodes, a facade between
 *
 * The animation scenes: each builds its runtime (entities and rules, in the
 * subject's own names), a scene graph of generic nodes, and the facade that
 * joins them.
 *
 *   setupHB(R) / setupATP(R)  →  { root, rules, update }
 *
 *   root    fit-stage > composite / shape / caption / polyline nodes.  None of
 *           them knows about haemoglobin or the runtime.
 *   rules   sidebar cards [{ type, label, dsl, isActive }].  The dsl text only
 *           shows what each rule does; the rules themselves are JavaScript.
 *   update  the facade: reads the entities (O2, Fe, His …) and writes the
 *           nodes' generic fields (x, y, rotation, fill …).  Called before
 *           every render (layer.inst.updateValues), after the runtime ticks.
 *
 * So the script is written in natural names, the nodes in general ones, and
 * only update() knows both.
 */

import { MiniAstNode } from '../omni-support/scene.js';
import { Values } from '../omni-support/values.js';
import '../nodes2d/fit-stage-node.js';
import '../nodes2d/composite-node.js';
import '../nodes2d/shape-node.js';
import '../nodes2d/caption-node.js';
import '../nodes2d/polyline-node.js';

/** Named nodes, so the facade can write them by name. */
function makeView() {
  const nodes = {};
  return {
    nodes,
    /** Make a node; give it a name to make it writable by the facade. */
    node(type, value = {}, children = [], name = null) {
      const n = new MiniAstNode(type, children, value);
      if (name) nodes[name] = n;
      return n;
    },
    set(name, patch) { Values.setValue(Values, nodes[name], null, patch); },
  };
}

const circle = (x, y, r, more = {}) => ({ x, y, w: 2 * r, h: 2 * r, cornerRadius: r, ...more });
const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;


class OmniAnimateModel {

  // ═══════════════════════════════════════════════════
  //  Haemoglobin Bohr Effect
  // ═══════════════════════════════════════════════════

  static setupHB(R) {
    R.reset();
    const rules = [];

    // ── Entities and rules: the script, in natural names ──
    R.ent('O2',     { x: 300, y: 15, bound: 0 });
    R.ent('Fe',     { x: 300, y: 176, r: 18 });
    R.ent('His',    { ang: -40 });
    R.ent('Asp',    { x: 245, y: 355 });
    R.ent('His146', { x: 305, y: 355 });
    R.ent('ChB',    { tilt: 0 });

    const dO2 = R.addDrive({ target: 'O2.y', mode: 'toward', value: 148, rate: 90 });
    rules.push({ type: 'phase', ref: dO2, label: 'bind_O₂',
      dsl: 'phase bind_O₂:\n  drive O₂.position toward Fe rate 1.0/s',
      isActive: () => dO2.active });

    const onBind = R.addOn({
      pred: () => Math.abs(R.ents.O2.y - R.ents.Fe.y) < (27 + R.ents.Fe.r) && !R.ents.O2.bound,
      action: () => {
        R.ents.O2.bound = 1;
        dO2.active = false;
        R.addDrive({ target: 'Fe.y', mode: 'toward', value: 168, rate: 3 });
        R.addDrive({ target: 'Fe.r', mode: 'toward', value: 9, rate: 3 });
      }
    });
    rules.push({ type: 'on', ref: onBind, label: 'O₂ binds',
      dsl: 'on distance(O₂, Fe) < 2.2:\n  O₂.state = bound\n  drive Fe toward plane rate 0.8/s\n  drive Fe.radius toward 0.9',
      isActive: () => R.t - onBind.lastFired < 0.6 });

    const wCouple = R.addWhile({
      pred: () => R.ents.Fe.y < 170,
      during: () => { R.ents.His.ang = (168 - R.ents.Fe.y) * 20; },
      enter: () => {}, exit: () => {}
    });
    rules.push({ type: 'while', ref: wCouple, label: 'Fe→His coupling',
      dsl: 'while distance(Fe, porphyrin_plane) < 0.3:\n  relate Fe.position, HisF8.chi2\n    via linear(gain: -40°/Å)',
      isActive: () => wCouple.active });

    const wSalt = R.addWhile({
      pred: () => R.ents.His.ang > -35,
      enter: () => {
        R.addDrive({ target: 'Asp.x', mode: 'toward', value: 155, rate: 40 });
        R.addDrive({ target: 'His146.x', mode: 'toward', value: 400, rate: 40 });
        R.addDrive({ target: 'ChB.tilt', mode: 'toward', value: 9, rate: 4 });
      }
    });
    rules.push({ type: 'while', ref: wSalt, label: 'salt bridge breaks',
      dsl: 'while HisF8.chi2 < -80°:\n  drive Asp away_from His146 rate 0.4/s\n  drive ChainB.rotation toward R_state',
      isActive: () => wSalt.active });

    // ── Scene: generic nodes, in a 620 × 500 reference area ──
    const v = makeView();
    const PLANE = '#3d6b80', CAP = '#4a90a8';
    const LEVER = 90;

    const heme = v.node('composite', { x: 300, y: 168 }, [
      v.node('shape', { x: -110, y: 0, w: 160, h: 5, cornerRadius: 2.5, fill: PLANE }),
      v.node('shape', { x:  110, y: 0, w: 160, h: 5, cornerRadius: 2.5, fill: PLANE }),
      ...[-190, -30, 30, 190].map(x => v.node('shape', circle(x, 0, 4, { fill: CAP }))),
      v.node('caption', { x: 104.5, y: -20, text: 'porphyrin plane', color: PLANE, fontSize: 10 }),
    ]);

    const lever = v.node('composite', {}, [
      v.node('polyline', { points: [{ x: 0, y: 0 }, { x: 0, y: LEVER }], width: 4 }, [], 'leverBar'),
      v.node('shape', circle(0, LEVER, 7), [], 'leverKnob'),
    ], 'lever');
    const leverLabel = v.node('caption', { text: 'His F8', fontSize: 11 }, [], 'leverLabel');

    const bridge = v.node('polyline', { dash: [4, 5], color: '#6688aa', width: 2 }, [], 'bridge');
    const bridgeLabel = v.node('caption', { fontSize: 9 }, [], 'bridgeLabel');
    const asp = v.node('shape', circle(0, 0, 10, { label: 'Asp', fontSize: 10, labelDy: 22 }), [], 'Asp');
    const his146 = v.node('shape', circle(0, 0, 10, { label: 'His 146', fontSize: 10, labelDy: 22 }), [], 'His146');

    const chainB = v.node('shape', {
      x: 530, y: 250, w: 40, h: 180, stroke: '#4a6a9a', label: 'Chain B', labelColor: '#8baabe', fontSize: 10,
    }, [], 'ChB');

    const fe = v.node('shape', {
      fill: '#c07830', stroke: '#e0a060', strokeWidth: 1.5, label: 'Fe²⁺', labelColor: '#fff', fontSize: 9, labelDy: 1,
    }, [], 'Fe');

    const o2 = v.node('composite', {}, [
      v.node('shape', circle(0, 0, 7, { fill: '#e04040' })),
      v.node('shape', circle(5, -8.6, 7, { fill: '#cc3535' })),
      v.node('caption', { x: -10, y: -14, text: 'O₂', color: '#ff6666', fontSize: 10 }),
    ], 'O2');

    const feArrow = v.node('polyline', { color: '#e8904088', width: 2, arrow: 'end' }, [], 'feArrow');

    const root = v.node('fit-stage', { originX: 0.48, originY: 0.38, refW: 620, refH: 500 }, [
      heme, lever, leverLabel, bridge, bridgeLabel, asp, his146, chainB, fe, o2, feArrow,
    ]);

    // ── Facade: entities → node fields ──
    const update = () => {
      const { O2, Fe, His, Asp, His146, ChB } = R.ents;

      v.set('Fe', { ...circle(Fe.x, Fe.y, Fe.r), glow: Fe.r * 2.5, glowColor: O2.bound ? '#c07030' : '#a06020' });
      v.set('O2', O2.bound ? { x: Fe.x, y: Fe.y - Fe.r - 14 } : { x: O2.x, y: O2.y });

      // The lever hangs from Fe; His.ang turns it (0° = straight down, positive swings right).
      const active = His.ang > -39;
      const leverColor = active ? '#e89040' : '#667788';
      v.set('lever', { x: Fe.x, y: Fe.y, rotation: -His.ang });
      v.set('leverBar', { color: leverColor });
      v.set('leverKnob', { fill: active ? '#e89040' : '#556677' });
      const rad = His.ang * Math.PI / 180;
      const tip = { x: Fe.x + Math.sin(rad) * LEVER, y: Fe.y + Math.cos(rad) * LEVER };
      v.set('leverLabel', { x: tip.x + (His.ang < -10 ? -22 : 18), y: tip.y, color: active ? '#e8a050' : '#667788' });

      // The salt bridge holds until Asp and His146 are 80 apart.
      const broken = Math.abs(His146.x - Asp.x) > 80;
      const bondColor = broken ? '#e06050' : '#5577aa', labelColor = broken ? '#e06050' : '#6688aa';
      v.set('Asp', { x: Asp.x, y: Asp.y, fill: bondColor, labelColor });
      v.set('His146', { x: His146.x, y: His146.y, fill: bondColor, labelColor });
      v.set('bridge', { visible: !broken, points: [{ x: Asp.x, y: Asp.y }, { x: His146.x, y: His146.y }] });
      v.set('bridgeLabel', {
        x: (Asp.x + His146.x) / 2, y: Asp.y - 16,
        text: broken ? 'broken!' : 'salt bridge', color: broken ? '#e06050' : '#5577aa',
      });

      v.set('ChB', { rotation: ChB.tilt, fill: ChB.tilt > 3 ? '#4a6a9a' : '#334466' });

      // Fe's displacement, once O2 is bound.
      v.set('feArrow', {
        visible: !!O2.bound && Fe.y > 170,
        points: [{ x: Fe.x + 15, y: Fe.y + 40 }, { x: Fe.x + 15, y: Fe.y + 20 }],
      });
    };
    update();

    return { root, rules, update };
  }

  // ═══════════════════════════════════════════════════
  //  ATP Synthase
  // ═══════════════════════════════════════════════════

  static setupATP(R) {
    R.reset();
    const rules = [];

    // ── Entities and rules ──
    R.ent('F0',     { theta: 0 });
    R.ent('gamma',  { theta: 0 });
    R.ent('b0',     { state: 0, color: 0 });
    R.ent('b1',     { state: 1, color: 0 });
    R.ent('b2',     { state: 2, color: 0 });
    R.ent('proton', { y: 0 });

    const dRot = R.addDrive({ target: 'F0.theta', mode: 'rotate', rate: 90 });
    rules.push({ type: 'phase', ref: dRot, label: 'proton_flow',
      dsl: 'phase proton_flow:\n  drive F₀.theta rotate 360°/cycle period 4s',
      isActive: () => dRot.active });

    const wCouple = R.addWhile({
      pred: () => true,
      during: () => { R.ents.gamma.theta = R.ents.F0.theta; }
    });
    rules.push({ type: 'couple', ref: wCouple, label: 'F₀→γ coupling',
      dsl: 'couple F₀.theta -> γ.theta via direct',
      isActive: () => true });

    let lastCrossing = -1;
    const onCross = R.addOn({
      pred: () => {
        const sector = Math.floor(R.ents.gamma.theta / 120);
        if (sector !== lastCrossing) { lastCrossing = sector; return true; }
        return false;
      },
      action: () => {
        R.ents.b0.state = (R.ents.b0.state + 1) % 3;
        R.ents.b1.state = (R.ents.b1.state + 1) % 3;
        R.ents.b2.state = (R.ents.b2.state + 1) % 3;
      }
    });
    onCross.prev = true;  // prevent immediate fire
    rules.push({ type: 'on', ref: onCross, label: '120° crossing',
      dsl: 'on γ.theta mod 120° crosses 0°:\n  β₁.state = next_state(β₁)\n  β₂.state = next_state(β₂)\n  β₃.state = next_state(β₃)',
      isActive: () => R.t - onCross.lastFired < 0.5 });

    const stateNames = ['open', 'loose', 'tight'];
    for (let i = 0; i < 3; i++) {
      const bName = 'b' + i;
      for (let s = 0; s < 3; s++) {
        const w = R.addWhile({
          pred: () => R.ents[bName].state === s,
          during: () => { R.ents[bName].color = s; }
        });
        if (i === 0) {
          rules.push({ type: 'while', ref: w, label: `β.state == ${stateNames[s]}`,
            dsl: `while β.state == ${stateNames[s]}:\n  drive β.conformation toward ${stateNames[s]}_conf`,
            isActive: () => w.active });
        }
      }
    }

    // ── Scene: the machine stands on a base point near the bottom centre ──
    const v = makeView();
    const f0H = 45, f0W = 160, shaftW = 14, shaftH = 110, barrelR = 75, barrelH = 140;
    const STRIPES = 12, PANEL_W = 32, SEP_W = 8, TWISTS = 5, TWIST_SKEW = 8;
    const BETA_COLORS = [[91, 155, 213], [232, 184, 74], [224, 96, 80]];
    const ALPHA_COLOR = [60, 75, 100], SEP_COLOR = [25, 32, 48];

    // F0 ring, with four protons riding through it.
    const ring = v.node('composite', { x: 0, y: -f0H / 2 }, [
      v.node('shape', { w: f0W, h: f0H, fill: '#2a3550', stroke: '#405070', label: 'F₀ ring', labelColor: '#6080a0', fontSize: 10 }),
      ...[0, 1, 2, 3].map(i => v.node('shape', circle(0, 0, 3, { fill: '#80c0e0' }), [], 'proton' + i)),
      v.node('caption', { x: -f0W / 2 - 22, y: 0, text: 'H⁺', color: '#80c0e0', fontSize: 9 }),
    ]);

    // The gamma shaft, with twist lines that climb as it turns.
    const shaft = v.node('composite', { x: 0, y: -f0H - shaftH / 2 }, [
      v.node('shape', { w: shaftW, h: shaftH, cornerRadius: 3, fill: '#3a5060', stroke: '#507080', strokeWidth: 1 }),
      ...Array.from({ length: TWISTS }, (_, i) => v.node('polyline', { color: '#608090', width: 1 }, [], 'twist' + i)),
      v.node('caption', { x: shaftW / 2 + 16, y: 0, text: 'γ', color: '#7090a0', fontSize: 12 }),
    ]);

    // The F1 head: a barrel of twelve stripes (three beta, three alpha,
    // separators between), projected as it turns.  Each slot is filled with
    // the stripes in back-to-front order, so later slots draw on top.
    const slots = [];
    for (let i = 0; i < STRIPES; i++) {
      slots.push(v.node('shape', { y: 0, h: barrelH - 8, cornerRadius: 0, visible: false }, [], 'stripe' + i));
    }
    const slotText = [];
    for (let i = 0; i < STRIPES; i++) {
      slotText.push(
        v.node('caption', { y: -8, color: '#fff', fontSize: 11, visible: false }, [], 'betaName' + i),
        v.node('caption', { y: 8, color: '#ddd', fontSize: 9, visible: false }, [], 'betaState' + i),
        v.node('caption', { y: -barrelH / 2 - 10, fontSize: 8, visible: false }, [], 'betaNote' + i),
      );
    }
    const barrel = v.node('composite', { x: 0, y: -f0H - shaftH - barrelH / 2 }, [
      v.node('shape', { w: (barrelR + 8) * 2, h: barrelH, cornerRadius: 8, fill: '#181e2a' }),
      ...slots,
      v.node('shape', { w: (barrelR + 8) * 2, h: barrelH, cornerRadius: 8, stroke: '#405070' }),
      v.node('caption', { x: barrelR + 24, y: 0, text: 'F₁ head', color: '#6080a0', fontSize: 10 }),
      ...slotText,
    ]);

    // The rotation arrow: a fixed arc, sampled once.
    const arcR = 92, a0 = -0.8 * Math.PI, a1 = -0.2 * Math.PI;
    const arcPts = Array.from({ length: 25 }, (_, i) => {
      const a = a0 + (a1 - a0) * i / 24;
      return { x: Math.cos(a) * arcR, y: Math.sin(a) * arcR };
    });
    const end = arcPts[arcPts.length - 1];
    const arrow = v.node('composite', { x: 0, y: -f0H / 2 }, [
      v.node('polyline', { points: arcPts, color: '#80c0e088', width: 2 }),
      v.node('polyline', {
        points: [{ x: end.x - 4, y: end.y }, { x: end.x + 3, y: end.y - 6 }],
        color: '#80c0e088', width: 2, arrow: 'end',
      }),
    ]);

    const machine = v.node('composite', { x: 0.46 * 620, y: 0.82 * 500 }, [ring, shaft, barrel, arrow]);
    const root = v.node('fit-stage', { refW: 620, refH: 500 }, [machine]);

    // ── Facade ──
    const update = () => {
      const { F0, b0, b1, b2 } = R.ents;
      const theta = F0.theta;

      for (let i = 0; i < 4; i++) {
        v.set('proton' + i, {
          x: -f0W / 2 + 15 + ((theta * 1.5 + i * 40) % (f0W - 30)),   // stays inside the ring
          y: Math.sin(theta * 0.05 + i) * 5,
        });
      }

      const step = shaftH / TWISTS, phase = (theta % 360) / 360;
      for (let i = 0; i < TWISTS; i++) {
        const ly = -shaftH / 2 + i * step + (phase * step) % step;
        v.set('twist' + i, { points: [{ x: -shaftW / 2, y: ly }, { x: shaftW / 2, y: ly - TWIST_SKEW }] });
      }

      const states = [b0.state ?? 0, b1.state ?? 1, b2.state ?? 2];
      const stripes = [];
      for (let i = 0; i < STRIPES; i++) {
        const ang = ((i / STRIPES) * 360 + theta) * Math.PI / 180;
        const cosA = Math.cos(ang);
        if (cosA <= 0.02) continue;                     // the far side
        const isSep = i % 2 === 1;
        const subIdx = Math.floor(i / 2);
        const isBeta = !isSep && subIdx % 2 === 0;
        const betaIdx = Math.floor(subIdx / 2);
        const rgb = isSep ? SEP_COLOR : isBeta ? BETA_COLORS[states[betaIdx]] : ALPHA_COLOR;
        stripes.push({ x: Math.sin(ang) * barrelR, w: cosA * (isSep ? SEP_W : PANEL_W), cosA, isBeta, betaIdx, rgb });
      }
      stripes.sort((a, b) => a.cosA - b.cosA);
      for (let i = 0; i < STRIPES; i++) {
        const s = stripes[i];
        if (!s) {
          v.set('stripe' + i, { visible: false });
          for (const k of ['betaName', 'betaState', 'betaNote']) v.set(k + i, { visible: false });
          continue;
        }
        v.set('stripe' + i, { visible: true, x: s.x, w: s.w, fill: rgba(s.rgb, 0.3 + 0.7 * s.cosA) });
        const st = states[s.betaIdx];
        const named = s.isBeta && s.cosA > 0.7;
        v.set('betaName' + i,  { visible: named, x: s.x, text: `β${s.betaIdx + 1}` });
        v.set('betaState' + i, { visible: named, x: s.x, text: stateNames[st] });
        const noted = s.isBeta && s.cosA >= 0.6 && st !== 0;
        v.set('betaNote' + i, {
          visible: noted, x: s.x,
          text: st === 1 ? 'ADP↓' : '→ATP', color: st === 1 ? '#e8b84a' : '#60e060',
        });
      }
    };
    update();

    return { root, rules, update };
  }

  static SCENES = [
    { id: 'hb',  label: 'Haemoglobin',  setup: (R) => OmniAnimateModel.setupHB(R) },
    { id: 'atp', label: 'ATP Synthase',  setup: (R) => OmniAnimateModel.setupATP(R) },
  ];
}

export { OmniAnimateModel };
