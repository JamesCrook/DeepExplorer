/* ============================================
   OmniParamEngine — DOM-free param + preset manager
   ============================================

   Manages a flat parameter map, a dictionary of named presets,
   and animated (ease-out cubic) morphing between them.

   Usage:
     const engine = new OmniParamEngine({
       params:    { bend: 0, stack: 1, ... },
       presets:   { 'Line Chart': { bend: 0, stack: 0, ... }, ... },
       onUpdate:  (params) => render(params),   // called every frame during morph
     });

     engine.setPreset('Line Chart');              // animated morph
     engine.setPreset('Spider', false);           // instant
     engine.setParams({ bend: 3.14, stack: 0.5 }); // merge + notify
     engine.getParams();                          // { ...current }
*/

// ── Color interpolation helpers ──────────────────────────────
const _isHex  = v => typeof v === 'string' && /^#[0-9a-fA-F]{6,8}$/.test(v);
const _parseC = h => { h = h.replace('#',''); return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: h.length>=8 ? parseInt(h.slice(6,8),16)/255 : 1 }; };
const _fmtC   = c => { const x=v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0'); return '#'+x(c.r)+x(c.g)+x(c.b)+x((c.a??1)*255); };

class OmniParamEngine {

  /**
   * @param {Object}   config
   * @param {Object}   config.params    – initial { id: defaultValue } map
   * @param {Object}   config.presets   – { presetName: { id: value, … }, … }
   * @param {Function} [config.onUpdate] – called with (params) after any change
   * @param {number}   [config.morphDuration=600] – ms for animated transitions
   */
  constructor(config) {
    this.params   = { ...config.params };
    this.presets  = config.presets || {};
    this.onUpdate = config.onUpdate || (() => {});
    this.morphDuration = config.morphDuration ?? 600;
    this._animId  = null;          // tracks in-flight rAF
    this._activePreset = null;
  }

  // ── Public API ───────────────────────────────────────────────

  /** Return a shallow copy of current params. */
  getParams() { return { ...this.params }; }

  /** Merge partial updates and notify. */
  setParams(updates, notify = true) {
    Object.assign(this.params, updates);
    this._activePreset = null;
    if (notify) this.onUpdate(this.params);
  }

  /** Set a single param. */
  setParam(id, value, notify = true) {
    this.params[id] = value;
    if (notify) this.onUpdate(this.params);
  }

  /** Apply a preset (animated by default). */
  setPreset(name, animate = true) {
    const preset = this.presets[name];
    if (!preset) return;

    if (animate) {
      this._morphTo(preset, () => { this._activePreset = name; });
    } else {
      this._applyImmediate(preset);
      this._activePreset = name;
      this.onUpdate(this.params);
    }
  }

  /** Name of last fully-applied preset (null if user tweaked since). */
  get activePreset() { return this._activePreset; }

  /** Cancel any in-flight morph. */
  cancelMorph() {
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
  }

  // ── Internals ────────────────────────────────────────────────

  _applyImmediate(preset) {
    for (const [k, v] of Object.entries(preset)) {
      if (k in this.params) this.params[k] = v;
    }
  }

  _morphTo(preset, onDone) {
    this.cancelMorph();
    const start  = { ...this.params };
    const keys   = Object.keys(preset).filter(k => k in this.params);
    const numKeys   = [];
    const colorKeys = [];
    const colorStart = {};
    const colorEnd   = {};

    for (const k of keys) {
      const sv = start[k], tv = preset[k];
      if (typeof sv === 'number' && typeof tv === 'number') {
        numKeys.push(k);
      } else if (_isHex(sv) && _isHex(tv)) {
        colorKeys.push(k);
        colorStart[k] = _parseC(sv);
        colorEnd[k]   = _parseC(tv);
      } else {
        this.params[k] = tv;     // snap non-interpolatable
      }
    }

    if (!numKeys.length && !colorKeys.length) {
      this.onUpdate(this.params);
      if (onDone) onDone();
      return;
    }

    const t0     = performance.now();
    const dur    = this.morphDuration;

    const step = (now) => {
      const t     = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - t, 3);          // ease-out cubic

      for (const k of numKeys) {
        this.params[k] = start[k] + (preset[k] - start[k]) * eased;
      }
      for (const k of colorKeys) {
        const s = colorStart[k], e = colorEnd[k];
        this.params[k] = _fmtC({
          r: s.r + (e.r - s.r) * eased,
          g: s.g + (e.g - s.g) * eased,
          b: s.b + (e.b - s.b) * eased,
          a: s.a + (e.a - s.a) * eased,
        });
      }
      this.onUpdate(this.params);

      if (t < 1) {
        this._animId = requestAnimationFrame(step);
      } else {
        this._animId = null;
        if (onDone) onDone();
      }
    };

    this._animId = requestAnimationFrame(step);
  }
}

export { OmniParamEngine };