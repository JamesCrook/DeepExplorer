// Content hit-testing inside frames (A-style children, such as chart cells).
//
//   node docs/tests/content-hit-test.mjs
//
// A probe node is drawn and hit-tested the way chart cells are: it reads
// ctxMix.hitPoint in its own local coordinates and drags in local units.
// During draw2d it records where it is actually drawn (T maps local to
// screen and matches the canvas transforms).  The test checks that the hit
// region is centred on the drawn position, and that a drag moves the drawn
// position by exactly the pointer movement.
//
// Cases: a handle-frame scaling a box (the chart addable) whose aspect
// matches the content's natural 800x600, and one whose aspect does not.

const W = 800, H = 600, STEP = 2, D = { x: 37, y: 23 };
const js = new URL('../../website/js/', import.meta.url).href;
globalThis.window ??= { devicePixelRatio: 1 };
const deep = new Proxy(function () {}, { get: (t, p) => (p === 'then' || typeof p === 'symbol') ? undefined : deep, apply: () => deep });
const fakeCtx = new Proxy({ canvas: { width: W, height: H } }, { get: (t, p) => (p in t ? t[p] : deep) });

const { SYS, sceneRegistry } = await import(js + 'omni-support/sys.js');
const { Values } = await import(js + 'omni-support/values.js');
for (const f of ['nodes2d/omni-scene-nodes.js', 'nodes2d/sizing-nodes.js', 'nodes2d/handle-frame-node.js', 'nodes2d/drag-point-node.js']) await import(js + f);

class LocalPoint {                       // A-style: local coordinates, like a chart cell
  static draw2d(ctxMix, node) { node._drawnAt = ctxMix.T.toScreen({ x: node.value.x, y: node.value.y }); }
  static hit_test(ctxMix, node) {
    const p = ctxMix.hitPoint, v = node.value;
    if ((p.x - v.x) ** 2 + (p.y - v.y) ** 2 > 30 ** 2) return;
    const ox = p.x - v.x, oy = p.y - v.y;
    ctxMix.hitResult = { node, interactions: { applyDrag(x, y) { v.x = x - ox; v.y = y - oy; } } };
  }
}
SYS.NODE_CLASSES.push({ name: 'local-point', cls: LocalPoint });
const mk = (type, value, subtree = []) => Object.assign(SYS.makeNode(type, value, subtree), { token: type });

const build = (zoom, x0, y0, x1, y1) => {
  const pt = mk('local-point', { x: 500, y: 200 });                  // in the box's 800x600 natural space
  const hf = mk('handle-frame', { draggable: false }, [mk('drag-point', { x: x0, y: y0 }), mk('drag-point', { x: x1, y: y1 }), mk('box', {}, [pt])]);
  const root = mk('scene-root', {}, [mk('layer', { center: true, params: { zoom } }, [hf])]);
  return { root, pt };
};
const walk = (root, phases, extra = {}) => { const c = { ...Values, ctx: fakeCtx, iterators: [], flyweight: {}, ...extra }; sceneRegistry.runPhases(c, root, {}, phases); return c; };
const draw = (root) => walk(root, ['measure', 'layout', 'draw2d']);
const hitAt = (root, x, y) => walk(root, ['hit_test'], { hitPoint: { x, y }, hitResult: null }).hitResult;

const rows = [];
for (const [label, frame] of [['4:3 frame (matches 800x600)', [-200, -150, 200, 150]], ['square frame', [-150, -150, 150, 150]], ['wide frame', [-250, -80, 250, 80]]])
  for (const zoom of [1, 2]) {
    const { root, pt } = build(zoom, ...frame);
    draw(root); const drawn = { ...pt._drawnAt };
    let n = 0, sx = 0, sy = 0;
    for (let y = 0; y < H; y += STEP) for (let x = 0; x < W; x += STEP) if (hitAt(root, x, y)?.node === pt) { n++; sx += x; sy += y; }
    if (!n) { rows.push({ case: label, zoom, result: 'NOT HIT' }); continue; }
    const hc = { x: sx / n, y: sy / n };
    const offset = { x: +(hc.x - drawn.x).toFixed(1), y: +(hc.y - drawn.y).toFixed(1) };
    const hit = hitAt(root, Math.round(drawn.x), Math.round(drawn.y));
    let moved = null;
    if (hit?.node === pt) { hit.interactions.applyDrag(Math.round(drawn.x) + D.x, Math.round(drawn.y) + D.y); draw(root); moved = { x: +(pt._drawnAt.x - drawn.x).toFixed(1), y: +(pt._drawnAt.y - drawn.y).toFixed(1) }; }
    const ok = Math.abs(offset.x) <= STEP && Math.abs(offset.y) <= STEP && moved && Math.abs(moved.x - D.x) <= 1 && Math.abs(moved.y - D.y) <= 1;
    rows.push({ case: label, zoom, 'hit centre − drawn': `${offset.x},${offset.y}`, 'drag moved': moved ? `${moved.x},${moved.y}` : 'no hit at drawn point', expected: `0,0 / ${D.x},${D.y}`, result: ok ? 'ok' : 'WRONG' });
  }
console.table(rows);
process.exitCode = rows.every(r => r.result === 'ok') ? 0 : 1;
