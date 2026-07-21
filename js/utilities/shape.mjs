/**
 * shape.mjs
 *
 * Shape geometry and edge-decoration system, migrated from shape.js.
 *
 * Exports:
 *   - Shape class (path building, wart decoration, drawing)
 *   - ShapeData  (edge definitions, in/out decorations, link types)
 *   - TileStyles (preset fill/outline colour sets)
 *   - Code-string manipulation (reversedCode, flippedCode, rotatedCode)
 *   - Bond helpers (getBondData, makeTaper, drawBond)
 *   - End-shape registration (setEnd, setInOut, setInOutBend)
 *
 * EXTERNAL (import and fix paths once migrated):
 *   Vector2d, transformXy, parseLabelString, firstValid,
 *   drawLineLabelAndText
 */

// import { Vector2d }           from '../2d-support/vector2d.js';
// import { firstValid }         from './utils.mjs';
// import { transformXy }        from '../nodes2d/workhorse-nodes.js';
// import { parseLabelString }   from '../utilities/label-parser.js';
// import { drawLineLabelAndText } from '../nodes2d/workhorse-nodes.js';


// ═══════════════════════════════════════════════════════════════
//  TILE STYLES  (preset colour sets)
// ═══════════════════════════════════════════════════════════════

export const TileStyles = {
  green:  { outline: '#225533', fill: '#55AA77', width: 4 },
  blue:   { outline: '#223355', fill: '#5577AA', width: 4 },
  red:    { outline: '#552233', fill: '#AA5577', width: 4 },
  yellow: { outline: '#AAAA33', fill: '#CCCC77', width: 4 },
};


// ═══════════════════════════════════════════════════════════════
//  SHAPE DATA  (edge definitions registry)
// ═══════════════════════════════════════════════════════════════

export const ShapeData = {
  LeftEdges: {},   // left and right end shapes
  InOuts:    {},   // up and down additions
  LinkTypes: {},   // bond rendering dispatch
};


// ═══════════════════════════════════════════════════════════════
//  CODE-STRING MANIPULATION
// ═══════════════════════════════════════════════════════════════

/** Reverse a code string (for the opposite-end mirror). */
export function reversedCode(code) {
  let reversed = '';
  for (let i = code.length - 1; i >= 0; i--) {
    reversed += code[i];
  }
  return reversed;
}

/** Swap paired characters in a code string. */
export function swappedCode(code, swaps) {
  let flipped = '';
  for (let i = 0; i < code.length; i++) {
    let ch = code[i];
    const index = swaps.indexOf(ch);
    if (index >= 0) {
      ch = swaps[index - 2 * (index % 2) + 1];
    }
    flipped += ch;
  }
  return flipped;
}

/** X-flip a code string: ( ↔ ), < ↔ >, / ↔ \. */
export function flippedCode(code) {
  return swappedCode(code, '()[]<>{}/\\');
}

/** Rotate a code string for the opposite end: ( ↔ ), < ↔ >. */
export function rotatedCode(code) {
  if (!code) return code;
  let flipped = swappedCode(code, '()[]<>{}');
  if (flipped.match(/-|=|\)\+\(|\(\+\)/)) {
    flipped = flipped.split('').reverse().join('');
  }
  return flipped;
}


// ═══════════════════════════════════════════════════════════════
//  SVG PATH DRAWING  (edge decoration renderer)
// ═══════════════════════════════════════════════════════════════

function drawSvg(i, src, s, flip, svg, siz, align) {
  flip = (flip || 1.0) * src.scaling * 0.7;
  const start = src.getPoint(i - 1);
  let along = src.getPoint(i).sub(start);
  const l = along.length();

  s.addPoint(start);

  let base = 0;
  if (siz) {
    along = along.normalized(siz);
    if (align) base = ((l - siz) * align) / siz;
  }
  const perp = along.perp();

  const commands = svg.split(' ');
  let j = 0;
  let x = 0, y = 0;

  while (j < commands.length) {
    if (commands[j] === 'L') {
      x = base + (+commands[++j]) / 100.0;
      y = (+commands[++j]) / 100.0;
      s.addPoint(start.add(along.mul(x)).add(perp.mul(y * flip)));
    } else if (commands[j] === 'M') {
      s.setMove();
      x = base + (+commands[++j]) / 100.0;
      y = (+commands[++j]) / 100.0;
      s.addPoint(start.add(along.mul(x)).add(perp.mul(y * flip)));
    } else if (commands[j] === 'C') {
      s.setBezier();
      for (let k = 0; k < 3; k++) {
        x = base + (+commands[++j]) / 100.0;
        y = (+commands[++j]) / 100.0;
        s.addPoint(start.add(along.mul(x)).add(perp.mul(y * flip)));
      }
    }
    j++;
  }
  return s;
}

function makeSvgDrawer(svg, siz, align) {
  return function (i, src, s, flip) {
    return drawSvg(i, src, s, flip, svg, siz, align);
  };
}


// ═══════════════════════════════════════════════════════════════
//  END-SHAPE REGISTRATION
// ═══════════════════════════════════════════════════════════════

export function getExtraSpaceLeft(code) {
  const type = ShapeData.LeftEdges[code];
  return type ? type.space : 0.0;
}

function typeEntry(fn, space, mid) {
  return { fn, space, mid: mid / 100 };
}

/**
 * Register an end shape (like round brackets, chevrons, arrows).
 * Automatically creates the flipped variant if `flips` is true.
 */
export function setEnd(name, code, space, mid, flips, svg) {
  const fn1 = makeSvgDrawer(svg);
  const fn2 = (i, src, s) => fn1(i, src, s, -1);

  ShapeData.LeftEdges[name] = typeEntry(fn1, space, mid);
  if (flips) ShapeData.LeftEdges[name + 'Flip'] = typeEntry(fn2, -space, -mid);

  if (!code) return;

  const flipped = flippedCode(code);
  ShapeData.LeftEdges[code] = typeEntry(fn1, space, mid);
  if (flips) ShapeData.LeftEdges[flipped] = typeEntry(fn2, -space, -mid);
}

/** Register an in/out decoration (stems, pips). */
export function setInOut(name, svg, align, offset) {
  offset = offset || 18;
  ShapeData.InOuts[name] = typeEntry(makeSvgDrawer(svg, offset, align), 0, 0);
}

/** Register a bend-based in/out decoration. */
export function setInOutBend(name, svg) {
  ShapeData.InOuts[name] = typeEntry(makeSvgDrawer(svg), 0, 0);
}


// ── Built-in end codes (runs at module load) ─────────────────

function makeEndCodes() {
  const flips = true;
  const noflip = false;

  setEnd('round',      '(',    0.6,  100, flips, 'C 0 30 20 75 50 75 C 80 75 100 30 100 0');
  setEnd('dot',        '.',    0.0,    0, flips, 'M 40 0 L 60 0 M 100 0');
  setEnd('chevron',    '<',    0.4,  100, flips, 'L 50 70');
  setEnd('forward',    '/',    0.0,    0, flips, 'L 0 40 L 100 -40');
  setEnd('straight',   '[',    0.0,    0, noflip, '');
  setEnd('straight',   '|',    0.0,    0, noflip, '');
  setEnd('zigzag',     '\\+/+\\', -0.0, 0, flips, 'L 33 15 L 66 -15');
  setEnd('sway',       ')+(',  -0.0,   0, flips, 'C 30 60 60 -60 100 0');
  setEnd('arrow_head', '<=',    0.8, 150, noflip, 'L -20 0 L 50 150 L 120 0');
  setEnd('arrow_tail', '>=',    0.2,   0, noflip,
    'C 0 20 25 25 25 40 L 25 45 L -30 60 L -30 70 L 25 60 L 25 70 L -30 85 L -30 95 L 25 85 L 25 95 L -30 110 L -30 120 L 25 110 L 25 120 L -30 135 L -30 145 L 25 135 C 25 145 35 160 50 160 C 60 160 75 145 75 135 L 130 145 L 130 135 L 75 120 L 75 110 L 130 120 L 130 110 L 75 95 L 75 85 L 130 95 L 130 85 L 75 70 L 75 60 L 130 70 L 130 60 L 75 45 L 75 40 C 75 25 100 20 100 0');
  setEnd('snake_head', '', 0.6, noflip, 0,
    'C -13 16 -27 1 -39 19 C -90 77 -40 114 -40 160 C -33 258 15 182 28 160 L 61 51 L 79 89 C 71 156 63 190 37 204 C 9 210 12 237 -21 241 C 16 240 27 234 42 216 C 29 241 46 242 32 278 C 60 249 42 222 55 205 C 84 180 79 157 93 118 L 110 170 C 116 192 126 217 152 159 C 164 128 180 120 170 70 C 150 10 140 40 100 0');
  setEnd('snake_tail', '', 0.8, noflip, 0,
    'C 0 120 50 150 110 310 C 70 120 100 40 100 0');
  setEnd('warm_front', '', 0.1, flips, 50,
    'C 0 50 50 50 50 0 C 50 50 100 50 100 0');
  setEnd('cold_front', '', 0.1, flips, 45,
    'C 10 0 25 25 25 45 C 25 25 40 0 50 0 C 60 0 75 25 75 45 C 75 25 90 0 100 0');

  setInOut('InStem',  'L 0 0 L 0 100 L 50 30 L 100 100 L 100 0', 0);
  setInOut('OutStem', 'L 0 0 L 0 100 L 50 170 L 100 100 L 100 0', 1);
  setInOut('InPip',   'L 0 0 L 50 70 L 100 0', 0);
  setInOut('OutPip',  'L 0 0 L 50 70 L 100 0', 1);
}

makeEndCodes();


// ═══════════════════════════════════════════════════════════════
//  BOND HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Extract bond endpoint data with transform applied.
 * EXTERNAL: Vector2d, transformXy
 */
export function getBondData(bond, params, r) {
  let a = bond.a1;
  const v0 = Vector2d(a.x, a.y);
  const r0 = r || a.size || a.r;
  const l1 = a.level;

  a = bond.a2;
  let v1 = Vector2d(a.x, a.y);
  if (a.ast && a.ast.box) v1 = a.ast.box.midpoint();
  const r1 = r || a.size || a.r;
  const l2 = a.level;

  transformXy(v0, params);
  transformXy(v1, params);

  return [v0, v1, r0, r1, l1, l2];
}

/**
 * Build a taper object from a bond for line/label drawing.
 * EXTERNAL: parseLabelString, firstValid
 */
export function makeTaper(bond, params) {
  const taper = parseLabelString(bond.value || '--');
  taper.extensionLength = firstValid(params.lineExtend, -12);

  const r = bond.linkWidth || params.linkWidth;
  const [v0, v1, r0, r1, l1, l2] = getBondData(bond, params, r);

  taper.v0 = v0;
  taper.v1 = v1;
  taper.lineAt = { v0, v1, r0, r1 };

  const mid = v0.add(v1).mul(0.5);
  taper.textAt = { v0: mid, v1: mid, r0: 2, r1: 2 };

  taper.l1 = l1;
  taper.l2 = l2;
  taper.styled        = bond.styled;
  taper.label          = false;
  taper.bend           = bond.bend;
  taper.multiplicity   = bond.multiplicity;
  taper.hotspotColour  = bond.hotspotColour;
  taper.taperIs        = 'link';

  return taper;
}

/** Draw trampoline — wide line via taper. */
function drawWideLineTrampoline(ctx, obj, params) {
  const taper = makeTaper(obj, params);
  drawLineLabelAndText(ctx, taper, params);
}

/** Draw trampoline — narrow line (same path, different label handling). */
function drawNarrowLineTrampoline(ctx, obj, params) {
  const taper = makeTaper(obj, params);
  drawLineLabelAndText(ctx, taper, params);
}

/** Register link-type draw functions. */
function makeLinkStyles() {
  ShapeData.LinkTypes['Wide']   = drawNarrowLineTrampoline;
  ShapeData.LinkTypes['Narrow'] = drawNarrowLineTrampoline;
}

makeLinkStyles();

/**
 * Draw a bond using the registered link type.
 */
export function drawBond(ctx, obj, params) {
  const key = params.defaultLinkType;
  const fn = ShapeData.LinkTypes[key];
  if (fn) fn(ctx, obj, params);
}


// ═══════════════════════════════════════════════════════════════
//  SHAPE CLASS
// ═══════════════════════════════════════════════════════════════

export class Shape {

  constructor() {
    this.offset   = new Vector2d(0, 0);
    this.points   = [];
    this.edges    = [];
    this.commands = [];
  }

  // ── Point / edge manipulation ──────────────────────────

  addPoint(x, y) {
    if (x instanceof Vector2d) this.points.push(x);
    else this.points.push(new Vector2d(x, y));
  }

  addPoints(...items) {
    if (items[0] instanceof Vector2d) {
      for (const item of items) this.points.push(item);
    } else {
      for (let i = 0; i < items.length; i += 2) {
        this.addPoint(items[i], items[i + 1]);
      }
    }
  }

  addEdge(code, value) {
    this.edges.push({ code: code || 'straight', value: value || 0 });
  }

  addEdges(...codes) {
    for (const item of codes) this.addEdge(item || 'straight');
  }

  dropLastPoint() { this.points.pop(); }

  setPoint(i, v) {
    i = (i + this.points.length) % this.points.length;
    this.points[i] = v;
  }

  setBezier() { this.commands[this.points.length] = 'C'; }
  setMove()   { this.commands[this.points.length] = 'M'; }

  getPoint(i) {
    i = (i + this.points.length) % this.points.length;
    return this.points[i].add(this.offset);
  }

  getEdge(i) {
    if (this.edges.length < 1) return 'straight';
    i = (i + this.edges.length) % this.edges.length;
    return this.edges[i];
  }

  // ── Drawing ────────────────────────────────────────────

  finishDraw(ctx, style) {
    if (style.gradient) {
      if (!Array.isArray(style.gradient)) {
        const grd = ctx.createLinearGradient(0, 0, 170, 0);
        grd.addColorStop(0, '#000');
        grd.addColorStop(1, '#bbb');
        ctx.fillStyle = grd;
      }
      ctx.fill();
    } else if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fill();
    }
    if (style.outline) {
      ctx.strokeStyle = style.outline;
      ctx.lineWidth   = style.lineWidth;
      ctx.stroke();
    }
  }

  draw(ctx, style) {
    style = style || TileStyles.green;
    this.drawInner(ctx, style);
    if (!style.pathWithEnds) ctx.closePath();
    this.finishDraw(ctx, style);

    if (this.bend) return;
    if (!style.sheen) return;
    const style2 = { outline: style.sheen || '#ff0', width: style.width };
    this.drawInner(ctx, style2, true);
    this.finishDraw(ctx, style2);
  }

  drawInner(ctx, style, sheening) {
    ctx.beginPath();
    const l = this.points.length + (style.pathWithEnds ? 0 : 1);
    let pOld;

    for (let i = 0; i < l; i++) {
      let p = this.getPoint(i);
      const c = this.commands[i];
      let skip = (i === 0);
      let r, q;

      if (c === 'C') {
        r = p;
        q = this.getPoint(++i);
        p = this.getPoint(++i);
      }

      skip = skip || (sheening && !this.isSheened(p, pOld));

      if (skip) {
        ctx.moveTo(p.x, p.y);
      } else if (c === 'C') {
        ctx.bezierCurveTo(r.x, r.y, q.x, q.y, p.x, p.y);
      } else if (c === 'M') {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
      pOld = p;
    }
  }

  drawBendy(ctx, style) {
    style = style || TileStyles.green;
    const multipliers = [0.0001, 2, 0.0001, -2];
    ctx.beginPath();
    let pPrev;
    for (let i = 0; i < this.points.length + 1; i++) {
      const p = this.getPoint(i);
      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        const f = this.bend / 100;
        const v = p.sub(pPrev);
        const vPerp = v.perp((multipliers[i % 4] * f) * 0.3);
        const v0 = pPrev.add(v.mul(0.3)).add(vPerp);
        const v1 = p.sub(v.mul(0.3)).add(vPerp);
        ctx.bezierCurveTo(v0.x, v0.y, v1.x, v1.y, p.x, p.y);
      }
      pPrev = p;
    }
  }

  drawPolar(ctx, style, at) {
    style = style || TileStyles.green;
    const p = Vector2d(0, 0);
    let q = Vector2d(0, 0);
    ctx.beginPath();
    for (let i = 0; i < this.points.length + 1; i++) {
      const loc = this.getPoint(i);
      p.x = loc.y * Math.cos(loc.x) + at.x;
      p.y = loc.y * Math.sin(loc.x) + at.y;

      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else if (Math.abs(loc.y - q.y) < 0.1) {
        ctx.arc(at.x, at.y, loc.y, q.x, loc.x, loc.x < q.x);
      } else {
        ctx.lineTo(p.x, p.y);
      }
      q = loc;
    }
    ctx.closePath();
    this.finishDraw(ctx, style);
  }

  // ── Geometry operations ────────────────────────────────

  isSheened(p0, p1) {
    const v = p1.sub(p0);
    return v.x === v.y ? v.x < -v.y : v.x < v.y;
  }

  /** Interleave points from this and another shape. */
  merge(poly) {
    const s = new Shape();
    for (let i = 0; i < this.points.length; i++) {
      s.addPoint(this.getPoint(i));
      s.addPoint(poly.getPoint(i));
    }
    return s;
  }

  /** Remove collinear intermediate points. */
  reduce() {
    const s = new Shape();
    const l = this.points.length;
    let pOld = this.getPoint(l - 1);
    let v;

    for (let i = 0; i < this.points.length + 1; i++) {
      const p = this.getPoint(i);
      if (i === 0) {
        s.addPoint(p);
      } else if (this.commands[i]) {
        const j = s.points.length;
        s.commands[j] = this.commands[i];
        const q = this.getPoint(++i);
        const r = this.getPoint(++i);
        s.addPoint(p);
        s.addPoint(q);
        s.addPoint(r);
        pOld = undefined;
      } else {
        if (v) {
          if (Math.abs(pOld.sub(v).dot(p.sub(pOld).perp())) < 0.01) {
            s.points.pop();
            pOld = undefined;
            if (s.points.length) pOld = s.points[s.points.length - 1];
          }
        }
        if (i < this.points.length) s.addPoint(p);
      }
      v = pOld;
      pOld = p;
    }
    return s;
  }

  /** Bevel right-angle corners. */
  bevelCorners(bevelAmount) {
    const s = new Shape();
    const l = this.points.length;
    let v    = this.getPoint(l - 2);
    let pOld = this.getPoint(l - 1);
    let lastPoint;

    for (let i = 0; i < this.points.length; i++) {
      const p = this.getPoint(i);
      if (this.commands[i]) {
        const j = s.points.length;
        s.commands[j] = this.commands[i];
        const q = this.getPoint(++i);
        const r = this.getPoint(++i);
        s.addPoint(p); s.addPoint(q); s.addPoint(r);
        pOld = undefined;
      } else {
        if (v) {
          const a = pOld.sub(v);
          const b = p.sub(pOld);
          let doBevel = Math.abs(a.dot(b)) < 0.01;
          doBevel = doBevel && a.length() > bevelAmount * 2;
          doBevel = doBevel && b.length() > bevelAmount * 2;
          if (doBevel) {
            const aN = a.normalized(bevelAmount);
            const bN = b.normalized(bevelAmount);
            if (i === 0) lastPoint = pOld.sub(aN);
            else s.setPoint(-1, pOld.sub(aN));
            s.addPoint(pOld.add(bN));
          }
        }
        if (i < this.points.length) s.addPoint(p);
      }
      v = pOld;
      pOld = p;
    }
    if (lastPoint) s.setPoint(-1, lastPoint);
    return s;
  }

  // ── Wart (edge decoration) application ─────────────────

  getWartFn(wartList, i) {
    const code = wartList.getEdge(i).code;
    const edge = ShapeData.LeftEdges[code] || ShapeData.InOuts[code];
    return edge?.fn;
  }

  addWarts(wartList, scaling) {
    let s = new Shape();
    this.scaling = scaling || 1.0;
    for (let i = 0; i < this.points.length; i++) {
      const fn = this.getWartFn(wartList, i);
      if (fn) s = fn(i, this, s);
      else    s.addPoint(this.getPoint(i));
    }
    return s;
  }

  // ── Factory methods ────────────────────────────────────

  makePolygon(r, nSides, phase) {
    phase = phase || 0;
    const s = new Shape();
    for (let i = 0; i < nSides; i++) {
      const theta = (2 * Math.PI) * (phase + i / nSides);
      s.addPoint(r * Math.cos(theta), r * Math.sin(theta));
    }
    s.offset = Vector2d(110, 110);
    return s;
  }

  makeStar(r1, r2, nSides) {
    const s = this.makePolygon(r1, nSides, 0);
    const t = this.makePolygon(r2, nSides, 0.5 / nSides);
    return s.merge(t);
  }
}
