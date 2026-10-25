export { CollisionGrid, LabelLayouter, LabelSpriteFactory, RandomReplacementCache, TextMeasurer, TextStyle, annulusShape, circleShape, rectShape };

/* ─────────────────────────────────────────────────────────────────────────────
annular-labels — the label sprite system from Constellation Labels, unchanged
in substance.  It knows nothing of graphs, zoom or the scene graph: it turns
label layouts into cached offscreen canvases.  ring-label-node is the adapter.

The one change: the factory's dpr is set by the caller per sprite (and is part
of the key), because in the scene graph the device scale is per node — a
camera, a stock strip and a soloed pane all differ.
──────────────────────────────────────────────────────────────────────────── */

/** Fixed-capacity cache with random replacement. evictRandom() hands back
 *  the victim so its canvas can be recycled for the next build. */
class RandomReplacementCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();
    this.keys = [];
    this.hits = 0; this.misses = 0; this.evictions = 0;
  }
  get size() { return this.keys.length; }
  get full() { return this.keys.length >= this.capacity; }
  get(key) {
    const e = this.map.get(key);
    if (e) { this.hits++; return e.value; }
    this.misses++; return undefined;
  }
  put(key, value) {
    const e = this.map.get(key);
    if (e) { e.value = value; return; }
    this.map.set(key, { value, slot: this.keys.length });
    this.keys.push(key);
  }
  evictRandom() {
    if (!this.keys.length) return undefined;
    const i = (Math.random() * this.keys.length) | 0;
    const key = this.keys[i];
    const victim = this.map.get(key);
    this.map.delete(key);
    const last = this.keys.pop();
    if (i < this.keys.length) { this.keys[i] = last; this.map.get(last).slot = i; }
    this.evictions++;
    return victim.value;
  }
  clear() { this.map.clear(); this.keys.length = 0; }
}

/** Typographic style for a family of labels. emboldenEm / erodeEm: synthetic
 *  weight beyond the font's own range, as a fraction of the font size. */
class TextStyle {
  constructor({ id, family, weight = 400, caps = false, tracking = 0, lineHeight = 1.18,
                halo = 'rgba(5,7,13,0.9)', haloWidth = 3, emboldenEm = 0, erodeEm = 0 }) {
    Object.assign(this, { id, family, weight, caps, tracking, lineHeight, halo, haloWidth, emboldenEm, erodeEm });
    this.pad = Math.ceil(haloWidth) + 1;
  }
  font(px) { return `${this.weight} ${px}px ${this.family}`; }
  transform(t) { return this.caps ? t.toUpperCase() : t; }
}

/** Cached text measurement, truncation, balanced splitting and wrapping. */
class TextMeasurer {
  constructor() {
    this.ctx = document.createElement('canvas').getContext('2d');
    this.cache = new Map();
  }
  clear() { this.cache.clear(); }
  width(text, style, px) {
    const k = style.id + '|' + px + '|' + text;
    let w = this.cache.get(k);
    if (w !== undefined) return w;
    if (this.cache.size > 40000) this.cache.clear();
    const ctx = this.ctx, t = style.transform(text);
    ctx.font = style.font(px);
    if (style.tracking) {
      const chars = [...t]; w = 0;
      for (const ch of chars) w += ctx.measureText(ch).width;
      w += style.tracking * px * Math.max(0, chars.length - 1);
    } else w = ctx.measureText(t).width;
    this.cache.set(k, w);
    return w;
  }
  truncate(text, style, px, maxW) {
    if (this.width(text, style, px) <= maxW) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.width(text.slice(0, mid).trimEnd() + '…', style, px) <= maxW) lo = mid; else hi = mid - 1;
    }
    return text.slice(0, lo).trimEnd() + '…';
  }
  /** Split at the word boundary that minimises the wider half. */
  splitBalanced(text, style, px) {
    const words = text.split(' ');
    if (words.length < 2) return [text, ''];
    let best = null, bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      const w = Math.max(this.width(a, style, px), this.width(b, style, px));
      if (w < bestW) { bestW = w; best = [a, b]; }
    }
    return best;
  }
  /** "Cognitive Development & Meditation Subtopic:125" -> [title, "Subtopic:125"]. */
  semanticSplit(text) {
    const m = text.match(/^(.*\S)\s+([A-Za-z]+:\s*\S+)$/);
    return m ? [m[1], m[2]] : [text, ''];
  }
  /** Break points that carry meaning: after "&", "—", ":" or ",". */
  meaningfulBreaks(text) {
    const words = text.split(' '), out = [];
    for (let i = 1; i < words.length; i++)
      if (/(&|—|:|,)$/.test(words[i - 1])) out.push([words.slice(0, i).join(' '), words.slice(i).join(' ')]);
    return out;
  }
  wrap(text, style, px, maxW, maxLines, force = false) {
    if (maxLines <= 1 || (!force && this.width(text, style, px) <= maxW)) return [this.truncate(text, style, px, maxW)];
    const words = text.split(' ');
    if (maxLines === 2 || words.length <= 2) {
      const [a, b] = this.splitBalanced(text, style, px);
      if (!b) return [this.truncate(a, style, px, maxW)];
      return [this.truncate(a, style, px, maxW), this.truncate(b, style, px, maxW)];
    }
    const lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (!cur || this.width(t, style, px) <= maxW) cur = t; else { lines.push(cur); cur = w; }
    }
    lines.push(cur);
    if (lines.length > maxLines) { const rest = lines.slice(maxLines - 1).join(' '); lines.length = maxLines - 1; lines.push(rest); }
    return lines.map(l => this.truncate(l, style, px, maxW));
  }
}

/** Pure geometry: decides what a label will look like, in layout units.
 *  The resulting layout's key identifies its sprite in the cache. */
class LabelLayouter {
  constructor(measurer) { this.m = measurer; }

  lines({ text, style, px, color, maxWidth, maxLines = 1, align = 'center', forceSplit = false }) {
    const lines = this.m.wrap(text, style, px, maxWidth, maxLines, forceSplit);
    const widths = lines.map(l => this.m.width(l, style, px));
    const pad = style.pad;
    const w = Math.ceil(Math.max(...widths) + 2 * pad);
    const h = Math.ceil(px * style.lineHeight * lines.length + 2 * pad);
    const keyBase = `L|${style.id}|${color}|${px}|${lines.join('\n')}`;
    return { type: 'lines', lines, widths, w, h, px, style, color, pad, align, keyBase, key: keyBase + '|' + align };
  }
  withAlign(layout, align) {
    if (layout.type !== 'lines' || layout.align === align) return layout;
    return { ...layout, align, key: layout.keyBase + '|' + align };
  }

  /** Text on a ring. The top track reads clockwise over the anchor, the
   *  bottom track counter-clockwise under it, so both read left to right.
   *  The ring reads like a sentence: top text, a space, a blob, a space,
   *  bottom text.  Filling is greedy, and the halves never overlap.
   *  meaning: split "Main title Subtopic:125" into title and qualifier, and
   *  prefer breaks after "&", "—", ":" or ",".  innerCont: straight, smaller
   *  text inside the ring below the star for whatever the ring can't hold. */
  ring({ text, style, px, color, clearRadius, baseRadius = 0, maxArcTop = 2.6, maxArcBottom = 2.6, grow = false, maxRadius = 260,
         meaning = true, innerCont = false, blob = 0, bandAlpha = 0, rimAlpha = 0 }) {
    const m = this.m, pad = style.pad;
    const band = px * style.lineHeight + 2 * pad;
    const W = t => t ? m.width(t, style, px) : 0;
    let R = Math.max(clearRadius + band / 2, baseRadius);
    if (grow) {
      const [a, b] = m.splitBalanced(text, style, px);
      R = Math.min(maxRadius, Math.max(R, (Math.max(W(a) / maxArcTop, W(b) / maxArcBottom)) + 2 * pad / maxArcTop));
    }
    R = Math.ceil(R);
    const space = m.width(' ', style, px);
    const sepLen = blob > 0 ? 2 * space + 2 * blob : 2 * space;
    const capTop = R * maxArcTop, capBot = R * maxArcBottom;
    const fits = (a, b) => W(a) <= capTop && W(b) <= capBot && W(a) / 2 + W(b) / 2 + sepLen <= Math.PI * R;

    let [main, qual] = meaning ? m.semanticSplit(text) : [text, ''];
    const ringText = innerCont && qual ? main : (qual ? main + ' ' + qual : main);
    let top = '', bottom = '', rest = '';
    const cands = [[ringText, '']];
    if (meaning) cands.push(...m.meaningfulBreaks(ringText));
    const ok = cands.find(([a, b]) => fits(a, b || ''));
    if (ok) { [top, bottom] = ok; bottom = bottom || ''; }
    else {
      const words = ringText.split(' ');
      let i = 0;
      while (i < words.length && (i === 0 || fits(words.slice(0, i + 1).join(' '), ''))) i++;
      top = words.slice(0, i).join(' ');
      let j = i;
      while (j < words.length && fits(top, words.slice(i, j + 1).join(' '))) j++;
      bottom = words.slice(i, j).join(' ');
      rest = words.slice(j).join(' ');
      if (!innerCont && rest) {
        const room = Math.min(capBot, 2 * (Math.PI * R - sepLen) - W(top));
        bottom = m.truncate(bottom ? bottom + ' ' + rest : rest, style, px, Math.max(0, room));
        rest = '';
      }
      const topRoom = Math.min(capTop, 2 * (Math.PI * R - sepLen));
      if (W(top) > topRoom) top = m.truncate(top, style, px, topRoom);
    }
    const tracks = [];
    if (top) tracks.push({ text: top, px, R, Rdraw: R, dir: 1, w: W(top), band });
    if (bottom) tracks.push({ text: bottom, px, R, Rdraw: R, dir: -1, w: W(bottom), band });

    const blobs = [];
    if (blob > 0 && top) {
      const th = (W(top) / 2 + space + blob) / R;
      blobs.push({ R, a: th, r: blob }, { R, a: -th, r: blob });
    }

    let innerBox = null;
    const innerText = innerCont ? [rest, qual].filter(Boolean).join(' ') : '';
    if (innerText) {
      const hole = R - band / 2 + pad;
      const y0 = clearRadius + 1;
      const tryLayout = (ipx, allowTrunc) => {
        const lh = ipx * style.lineHeight, lines = [], widths = [];
        let words = innerText.split(' '), y = y0;
        while (words.length && y + lh <= hole) {
          const avail = 2 * Math.sqrt(Math.max(0, hole * hole - (y + lh) ** 2)) - 2;
          if (avail < ipx * 2) break;
          let k = 0;
          while (k < words.length && m.width(words.slice(0, k + 1).join(' '), style, ipx) <= avail) k++;
          if (k === 0) { if (!allowTrunc) return null; k = 1; }
          let line = words.slice(0, k).join(' ');
          words = words.slice(k);
          const lastRow = y + 2 * lh > hole;
          if (lastRow && words.length) { if (!allowTrunc) return null; line += ' ' + words.join(' '); words = []; }
          line = m.truncate(line, style, ipx, avail);
          lines.push(line); widths.push(m.width(line, style, ipx));
          y += lh;
        }
        if (words.length && !allowTrunc) return null;
        return lines.length ? { lines, widths, px: ipx, lh } : null;
      };
      let fit = null;
      for (let ipx = Math.max(9, Math.round(px * 0.8)); ipx >= 8 && !fit; ipx--) fit = tryLayout(ipx, false);
      if (!fit) fit = tryLayout(8, true);
      if (fit) {
        const boxW = Math.max(...fit.widths) + 2 * pad, boxH = fit.lines.length * fit.lh + 2 * pad;
        innerBox = { ...fit, boxW, boxH, x: -boxW / 2, y: y0 - pad };
      }
    }

    const inner = R - band / 2 + pad, outer = R + band / 2 - pad * 0.5;
    const size = Math.ceil(2 * (outer + pad + 2));
    const key = `R|${style.id}|${color}|${blob}|${bandAlpha}|${rimAlpha}|${R}|${top}|${bottom}|` +
      (innerBox ? innerBox.px + '|' + innerBox.lines.join('/') + '|' + innerBox.y.toFixed(1) : '');
    return { type: 'ring', tracks, blobs, innerBox, inner, outer, size, w: size, h: size, Rc: R,
             band, px, style, color, pad, bandAlpha, rimAlpha, key };
  }
}

/** Builds and caches label sprites in device pixels.
 *  Stage 1: straight text with halo, drawn offscreen.
 *  Stage 2 (rings): stage 1 is copied one vertical strip at a time onto the
 *  circle, each strip rotated to its own tangent, so glyphs bend smoothly. */
class LabelSpriteFactory {
  constructor({ capacity = 300, dpr = 1 } = {}) {
    this.cache = new RandomReplacementCache(capacity);
    this.dpr = dpr;
    this.scratch = document.createElement('canvas');
    this.sctx = this.scratch.getContext('2d');
    this.builtTotal = 0;
  }
  clear() { this.cache.clear(); }

  get(layout) {
    const s = this.cache.get(layout.key);
    if (s) return s;
    const recycled = this.cache.full ? this.cache.evictRandom() : null;
    const canvas = recycled ? recycled.canvas : document.createElement('canvas');
    const sprite = layout.type === 'ring' ? this._buildRing(layout, canvas) : this._buildLines(layout, canvas);
    this.cache.put(layout.key, sprite);
    this.builtTotal++;
    return sprite;
  }

  _paintLines(ctx, lines, widths, L, boxW, boxH) {
    const { style, px, color, pad } = L, D = this.dpr;
    const lh = px * style.lineHeight;
    const align = L.align || 'left';
    const setup = c => {
      c.setTransform(D, 0, 0, D, 0, 0);
      c.font = style.font(px); c.textBaseline = 'middle'; c.lineJoin = 'round'; c.miterLimit = 2;
    };
    const each = (c, stroke) => {
      for (let i = 0; i < lines.length; i++) {
        const tw = widths[i], y = pad + lh * (i + 0.5);
        const x = align === 'left' ? pad : align === 'right' ? boxW - pad - tw : (boxW - tw) / 2;
        this._run(c, style.transform(lines[i]), x, y, style, px, stroke);
      }
    };
    setup(ctx);
    ctx.strokeStyle = style.halo; ctx.lineWidth = style.haloWidth * 2;
    each(ctx, true);
    let g = ctx;
    const W = Math.ceil(boxW * D), H = Math.ceil(boxH * D);
    if (style.erodeEm > 0) {
      if (!this.layer) { this.layer = document.createElement('canvas'); this.lctx = this.layer.getContext('2d'); }
      if (this.layer.width < W || this.layer.height < H) {
        this.layer.width = Math.max(this.layer.width, W); this.layer.height = Math.max(this.layer.height, H);
      }
      g = this.lctx;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
      setup(g);
    }
    g.fillStyle = color;
    each(g, false);
    if (style.emboldenEm > 0) { g.strokeStyle = color; g.lineWidth = style.emboldenEm * px; each(g, true); }
    if (style.erodeEm > 0) {
      g.globalCompositeOperation = 'destination-out';
      g.strokeStyle = '#000'; g.lineWidth = style.erodeEm * px;
      each(g, true);
      g.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.layer, 0, 0, W, H, 0, 0, W, H);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  _run(ctx, t, x, y, style, px, stroke) {
    if (!style.tracking) { stroke ? ctx.strokeText(t, x, y) : ctx.fillText(t, x, y); return; }
    const gap = style.tracking * px;
    for (const ch of t) {
      stroke ? ctx.strokeText(ch, x, y) : ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + gap;
    }
  }
  _buildLines(L, canvas) {
    const D = this.dpr;
    canvas.width = Math.ceil(L.w * D); canvas.height = Math.ceil(L.h * D);
    this._paintLines(canvas.getContext('2d'), L.lines, L.widths, L, L.w, L.h);
    return { canvas, w: L.w, h: L.h };
  }
  _buildRing(L, canvas) {
    const D = this.dpr;
    const size = Math.ceil(L.size * D);
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size / 2;
    if (L.bandAlpha > 0 || L.rimAlpha > 0) {
      const ri = L.inner * D, ro = L.outer * D;
      if (L.bandAlpha > 0) {
        ctx.globalAlpha = L.bandAlpha; ctx.fillStyle = L.color;
        ctx.beginPath(); ctx.arc(c, c, ro, 0, Math.PI * 2); ctx.arc(c, c, ri, 0, Math.PI * 2, true); ctx.fill();
      }
      if (L.rimAlpha > 0) {
        ctx.globalAlpha = L.rimAlpha; ctx.strokeStyle = L.color; ctx.lineWidth = Math.max(1, 0.8 * D);
        ctx.beginPath(); ctx.arc(c, c, ro, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(c, c, ri, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (const t of L.tracks) {
      const pad = L.pad, boxW = t.w + 2 * pad;
      const sw = Math.ceil(boxW * D), sh = Math.ceil(t.band * D);
      if (this.scratch.width < sw || this.scratch.height < sh) {
        this.scratch.width = Math.max(this.scratch.width, sw);
        this.scratch.height = Math.max(this.scratch.height, sh);
      }
      this.sctx.setTransform(1, 0, 0, 1, 0, 0);
      this.sctx.clearRect(0, 0, sw, sh);
      this._paintLines(this.sctx, [t.text], [t.w], { style: L.style, px: t.px, color: L.color, pad, align: 'left' }, boxW, t.band);
      const Rc = t.Rdraw * D;
      const span = sw / Rc;
      const stripW = (Rc + sh / 2) / Rc + 0.3;
      const y0 = t.dir > 0 ? -(Rc + sh / 2) : Rc - sh / 2;
      for (let i = 0; i < sw; i++) {
        const along = (i + 0.5) / Rc;
        const phi = t.dir > 0 ? -span / 2 + along : span / 2 - along;
        const cs = Math.cos(phi), sn = Math.sin(phi);
        ctx.setTransform(cs, sn, -sn, cs, c, c);
        ctx.drawImage(this.scratch, i, 0, 1, sh, -stripW / 2, y0, stripW, sh);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (L.innerBox) {
      const b = L.innerBox, sw = Math.ceil(b.boxW * D), sh = Math.ceil(b.boxH * D);
      if (this.scratch.width < sw || this.scratch.height < sh) {
        this.scratch.width = Math.max(this.scratch.width, sw);
        this.scratch.height = Math.max(this.scratch.height, sh);
      }
      this.sctx.setTransform(1, 0, 0, 1, 0, 0);
      this.sctx.clearRect(0, 0, sw, sh);
      this._paintLines(this.sctx, b.lines, b.widths, { style: L.style, px: b.px, color: L.color, pad: L.pad, align: 'center' }, b.boxW, b.boxH);
      ctx.drawImage(this.scratch, 0, 0, sw, sh, Math.round(c + b.x * D), Math.round(c + b.y * D), sw, sh);
    }
    for (const b of L.blobs) {
      const x = c + Math.sin(b.a) * b.R * D, y = c - Math.cos(b.a) * b.R * D;
      ctx.fillStyle = L.style.halo;
      ctx.beginPath(); ctx.arc(x, y, (b.r + L.style.haloWidth * 0.7) * D, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = L.color;
      ctx.beginPath(); ctx.arc(x, y, b.r * D, 0, Math.PI * 2); ctx.fill();
    }
    return { canvas, w: L.size, h: L.size };
  }
}

/* Screen-space collision grid. */
const rectShape = (x0, y0, x1, y1) => ({ t: 0, x0, y0, x1, y1 });
const circleShape = (cx, cy, r) => ({ t: 1, cx, cy, r, x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r });
/** A ring of text with an empty hole (r0) inside: things in the hole don't collide with it. */
const annulusShape = (cx, cy, r0, r1) => ({ t: 2, cx, cy, r: r1, r0, x0: cx - r1, y0: cy - r1, x1: cx + r1, y1: cy + r1 });
function insideHole(an, s) {
  const r0sq = an.r0 * an.r0;
  if (s.t === 0) {
    for (const [x, y] of [[s.x0, s.y0], [s.x1, s.y0], [s.x0, s.y1], [s.x1, s.y1]])
      if ((x - an.cx) ** 2 + (y - an.cy) ** 2 >= r0sq) return false;
    return true;
  }
  return Math.hypot(s.cx - an.cx, s.cy - an.cy) + s.r <= an.r0;
}
function shapesHit(a, b) {
  if (a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0) return false;
  if (a.t === 2 || b.t === 2) {
    const an = a.t === 2 ? a : b, o = a.t === 2 ? b : a;
    if (insideHole(an, o)) return false;
    if (o.t === 2 && insideHole(o, an)) return false;
    return shapesHit({ ...an, t: 1 }, o.t === 2 ? { ...o, t: 1 } : o);
  }
  if (a.t === 0 && b.t === 0) return true;
  if (a.t === 1 && b.t === 1) { const dx = a.cx - b.cx, dy = a.cy - b.cy, r = a.r + b.r; return dx * dx + dy * dy < r * r; }
  const c = a.t === 1 ? a : b, r = a.t === 1 ? b : a;
  const qx = Math.max(r.x0, Math.min(c.cx, r.x1)), qy = Math.max(r.y0, Math.min(c.cy, r.y1));
  const dx = c.cx - qx, dy = c.cy - qy;
  return dx * dx + dy * dy < c.r * c.r;
}
class CollisionGrid {
  constructor(cell = 48) { this.cell = cell; this.cells = []; this.cols = 0; this.rows = 0; this.shapes = []; }
  reset(W, H) {
    this.cols = Math.ceil(W / this.cell) + 1; this.rows = Math.ceil(H / this.cell) + 1;
    const n = this.cols * this.rows;
    if (this.cells.length < n) for (let i = this.cells.length; i < n; i++) this.cells.push([]);
    for (let i = 0; i < n; i++) this.cells[i].length = 0;
    this.shapes.length = 0;
  }
  _range(s) {
    const c = this.cell;
    return [Math.max(0, Math.floor(s.x0 / c)), Math.max(0, Math.floor(s.y0 / c)),
            Math.min(this.cols - 1, Math.floor(s.x1 / c)), Math.min(this.rows - 1, Math.floor(s.y1 / c))];
  }
  insert(s) {
    const [a, b, cx, d] = this._range(s);
    for (let y = b; y <= d; y++) for (let x = a; x <= cx; x++) this.cells[y * this.cols + x].push(s);
    this.shapes.push(s);
  }
  hits(s) {
    const [a, b, cx, d] = this._range(s);
    for (let y = b; y <= d; y++) for (let x = a; x <= cx; x++)
      for (const o of this.cells[y * this.cols + x]) if (shapesHit(o, s)) return true;
    return false;
  }
}
