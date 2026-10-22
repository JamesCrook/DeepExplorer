// ═══════════════════════════════════════════════════════════════
//  mdplus.js — markdown+ , step one
// ═══════════════════════════════════════════════════════════════
//
//  Two stages, only the first of which is temporary:
//
//    1. findBlocks()  — a fence-aware block finder. Splits a document into
//       fences, callouts, headings, rules, list items and paragraphs.
//       This is the part the PEG parser replaces. When it does, `on:` in a
//       rule stops naming a block kind and starts naming an ast.token.
//
//    2. RuleSet.apply() — an ordered list of rules, first match wins, each
//       emitting a scene node, { type, value, subtree: [] }. This is final:
//       every rule written today survives the parser swap unchanged.
//
//  Nothing here knows what a widget is. transform() returns scene nodes; the
//  host's node types decide what to build from them. A rule's fields land in
//  the node's value like this:
//
//    with / scalar          → value (a scalar becomes { text }, a list
//                             { list }, so value is always a map)
//    content                → value.body, markup already rendered
//    zoneOut                → value.zoneOut, the zone the node mounts in
//    nav                    → value.on.click, what a click does, and the
//                             selection group whose active member the
//                             node's target is (see navEvents)
//
//  A node with a scene field joins group 'scene', keyed by it, so a stage
//  and the topics that name its scene share one live member.

// ── Coercion ──────────────────────────────────────────────

/** '42' → 42, 'true' → true, '' → '', everything else unchanged. */
export function coerce(v) {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (t === 'true')  return true;
  if (t === 'false') return false;
  if (t === 'null')  return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return v;
}

// ── Inline attributes: `k=v; k=v` ─────────────────────────
//
//  `=` assigns and `;` separates, so a value may contain colons —
//  `labelStyle=color:var(--accent)` parses without quoting. A bare token
//  with no `=` becomes a flag set to true.

export function parseAttrs(src) {
  const out = {};
  if (!src) return out;
  const s = String(src);
  let i = 0;

  while (i < s.length) {
    while (i < s.length && (s[i] === ';' || /\s/.test(s[i]))) i++;
    if (i >= s.length) break;

    // key
    let k = '';
    while (i < s.length && s[i] !== '=' && s[i] !== ';') k += s[i++];
    k = k.trim();
    if (!k) continue;
    if (s[i] !== '=') { out[k] = true; continue; }   // bare flag
    i++;

    // value — quoted values may contain `;`, which CSS needs
    while (i < s.length && /\s/.test(s[i])) i++;
    let v = '';
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i++];
      while (i < s.length && s[i] !== q) v += s[i++];
      i++;
      out[k] = v;                                     // quoted: never coerced
      continue;
    }
    while (i < s.length && s[i] !== ';') v += s[i++];
    out[k] = coerce(v.trim());
  }
  return out;
}

// ── Flat YAML ─────────────────────────────────────────────
//
//  A deliberate subset: a list of flat maps, or one flat map. The value is
//  RAW TO END OF LINE — no quote or escape processing — which is what lets a
//  regex live in a rules island without doubling every backslash.
//
//  Real YAML accepts everything this accepts, so islands stay valid when
//  js-yaml (or the PEG's YAML grammar) takes over.

export function readFlatYaml(text) {
  const items = [];
  let cur = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (/^\s*#($|\s)/.test(line)) continue;          // full-line comment only

    const item = line.match(/^\s*-\s+(.*)$/);
    const body = item ? item[1] : line.trim();
    if (item) { cur = {}; items.push(cur); }
    if (!cur) { cur = {}; items.push(cur); }

    const colon = body.indexOf(':');
    if (colon === -1) continue;
    cur[body.slice(0, colon).trim()] = coerce(body.slice(colon + 1).trim());
  }
  return items;
}

// ── Inline rendering ──────────────────────────────────────

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = s => String(s).replace(/[&<>"]/g, c => ESC[c]);

/** Markdown inlines → HTML. Code spans are lifted out first so nothing
 *  inside them is ever interpreted. */
export function renderInline(src) {
  if (!src) return '';
  const spans = [];
  let s = String(src).replace(/`([^`\n]+)`/g,
    (_, code) => `\u0000${spans.push('<code>' + esc(code) + '</code>') - 1}\u0000`);

  s = esc(s)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,
      (_, t, l) => `<a href="#" class="wikilink" data-note="${esc(t.trim())}" data-on="nav note ${esc(t.trim())}">${l.trim()}</a>`)
    .replace(/\[\[([^\]]+)\]\]/g,
      (_, t) => `<a href="#" class="wikilink" data-note="${esc(t.trim())}" data-on="nav note ${esc(t.trim())}">${t.trim()}</a>`)
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g,
      (_, l, h) => `<a href="${esc(h || '#')}">${l}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g,   '$1<em>$2</em>')
    .replace(/\n/g, ' ');

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => spans[+i]);
}

// ── Blocks ────────────────────────────────────────────────
//
//  Kinds: fence, callout, directive, heading, hr, item, para.
//
//  Two invisible carriers, both `%%…%%` — an Obsidian comment, so neither
//  shows in a vault:
//
//    trailing   `- B [[BMesh]] 58/30 %%active%%`      → attrs on that node
//    standalone `%%tags datastructures=ds%%`          → a chrome widget
//
//  A block carries `.text` (with trailing attrs stripped), `.attrs`, and for
//  fences and callouts a `.head` / `.body` split.

const RX_FENCE     = /^\s*(`{3,}|~{3,})\s*(.*)$/;
const RX_CALLOUT   = /^\s*>\s*\[!([\w-]+)(?:\|([\w-]+))?\]\s*(.*)$/;
const RX_HEADING   = /^\s*(#{1,6})\s+(.*)$/;
const RX_HR        = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const RX_ITEM      = /^(\s*)[-*+]\s+(.*)$/;
const RX_DIRECTIVE = /^\s*%%\s*([\s\S]*?)\s*%%\s*$/;
const RX_TRAILING  = /\s*%%\s*([^%]*?)\s*%%\s*$/;

/** Pull a trailing `%%…%%` off a line. Returns [text, attrs]. */
function splitTrailing(line) {
  if (RX_DIRECTIVE.test(line)) return [line, {}];
  const m = line.match(RX_TRAILING);
  if (!m) return [line, {}];
  return [line.slice(0, m.index), parseAttrs(m[1])];
}

export function findBlocks(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  let paraStart = 0;

  // Every block carries `line`/`endLine` (0-based, inclusive) into the source.
  // Nothing above needs them yet; a writer that must splice a file it does not
  // own does, and so will click-to-edit and per-block re-render.
  const flushPara = () => {
    if (!para.length) return;
    const joined = para.join('\n');
    const [text, attrs] = splitTrailing(joined);
    blocks.push({ kind: 'para', text: text.trim(), attrs,
                  line: paraStart, endLine: paraStart + para.length - 1 });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Fence ── consumes to its closer; nothing inside is interpreted.
    const fence = line.match(RX_FENCE);
    if (fence) {
      flushPara();
      const marker = fence[1];
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].trim().startsWith(marker)) break;
        body.push(lines[j]);
      }
      const [head, attrs] = splitTrailing(fence[2]);
      const info = head.trim().split(/\s+/);
      blocks.push({
        kind: 'fence',
        lang: info[0] || '',
        head: head.trim(),
        text: head.trim(),
        attrs: Object.assign(parseAttrs(info.slice(1).join(' ')), attrs),
        body: body.join('\n'),
        line: i, endLine: Math.min(j, lines.length - 1),
      });
      i = j;
      continue;
    }

    // ── Callout ── `> [!card|sparse] Title` plus following `>` lines.
    const call = line.match(RX_CALLOUT);
    if (call) {
      flushPara();
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const c = lines[j].match(/^\s*>\s?(.*)$/);
        if (!c) break;
        body.push(c[1]);
      }
      const [head, attrs] = splitTrailing(call[3]);
      blocks.push({
        kind: 'callout',
        callout: call[1],
        variant: call[2] || '',
        head: head.trim(),
        text: head.trim(),
        attrs,
        body: body.join('\n').trim(),
        line: i, endLine: j - 1,
      });
      i = j - 1;
      continue;
    }

    // ── Standalone directive ──
    const dir = line.match(RX_DIRECTIVE);
    if (dir) {
      flushPara();
      const sp = dir[1].indexOf(' ');
      const type = (sp === -1 ? dir[1] : dir[1].slice(0, sp)).trim();
      const rest = (sp === -1 ? '' : dir[1].slice(sp + 1)).trim();
      blocks.push({
        kind: 'directive',
        directive: type,
        text: rest,
        attrs: rest.includes('=') ? parseAttrs(rest) : {},
        line: i, endLine: i,
      });
      continue;
    }

    if (RX_HR.test(line) && !para.length) { flushPara(); blocks.push({ kind: 'hr', text: '', attrs: {}, line: i, endLine: i }); continue; }

    const head = line.match(RX_HEADING);
    if (head) {
      flushPara();
      const [text, attrs] = splitTrailing(head[2]);
      blocks.push({ kind: 'heading', level: head[1].length, text: text.trim(), attrs,
                    line: i, endLine: i });
      continue;
    }

    const item = line.match(RX_ITEM);
    if (item) {
      flushPara();
      const [text, attrs] = splitTrailing(item[2]);
      blocks.push({ kind: 'item', indent: item[1].length, text: text.trim(), attrs,
                    line: i, endLine: i });
      continue;
    }

    if (!line.trim()) { flushPara(); continue; }
    if (!para.length) paraStart = i;
    para.push(line);
  }
  flushPara();
  return blocks;
}

// ── Rules ─────────────────────────────────────────────────
//
//  Four independent axes, which an earlier draft wrongly collapsed into one
//  called "zone":
//
//    emit      what widget to build
//    where     which documents this rule may match in (a role, not a column)
//    zoneOut   which zone the widget mounts in
//    nav       what a click on it does
//
//  A rule is a flat map:
//
//    on        block kinds this rule may match      (comma list, optional)
//    where     document roles this rule applies in  (comma list, optional)
//    attr      `%%…%%` markers the block must carry — `attr: server` matches
//              `%%server%%`. A rule with `attr` ignores `where`, so a marked
//              line works in any document: that is how a server icon appears
//              in a note.
//    match     regex against block.text             (optional)
//    emit      widget type, may interpolate $<name>
//    nav       what a click loads: server | index | note
//    with      `k=v; k=v`, values may interpolate $<name>
//    scalar    the node's value IS this, not a map
//    split     turn a scalar into a list on this separator
//    content   source for the widget body: $<name>, `body`, or literal
//    wrap      HTML around the content; `$` is the placeholder
//    raw       set to skip inline rendering of content (html/svg/code)
//    derive    named capture to build a speaker identity from
//    requires  named capture that must be a known cast id
//    inherits  keys to take from the enclosing group
//    provides  keys later nodes inherit from this one
//    zoneOut   send the emitted node to a different zone
//
//  Interpolation sources, in order: named captures, block.attrs, ctx.inherit.

//  `$<label|note>` falls back left to right — the first source that has a
//  non-empty value wins. Lets one rule cover `[[BMesh]]` and `[[BMesh|Mesh]]`.
const RX_INTERP = /\$<([\w.|]+)>/g;

// ── Derived speakers ──────────────────────────────────────
//
//  A pattern accepts an unseen name; a registry cannot. The cast island only
//  refines the speakers we happen to know — anyone else gets initials and a
//  stable role, so an imported chat log needs no cast at all.

const ROLES = ['u1', 'u2', 'u3'];

export function deriveSpeaker(who) {
  const name = String(who);
  const parts = name.split(/[._\-\s]+/).filter(Boolean);
  const avatar = (parts.length > 1
    ? parts[0][0] + parts[1][0]
    : name.slice(0, 2)).toLowerCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return { name, avatar, role: ROLES[h % ROLES.length] };
}

export class RuleSet {
  constructor(rules = [], cast = {}) {
    this.rules = RuleSet._sorted(rules.map(r => RuleSet._compile(r)));
    this.cast  = cast;
  }

  static _compile(r) {
    const c = Object.assign({}, r);
    c.rx    = r.match ? new RegExp(r.match) : null;
    c.on    = r.on    ? String(r.on).split(',').map(s => s.trim())    : null;
    c.roles = r.where ? String(r.where).split(',').map(s => s.trim()) : null;
    c.attrs = parseAttrs(r.with || '');
    c.need  = r.attr ? parseAttrs(r.attr) : null;
    c.inh   = r.inherits ? String(r.inherits).split(',').map(s => s.trim()) : null;
    // Priority: higher numbers match first. Default 0; the prose floor should
    // declare a negative priority so that a folder rule at 0 outranks it
    // without anyone having to know the floor exists.
    c._pri  = Number(r.priority) || 0;
    return c;
  }

  /** Stable sort descending by priority. Rules at the same priority keep
   *  their document order (first-match-wins within a tier). */
  static _sorted(rules) {
    return rules
      .map((r, i) => ({ r, i }))
      .sort((a, b) => b.r._pri - a.r._pri || a.i - b.i)
      .map(({ r }) => r);
  }

  /** Read every `omni type=rules` and `omni type=cast` island in a document. */
  static fromMarkdown(src) {
    const rules = [];
    const cast  = {};
    for (const b of findBlocks(src)) {
      if (b.kind !== 'fence' || b.lang !== 'omni') continue;
      const kind = b.attrs.type;
      if (kind === 'rules') rules.push(...readFlatYaml(b.body));
      if (kind === 'cast') {
        for (const c of readFlatYaml(b.body)) if (c.id) cast[c.id] = c;
      }
    }
    return new RuleSet(rules, cast);
  }

  /** Later islands win: merge another ruleset over this one, by rule id.
   *  The result is re-sorted by priority so a folder rule at priority 0
   *  outranks the prose floor at priority -1000 regardless of append order. */
  merge(other) {
    const byId = new Map();
    const out  = [];
    for (const r of [...this.rules, ...other.rules]) {
      if (!r.id) { out.push(r); continue; }
      if (byId.has(r.id)) out[byId.get(r.id)] = r;
      else { byId.set(r.id, out.length); out.push(r); }
    }
    const merged = new RuleSet([], Object.assign({}, this.cast, other.cast));
    merged.rules = RuleSet._sorted(out);
    return merged;
  }

  _interp(str, caps, block, ctx) {
    if (typeof str !== 'string') return str;
    const out = str.replace(RX_INTERP, (_, chain) => {
      for (const key of chain.split('|')) {
        for (const src of [caps, block.attrs, ctx.inherit]) {
          if (src && src[key] !== undefined && src[key] !== '') return src[key];
        }
      }
      return '';
    });
    return out === str ? str : coerce(out);
  }

  /** Try every rule in order against one block. First match wins. */
  apply(block, ctx) {
    for (const r of this.rules) {
      if (r.on && !r.on.includes(block.kind)) continue;

      // A rule that demands a marker is opt-in anywhere; one that doesn't is
      // scoped by document role. That is what lets `%%server%%` put a server
      // icon in a note without loosening the unmarked rules.
      if (r.need) {
        if (!Object.entries(r.need).every(([k, v]) =>
              v === true ? block.attrs[k] !== undefined
                         : String(block.attrs[k]) === String(v))) continue;
      } else 
        if (r.roles && !r.roles.includes(ctx.role)) continue;

      if (r.callout && r.callout !== block.callout) continue;
      if (r.variant !== undefined && String(r.variant) !== String(block.variant || '')) continue;
      if (r.directive && r.directive !== block.directive) continue;
      if (r.lang && r.lang !== block.lang) continue;
      if (r.level && Number(r.level) !== block.level) continue;

      let caps = {};
      if (r.rx) {
        const m = r.rx.exec(block.text);
        if (!m) continue;
        caps = Object.assign({}, m.groups);
        for (const k of Object.keys(caps)) if (caps[k] === undefined) delete caps[k];
      }
      if (r.requires === 'cast' && !this.cast[caps.who]) continue;

      // ── Build the node ──
      const value = {};
      if (r.inh) for (const k of r.inh) {
        if (ctx.inherit[k] !== undefined) value[k] = ctx.inherit[k];
      }
      for (const [k, v] of Object.entries(r.attrs)) {
        const out = this._interp(v, caps, block, ctx);
        if (out !== '' && out !== undefined) value[k] = out;
      }
      for (const [k, v] of Object.entries(block.attrs)) value[k] = v;

      // Speaker identity: derived from the name, then refined by the cast if
      // it happens to know this one.
      const who = caps[r.derive] ?? (r.requires === 'cast' ? caps.who : undefined);
      if (who !== undefined) {
        Object.assign(value, deriveSpeaker(who));
        const known = this.cast[who];
        if (known) for (const k of ['name', 'avatar', 'role']) {
          if (known[k] !== undefined) value[k] = known[k];
        }
      }

      let content = null;
      if (r.content) {
        const src = r.content === 'body' ? (block.body ?? '')
                                         : this._interp(r.content, caps, block, ctx);
        content = r.raw ? String(src) : renderInline(String(src));
        if (r.wrap) content = String(r.wrap).split('$').join(content);
      }

      // Some widgets take a scalar rather than a map — `:group: Data
      // Structures` was never an object. `split` turns one into a list.
      let finalValue = value;
      if (r.scalar !== undefined) {
        const s = this._interp(r.scalar, caps, block, ctx);
        finalValue = r.raw ? s : renderInline(String(s));
        if (r.split) finalValue = String(s).split(r.split).map(x => x.trim()).filter(Boolean);
      }

      const type = String(this._interp(r.emit, caps, block, ctx));
      const v = finalValue && typeof finalValue === 'object' && !Array.isArray(finalValue) ? finalValue
              : Array.isArray(finalValue) ? { list: finalValue }
              : finalValue == null || finalValue === '' ? {} : { text: finalValue };
      if (content != null) v.body = content;
      if (r.zoneOut) v.zoneOut = r.zoneOut;
      // What a click does. `nav` is a kind, not a column — a server loads two
      // files, so a column would be the wrong thing to name.
      navEvents(v, block.attrs.nav || r.nav);
      const node = { type, value: v, subtree: [], _rule: r.id || r.emit, _block: block };

      // Group headings hand style down to the topics beneath them.
      if (r.provides) {
        const pool = Object.assign({}, caps, ctx.inherit, value, block.attrs);
        ctx.inherit = {};
        for (const k of String(r.provides).split(',').map(s => s.trim())) {
          if (pool[k] !== undefined) ctx.inherit[k] = pool[k];
        }
      }
      return node;
    }
    return null;
  }
}

// ── Clicks and groups ─────────────────────────────────────
//
//  A rule's nav kind becomes the node's click, as an action the scene
//  harness runs ('nav <kind> <target>'), and the node joins the selection
//  group of things that kind opens, keyed by its target, so the one that is
//  open shows as active with no click handler marking it:
//
//    server         group 'server'        the open corpus
//    note, index    group 'topic'         the open note
//    config         group 'config:<key>'  the chosen value of that key
//    (scene field)  group 'scene'         the live stage; a click scrolls to it

export function navEvents(v, nav) {
  if (v.scene) { v.group = 'scene'; v.groupKey = v.scene; }
  if (!nav) return v;
  if (v.scene) {
    v.on = { click: `nav scene ${v.scene}` };
  } else if (nav === 'config') {
    v.on = { click: 'nav config' };
    v.group = 'config:' + v.key;
    v.groupKey = String(v.value);
  } else {
    const target = v.note ?? v.url ?? v.id;
    v.on = { click: `nav ${nav} ${target}` };
    v.group = nav === 'server' ? 'server' : 'topic';
    v.groupKey = String(target);
  }
  return v;
}

// ── Transform ─────────────────────────────────────────────

/** Run a document through a ruleset. `role` says what kind of document this
 *  is — servers, index, note, chat — not which column it lands in. */
export function transform(src, ruleset, role) {
  const ctx = { role, inherit: {}};
  const nodes = [];
  const unmatched = [];
  const controlIslands = [];        // `type=controls` islands, for config
  for (const block of findBlocks(src)) {
    // Islands that configure the reader are not content. `controls` is
    // deliberately absent: it is the same syntax as `config`, and the type
    // name is what says whether the island also renders.
    if (block.kind === 'fence' && block.lang === 'omni' &&
        ['rules', 'cast', 'config', 'theme'].includes(block.attrs.type)) continue;
    const node = ruleset.apply(block, ctx);
    if (node) {
      nodes.push(node);
      // Controls islands pass through to rendering AND contribute their
      // declarations to config, so collect the body here rather than
      // re-parsing the whole document in absorbDoc.
      if (node.type === 'controls' && node.value.body) controlIslands.push(node.value.body);
    }
    else if (block.text || block.body) unmatched.push(block);
  }
  return { nodes, unmatched, controlIslands };
}

// ── Source ────────────────────────────────────────────────
//
//  One method, so the Chrome folder-drag drops in later without anything
//  above it changing — and so write() has an obvious home when OmniScene
//  starts saving diagrams.

// ── Overlay source ────────────────────────────────────────
//
//  A read-only base plus a writable store, where the store has its OWN path
//  namespace: `local:` paths are browser files, bare paths are vault files,
//  and neither can shadow the other.
//
//  Each layer must have a WRITER, or it is dead weight. `_project.md` and
//  `_local.md` are written by hand in the vault; `local:_settings.md` is
//  written by the app. Naming the browser file after the vault one was a
//  mistake — it made two layers with different writers look like duplicates.
//
//  An earlier version had the store shadow matching vault paths, which was
//  wrong in exactly the way this design is meant to avoid: a stale browser
//  copy hid every later edit to the served file, and precedence became
//  per-file instead of per-key. Making it a namespace means both files are
//  ordinary config layers, both are read, and the vault's later edits still
//  reach keys the user never personally set.
//
//  The store is injectable — localStorage by default, a Map in tests, a File
//  System Access directory handle when the user grants one, at which point
//  the same text becomes a real file on disk.

export const LOCAL_PREFIX = 'local:';

export class MemoryStore {
  constructor(seed = {}) { this.m = new Map(Object.entries(seed)); }
  get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  set(k, v) { this.m.set(k, v); }
  delete(k) { this.m.delete(k); }
  keys() { return [...this.m.keys()]; }
}

export class LocalStore {
  constructor(prefix = 'dplus:') { this.prefix = prefix; }
  get(k) { try { return localStorage.getItem(this.prefix + k); } catch { return null; } }
  set(k, v) { try { localStorage.setItem(this.prefix + k, v); } catch { /* full or blocked */ } }
  delete(k) { try { localStorage.removeItem(this.prefix + k); } catch { /* ignore */ } }
  keys() {
    try {
      return Object.keys(localStorage)
        .filter(k => k.startsWith(this.prefix))
        .map(k => k.slice(this.prefix.length));
    } catch { return []; }
  }
}

export class OverlaySource {
  constructor(base, store = new MemoryStore()) { this.base = base; this.store = store; }
  get writable() { return true; }
  static isLocal(path) { return String(path).startsWith(LOCAL_PREFIX); }

  async read(path) {
    if (!OverlaySource.isLocal(path)) return this.base.read(path);
    const text = this.store.get(path.slice(LOCAL_PREFIX.length));
    if (text === null || text === undefined) throw new Error(`404 — ${path}`);
    return text;
  }

  async write(path, text) {
    if (!OverlaySource.isLocal(path)) return this.base.write(path, text);
    this.store.set(path.slice(LOCAL_PREFIX.length), text);
    return text;
  }

  /** Everything the browser holds, for export into a real vault. */
  overlays() {
    return Object.fromEntries(this.store.keys().map(k => [k, this.store.get(k)]));
  }

  clearLocal() { for (const k of this.store.keys()) this.store.delete(k); }
}

export class FetchSource {
  constructor(root = './content') { this.root = root.replace(/\/$/, ''); }
  _url(path) {
    return this.root + '/' + path.split('/').map(encodeURIComponent).join('/');
  }
  async read(path) {
    const res = await fetch(this._url(path));
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${this._url(path)}`);
    return res.text();
  }
  /** Declared, not implemented: a plain http server has nowhere to put this.
   *  ConfigStack.flush() calls it, so the failure is loud and at the right
   *  place — and a source that CAN write only has to override this. */
  get writable() { return false; }
  async write(path) {
    throw new Error(
      `FetchSource cannot write ${path} — this source is read-only. ` +
      `Use ConfigStack.serialize() to get the island and paste it in, ` +
      `or supply a writable source.`);
  }
}

export class DataSource {

  constructor(root = 'http://127.0.0.1:8765') { this.root = root.replace(/\/$/, ''); }
  
  async getHistory(scope = 'founders-dm', limit = 200, around = null) {
    const params = new URLSearchParams({ scope, limit: String(limit) });
    if (around) params.set('around', around);
    
    const res = await fetch(`${this.root}/api/history?${params}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.messages || [];
  }

  // 1. Node Identity & Health
  async getHealth() {
    const res = await fetch(`${this.root}/api/health`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // 2. Channels / Scopes
  async getScopes() {
    const res = await fetch(`${this.root}/api/scopes`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.scopes || [];
  }

  // 4. Search
  async search({ query, scope = '', order = 'relevance', limit = 25, offset = 0 }) {
    const params = new URLSearchParams({
      q: query,
      order,
      limit: String(limit),
      offset: String(offset),
    });
    if (scope) params.set('scope', scope);

    const res = await fetch(`${this.root}/api/search?${params}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json(); // returns { total, offset, matches: [...] }
  }

  // 5. Message Context (Surrounding messages)
  async getContext(atomId, before = 6, after = 6) {
    const params = new URLSearchParams({
      id: atomId,
      before: String(before),
      after: String(after),
    });

    const res = await fetch(`${this.root}/api/context?${params}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // 6. Send Message
  async sendMessage(text, scope = 'founders-dm') {
    const res = await fetch(`${this.root}/api/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, text }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
};



// ── Memory source ─────────────────────────────────────────
//
//  A writable source with no backend, for tests and for holding a session's
//  worth of edits before anything decides where they land.

export class MemorySource {
  constructor(files = {}) { this.files = new Map(Object.entries(files)); }
  get writable() { return true; }
  async read(path) {
    if (!this.files.has(path)) throw new Error(`404 — ${path}`);
    return this.files.get(path);
  }
  async write(path, text) { this.files.set(path, text); return text; }
}
