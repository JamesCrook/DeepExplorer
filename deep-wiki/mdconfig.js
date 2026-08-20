// ═══════════════════════════════════════════════════════════════
//  mdconfig.js — configuration as content
// ═══════════════════════════════════════════════════════════════
//
//  One syntax, and PLACEMENT decides scope. The island below means project
//  configuration in _project.md and personal configuration in _local.md;
//  nothing about the island itself says which. That is the whole point — the
//  alternative is a second notation per level, which is what the directive
//  form, the controls island and the JSON spec were each becoming.
//
//  ── Bootstrap ──
//
//    %%config layers=_project.md, _local.md; writes=_local.md%%
//
//  The stack loads from ONE file, which names the sequence. Any layer may
//  EXTEND the sequence — new paths are appended, never inserted — so nothing
//  can reorder what has already resolved. There is deliberately no way for a
//  file to say "I win over the ones after me": precedence is positional, and
//  a key that genuinely must not be overridden says so per key (`locked`),
//  not per file.
//
//  A missing layer is an empty layer. _local.md need not exist until the
//  first write creates it.
//
//  ── Declarations ──
//
//    ```omni type=config
//    - key: theme
//      value: dark
//    - key: col2-width
//      var: --col2-width
//      value: 260
//      min: 180
//      max: 420
//      unit: px
//    ```
//
//  Merging is PER KEY, not per file: a later layer setting only `value`
//  keeps the `min`/`max`/`var` an earlier one declared. `var` is optional —
//  it says a key also mirrors to a CSS custom property. The resolver's
//  output is a map; CSS is a projection of it, not the storage.
//
//  `unit` and `suffix` are NOT synonyms and must not be conflated:
//
//    unit    appended to the CSS value.  --msg-font-size: 13.5px
//    suffix  a display label only.       --srv-btn-size: 44   shown as "44px"
//
//  The distinction is load-bearing because a stylesheet may hold a bare
//  number to do arithmetic on — `calc((var(--srv-btn-size) + 16) * 1px)`.
//  Appending a unit there makes the whole declaration invalid, and CSS drops
//  invalid declarations silently, so the failure surfaces as a collapsed
//  layout somewhere else entirely.
//
//  `type=controls` islands are read too, and are the same shape: a control
//  is a config key with UI attached. The difference is that transform()
//  skips `config` and renders `controls`, so the type name says whether the
//  island is also a widget.

import { findBlocks, readFlatYaml, coerce } from './mdplus.js';

const CONFIG_TYPES = ['config', 'controls'];

// ── Themes ────────────────────────────────────────────────
//
//  A theme is a named set of key → value at app scope. That is the same
//  object as the `presets` in a scene spec, which are a named set of
//  key → value at scene scope — so this deliberately reuses the config island
//  rather than inventing a theme format:
//
//    ```omni type=theme; id=midnight
//    - key: bg-1
//      var: --bg-1
//      value: #0b0d13
//    ```
//
//  Themes sit between the layers and the session: a declared value is the
//  theme's floor, the theme repaints it, and anything you then set by hand
//  wins over both. Switching theme therefore does not discard your tweaks.

const THEME_TYPE = 'theme';

/** A declaration's key: explicit, or derived from the CSS var it drives, so
 *  the existing controls islands need no edit to participate. */
function keyOf(entry) {
  if (entry.key !== undefined) return String(entry.key);
  if (entry.var !== undefined) return String(entry.var).replace(/^--/, '');
  if (entry.id !== undefined) return String(entry.id);
  return null;
}

export class ConfigStack {

  constructor(source) {
    this.source  = source;
    this.layers  = [];          // paths actually read, in resolution order
    this.missing = [];          // declared but absent — not an error
    this.writes  = null;        // the one layer a set() lands in
    this.themes  = new Map();   // theme id -> Map(key -> value)
    this.decls   = new Map();   // key -> merged declaration
    this.history = new Map();   // key -> [{ layer, value }] for explain()
    this.session = new Map();   // set() but not yet flushed
  }

  // ── Load ──────────────────────────────────────────────────

  /** Read the stack, starting from one file that names the rest. */
  async load(boot = '_project.md') {
    const queue = [boot];
    const seen  = new Set();
    this.layers = []; this.missing = [];
    this.decls.clear(); this.history.clear(); this.themes.clear();

    for (let i = 0; i < queue.length; i++) {
      const path = queue[i];
      if (seen.has(path)) continue;
      seen.add(path);

      let text;
      try { text = await this.source.read(path); }
      catch { this.missing.push(path); continue; }

      this.layers.push(path);
      this._absorb(path, text, queue);
    }
    return this;
  }

  /** Read one layer's directives and islands. `queue` is extended in place. */
  _absorb(path, text, queue) {
    for (const b of findBlocks(text)) {

      if (b.kind === 'directive' && b.directive === 'config') {
        if (b.attrs.layers !== undefined) {
          for (const p of String(b.attrs.layers).split(',').map(s => s.trim())) {
            if (p && !queue.includes(p)) queue.push(p);   // append only
          }
        }
        if (b.attrs.writes !== undefined) this.writes = String(b.attrs.writes);
        continue;
      }

      if (b.kind !== 'fence' || b.lang !== 'omni') continue;

      if (b.attrs.type === THEME_TYPE) {
        const id = String(b.attrs.id ?? '').trim();
        if (!id) continue;
        const bundle = this.themes.get(id) || new Map();
        for (const entry of readFlatYaml(b.body)) {
          if (entry.sel && entry.prop) {
            const raw = bundle.get('__raw') || [];
            raw.push({ sel: String(entry.sel), prop: String(entry.prop),
                       value: String(entry.value ?? '') });
            bundle.set('__raw', raw);
            continue;
          }
          const key = keyOf(entry);
          if (!key || entry.value === undefined) continue;
          bundle.set(key, entry.value);
          // A theme may introduce a key the layers never declared; without
          // this its `var` would be unknown and it could not be painted.
          if (!this.decls.has(key)) this.decls.set(key, { key, var: entry.var });
        }
        this.themes.set(id, bundle);
        continue;
      }

      if (!CONFIG_TYPES.includes(b.attrs.type)) continue;

      // A `managed` island is written by the app, so every value in it came
      // from a deliberate act. That is what lets a saved tweak keep beating
      // the theme after a reload — before the flush it won as session state,
      // and it must not silently lose its standing just by being persisted.
      const explicit = !!b.attrs.managed;

      for (const entry of readFlatYaml(b.body)) {
        const key = keyOf(entry);
        if (!key) continue;
        const prev = this.decls.get(key);
        if (prev?.locked && prev.value !== undefined) continue;  // per-key, not per-file
        const next = Object.assign({}, prev, entry, { key });
        if (entry.value !== undefined) next.explicit = explicit;
        this.decls.set(key, next);
        if (entry.value !== undefined) {
          if (!this.history.has(key)) this.history.set(key, []);
          this.history.get(key).push({ layer: path, value: entry.value });
        }
      }
    }
  }

  // ── Read ──────────────────────────────────────────────────

  has(key)  { return this.session.has(key) || this.decls.has(key); }
  decl(key) { return this.decls.get(key) || null; }
  keys() {
    const t = this.activeTheme();
    return [...new Set([...this.decls.keys(), ...this.session.keys(),
                        ...(t ? t.keys() : [])])].filter(k => k !== '__raw');
  }

  /** The active theme's bundle, or null. `theme` is an ordinary config key,
   *  so a theme choice persists through exactly the same machinery as any
   *  other setting. */
  activeTheme() {
    const name = this.session.has('theme')
      ? this.session.get('theme')
      : this.decls.get('theme')?.value;
    return name ? (this.themes.get(String(name)) || null) : null;
  }

  /** Resolution order is provenance, not position:
   *
   *      session  — changed this session, not yet kept
   *      explicit — kept by you, from a `managed` island
   *      theme    — the active theme's bundle
   *      declared — a layer's default
   *
   *  Scope alone cannot order these. A theme chosen just now should beat a
   *  palette the project declared, but a colour you deliberately set should
   *  beat the theme — so what decides is whether a value came from an act or
   *  from a standing default. */
  get(key, fallback = undefined) {
    if (key === '__raw') return fallback;          // internal to the bundle
    if (this.session.has(key)) return this.session.get(key);
    const d = this.decls.get(key);
    if (d?.explicit && d.value !== undefined) return d.value;
    if (key !== 'theme') {
      const t = this.activeTheme();
      if (t && t.has(key)) return t.get(key);
    }
    return d && d.value !== undefined ? d.value : fallback;
  }

  /** Why is this value what it is. The inspector is what makes per-key
   *  policy tractable — without it, precedence is folklore. */
  explain(key) {
    const trail = (this.history.get(key) || []).map(h => ({ ...h, active: false }));
    if (trail.length) trail[trail.length - 1].active = true;
    const t = this.activeTheme();
    const d = this.decls.get(key);
    if (key !== 'theme' && t && t.has(key)) {
      const name = this.session.has('theme') ? this.session.get('theme') : this.get('theme');
      const beaten = d?.explicit && d.value !== undefined;
      if (!beaten) trail.forEach(h => { h.active = false; });
      trail.splice(Math.max(0, trail.length - (beaten ? 1 : 0)), 0,
                   { layer: `theme:${name}`, value: t.get(key), active: !beaten });
    }
    if (this.session.has(key)) {
      trail.push({ layer: '(session)', value: this.session.get(key), active: true });
      if (trail.length > 1) trail[trail.length - 2].active = false;
    }
    return { key, value: this.get(key), decl: this.decl(key), trail };
  }

  // ── Write ─────────────────────────────────────────────────
  //
  //  set() is always session-scoped. Persistence is a separate deliberate
  //  act, so the same click never means "try this" in one mode and "keep
  //  this" in another — and flush() can show its diff before it runs.

  set(key, value, { root = null } = {}) {
    const d = this.decls.get(key);
    if (d?.locked) throw new Error(`mdconfig: "${key}" is locked`);
    this.session.set(key, coerce(value));
    if (root) this.applyCss(root, [key]);
    return this;
  }

  revert(key) {
    if (key === undefined) this.session.clear();
    else this.session.delete(key);
    return this;
  }

  get dirty() { return this.session.size > 0; }

  // ── CSS projection ────────────────────────────────────────

  /** Mirror every key that declares a `var` onto a root element. Values are
   *  suffixed with `unit` or `suffix` — both spellings are in use. */
  applyCss(root = document.documentElement, only = null) {
    for (const key of this.keys()) {
      if (only && !only.includes(key)) continue;
      const d = this.decls.get(key);
      if (!d?.var) continue;
      const v = this.get(key);
      if (v === undefined || v === null) continue;
      root.style.setProperty(d.var, `${v}${d.unit ?? ''}`);
    }
    return this;
  }

  /** The generated sheet carries ONLY raw declarations — never custom
   *  properties.
   *
   *  An earlier version emitted `:root, body { --x: … }` to outrank a vendor
   *  rule on `body`. Nothing declares these on `body` (they are all on
   *  `:root`), and the `body` half did real damage: it gave body its OWN
   *  declaration, which beats the value inherited from `:root`. The control
   *  panel writes inline on `:root`, so every descendant of body kept seeing
   *  the generated value and live slider drags stopped showing. It also
   *  blinded captureCss, which reads computed style and was therefore reading
   *  back its own output — so nothing ever looked changed and nothing saved.
   *
   *  Custom properties go inline on `:root` via applyCss, which outranks any
   *  stylesheet without competing with the panel: both write the same style
   *  attribute, so the later write simply wins.
   *
   *  Raw declarations remain, for values a stylesheet hardcodes and no
   *  variable reaches — `.servers { background:#111118 }`. */
  themeCss() {
    const out = [];
    const bySel = new Map();
    for (const r of this.rawRules()) {
      if (!bySel.has(r.sel)) bySel.set(r.sel, []);
      bySel.get(r.sel).push(`  ${r.prop}: ${r.value};`);
    }
    for (const [sel, decls] of bySel) out.push(`${sel} {`, ...decls, '}');
    return out.join('\n');
  }

  /** `sel`/`prop`/`value` entries from the active theme. */
  rawRules() {
    const t = this.activeTheme();
    return t ? (t.get('__raw') || []) : [];
  }

  /** Install the generated stylesheet. Idempotent — one element, rewritten. */
  installCss(doc = document, id = 'dp-theme') {
    let el = doc.getElementById(id);
    if (!el) {
      el = doc.createElement('style');
      el.id = id;
      doc.head.appendChild(el);      // last in head: wins on document order
    }
    el.textContent = this.themeCss();
    return this;
  }

  // ── Discovery ─────────────────────────────────────────────
  //
  //  A theme that names a variable no stylesheet reads is silently inert, and
  //  that failure is invisible. So rather than trusting a hand-written list,
  //  read the loaded stylesheets: report which custom properties are DECLARED,
  //  which are USED via var(), and which the config claims to drive.

  /** Scan for custom properties. CSSOM is the obvious route and the
   *  unreliable one — `cssRules` throws on a cross-origin sheet, and
   *  `CSSRuleList` is not iterable everywhere — so the source text is read
   *  directly as well and the two are unioned. Text always works; CSSOM adds
   *  anything injected at runtime. */
  static async scanVars(doc = document) {
    const declared = new Set(), used = new Set();

    const harvest = (text) => {
      if (!text) return;
      for (const m of String(text).matchAll(/(--[\w-]+)\s*:/g)) declared.add(m[1]);
      for (const m of String(text).matchAll(/var\(\s*(--[\w-]+)/g)) used.add(m[1]);
    };

    // 1. Inline <style> elements, including our own generated one.
    for (const el of doc.querySelectorAll?.('style') || []) harvest(el.textContent);

    // 2. Linked stylesheets, by fetching the source. Same-origin only, which
    //    is exactly the case that matters.
    const hrefs = [...(doc.querySelectorAll?.('link[rel="stylesheet"]') || [])]
      .map(l => l.href).filter(Boolean);
    await Promise.all(hrefs.map(async (href) => {
      try { harvest(await (await fetch(href)).text()); }
      catch { /* unreachable or cross-origin — CSSOM may still see it */ }
    }));

    // 3. CSSOM, defensively. Each sheet is isolated so one failure cannot
    //    empty the whole result — which is what made an earlier version
    //    report nothing at all rather than reporting less.
    for (const sheet of doc.styleSheets || []) {
      try {
        const walk = (list) => {
          for (const rule of Array.from(list || [])) {
            if (rule.cssRules) { walk(rule.cssRules); continue; }
            harvest(rule.cssText);
          }
        };
        walk(sheet.cssRules);
      } catch { /* cross-origin, or a non-iterable rule list */ }
    }

    return { declared: [...declared].sort(), used: [...used].sort() };
  }

  /** Which of this config's vars the stylesheets actually know about. */
  async auditVars(doc = document) {
    const { declared, used } = await ConfigStack.scanVars(doc);
    const known = new Set([...declared, ...used]);
    const mine = this.keys().map(k => this.decls.get(k)?.var).filter(Boolean);
    return {
      declared, used,
      driven:   mine.filter(v => known.has(v)).sort(),
      inert:    mine.filter(v => !known.has(v)).sort(),   // set, but nothing reads it
      undriven: [...known].filter(v => !mine.includes(v)).sort(),
    };
  }

  // ── Documents ─────────────────────────────────────────────
  //
  //  A `type=controls` island is a declaration wherever it sits, but only the
  //  config LAYERS are loaded by the stack — an island in a note or an index
  //  is never seen by it. That made the settings sliders unsaveable: their
  //  keys were undeclared, so nothing knew they had a `var`, and captureCss
  //  had nothing to compare against.
  //
  //  So a rendered document contributes its declarations, and only those. Its
  //  `value:` is a floor: any layer value, theme value or session value still
  //  wins, because the island is where a control is DEFINED, not where the
  //  user's choice is recorded.

  /** Register declarations from a rendered document.
   *
   *  Two signatures:
   *    absorbDoc(text)          — re-parses the text (legacy, costs a full scan)
   *    absorbDoc(islandBodies)  — takes the `controlIslands` array that
   *                              `transform` already extracted, no re-parse.
   *
   *  The second form is preferred: `transform` already ran `findBlocks` over
   *  the same text, so re-parsing is pure waste. */
  absorbDoc(input) {
    const bodies = Array.isArray(input) ? input : null;
    const added = [];

    if (bodies) {
      for (const body of bodies) {
        for (const entry of readFlatYaml(body)) {
          const key = keyOf(entry);
          if (!key) continue;
          const prev = this.decls.get(key);
          this.decls.set(key, Object.assign({}, entry, prev, { key }));
          added.push(key);
        }
      }
      return added;
    }

    // Legacy path: full text, must re-parse.
    for (const b of findBlocks(String(input ?? ''))) {
      if (b.kind !== 'fence' || b.lang !== 'omni') continue;
      if (b.attrs.type !== 'controls') continue;
      for (const entry of readFlatYaml(b.body)) {
        const key = keyOf(entry);
        if (!key) continue;
        const prev = this.decls.get(key);
        this.decls.set(key, Object.assign({}, entry, prev, { key }));
        added.push(key);
      }
    }
    return added;
  }

  /** The value a control should RENDER at — the resolved one, so a slider
   *  opens where the user left it rather than snapping back to the island's
   *  default and overwriting it on first paint. */
  seedControls(list) {
    return list.map(c => {
      const key = keyOf(c);
      if (!key) return c;
      const v = this.get(key);
      return v === undefined ? c : Object.assign({}, c, { value: v });
    });
  }

  // ── Capture ───────────────────────────────────────────────
  //
  //  The panel and the control widgets write CSS custom properties directly;
  //  they know nothing about config, and shouldn't have to. So config reads
  //  them back: any owned `var` whose live value differs from the resolved
  //  one is a change the user made, and becomes session state.
  //
  //  This is deliberately a one-way mirror rather than a rewrite of the panel.
  //  It couples to the CSS variable — which is already the contract between
  //  the island and the stylesheet — and to nothing else.

  /** Strip a declaration's unit back off a live CSS value. */
  _bare(raw, d) {
    let s = String(raw).trim();
    const unit = d.unit ?? '';
    if (unit && s.endsWith(unit)) s = s.slice(0, -unit.length);
    return coerce(s.trim());
  }

  /** Read live CSS vars into the session. Returns the keys that changed. */
  captureCss(root = document.documentElement, read = null) {
    // The panel writes inline on :root. getComputedStyle forces a style recalc
    // if anything is dirty, and the observer can fire several times per drag.
    // So: read the inline style text once and only fall through to computed
    // style if the var name appears there. In the common no-change case this
    // avoids the expensive path entirely.
    const inlineText = (!read && root?.style?.cssText) || '';
    const get = read || ((name) => {
      const inline = root.style?.getPropertyValue(name);
      if (inline) return inline;
      if (!inlineText.includes(name)) return '';
      try { return getComputedStyle(root).getPropertyValue(name); }
      catch { return ''; }
    });
    const changed = [];
    for (const key of this.keys()) {
      const d = this.decls.get(key);
      if (!d?.var) continue;
      const raw = get(d.var);
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      const live = this._bare(raw, d);
      if (live === this.get(key)) continue;
      if (d.locked) continue;
      this.session.set(key, live);
      changed.push(key);
    }
    return changed;
  }

  /** Watch a root for inline style changes and capture on each one. Returns
   *  a stop function. `onChange` fires with the keys that moved, so a host
   *  can light up a "keep these?" affordance. */
  observe(root = document.documentElement, onChange = null) {
    if (typeof MutationObserver === 'undefined') return () => {};
    let queued = false;
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      Promise.resolve().then(() => {
        queued = false;
        const changed = this.captureCss(root);
        if (changed.length && onChange) onChange(changed, this);
      });
    });
    mo.observe(root, { attributes: true, attributeFilter: ['style'] });
    return () => mo.disconnect();
  }

  // ── Serialisation ─────────────────────────────────────────

  /** The island a flush would write. Also the body of a click-to-apply
   *  fence, which is how a change gets reviewed before it lands. */
  serialize(keys = [...this.session.keys()]) {
    const lines = ['```omni type=config; managed'];
    for (const key of keys) {
      lines.push(`- key: ${key}`);
      lines.push(`  value: ${this.get(key)}`);
    }
    lines.push('```');
    return lines.join('\n');
  }

  /** Splice the managed island into a layer's text, leaving everything a
   *  human wrote in that file alone. This is what block positions bought. */
  rewrite(text, keys) {
    const island = this.serialize(keys);
    const src = String(text ?? '');
    const managed = findBlocks(src).find(b =>
      b.kind === 'fence' && b.lang === 'omni' &&
      b.attrs.type === 'config' && b.attrs.managed);

    if (!managed) {
      const head = src.trim()
        ? src.replace(/\s*$/, '\n\n')
        : '# Local\n\nPersonal configuration. Managed island below is rewritten\n' +
          'on save; anything else in this file is left alone.\n\n';
      return head + island + '\n';
    }
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    lines.splice(managed.line, managed.endLine - managed.line + 1, island);
    return lines.join('\n');
  }

  /** Fold the session into the writes layer. Throws loudly on a read-only
   *  source rather than pretending — the caller can fall back to showing
   *  serialize() for the user to paste. */
  async flush() {
    if (!this.session.size) return null;
    if (!this.writes) throw new Error('mdconfig: no writes layer declared');

    const keys = [...this.session.keys()];
    let text = '';
    try { text = await this.source.read(this.writes); } catch { /* new file */ }
    const next = this.rewrite(text, keys);
    await this.source.write(this.writes, next);

    for (const key of keys) {
      const prev = this.decls.get(key) || { key };
      const value = this.session.get(key);
      this.decls.set(key, Object.assign({}, prev, { value, explicit: true }));
      if (!this.history.has(key)) this.history.set(key, []);
      this.history.get(key).push({ layer: this.writes, value });
    }
    this.session.clear();
    return { path: this.writes, text: next, keys };
  }
}
