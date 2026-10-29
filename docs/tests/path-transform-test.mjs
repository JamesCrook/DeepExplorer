// PathTransform test: mapRect against cornersAt/edgeBends for every path type; toScreen/toLocal round trips
//
//   node docs/tests/path-transform-test.mjs
//
// For each path type (linear, arc, arc with a segment gap, sector, grid,
// linear-arc blend, sector blend, a blend of blends) under three parents
// (none, identity Transform, and translate + uniform scale + rotation), over
// a grid of t intervals:
//   mapRect(t0·L, −c/2, t1·L, +c/2)  ==  parent(path.cornersAt(t0, t1)), bends == path.edgeBends(t0, t1)
//   the neighbourliness trapezoid via mapQuad == cornersAt(t0, t1, t0A, t1A)
//   toLocal(toScreen(p)) == p, for paths whose inverse is exact (linear, arc,
//   sector along the spine), and within tolerance for blends
// Also: the affine Transform's new interface (frameAt, mapRect, localBounds,
// ctxMatrix) against toScreen.  Exit status 1 on any failure.

const js = new URL('../../website/js/', import.meta.url).href;
globalThis.window ??= { devicePixelRatio: 1 };
const { Vector2D } = await import(js + '2d-support/vector2d.js');
const P = await import(js + '2d-support/path.js');
const { PathTransform, blendedTransform } = await import(js + '2d-support/path-transform.js');
const { Transform } = await import(js + 'omni-support/transform.js');

let fails = 0, checks = 0;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
function check(ok, what) { checks++; if (!ok) { fails++; if (fails <= 25) console.log('FAIL', what); } }

const o = new Vector2D(100, 80);
const paths = {
  linear:      P.LinearPath.makePath(o, 0.3, 400, 60),
  arc:         P.ArcPath.makePath(o, 0.3, 400, 60, 2.2),
  arcGap:      P.ArcPath.makePath(o, 0.3, 400, 60, 4.5, 12),
  sector:      P.SectorPath.makePath(o, 0.3, 300, 0, 40, 0.4),
  grid:        P.GridPath.makePath(o, 0.2, 400, 50, 3, 300, 7),
  blendLA:     new P.BlendedPath(P.LinearPath.makePath(o, 0.3, 400, 60), P.ArcPath.makePath(o, 0.3, 400, 60, 3.0), 0.4),
  blendLS:     new P.BlendedPath(P.LinearPath.makePath(o, 0.3, 300, 60), P.SectorPath.makePath(o, 0.3, 300, 0, 40, 0.4), 0.6),
};
paths.blendOfBlends = new P.BlendedPath(paths.blendLA, P.ArcPath.makePath(o, 1.0, 400, 60, 6.0), 0.5);

const parents = {
  none:     null,
  identity: new Transform({ x: 0, y: 0 }, 1, 1),
  similar:  new Transform({ x: 37, y: -12 }, 1.7, 1.7, 0.4),
};

for (const [pname, path] of Object.entries(paths)) {
  for (const [qname, parent] of Object.entries(parents)) {
    const L = 500, C = path.crossSize || 60;
    const T = new PathTransform(path, parent, { length: L, cross: C });
    const up = v => parent ? parent.toScreen(v) : v;
    for (let i = 0; i < 6; i++) for (let j = i + 1; j <= 6; j++) {
      const t0 = i / 6 - 0.1, t1 = j / 6 + 0.05;
      const { corners, bends } = T.mapRect(t0 * L, -C / 2, t1 * L, C / 2);
      const ref = path.cornersAt(t0, t1).map(up), rb = path.edgeBends(t0, t1);
      for (let k = 0; k < 4; k++)
        check(near(corners[k].x, ref[k].x) && near(corners[k].y, ref[k].y), `${pname}/${qname} corner ${k} t ${t0.toFixed(2)}..${t1.toFixed(2)}`);
      for (let k = 0; k < 4; k++) check(near(bends[k], rb[k]), `${pname}/${qname} bend ${k}`);
      const t0A = t0 + 0.03, t1A = t1 - 0.02;
      const tz = T.mapQuad({ x: t0 * L, y: -C / 2 }, { x: t0A * L, y: C / 2 }, { x: t1A * L, y: C / 2 }, { x: t1 * L, y: -C / 2 });
      const rz = path.cornersAt(t0, t1, t0A, t1A).map(up);
      for (let k = 0; k < 4; k++)
        check(near(tz.corners[k].x, rz[k].x) && near(tz.corners[k].y, rz[k].y), `${pname}/${qname} trapezoid corner ${k}`);
    }
    // Round trips along the spine (y = 0) and across.
    const exact = ['linear', 'arc', 'sector'].includes(pname);
    const tol = exact ? 1e-6 : 0.02;
    if (pname === 'grid' || pname === 'arcGap') continue;     // grid folds; a gap shifts ends
    T._hint = null;
    for (let i = 1; i < 10; i++) {
      for (const yf of exact && pname !== 'sector' ? [-0.4, 0, 0.3] : [0]) {
        const p = { x: i / 10 * L, y: yf * C };
        const back = T.toLocal(T.toScreen(p));
        check(near(back.x, p.x, tol) && Math.abs(back.y - p.y) <= tol * C + 1e-6,
          `${pname}/${qname} round trip (${p.x.toFixed(0)}, ${p.y.toFixed(1)}) -> (${back.x.toFixed(2)}, ${back.y.toFixed(2)})`);
      }
    }
  }
}

// A blended transform equals a PathTransform over the BlendedPath.
{
  const A = new PathTransform(paths.linear, parents.similar, { length: 500 });
  const B = new PathTransform(paths.arc, parents.similar, { length: 500 });
  const M = blendedTransform(A, B, 0.35);
  const R = new PathTransform(new P.BlendedPath(paths.linear, paths.arc, 0.35), parents.similar, { length: 500 });
  const a = M.mapRect(50, -30, 200, 30).corners, b = R.mapRect(50, -30, 200, 30).corners;
  for (let k = 0; k < 4; k++) check(near(a[k].x, b[k].x) && near(a[k].y, b[k].y), `blendedTransform corner ${k}`);
}

// Scale and angle: a linear path under a similarity parent has scale 1.7 and angle rot + path angle.
{
  const T = new PathTransform(paths.linear, parents.similar, { length: 400, cross: 60 });
  check(near(T.scaleAt({ x: 100, y: 0 }), 1.7, 1e-6), `linear scaleAt ${T.scaleAt({ x: 100, y: 0 })}`);
  check(near(T.angleAt({ x: 100, y: 0 }), 0.3 + 0.4, 1e-6), `linear angleAt ${T.angleAt({ x: 100, y: 0 })}`);
  const arcT = new PathTransform(paths.arc, null, { length: paths.arc.length, cross: 60 });
  const s0 = arcT.scaleAt({ x: 100, y: -30 }), s1 = arcT.scaleAt({ x: 100, y: 30 });
  check(s0 > 1 !== s1 > 1 || s0 !== s1, `arc scale differs across the band (${s0.toFixed(3)} vs ${s1.toFixed(3)})`);
}

// The affine Transform's interface.
{
  const T = new Transform({ x: 10, y: 20 }, 2, 3, 0.5);
  const f = T.frameAt({ x: 1, y: 1 });
  const a = T.toScreen({ x: 1, y: 1 }), b = T.toScreen({ x: 2, y: 1 }), c = T.toScreen({ x: 1, y: 2 });
  check(near(f.ex.x, b.x - a.x) && near(f.ex.y, b.y - a.y) && near(f.ey.x, c.x - a.x) && near(f.ey.y, c.y - a.y), 'affine frameAt');
  const r = T.mapRect(0, 0, 4, 5).corners, want = [[0, 0], [0, 5], [4, 5], [4, 0]].map(([x, y]) => T.toScreen({ x, y }));
  for (let k = 0; k < 4; k++) check(near(r[k].x, want[k].x) && near(r[k].y, want[k].y), `affine mapRect corner ${k}`);
  const [m0, m1, m2, m3, m4, m5] = T.ctxMatrix(), p = { x: 3, y: -2 }, q = T.toScreen(p);
  check(near(m0 * p.x + m2 * p.y + m4, q.x) && near(m1 * p.x + m3 * p.y + m5, q.y), 'affine ctxMatrix');
  const lb = new Transform({ x: 100, y: 50 }, 2, 2).localBounds({ x: 100, y: 50, w: 200, h: 100 });
  check(near(lb.x0, 0) && near(lb.x1, 100) && near(lb.y0, 0) && near(lb.y1, 50), 'affine localBounds');
  const pin = new Transform({ x: 100, y: 50 }, 2, 2).pinned('y', 7);
  check(pin.origin.x === 100 && pin.origin.y === 7, 'affine pinned');
}

console.log(`${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
