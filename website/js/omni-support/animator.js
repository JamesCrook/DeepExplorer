/**
 * animator.js — one frame loop for everything that animates.
 *
 * Preset morphs, a model's tick, any future timeline: each is a *track*, a
 * function called once per display frame with (now, dt).  It returns false
 * when it has finished; anything else keeps it running.  The loop runs only
 * while some track is live, and stops by itself.
 *
 *   const anim = new Animator();
 *   anim.add('morph', (now, dt) => { …; return t < 1; });
 *   anim.remove('morph');
 *
 * Adding a track under a key that is already live replaces it, which is how
 * a new morph of the same params cancels the old one.  Keys can be any
 * value, objects included (a params object, say).
 *
 * Renders are coalesced.  While the tracks of a frame run, a renderer that
 * calls anim.defer(renderFn) is told "not now", and renderFn runs once after
 * the last track, however many tracks asked.  So a preset morph and a tick in
 * the same frame cost one render, not two.  Outside a frame, defer returns
 * false and the caller renders as usual.
 */

class Animator {
  constructor() {
    this.tracks = new Map();
    this.stepping = false;
    this._pending = new Set();
    this._raf = null;
    this._last = 0;
  }

  /** Start (or replace) a track. */
  add(key, step) {
    this.tracks.set(key, step);
    this._wake();
  }

  remove(key) { this.tracks.delete(key); }

  has(key) { return this.tracks.has(key); }

  get running() { return this._raf !== null; }

  /**
   * Called by a renderer.  During a frame, queue renderFn to run once after
   * the tracks, and return true (the caller should not render now).
   */
  defer(renderFn) {
    if (!this.stepping) return false;
    this._pending.add(renderFn);
    return true;
  }

  _wake() {
    if (this._raf !== null || typeof requestAnimationFrame === 'undefined') return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._frame);
  }

  _frame = (now) => {
    this._raf = null;
    const dt = Math.max(0, (now - this._last) / 1000);
    this._last = now;

    this.stepping = true;
    for (const [key, step] of [...this.tracks]) {
      let keep;
      try { keep = step(now, dt); }
      catch (err) { console.error('Animator track failed:', key, err); keep = false; }
      if (keep === false && this.tracks.get(key) === step) this.tracks.delete(key);
    }
    this.stepping = false;

    const pending = [...this._pending];
    this._pending.clear();
    for (const fn of pending) fn();

    if (this.tracks.size) this._raf = requestAnimationFrame(this._frame);
  };
}

export { Animator };
