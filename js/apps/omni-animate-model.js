/**
 * omni-animate-model.js
 *
 * Builds scene ASTs and configures the ReactiveRuntime
 * for each animation scene.
 *
 * Each scene function returns { root, rules }:
 *   root  — MiniAstNode tree for the scene walker
 *   rules — sidebar rule descriptors [{type, label, dsl, isActive}]
 */

import { MiniAstNode } from '../omni-support/scene.js';


class OmniAnimateModel {

  // ═══════════════════════════════════════════════════
  //  Haemoglobin Bohr Effect
  // ═══════════════════════════════════════════════════

  static setupHB(R) {
    R.reset();
    const rules = [];

    // Entities
    R.ent('O2',     { x: 300, y: 15, bound: 0 });
    R.ent('Fe',     { x: 300, y: 176, r: 18 });
    R.ent('His',    { ang: -40 });
    R.ent('Asp',    { x: 245, y: 355 });
    R.ent('His146', { x: 305, y: 355 });
    R.ent('ChB',    { tilt: 0 });

    // Phase: O2 approach
    const dO2 = R.addDrive({ target: 'O2.y', mode: 'toward', value: 148, rate: 90 });
    rules.push({ type: 'phase', ref: dO2, label: 'bind_O\u2082',
      dsl: 'phase bind_O\u2082:\n  drive O\u2082.position toward Fe rate 1.0/s',
      isActive: () => dO2.active });

    // On: O2 binds
    const onBind = R.addOn({
      pred: () => Math.abs(R.ents.O2.y - R.ents.Fe.y) < (27 + R.ents.Fe.r) && !R.ents.O2.bound,
      action: () => {
        R.ents.O2.bound = 1;
        dO2.active = false;
        R.addDrive({ target: 'Fe.y', mode: 'toward', value: 168, rate: 3 });
        R.addDrive({ target: 'Fe.r', mode: 'toward', value: 9, rate: 3 });
      }
    });
    rules.push({ type: 'on', ref: onBind, label: 'O\u2082 binds',
      dsl: 'on distance(O\u2082, Fe) < 2.2:\n  O\u2082.state = bound\n  drive Fe toward plane rate 0.8/s\n  drive Fe.radius toward 0.9',
      isActive: () => R.t - onBind.lastFired < 0.6 });

    // While: Fe couples to His
    const wCouple = R.addWhile({
      pred: () => R.ents.Fe.y < 170,
      during: () => { R.ents.His.ang = (168 - R.ents.Fe.y) * 20; },
      enter: () => {}, exit: () => {}
    });
    rules.push({ type: 'while', ref: wCouple, label: 'Fe\u2192His coupling',
      dsl: 'while distance(Fe, porphyrin_plane) < 0.3:\n  relate Fe.position, HisF8.chi2\n    via linear(gain: -40\u00b0/\u00c5)',
      isActive: () => wCouple.active });

    // While: salt bridge breaks
    const wSalt = R.addWhile({
      pred: () => R.ents.His.ang > -35,
      enter: () => {
        R.addDrive({ target: 'Asp.x', mode: 'toward', value: 155, rate: 40 });
        R.addDrive({ target: 'His146.x', mode: 'toward', value: 400, rate: 40 });
        R.addDrive({ target: 'ChB.tilt', mode: 'toward', value: 9, rate: 4 });
      }
    });
    rules.push({ type: 'while', ref: wSalt, label: 'salt bridge breaks',
      dsl: 'while HisF8.chi2 < -80\u00b0:\n  drive Asp away_from His146 rate 0.4/s\n  drive ChainB.rotation toward R_state',
      isActive: () => wSalt.active });

    // AST
    const root = new MiniAstNode('animate-scene', [
      new MiniAstNode('porphyrin-plane'),
      new MiniAstNode('his-lever'),
      new MiniAstNode('salt-bridge'),
      new MiniAstNode('chain-block', [], { x: 530, y: 250 }),
      new MiniAstNode('fe-atom'),
      new MiniAstNode('o2-molecule'),
      new MiniAstNode('binding-arrow'),
    ], { originX: 0.48, originY: 0.38, refW: 620, refH: 500 });

    return { root, rules };
  }

  // ═══════════════════════════════════════════════════
  //  ATP Synthase
  // ═══════════════════════════════════════════════════

  static setupATP(R) {
    R.reset();
    const rules = [];

    // Entities
    R.ent('F0',     { theta: 0 });
    R.ent('gamma',  { theta: 0 });
    R.ent('b0',     { state: 0, color: 0 });
    R.ent('b1',     { state: 1, color: 0 });
    R.ent('b2',     { state: 2, color: 0 });
    R.ent('proton', { y: 0 });

    const f0H = 45, shaftH = 110, barrelH = 140;

    // Continuous rotation
    const dRot = R.addDrive({ target: 'F0.theta', mode: 'rotate', rate: 90 });
    rules.push({ type: 'phase', ref: dRot, label: 'proton_flow',
      dsl: 'phase proton_flow:\n  drive F\u2080.theta rotate 360\u00b0/cycle period 4s',
      isActive: () => dRot.active });

    // Couple F0 → gamma
    const wCouple = R.addWhile({
      pred: () => true,
      during: () => { R.ents.gamma.theta = R.ents.F0.theta; }
    });
    rules.push({ type: 'couple', ref: wCouple, label: 'F\u2080\u2192\u03b3 coupling',
      dsl: 'couple F\u2080.theta -> \u03b3.theta via direct',
      isActive: () => true });

    // On: 120° crossing → cycle states
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
    rules.push({ type: 'on', ref: onCross, label: '120\u00b0 crossing',
      dsl: 'on \u03b3.theta mod 120\u00b0 crosses 0\u00b0:\n  \u03b2\u2081.state = next_state(\u03b2\u2081)\n  \u03b2\u2082.state = next_state(\u03b2\u2082)\n  \u03b2\u2083.state = next_state(\u03b2\u2083)',
      isActive: () => R.t - onCross.lastFired < 0.5 });

    // While rules for beta states (visual)
    const stateNames = ['open', 'loose', 'tight'];
    for (let i = 0; i < 3; i++) {
      const bName = 'b' + i;
      for (let s = 0; s < 3; s++) {
        const w = R.addWhile({
          pred: () => R.ents[bName].state === s,
          during: () => { R.ents[bName].color = s; }
        });
        if (i === 0) {
          rules.push({ type: 'while', ref: w, label: `\u03b2.state == ${stateNames[s]}`,
            dsl: `while \u03b2.state == ${stateNames[s]}:\n  drive \u03b2.conformation toward ${stateNames[s]}_conf`,
            isActive: () => w.active });
        }
      }
    }

    // AST — positioned relative to bottom-center
    const root = new MiniAstNode('animate-scene', [
      new MiniAstNode('proton-channel', [], { x: 0, y: -f0H / 2, w: 160, h: f0H }),
      new MiniAstNode('gamma-shaft', [], { x: 0, y: -f0H - shaftH / 2, h: shaftH }),
      new MiniAstNode('f1-barrel', [], { x: 0, y: -f0H - shaftH - barrelH / 2, h: barrelH }),
      new MiniAstNode('rotation-arrow', [], { x: 0, y: -f0H / 2, radius: 92 }),
    ], { originX: 0.46, originY: 0.82, refW: 620, refH: 500 });

    return { root, rules };
  }

  static SCENES = [
    { id: 'hb',  label: 'Haemoglobin',  setup: (R) => OmniAnimateModel.setupHB(R) },
    { id: 'atp', label: 'ATP Synthase',  setup: (R) => OmniAnimateModel.setupATP(R) },
  ];
}

export { OmniAnimateModel };
