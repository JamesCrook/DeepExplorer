/**
 * reactive-runtime.js
 *
 * Tiny reactive entity/rule engine.
 *
 *   Entities: named bags of numeric properties.
 *   Drives:   continuously move a property toward a target or rotate.
 *   Whiles:   predicate → enter/during/exit callbacks.
 *   Ons:      edge-triggered (rising) predicate → action.
 *
 * The runtime is tick-driven — call tick(speed) each frame.
 * Scene nodes read entity values; rules mutate them.
 */

class ReactiveRuntime {
  constructor() {
    this.ents   = {};
    this.drives = [];
    this.whiles = [];
    this.ons    = [];
    this.t      = 0;
    this.dt     = 1 / 60;
  }

  reset() {
    this.ents = {};
    this.drives = [];
    this.whiles = [];
    this.ons = [];
    this.t = 0;
  }

  // ── Property access ─────────────────────────────────

  p(path) {
    const [e, k] = path.split('.');
    return this.ents[e][k];
  }

  sp(path, v) {
    const [e, k] = path.split('.');
    this.ents[e][k] = v;
  }

  // ── Builders ────────────────────────────────────────

  ent(name, params) {
    this.ents[name] = params;
  }

  addDrive(cfg) {
    const d = { active: true, ...cfg };
    this.drives.push(d);
    return d;
  }

  addWhile(cfg) {
    const w = { active: false, wasActive: false, ...cfg };
    this.whiles.push(w);
    return w;
  }

  addOn(cfg) {
    const o = { prev: false, lastFired: -Infinity, ...cfg };
    this.ons.push(o);
    return o;
  }

  // ── Tick ────────────────────────────────────────────

  tick(speed) {
    const dt = this.dt * speed;
    this.t += dt;

    // While rules
    for (const w of this.whiles) {
      const now = w.pred();
      if (now && !w.active) {
        w.active = true;
        if (w.enter) w.enter();
      } else if (!now && w.active) {
        w.active = false;
        if (w.exit) w.exit();
      }
      if (w.active && w.during) w.during(dt);
    }

    // On rules (rising edge)
    for (const o of this.ons) {
      const now = o.pred();
      if (now && !o.prev) {
        o.action();
        o.lastFired = this.t;
      }
      o.prev = now;
    }

    // Drives
    for (const d of this.drives) {
      if (!d.active) continue;
      const cur = this.p(d.target);
      if (d.mode === 'toward') {
        const diff = d.value - cur;
        if (Math.abs(diff) < 0.05) { this.sp(d.target, d.value); continue; }
        this.sp(d.target, cur + Math.sign(diff) * Math.min(Math.abs(diff), d.rate * dt));
      } else if (d.mode === 'rotate') {
        this.sp(d.target, cur + d.rate * dt);
      }
    }
  }

  // ── Rule metadata for sidebar ───────────────────────

  getRuleStates() {
    return {
      whiles: this.whiles.map(w => ({ active: w.active })),
      ons:    this.ons.map(o => ({ fired: this.t - o.lastFired < 0.6 })),
      drives: this.drives.map(d => ({ active: d.active })),
    };
  }
}

export { ReactiveRuntime };
