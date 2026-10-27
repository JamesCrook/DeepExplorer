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

## Pairs, in order (one commit per pair or step)

Each step:

1. Write the merged class into the **Omni filename**.
2. Delete the `-zones` file.
3. Point its importers at the Omni file (`grep -rn "<name>-zones.js" website`).
4. Change the Zones callers.
5. Open the pages listed.

Stopping after any pair leaves the repo working. Order: MolamBondNode first (it proves D1/D2 cheaply), then FrameNode (the one that matters most), then the rest.

### 1. MolamBondNode (wrapper only)

- **Logic:** the Omni file already holds the merged class.
- **Renderer:** change `3d-support/bond-renderer.js`, the compacted copy, into a re-export of `BondRenderer` from `molam-objects.js`. Alternatively, swap the Zones import directly and delete the file.
- **Registration:** register both `molam-bonds` and `molam-bond`.
- **Zones callers:** `nodes3d/dumbbell-node.js` currently calls `MolamBondNode.setData(node, …)` (static), walks `build3d`, and reads `node.value.group`. Change it to `node.inst.setData(…)` after walking `build`, and read `node.inst.group`.
- **Opacity:** keep `bondOpacity ?? 1` and the `atomRange ?? 0/100` defaults from the Zones version in `update`. These are what make it visible when params are missing, and Omni's initial renderer opacity is `0`.
- **Pages:** `html/molam.html`, `demos/3d-demos.html` (dumbbell), `demos/panopticon.html`.

### 2. FrameNode (analysed below; its own sequence FR0–FR5)

This is not a twin merge. See **FrameNode analysis** for why, and for the steps that replace a merge.

### 3. GroundPlaneNode

Same lifecycle conversion. The Omni version handles `build`/`teardown` and the Zones version `build3d`/`update3d`, so the merged class needs `build`, `update` and `teardown`; port `update3d`'s body into `update`.

- **Callers:** `models/ground-plane-model.js` changes `'build3d'`→`'build'`, `'update3d'`→`'update'`, and `value.group`→`inst.group`.
- **Pages:** `html/molam.html`, `demos/3d-demos.html`.

### 4. PlanetNode

The Omni file is loaded by no page and is the larger one (296 vs 94 lines). Diff it first. If it is a superset, convert the Zones caller; if not, port the Zones-only behaviour into it.

- **Callers:** `models/planet-model.js`.
- **Pages:** `demos/astro-demos.html`, `demos/panopticon.html`.

### 5. ImposterAtomNode

Largest 3D pair (536 vs 224 lines): 9 methods only in Zones, 11 only in Omni, 1 shared and different. Token-diff the shared method, then list the Zones-only methods and port each into the instance class.

- **Exports:** after F3, `imposter-atom-node-zones.js` is only a provider of constants (`CPK_ATOM_DATA`, `BOND_*`, `NEUTRAL_CHAIN_COLOR`). Move those to `3d-support/molam-objects.js` (or a small `3d-support/molam-constants.js`) and delete the file.
- **Callers:** `nodes3d/dumbbell-node.js`, as in pair 1.
- **Pages:** `html/molam.html`, `demos/3d-demos.html`.

### 6. DragPointNode (first 2D pair; proves D3)

Merged class:

- `draw2d` and `hit_test` read `res.getValue`, map with `res.T.toScreen`, and size with `res.T.uniformScale`.
- Keep the Zones pip methods (`getCentreXY` returns **local**; `getPips` and `setPipPos` are unchanged).
- The drag closure keeps Omni's `T.toLocal` and writes with `res.setValue`.

Pages: `html/omni-scene.html` (drag a point at zoom ≠ 1) and `demos/graph-demos.html` (pips snap as before).

### 7. ButtonNode

Same pattern as pair 6. The Zones version's `zoom = 1` becomes `res.T.uniformScale`, which is 1 under identity `T`, so Zones demos are unchanged. Keep the Zones `getCentreXY`.

Pages: `html/omni-scene.html`, `demos/widget-demos.html`, `demos/stockstrip-demos.html`.

## FrameNode analysis

Written before touching any frame code, because nested-frame dragging was hard to get right. Read from source; nothing run.

### There are four frame-like containers, not two twins

| Type | Class (file) | What it is | Hit-space convention |
|---|---|---|---|
| `stamp-frame` | `FrameNode` (`nodes2d/frame-node.js`, Omni) | decorative movable card with a bumpy perimeter; move only | **B** (map forward) |
| `handle-frame` | `HandleFrameNode` (`nodes2d/handle-frame-node.js`, Omni) | resizable frame: two `drag-point` children are its corners; body drag moves both; content scaled to fit or stretched | **mixed**: A for content children, B for its corners, legacy pan/`W/2` arithmetic for its own body drag |
| `frame-node` | `FrameNode` (`nodes2d/frame-node-zones.js`, Zones) | resizable content frame: `cw`/`ch` + padding, corner or edge handles that rescale children's x/y, screen-fit mode, drop-to-strip removal | **A** (rewrite down, wrap up) |
| `frame` | `FrameNode` (`nodes2d/sizing-nodes.js`, Omni) | sizing adapter that centres or offsets an addable inside a zoom-pan; works with `zoom-pan`, `uncenter`, `box` | **A**, with `ctx.scale` |

The Zones `frame-node` is conceptually the twin of `handle-frame`, not of `stamp-frame`: both are resizable frames. They have different resize models, though.

- `handle-frame` corners are child *nodes* (`drag-point`), so resizing is two ordinary point drags.
- Zones `frame-node` corners are handles inside the frame, and a resize rewrites every child's position proportionally.

### The two hit-space conventions

**A — rewrite down, wrap up.** On the way down, a container converts `ctxMix.hitPoint` into its children's local space and restores it in `after_*`. On the way up, it wraps the winning descendant's `applyDrag` so that pointer coordinates are converted the same way. Every level must do both, symmetrically.

**B — map forward, capture T.** `ctxMix.hitPoint` stays in one space throughout. Containers push `ctxMix.T`; each node maps its *own* geometry forward with `T.toScreen` and compares there. A drag captures the `T` in force at hit time and inverts once with `T.toLocal`. Nothing is wrapped, so nesting depth costs nothing: the captured `T` already *is* the full accumulated mapping. `stamp-frame` and Omni `drag-point` work this way, and so does D3.

### Why nested dragging was painful

The pain sits at the boundaries between A and B, which needed compensating code:

- `handle-frame` rewrites `hitPoint` to frame-local for content children, but also pushes `T`. A B-style child inside it therefore compares a screen-space `T.toScreen(...)` with a local `hitPoint`. `postit-node.js` exists partly to undo this: its header says its `hit_test` "restores hitPoint to screen coordinates (undoing handle-frame's frame-local transform)".
- `handle-frame`'s own body drag uses `params.panX`, `params.zoom` and `ctxMix.W/2`, not `T`. Inside another `handle-frame`, `ctxMix.W` has been replaced by the parent frame's width, so the `W/2` centring term is wrong. **Suspected:** body-dragging a `handle-frame` nested inside another `handle-frame` mis-tracks. Corner drags are fine, because `drag-point` uses `T`.
- `stamp-frame` keeps a legacy branch: it shifts `params.panX/panY` in `before_hit_test` "so non-T children still work", and calls `ctx.translate` in `before_draw2d` for children that draw on raw `ctx`.
- Zoom is recorded twice on the Omni path. A zoomed `layer` pushes `T.zoomed(z)` *and* passes `zoom` in params, which `frameRect` uses for sizes and offsets. `stamp-frame` is correct because the two agree, and `ctx` is never scaled on that path. **Fragile:** nested layers *multiply* `T.sx` but *override* `params.zoom`, and a `zoom-pan` (`ctx.scale`, not `T`) above a `stamp-frame` would break the agreement.
- **Likely bug in Zones `frame-node` at depth ≥ 2.** Each frame's `after_hit_test` wraps the winning descendant's `applyDrag` to subtract its own centre, then sets `hitResult._wrappedByChartCoordMap = true`. `after_hit_test` runs innermost-first, so only the *innermost* enclosing frame subtracts its offset; every outer frame sees the flag and skips. `hitPoint` is converted at every level, so hits land correctly, but drags of anything two frames deep are offset by the outer frames' positions. Single-level nesting, which is what the demos use, is unaffected.

### What the code already gets right (keep it)

- **Hit priority:** containers set `hitResult` in `before_hit_test`, and children overwrite during recursion, so the deepest and topmost node wins. Draw order and hit order agree. All four frames rely on this.
- **Omni drag capture:** `stamp-frame` and `drag-point` capture `Ts = T.clone()` (the parent's accumulated `T`) plus the grab offset, and invert once. This is exactly the right mechanism for nesting.
- **Zones writes:** Zones `frame-node` writes through `Values.setValue`. The exception is screen-fit mode, which writes `node.value` during draw; the code says so in a comment.

### Recommendation

Standardise all frames on **B**. It is what D3 already establishes (`T` on the resolver, identity outside a walk), it makes nesting correct by construction, and it is the convention a warping `T` needs (forward map for hits, inverse only for drags). Do not merge `stamp-frame` with `frame-node`; they are different objects. Whether `handle-frame` and Zones `frame-node` become one resizable frame is a design choice (corners-as-nodes versus handles-in-frame) to make after FR3, not before.

### Steps (each its own commit; stop after any)

- **FR0 — Nested-drag test scenes first.** Before any frame code changes, build a small scene for each world (or reuse `apps/scenes-frame.js`). Check each case and record the result in this doc as the baseline.

  | Case | Omni | Zones |
  |---|---|---|
  | frame in frame in frame: drag innermost body | `handle-frame` ×3 and `stamp-frame` ×3 | `frame-node` ×3 |
  | same at layer zoom 2 and with pan | ✓ | ✓ (camera zoom) |
  | drag a corner of the middle frame | `drag-point` corner | corner handle |
  | resize the outer frame with nested content | ✓ | ✓ (children rescale) |
  | drag a child out onto the strip | — | ✓ |
  | `postit-node` inside `handle-frame`: drag and hit at zoom 2 | ✓ | — |

  The two "suspected" and "likely" bugs above should show up here. If they don't, update this analysis before going further.
- **FR1 — Names only.** Rename the classes `StampFrameNode`, `ContentFrameNode` (the Zones one) and `SizingFrameNode`, keeping all type names. `HandleFrameNode` is unchanged. This ends three classes sharing one name and changes no behaviour.
- **FR2 — Zones `frame-node` to B.**
  - Replace the `hitPoint` rewrite and the `applyDrag` wrapping (and the `_wrappedByChartCoordMap` flag) with a push of `ctxMix.T.child({x, y})` and a captured-`T` drag.
  - Zones coordinates are world coordinates from the harness. With F2's identity `T` at the top, that is the space `T` maps into, so nothing else changes.
  - Keep resize, screen-fit and strip-drop logic as they are. The strip-drop wrapper in `after_child_hit_test` stays, but should preserve the other `interactions` members (`cursor`, `getValue`…), which it currently drops.
  - Rerun FR0: the depth-≥2 drag case should now pass.
- **FR3 — `handle-frame` to B.**
  - The body drag uses `T.toScreen` of the frame centre and a captured `T`, like `stamp-frame`, dropping the `panX`/`zoom`/`W/2` arithmetic.
  - Content children get `T.child(...)` only, with no `hitPoint` rewrite.
  - Then delete `postit-node.js`'s hit-point restore.
  - Rerun FR0.
- **FR4 — `stamp-frame` cleanup.** List its children that still need raw `ctx` translation or `params.panX`. When none are left, drop the legacy pan shift and `ctx.translate`, and replace `frameRect`'s `params.zoom` with `res.T.uniformScale`. That ends the double-recorded zoom.
- **FR5 — `sizing-nodes` (`frame`, `zoom-pan`, `uncenter`, `box`) to B.** `zoom-pan` pushes `T.zoomed`/`T.shift` instead of `ctx.scale` plus `hitPoint` rewriting. This is the widest change; do it last, and only if FR0 is still green.

## Notes for later sessions (27 Oct, end of day)

### Hit-test ordering: where the reverse-and-abort variant lives

The house rule: hit-test in draw order and let the last hit win, matching "last drawn is on top". The walker supports an alternative: `ctxMix.abortPhase = true` breaks the *current node's* child loop (`scene.js` `walkPhase`). The flag is cleared before `after_X`, so it never propagates to ancestors, whose loops continue with last-wins.

Only three files use it:

| File | What it does | Verdict |
|---|---|---|
| `nodes2d/flyweight-array-node.js` | `_order` yields items in **reverse** for `hit_test` (or `value.hitOrder`); `after_child_hit_test` aborts after the first item hit | Same result as last-wins, and much cheaper with thousands of items. **Gap:** it aborts only when `hit.node === child`, i.e. the proto itself. If the proto is a container and one of *its* children is hit, there's no abort, the reverse walk continues, and the **lowest** item wins. Reverting to forward/last-wins fixes that but costs a full scan; the alternative is to abort whenever `hitResult` changed during that child. |
| `nodes2d/pipper-node.js` | `before_hit_test` scans followers' pips **in reverse** and aborts on the first pip hit; `after_child_hit_test` aborts after the first **body** hit | The pip scan is a deliberate *priority* rule (any pip beats any body), not just z-order. Keep it. **Bug:** body hits use the default *forward* iterator plus abort, so the **first-drawn (bottom)** overlapping body wins. Here reverting to last-wins (drop the abort in `after_child_hit_test`) is the right fix. |
| `nodes2d/stock-strip-node.js` | `before_hit_test` aborts when the point is outside the strip, as a cull; `after_child_hit_test` aborts after the first hit | The cull is fine, and items don't overlap, so order doesn't matter. **Check:** `after_child_hit_test` tests `if (!ctxMix.hitResult)` rather than `hitResult.node === child`, so a hit left by an earlier-drawn sibling (e.g. the arena) can be mistaken for a stock prototype. |

### Morph-slider pip sits outside the track at 0 and 1

`omni-support/morph-slider-widget.js` appends `.ms-pip` to `.morph-slider` as a **sibling** of `.ms-track`, and sets `pip.style.left = pct + '%'`. A percentage `left` on an absolutely positioned element is relative to the slider's full padding box. The track is inset `left: 8px; right: 8px` (in both `css/omni-scene.css` and `css/panopticon.css`). So:

- at 0 the pip's centre is 8px left of the track;
- at 1 it is 8px past the track's end;
- in between it disagrees with the fill, which lives inside the track, everywhere except 50%.

The drag mapping uses `track.getBoundingClientRect()`, so dragging is right and only the pip is drawn wrong.

Fix (JS, one line), keeping the pip wholly inside the track at both ends:

```js
pip.style.left = `calc(8px + var(--ms-pip-w) * 0.5px + (100% - 16px - var(--ms-pip-w) * 1px) * ${pct / 100})`;
```

Apply the same fix to the copy of `buildMorphSlider` in `nodes2d/pipped-edge-ref-node.js`, or better, make that file import `morph-slider-widget.js` (see the reorganisation notes).

## Afterwards

- Rerun Code Cartographer. Expected: no duplicate type names except D4's intentional aliases, and no `-zones` twin files. `heatmap-zone.js`, `bga-zone.js` and the other Zones-only nodes are not twins and are out of scope.
- Retire D4 aliases one at a time with a grep-replace commit each.
- Later: the general-`T` interface (`toScreen`, `toLocal`, `uniformScale`→`scaleAt(p)`, `isAffine`) and a `PathTransform` built on `2d-support/path.js`. D3 is the prerequisite; nothing in this plan depends on it.
