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

## Decisions taken 27 Oct (late)

1. **Nested-corner fix via FR5.** The sizing nodes (`zoom-pan`, `box`, `frame`, `uncenter`) push `T`. After that, `T`-using nodes compare with `screenHitPoint`. Order: FR5 → corner fix → pairs 3–7.
2. **Childless containers.** `walkPhase` gives a node with an empty subtree, and no plain handler for the phase, its `before_`/`after_` pair. Every container class is audited for empty-subtree assumptions first.
3. **Hit order.** `PipperNode` body hits go back to last-wins (pip-first priority kept). Also fix the flyweight container-proto case and `stock-strip`'s unowned-hit check.
4. **Type names.** Omni names are canonical (`molam-bonds`, `imposter-atoms`, `planet`). Zones names stay registered as aliases until it is confirmed no saved data uses them.

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

- **FR0 — Nested-drag baseline: done (27 Oct).** The test is `docs/tests/frame-drag-test.mjs`.

  It runs under Node with no DOM or three.js:

  ```
  node docs/tests/frame-drag-test.mjs omni-stamp | omni-handle | zones
  ```

  It is convention-neutral. It finds a frame's on-screen box by probing a grid of points with the real `hit_test` walk, grabs it where it is topmost, calls the real `applyDrag` with the pointer moved by D = (37, 23), and checks that the box moved by exactly D. Each case uses three frames nested inside one another, tested at each depth at zoom 1 and 2.

  Baseline before any frame change:

  | Frame | depth 1 | depth 2 | depth 3 |
  |---|---|---|---|
  | `stamp-frame` (B) | ok (both zooms) | ok | ok |
  | `handle-frame` (mixed) | ok | **wrong**: moved (−67, −54), and (−152, −119) at zoom 2 | **lost**: frame ends up off screen |
  | Zones `frame-node` (A) | **wrong**: (7, 8) | **wrong**: (177, 158) | **wrong**, lost at zoom 2 |

  What this shows:

  - **B works at any depth, as predicted.**
  - **The `handle-frame` nesting bug is confirmed.** Its body drag uses `params.panX`, `params.zoom` and `ctxMix.W/2` instead of `T`.
  - **Zones `frame-node` is worse than predicted.** Its `after_hit_test` wraps the current hit's `applyDrag` with "subtract my centre" whenever the hit is *not itself*. It never checks that the hit was produced inside its subtree. So any frame visited after the hit (a descendant frame, or a later sibling) shifts the drag by its own position. The innermost such frame runs first and sets `_wrappedByChartCoordMap`, which then stops the correct ancestors from wrapping. Depth-1 dragging is only right when nothing after the hit is a frame. That is the demo case, which is why it hasn't shown up. `pane-camera` gets this right by comparing `hitResult` with the one saved in its `before_` hook.
  - **Walker rule:** a container-pattern node with an **empty `subtree`** receives no `before_`/`after_` hooks, only the plain phase. So a childless `stamp-frame` or `frame-node` is never hit-tested, and by the same rule never drawn. The test checks this and prints it. This is not a frame bug as such, but a frame is a container people will leave empty. A fix belongs in `walkPhase`: when a node has no subtree but no plain handler for the phase, call its `before_`/`after_` pair.
- **FR1 — Names only.** Rename the classes `StampFrameNode`, `ContentFrameNode` (the Zones one) and `SizingFrameNode`, keeping all type names. `HandleFrameNode` is unchanged. This ends three classes sharing one name and changes no behaviour.
- **FR2 — Zones `frame-node` made correct within convention A: done (27 Oct).**

  The plan said "move it to B". That turned out to be the wrong first step. Zones content children (`drag-point` Zones, `mouse-zone`, the chart zones) compare their *local* coordinates with `ctxMix.hitPoint`, so they depend on the frame rewriting `hitPoint` and wrapping their drags. Moving the frame alone to B would break them. B must come child by child (pair 6 onward), and the frame can follow once its children use `res.T`.

  What changed in `frame-node-zones.js` instead:

  - `before_hit_test` saves the incoming `hitResult`. `after_hit_test` wraps only a hit produced inside its own subtree, which is the test `pane-camera` already uses.
  - The `_wrappedByChartCoordMap` flag is gone, so every enclosing frame adds its offset and nesting composes.
  - The strip-drop wrapper now keeps the other `interactions` members.
  - `ctxMix.getWH` is restored after the frame in both draw and hit-test, so it is scoped to the frame's children.

  `frame-drag-test.mjs zones` now passes every case at zoom 1 and 2: three nested frames, a Zones `drag-point` inside the innermost frame (previously 247 px off), and a later sibling frame.
- **FR3 — `handle-frame` body drag to captured-T: done (27 Oct). Nested corners still open.**

  Done:

  - `before_hit_test` now finds the frame on screen with the `T` in force, from its own corner values, and compares it with `ctxMix.screenHitPoint`. That is the untouched pointer `SceneRootNode` keeps; `hitPoint` can't be used because an enclosing `handle-frame` has rewritten it for its content.
  - The drag captures `T` and inverts once, as `stamp-frame` does.
  - The old `panX`/`zoom`/`W/2` arithmetic is kept only as a fallback for a walk with no `T`.
  - Body drags now pass at depths 1–3, zoom 1 and 2. Before, they were wrong from depth 2 and lost the frame at depth 3.

  Open: **corners of nested frames.** `frame-drag-test.mjs omni-handle` rows 5–6 show a nested frame's corner drag-point is off at zoom 1 and unreachable at zoom 2. This was the same before FR3. Omni `drag-point` maps itself with `T` (screen space) but compares with `ctxMix.hitPoint`, which the enclosing `handle-frame` has rewritten to frame-local space.

  The obvious fix is to compare with `screenHitPoint`. That is right under `handle-frame`, but wrong under the sizing `zoom-pan`/`box` nodes, which rewrite `hitPoint` *without* pushing a matching `T`. Two options:

  - **(a)** Do FR5 first (sizing nodes push `T`); after that, every B node can compare with `screenHitPoint`.
  - **(b)** Have `handle-frame` stop rewriting `hitPoint` for content children that hit-test with `T`. That needs a per-class flag, and `postit-node.js`'s undo would go at the same time.

  (a) is the principled one.
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
