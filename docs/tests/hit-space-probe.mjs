// Hit-space probe: under each container combination, does ctxMix.hitPoint agree with T?
//
//   node docs/tests/hit-space-probe.mjs
//
// A probe node records, during hit_test, ctxMix.hitPoint and T.toLocal(screenHitPoint).
// AGREE: an A-style node (local hitPoint) and a T-based node see the same space.
// DIFFER where the container leaves hitPoint in screen space is expected and fine:
// T-based nodes compare with screenHitPoint.  Use it to check a new container.
globalThis.window = { devicePixelRatio: 1 };
const js = new URL('../../website/js/', import.meta.url).href;
const deep = new Proxy(function () {}, { get: (t, p) => (p === 'then' || typeof p === 'symbol') ? undefined : deep, apply: () => deep });
const W = 800, H = 600;
const fakeCtx = new Proxy({ canvas: { width: W, height: H }, measureText: () => ({ width: 10 }) }, { get: (t, p) => p in t ? t[p] : deep });
const { SYS, sceneRegistry } = await import(js + 'omni-support/sys.js'); const { Values } = await import(js + 'omni-support/values.js');
for (const f of ['nodes2d/omni-scene-nodes.js', 'nodes2d/sizing-nodes.js', 'nodes2d/handle-frame-node.js', 'nodes2d/drag-point-node.js']) await import(js + f);
const seen = [];
class Probe {
  static hit_test(ctxMix) { const s = ctxMix.screenHitPoint, T = ctxMix.T; seen.push({ hp: { ...ctxMix.hitPoint }, tl: T.toLocal(s) }); }
  static measure(ctxMix, node) { node.box = { width: () => 400, height: () => 300 }; }   // natural size for a scaling handle-frame
}
SYS.NODE_CLASSES.push({ name: 'probe', cls: Probe });
const mk = (type, value, subtree = []) => Object.assign(SYS.makeNode(type, value, subtree), { token: type });
const hf = (x0, y0, x1, y1, content, stretch = true) => mk('handle-frame', { draggable: true, stretchContent: stretch }, [mk('drag-point', { x: x0, y: y0 }), mk('drag-point', { x: x1, y: y1 }), content]);
const scenes = {
  'layer(centred)': (z) => mk('layer', { center: true, params: { zoom: z } }, [mk('probe', {})]),
  'layer > zoom-pan > frame': (z) => mk('layer', { params: { zoom: z, panX: 40, panY: 25 } }, [mk('zoom-pan', {}, [mk('frame', {}, [mk('probe', {})])])]),
  'layer(c) > uncenter': (z) => mk('layer', { center: true, params: { zoom: z, panX: 15, panY: 5 } }, [mk('uncenter', {}, [mk('probe', {})])]),
  'layer(c) > handle-frame(stretch)': (z) => mk('layer', { center: true, params: { zoom: z } }, [hf(-150, -100, 150, 100, mk('probe', {}))]),
  'layer(c) > handle-frame(scaled) > box': (z) => mk('layer', { center: true, params: { zoom: z } }, [hf(-150, -100, 150, 100, mk('box', {}, [mk('probe', {})]), false)]),
  'layer(c) > handle-frame > handle-frame': (z) => mk('layer', { center: true, params: { zoom: z } }, [hf(-150, -100, 150, 100, hf(20, 20, 200, 140, mk('probe', {})))]),
};
for (const [name, make] of Object.entries(scenes)) for (const z of [1, 2]) {
  const root = mk('scene-root', {}, [make(z)]);
  const c0 = { ...Values, ctx: fakeCtx, iterators: [], flyweight: {} };
  sceneRegistry.runPhases(c0, root, {}, ['measure', 'layout']);          // handle-frame needs measure for natural size
  seen.length = 0;
  const c = { ...Values, ctx: fakeCtx, hitPoint: { x: 431, y: 287 }, hitResult: null, iterators: [], flyweight: {} };
  sceneRegistry.runPhases(c, root, {}, ['hit_test']);
  const s = seen[0];
  if (!s) { console.log(`${name.padEnd(40)} z${z}  probe not reached`); continue; }
  const agree = Math.abs(s.hp.x - s.tl.x) < 1e-6 && Math.abs(s.hp.y - s.tl.y) < 1e-6;
  console.log(`${name.padEnd(40)} z${z}  hitPoint (${s.hp.x.toFixed(1)}, ${s.hp.y.toFixed(1)})  T.toLocal (${s.tl.x.toFixed(1)}, ${s.tl.y.toFixed(1)})  ${agree ? 'AGREE' : 'DIFFER'}`);
}
