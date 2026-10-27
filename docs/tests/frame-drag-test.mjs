// Nested-frame drag test (FR0 in docs/twin-merge-plan.md).
//
//   node docs/tests/frame-drag-test.mjs omni-stamp     stamp-frame in stamp-frame in stamp-frame
//   node docs/tests/frame-drag-test.mjs omni-handle    handle-frame ×3 (corners are drag-points)
//   node docs/tests/frame-drag-test.mjs omni-mixed     stamp-frame + drag-point as handle-frame content
//   node docs/tests/frame-drag-test.mjs zones          frame-node ×3 under a pane-camera
//
// Convention-neutral: a frame's on-screen box is measured by probing a grid
// of screen points with the real hit_test walk and keeping the points where
// that frame is the topmost hit.  The test grabs the box centre, calls the
// real applyDrag with the pointer moved by D (as the page's mousemove does),
// re-measures, and expects the box to have moved by exactly D.  It runs at
// each nesting depth, at zoom 1 and zoom 2.  For zones, rows 4-5 are a drag-point
// inside the innermost frame and a later sibling frame.  No DOM or three.js needed.

const W = 800, H = 600, STEP = 2, D = { x: 37, y: 23 };
const kind = process.argv[2] || 'omni-stamp';
const js = new URL('../../website/js/', import.meta.url).href;

globalThis.window ??= { devicePixelRatio: 1 };
const deep = new Proxy(function () {}, { get: (t, p) => (p === 'then' || typeof p === 'symbol') ? undefined : deep, apply: () => deep });
const fakeCtx = new Proxy({ canvas: { width: W, height: H } }, { get: (t, p) => (p in t ? t[p] : deep) });

const { SYS, sceneRegistry } = await import(js + 'omni-support/sys.js');
const { Values } = await import(js + 'omni-support/values.js');
// Omni scenes are MiniAstNodes, which carry token = type (handle-frame tests child.token)
const mk = (type, value, subtree = []) => Object.assign(SYS.makeNode(type, value, subtree), { token: type });

let build, hitWalk;
if (kind.startsWith('omni')) {
  await import(js + 'nodes2d/omni-scene-nodes.js');      // scene-root, layer
  await import(js + 'nodes2d/frame-node.js');            // stamp-frame
  await import(js + 'nodes2d/handle-frame-node.js');     // handle-frame
  await import(js + 'nodes2d/drag-point-node.js');       // drag-point (Omni)
  // as omni-2d.js builds the hit ctxMix
  hitWalk = (root, x, y) => {
    const c = { ...Values, ctx: fakeCtx, hitPoint: { x, y }, hitResult: null, iterators: [], flyweight: {} };
    sceneRegistry.runPhases(c, root, {}, ['hit_test']);
    return c.hitResult;
  };
  build = (zoom) => {
    if (kind === 'omni-stamp') {
      const c = mk('stamp-frame', { x: 40, y: 20, width: 60, height: 40 }, [mk('test-content', {})]);
      const b = mk('stamp-frame', { x: 30, y: 10, width: 160, height: 110 }, [c]);
      const a = mk('stamp-frame', { x: -20, y: 0, width: 300, height: 220 }, [b]);
      const layer = mk('layer', { center: true, params: { zoom } }, [a]);
      return { root: mk('scene-root', {}, [layer]), targets: [a, b, c] };
    }
    if (kind === 'omni-mixed') {
      // conventions mixed: a stamp-frame (T-based) holding a drag-point, as content of a handle-frame
      const dp = mk('drag-point', { x: 15, y: 10 });
      const st = mk('stamp-frame', { x: 120, y: 80, width: 90, height: 60 }, [dp]);
      const a = mk('handle-frame', { draggable: true, stretchContent: true }, [mk('drag-point', { x: -150, y: -110 }), mk('drag-point', { x: 150, y: 110 }), st]);
      const layer = mk('layer', { center: true, params: { zoom } }, [a]);
      return { root: mk('scene-root', {}, [layer]), targets: [a, st, dp] };
    }
    // handle-frame: two drag-point corners, then content (stretchContent: no scaling)
    const hf = (x0, y0, x1, y1, inner) => mk('handle-frame', { draggable: true, stretchContent: true },
      [mk('drag-point', { x: x0, y: y0 }), mk('drag-point', { x: x1, y: y1 }), ...(inner ? [inner] : [])]);
    const c = hf(30, 20, 90, 60);
    const b = hf(20, 20, 200, 140, c);
    const a = hf(-150, -110, 150, 110, b);
    const layer = mk('layer', { center: true, params: { zoom } }, [a]);
    // rows 4-6: the top-left corner drag-point of the outer, middle and inner frame
    return { root: mk('scene-root', {}, [layer]), targets: [a, b, c, a.subtree[0], b.subtree[0], c.subtree[0]] };
  };
} else {
  await import(js + 'nodes2d/pane-camera-node.js');
  await import(js + 'nodes2d/frame-node-zones.js');      // frame-node
  await import(js + 'nodes2d/drag-point-node-zones.js'); // drag-point (Zones), content inside frames
  // as demo-harness2-d.js builds its ctxMix (camera at identity origin, zoom z)
  let camZoom = 1;
  hitWalk = (root, x, y) => {
    const c = { ...Values, ctx: fakeCtx, iterators: [], state: { index: 0, pass: 0 },
      getWH: () => ({ W, H, Z: camZoom, ox: 0, oy: 0 }), viewport: { x: 0, y: 0, w: W / camZoom, h: H / camZoom },
      W, H, hitPoint: { x, y }, hitResult: null };
    sceneRegistry.walkPhase(c, 'hit_test', root, {});
    return c.hitResult;
  };
  build = (zoom) => {
    camZoom = zoom;
    const fr = (x, y, cw, ch, kids = []) => mk('frame-node', { x, y, cw, ch, padding: 10, resizeMode: null }, kids);
    const p = mk('drag-point', { x: -20, y: 0, r: 6 });        // content child, frame-local coords
    const c = fr(30, 15, 50, 30, [p]);
    const b = fr(40, 30, 160, 110, [c]);
    const a = fr(170, 150, 300, 220, [b]);
    const sib = fr(355, 60, 10, 10, [mk('test-content', { x: 0, y: 0 })]);   // later sibling frame
    return { root: mk('pane-camera', { zoom, centerOrigin: false, scrollX: 0, scrollY: 0 }, [a, sib]), targets: [a, b, c, p, sib] };
  };
}

function measure(root, target) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const pts = [];
  for (let y = 0; y < H; y += STEP) for (let x = 0; x < W; x += STEP) {
    if (hitWalk(root, x, y)?.node === target) { pts.push([x, y]); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (!pts.length) return null;
  // grab where the target itself is topmost: the hit point nearest the box centre
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let g = pts[0], best = Infinity;
  for (const p of pts) { const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2; if (d < best) { best = d; g = p; } }
  return { x0, y0, x1, y1, cx, cy, gx: g[0], gy: g[1] };
}

// A childless container-pattern frame: is it reachable at all?  (Not meaningful
// for handle-frame, whose two corner children define the frame.)
if (kind !== 'omni-handle' && kind !== 'omni-mixed') {
  const lone = build(1);
  const t = lone.targets[2]; t.subtree.length = 0;
  console.log('childless innermost frame hit anywhere:', measure(lone.root, t) ? 'yes' : 'NO (an empty container got no before_/after_ hooks)');
}

const rows = [];
for (const zoom of [1, 2]) for (let depth = 0; depth < build(1).targets.length; depth++) {
  const { root, targets } = build(zoom);
  const t = targets[depth];
  const before = measure(root, t);
  if (!before) { rows.push({ zoom, depth: depth + 1, result: 'NOT HIT' }); continue; }
  const hit = hitWalk(root, before.gx, before.gy);
  if (hit?.node !== t || !hit.interactions?.applyDrag) { rows.push({ zoom, depth: depth + 1, result: 'no drag on target' }); continue; }
  const v0 = { x: t.value.x, y: t.value.y };
  hit.interactions.applyDrag(before.gx + D.x, before.gy + D.y);
  if (process.env.DEBUG) console.log({ zoom, depth: depth + 1, grab: [before.gx, before.gy], box: [before.x0, before.y0, before.x1, before.y1], value: [v0, { x: t.value.x, y: t.value.y }] });
  const after = measure(root, t);
  const moved = after ? { x: after.cx - before.cx, y: after.cy - before.cy } : null;
  const ok = moved && Math.abs(moved.x - D.x) <= STEP && Math.abs(moved.y - D.y) <= STEP;
  rows.push({ zoom, depth: depth + 1, moved: moved ? `${moved.x},${moved.y}` : 'lost', expected: `${D.x},${D.y}`, result: ok ? 'ok' : 'WRONG' });
}
console.log(kind);
console.table(rows);
process.exitCode = rows.every(r => r.result === 'ok') ? 0 : 1;
