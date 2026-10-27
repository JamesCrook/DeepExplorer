# Plan: merge the Omni / Zones twin node pairs

Status: plan, 27 Oct 2026, written against commit `0348426`. Nothing here has been run yet.

## Why

Two families of node files never load on the same page:

- **Omni:** `html/omni-scene.html`, `deep-wiki/d-plus.html`, `html/molam.html`.
- **Zones:** `demos/*.html`, including `panopticon.html`; these came from the multi-zone stand-alone.

Seven concepts exist in both as separate classes with the same class name. They drifted because nothing forced them to agree. Type names are one registry namespace (`scene.js`), so the pairs would collide the day one page loads both.

| Class | Omni file → type | Zones file → type |
|---|---|---|
| `MolamBondNode` | `nodes3d/molam-bond-node.js` → `molam-bonds` | `nodes3d/molam-bond-node-zones.js` → `molam-bond` |
| `GroundPlaneNode` | `nodes3d/ground-plane-node.js` → `ground-plane` | `nodes3d/ground-plane-node-zones.js` → `ground-plane` |
| `PlanetNode` | `nodes3d/planet-node.js` → `planet` (not loaded) | `nodes3d/planet-node-zones.js` → `planet-node` |
| `ImposterAtomNode` | `nodes3d/imposter-atom-node.js` → `imposter-atoms` | `nodes3d/imposter-atom-node-zones.js` → `imposter-atom` |
| `DragPointNode` | `nodes2d/drag-point-node.js` → `drag-point` | `nodes2d/drag-point-node-zones.js` → `drag-point` |
| `ButtonNode` | `nodes2d/button-node.js` → `button-node` | `nodes2d/button-node-zones.js` → `button-node` |
| `FrameNode` | `nodes2d/frame-node.js` → `stamp-frame` (+ a third `FrameNode` in `sizing-nodes.js` → `frame`) | `nodes2d/frame-node-zones.js` → `frame-node` |

The differences are not seven separate stories. They are two systematic contracts plus a few local changes.

**3D lifecycle.**

- Omni nodes extend `SceneNode` and use instance methods with state on `this` (that is, `node.inst`). Phases are `build`/`update`/`teardown`, driven by `omni-support/omni-3d.js`, and apps create `node.inst` by hand (`apps/scenes-molam.js`).
- Zones nodes use static methods with state on `node.value`. Phases are `build3d`/`update3d`, called directly by each model (`models/*-model.js`, `nodes3d/dumbbell-node.js`). There is no teardown.
- The node logic inside is often identical: `MolamBondNode` build, `setData` and update are line for line the same.

**2D coordinate contract.**

- Omni nodes read `node.value` directly and map through `ctxMix.T` (`T.toScreen`, zoom `T.sx`, drags via `T.toLocal`).
- Zones nodes read through the resolver (`res.getValue`, `getCentreXY`), with zoom fixed at 1, and they carry pip support (`getCentreXY`, `getPips`, `setPipPos`).

**Local changes worth knowing.**

- `3d-support/bond-renderer.js` is a compacted rewrite of `BondRenderer` from `3d-support/molam-objects.js`. It is identical except that the initial opacity is `1` rather than `0` and debug logging is gone.
- `nodes3d/imposter-atom-node-zones.js` exports a **stub** `getResidueColor` (always the chain colour), where the real one blends the amino-acid schemes. Nothing in the Zones world reaches it today.
- `button-node.js` and `postit-node.js` carry private copies of `hexToRgb`, `shiftColor` and `roundRectPath`, identical to `2d-support/paint.js`.

## Decisions (made once, before any pair)

**D1 — 3D lifecycle: Omni style wins.** Instance methods, state on `node.inst`, phases `build`/`update`/`teardown`. Reasons:

- `scene.js` says `node.value` is the serialisable part and `inst` holds runtime state. Zones puts `THREE.Group`s and renderers into `value`.
- Only the Omni style has teardown.

**D2 — `node.inst` is created lazily by the registry.** In `SceneRegistry.registerNodeClass` (`omni-support/scene.js`), the instance-method handler becomes:

```js
(ctxMix, node, params, child) => {
  const inst = node.inst ??= new nodeClass();
  return inst[name].call(inst, ctxMix, node, params, child);
}
```

Then `SYS.makeNode` nodes (Zones models) work without hand-made instances, and the hand-made ones in `scenes-molam.js` are unaffected, because `??=` leaves an existing `inst` alone.

Risk to check: registered classes whose constructor needs arguments. `omni-widget.js` builds with `new meta.nodeClass(config)`; confirm it sets `inst` before any instance handler runs.

**D3 — 2D contract: resolver for identity, `T` for geometry, with `T` living on the resolver.**

- `Values` gets an identity `T`. Any `ctxMix` that spreads `...Values` therefore has one, and walk-time containers keep overriding `ctxMix.T` as now.
- Merged 2D nodes read data with `res.getValue(res, node, params)` (local coordinates, writes via `res.setValue`).
- They place it with `res.T.toScreen(...)`.
- They size strokes and fonts with `res.T.uniformScale`, replacing `T.sx`.
- Values stay in local space; never put `T` inside `getValue`.

**D4 — Type names: keep both during transition.** Each merged class is registered under both old names. Registering one class under two names does not trigger the duplicate warning, which fires only for one name with two classes. Pick the canonical name per pair, and grep-replace the other later as a separate commit.

## Foundation steps (do first, each its own commit)

- **F1 — Lazy `inst`** (D2). One handler in `scene.js`. Verify: `html/molam.html` and `deep-wiki/d-plus.html` render molecules as before.
- **F2 — Identity `T` on `Values`, plus `Values` in the Omni canvas `ctxMix`.**
  - Add `T: new Transform()` to `Values` (`omni-support/values.js`, importing `transform.js`).
  - Today only `omni-support/demo-harness2-d.js` (Zones canvas) and `omni-support/omni-html.js` spread `...Values`. The Omni canvas `ctxMix` (`omni-support/omni-2d.js`, root set up in `nodes2d/omni-scene-nodes.js`) must spread it too, keeping its own `T`, which overrides the identity.
  - Verify: `html/omni-scene.html` drag and select still work, and `demos/graph-demos.html` is unchanged.
- **F3 — Colour helpers.**
  - `button-node.js`, `postit-node.js`: delete the private `hexToRgb`, `shiftColor` and `roundRectPath`, and import them from `2d-support/paint.js`.
  - `nodes3d/imposter-atom-node-zones.js`: export the real `getResidueColor` and `computeResidueTangents` by re-exporting from `3d-support/molam-objects.js`, deleting the stub.
  - Verify: buttons and post-its look the same on `html/omni-scene.html`.

## Pairs, easiest first (one commit per pair)

Each step:

1. Write the merged class into the **Omni filename**.
2. Delete the `-zones` file.
3. Point its importers at the Omni file (`grep -rn "<name>-zones.js" website`).
4. Change the Zones callers.
5. Open the pages listed.

Stopping after any pair leaves the repo working.

### 1. MolamBondNode (wrapper only)

- **Logic:** the Omni file already holds the merged class.
- **Renderer:** change `3d-support/bond-renderer.js`, the compacted copy, into a re-export of `BondRenderer` from `molam-objects.js`. Alternatively, swap the Zones import directly and delete the file.
- **Registration:** register both `molam-bonds` and `molam-bond`.
- **Zones callers:** `nodes3d/dumbbell-node.js` currently calls `MolamBondNode.setData(node, …)` (static), walks `build3d`, and reads `node.value.group`. Change it to `node.inst.setData(…)` after walking `build`, and read `node.inst.group`.
- **Opacity:** keep `bondOpacity ?? 1` and the `atomRange ?? 0/100` defaults from the Zones version in `update`. These are what make it visible when params are missing, and Omni's initial renderer opacity is `0`.
- **Pages:** `html/molam.html`, `demos/3d-demos.html` (dumbbell), `demos/panopticon.html`.

### 2. GroundPlaneNode

Same lifecycle conversion. The Omni version handles `build`/`teardown` and the Zones version `build3d`/`update3d`, so the merged class needs `build`, `update` and `teardown`; port `update3d`'s body into `update`.

- **Callers:** `models/ground-plane-model.js` changes `'build3d'`→`'build'`, `'update3d'`→`'update'`, and `value.group`→`inst.group`.
- **Pages:** `html/molam.html`, `demos/3d-demos.html`.

### 3. PlanetNode

The Omni file is loaded by no page and is the larger one (296 vs 94 lines). Diff it first. If it is a superset, convert the Zones caller; if not, port the Zones-only behaviour into it.

- **Callers:** `models/planet-model.js`.
- **Pages:** `demos/astro-demos.html`, `demos/panopticon.html`.

### 4. ImposterAtomNode

Largest 3D pair (536 vs 224 lines): 9 methods only in Zones, 11 only in Omni, 1 shared and different. Token-diff the shared method, then list the Zones-only methods and port each into the instance class.

- **Exports:** after F3, `imposter-atom-node-zones.js` is only a provider of constants (`CPK_ATOM_DATA`, `BOND_*`, `NEUTRAL_CHAIN_COLOR`). Move those to `3d-support/molam-objects.js` (or a small `3d-support/molam-constants.js`) and delete the file.
- **Callers:** `nodes3d/dumbbell-node.js`, as in pair 1.
- **Pages:** `html/molam.html`, `demos/3d-demos.html`.

### 5. DragPointNode (first 2D pair; proves D3)

Merged class:

- `draw2d` and `hit_test` read `res.getValue`, map with `res.T.toScreen`, and size with `res.T.uniformScale`.
- Keep the Zones pip methods (`getCentreXY` returns **local**; `getPips` and `setPipPos` are unchanged).
- The drag closure keeps Omni's `T.toLocal` and writes with `res.setValue`.

Pages: `html/omni-scene.html` (drag a point at zoom ≠ 1) and `demos/graph-demos.html` (pips snap as before).

### 6. ButtonNode

Same pattern as pair 5. The Zones version's `zoom = 1` becomes `res.T.uniformScale`, which is 1 under identity `T`, so Zones demos are unchanged. Keep the Zones `getCentreXY`.

Pages: `html/omni-scene.html`, `demos/widget-demos.html`, `demos/stockstrip-demos.html`.

### 7. FrameNode (hardest, do last)

There are three classes called `FrameNode`:

- `frame-node.js` → `stamp-frame`
- `frame-node-zones.js` → `frame-node`
- `sizing-nodes.js` → `frame`

All are containers. First decide whether `stamp-frame` and `frame-node` are the same concept. Zones adds `after_child_hit_test`, and Omni has 11 methods Zones lacks. Leave the `sizing-nodes.js` `frame` alone, but rename its class (e.g. `SizingFrameNode`) so the name stops colliding.

Pages: `html/omni-scene.html`, `deep-wiki/d-plus.html`, `demos/chart-demos.html`, `demos/panopticon.html`.

## Afterwards

- Rerun Code Cartographer. Expected: no duplicate type names except D4's intentional aliases, and no `-zones` twin files. `heatmap-zone.js`, `bga-zone.js` and the other Zones-only nodes are not twins and are out of scope.
- Retire D4 aliases one at a time with a grep-replace commit each.
- Later: the general-`T` interface (`toScreen`, `toLocal`, `uniformScale`→`scaleAt(p)`, `isAffine`) and a `PathTransform` built on `2d-support/path.js`. D3 is the prerequisite; nothing in this plan depends on it.
