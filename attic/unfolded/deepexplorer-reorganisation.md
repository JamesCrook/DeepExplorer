# DeepExplorer — reorganisation map

Based on `JamesCrook/DeepExplorer` at commit `0348426` ("Shift to using SYS", 27 Oct 2026). Scope is `website/` unless stated; `attic/` is set aside. All counts come from parsing the code (declarations, imports, registrations) and from following what each HTML page actually loads.

## Status, 28 Oct

What this map proposed, and where it stands (all pushed to `master`):

| Proposal | Status |
|---|---|
| Archive unloaded code (§2.4, §3.1, step 1) | **Done.** 34 files are now in `attic/website-unloaded/`, at mirrored paths. The true count of unloaded files was 50, not 52: the parser missed `import {} from '…'`, so `blob-node.js` was wrongly listed. 16 remain unloaded on purpose: the parsers, which are reached by name. `node docs/tests/load-graph.mjs --unloaded` lists them. |
| Widget nodes out of `omni-support/` (§2.3) | **Done.** `nodes-html/widgets/` holds one file per widget type (28) plus `widget-base.js`, `index.js`, and the morph-slider, layers and topics widgets. The registry is unchanged: same names, order, defaults and methods. |
| `MorphSliderWidget` copy in `pipped-edge-ref-node.js` | **Done.** It now imports the widget. |
| Dissolve `utilities/` and `utilities2/` (§3.1) | **Done.** `ast-manager` → `parsers/`; `path-ast` and `line-geometry` → `2d-support/` (kept flat, like the rest of that folder); `spherical` → `3d-support/`; `tree-of-data` → `data/`; `nav` and `help` → `page/`; `reactive-runtime` → `omni-support/`. Both folders are gone. |
| One colour module (§3.2) | **Done.** `js/colour/colour.js` holds hex/RGB parse and format, `shift`, `lerp` and `ColorEngine`. `colour/perceptual.js` is `colours.js` brought back, and `ribbon-node` now imports it. The private copies are gone. `TextUtils` → `2d-support/text-utils.js`. Two parsers remain on purpose: a forgiving one for drawing and a strict one with alpha for morphing. |
| Twins (§1.2, §2.1) | **Done.** All seven pairs are merged; see `docs/twin-merge-plan.md`. So no `zones/` sub-folders are needed. |
| README tree (step 6) | **Done.** |
| Split the other multi-node files (§2.2: `mol-scene-nodes`, `hud-panel`, `sizing-nodes`, …) | Not started. |
| `card-grid` / `flash-card` out of `apps/scenes-cards.js` (§2.3) | Not started. |
| Copy clusters (§3.3) | Not started. |
| The four `attic/unfolded` apps | **Done** (28 Oct): rebuilt as OmniScene scenes with pages in `html/`; omni-grid's renderer is still one opaque node. See `attic/unfolded/README.md`. |

The rest of this document is the map as first written, at commit `0348426`.

---

## 1. The two facts that organise everything else

### 1.1 Your registry already defines "node", "container" and "leaf"

The tool's first report guessed nodes by inheritance and picked `OmniWidget`. That was the wrong lens: your scene nodes mostly share no base class. The definition is in `sys.js` and `scene.js`:

- **A node type** is anything pushed onto `SYS.NODE_CLASSES` as `{ name, cls }`. The registry scans `cls` for methods whose first parameter is `ctxMix` and files each as a phase handler.
- **`walkPhase` decides compound versus terminal by itself.** If `node.subtree` is empty it dispatches the plain phase (`draw2d`, `hit_test`, `mount`…). If the subtree is non-empty it dispatches *only* `before_X`, `before_child_X`, `after_child_X` and `after_X`, never `X` itself.

So the natural, code-backed classification is:

| Kind | Test | Meaning |
|---|---|---|
| **Container** | class (or an ancestor) has a `ctxMix` handler named `before_*` / `after_*` | written to wrap children |
| **Leaf** | only plain phase handlers | if given children, its own `draw2d` is silently skipped |

That second row is a real hazard, not just a label. A leaf type placed inside a subtree-bearing position stops drawing without an error. A cheap guard: have `walkPhase` warn once per type when a node has a subtree but its type has no `before_`/`after_` handler for that phase.

Counts for `website/`:

| | Types |
|---|---:|
| Registered (commented-out pushes excluded) | 201 |
| Loaded by at least one page | 163 |
| — containers | 49 |
| — leaves | 112 |
| — built by a factory, not classified (`stage`, `ms-cell`) | 2 |
| Registered in files no page loads | 38 |

The full live list is in the appendix.

### 1.2 There are two node "worlds", and they never meet

Following imports from every HTML page splits the live node types cleanly:

| World | Pages | Live node types |
|---|---|---:|
| **Omni** | `html/omni-scene.html`, `deep-wiki/d-plus.html`, `html/molam.html` (+ `aa-colors.html` for widgets) | 114 (85 scene nodes + 29 widget nodes) |
| **Zones** | `demos/*.html` incl. `panopticon.html` | 47 |
| Shared by both | — | **0** |

The Zones world came from the multi-zone stand-alone (`sys.js` says as much). Seven concepts exist in both worlds as **separate classes with the same class name**. They have drifted apart, and their type names agree in only three cases:

| Class | Omni file → type | Zones file → type | What actually differs |
|---|---|---|---|
| `ButtonNode` | `button-node.js` → `button-node` | `button-node-zones.js` → `button-node` | coordinate contract (see below); Zones adds `getCentreXY` |
| `DragPointNode` | `drag-point-node.js` → `drag-point` | `drag-point-node-zones.js` → `drag-point` | coordinate contract; Zones adds pips (`getCentreXY`, `getPips`, `setPipPos`) |
| `GroundPlaneNode` | `ground-plane-node.js` → `ground-plane` | `ground-plane-node-zones.js` → `ground-plane` | 3D lifecycle style (see below) |
| `FrameNode` | `frame-node.js` → `stamp-frame`; `sizing-nodes.js` → `frame` (a third `FrameNode`) | `frame-node-zones.js` → `frame-node` | coordinate contract; Zones adds `after_child_hit_test` |
| `ImposterAtomNode` | `imposter-atom-node.js` → `imposter-atoms` | `imposter-atom-node-zones.js` → `imposter-atom` | 3D lifecycle style; Zones `getResidueColor` is a stub |
| `MolamBondNode` | `molam-bond-node.js` → `molam-bonds` | `molam-bond-node-zones.js` → `molam-bond` | 3D lifecycle style only; bond logic identical |
| `PlanetNode` | `planet-node.js` → `planet` (**not loaded**) | `planet-node-zones.js` → `planet-node` | 3D lifecycle style |

The differences fall into two systematic kinds rather than seven separate stories:

- **2D coordinate contract.** Omni nodes read `node.value` directly and map through `ctxMix.T` (`T.toScreen`, zoom `T.sx`). Zones nodes ask the mediators: `ctxMix.getValue(ctxMix, node, params)`, `getCentreXY`, zoom fixed at 1. They also carry pip support. The Zones side follows the mediator design that `scene.js`'s header describes; the Omni side supports zoom through `T`.
- **3D lifecycle style.** Omni nodes extend `SceneNode`, keep state on the instance (`this.group`, `this.renderer`, so `node.inst`) and handle `build`/`update`/`teardown`, driven by `omni-3d.js`. Zones nodes are static, keep state on `node.value`, handle `build3d`/`update3d`, are driven directly by each model, and have no teardown. Inside that wrapper the logic is often identical: `MolamBondNode`'s build, `setData` and update are line-for-line the same.

Nothing breaks today only because no page loads both. But `scene.js` states that type names are one namespace across all backends, and d-plus is described as the "everything app". If it ever loads a Zones demo, the first three pairs collide (last import wins, with a console warning). The other four don't collide, but they quietly give one concept two names, so a saved scene from one world won't load in the other. `imposter-atoms` against `imposter-atom` is the sort of difference that gets misread.

The heatmap pair is the same split under different names: `heatmap-node.js` (Omni) and `heatmap-zone.js` (Zones) share five byte-identical helpers (`colormapField`, `sampleRandom`, `fillPoly`, `strokePoly`, `scalePts`).

**This split, not utilities versus utilities2, is the main reason things feel disorganised.** Much of the duplication below is one world's copy of the other's code.

---

## 2. Scene-graph nodes — proposed moves

### 2.1 Make the two worlds visible, then converge pair by pair

The cheap first step changes no behaviour:

```
js/nodes2d/            omni 2D nodes
js/nodes2d/zones/      the *-zone(s).js files (drop the suffix inside the folder)
js/nodes3d/            omni 3D nodes
js/nodes3d/zones/      *-node-zones.js
```

Then converge one twin pair at a time into a single file. Because the differences are two systematic contracts (2D coordinates, 3D lifecycle), each contract is a decision made once, after which the pairs merge mechanically. The Zones versions are often the better-factored side: `button-node-zones.js` imports `hexToRgb`, `roundRectPath` and `shiftColor` from `2d-support/paint.js`, while `button-node.js` carries private copies of all three. The Omni versions are generally larger (`frame-node.js` has 11 methods the Zones one lacks), so convergence means merging, not choosing.

### 2.2 Split the live multi-node files

You wanted one node per file. These live files register more than one class:

| File | Types | Notes |
|---|---:|---|
| `omni-support/omni-widget.js` | 28 | HTML widget nodes (`mount` phases); also mis-filed, see 2.3 |
| `nodes2d/mol-scene-nodes.js` | 12 | one container (`animate-scene`) + 11 molecule-diagram leaves |
| `nodes-html/hud-panel.js` | 7 | `hud-panel` container + 6 control leaves |
| `nodes2d/sizing-nodes.js` | 6 | all containers: frame, box, zoom-pan, uncenter, nm-frame, nm-box |
| `nodes2d/workhorse-nodes.js` | 6 | `mind-map` container + atom, bond, ruler, chem, tree2 |
| `nodes-html/chat-nodes.js` | 5 | all leaves |
| `nodes2d/jatex-node.js` | 5 | frac, jexp, jatex containers; jatex.sym, jsymbol leaves |
| `nodes2d/multiscroller-nodes.js` | 4 | `hstack`/`vstack` are one `StackNode` class registered twice |
| `nodes-html/html-nodes.js` | 3 | |
| `nodes2d/mask-scene-nodes.js` | 3 | |
| `nodes2d/sky-nodes.js` | 3 | star, field-star, deep-sky |
| `nodes2d/table-cell-node.js` | 3 | `ms-cell` comes from a factory, `createCellClass` |
| 9 files with a container + its item | 2 each | ribbon/ribbon-point, warpable-grid/rect-grid-cell, label-layer/ring-label, lloyd/lloyd-directions, html-repeat/html-variants, layer/scene-root, layers/selection-action-bar, topics/topic-link, pipped-edge/morph-slider |

For the nine "container + its own item" pairs, splitting is optional. The item exists only to be a child of that container, and keeping them together documents that. Splitting them is a style choice rather than a fix.

### 2.3 Move nodes that live outside node folders

- **33 widget node types in `omni-support/`** (`omni-widget.js`, `layers-widget.js`, `topics-widget.js`, `morph-slider-widget.js`). They are registered node types in the same namespace as everything else, with mount-phase handlers. They belong with `nodes-html/`, perhaps as `nodes-html/widgets/`. That would leave `omni-support/` as infrastructure.
- **`apps/scenes-cards.js`** registers `card-grid` and `flash-card`. Move both to `nodes-html/`.
- **`nodes2d/pipped-edge-ref-node.js`** contains a complete second `MorphSliderWidget`; `buildMorphSlider` is 648 tokens, identical to `omni-support/morph-slider-widget.js`. It should import that file instead.

### 2.4 Retire node files no page loads

These register 38 types but are reached by no page through `<script src>`, imports or literal dynamic imports. No code calls `patchbay.requestModule`, the only computed-path loader.

`nodes2d/`: `scorpio-nodes.js` (23 types), `structural-nodesxxx.js`, `algorithms-node.js`, `transform-node.js`, `camera-node2d.js`, `camera-node-zones.js`, `blob-node.js`, `network-node.js` · `nodes3d/planet-node.js` · `nodes-html/card-set-node.js`

Moving them to `attic/` also clears six of the duplicate type names (`overlay`, `hstack`, `vstack`, `rect`, `transform`, `label`). Both stale `before_hitTest`/`after_hitTest` hooks go with them; the phase is `hit_test`, so those hooks could never have fired.

---

## 3. Support code

### 3.1 What utilities/ and utilities2/ really are

Most of both folders is not loaded by any page:

| Folder | Files | Loaded by some page | Loaded files |
|---|---:|---:|---|
| `utilities/` | 6 | 2 | `color-engine.js`, `reactive-runtime.js` |
| `utilities2/` | 19 | 7 | `ast-manager.js`, `help.js`, `nav.js`, `line-geometry.js`, `path-ast.js`, `spherical.js`, `tree-of-data.js` |

`utilities2/` also follows a different style from the rest: almost every file is a class used as a namespace of static methods (`Colours.hexToRgb`), where `2d-support/` and `omni-support/` export plain functions.

Grouped by who imports them, the live files have obvious domain homes, and both "utilities" folders can disappear:

| Live file | Imported by | Suggested home |
|---|---|---|
| `utilities2/ast-manager.js` | 9 parsers + `jatex-node.js` | `parsers/` (it is the parsers' core) |
| `utilities2/path-ast.js`, `line-geometry.js` | `ribbon2d.js`, `ribbon-node.js` | `2d-support/geometry/` |
| `utilities2/spherical.js` | `ribbon-node3d.js` | `3d-support/` |
| `utilities2/tree-of-data.js` | `scenes-chart.js` | `data/` |
| `utilities2/help.js`, `nav.js`, `menu.js` | `molam.html`, `omni-scene.html`, `aa-colors.html` | a page-chrome folder, e.g. `page/` |
| `utilities/reactive-runtime.js` | `scenes-animate.js` | `omni-support/` |
| `utilities/color-engine.js` | `table-cell-node.js` | the colour module, 3.2 |

Unloaded files to move to `attic/`:

- **`utilities/`:** `scorpio-infrastructure.js`, `scorpio-drawing-utils.js` (only the dead `scorpio-nodes.js` used them), `utils.mjs`, and `shape.mjs`, which is an older copy of the live `2d-support/shape.js` (`makeEndCodes`, `getEdge`, `getPoint`… identical).
- **`utilities2/`:** `avatars`, `font-outline`, `framer-geometry`, `glyph`, `image-warping`, `line-markings`, `login`, `menu`*, `pathing`, `random`, `recoloring`, and `colours` (see 3.2).

\* `menu.js` imports `nav` and `help` but nothing imports it.

### 3.2 Colour: three representations, one de-facto library, several private copies

77 colour-related functions in `website/`, 43 of them in loaded files. The overlap you suspected is real, but it isn't mainly between `utilities` and `utilities2`. It comes from **three incompatible representations**:

| Representation | Where |
|---|---|
| `{r,g,b}` from hex; CSS-string output | `2d-support/paint.js`: `hexToRgb`, `hexToRgba`, `shiftColor` |
| `[r,g,b]` arrays | `nodes2d/mask-scene-nodes.js` `hexToRgb`; `utilities/color-engine.js` schemes |
| `{r,g,b,a}` with 8-digit hex | `omni-support/omni-widget.js` (`isHexColor`, `parseHexColor`, `formatHexColor`, `lerpColor`), re-implemented as `_isHex`/`_parseC`/`_fmtC` in `omni-support/omni-param-engine.js` |

Private copies of `paint.js`:

- `nodes2d/button-node.js` and `nodes2d/postit-node.js` each contain `hexToRgb` and `shiftColor` byte-identical to `paint.js`; `button-node.js` also has an identical `roundRectPath`.
- `3d-support/bond-renderer.js` and `3d-support/molam-objects.js` both define a `BondRenderer` class with identical `setHalfColor`, `setbondLightness`, `setRingPink`, `setOpacity`, `setFade`, `clear` and `setAtomRange`.

The richest colour code is not loaded at all. `utilities2/colours.js` (`Colours`, 418 lines) has the perceptual conversions: LCH↔LAB↔XYZ↔RGB, hue interpolation, gradient and proximity interpolation. `utilities2/recoloring.js` has HSL conversion and canvas filters.

Proposed: one `js/colour/` module (or `2d-support/colour.js`):

1. A canonical colour value `{r,g,b,a}` with `parseHex` / `toHex` / `toCss`, absorbing the widget and param-engine versions. Accept 3, 6 and 8-digit hex, as `paint.js` already does.
2. `shift`, `lerp`, `hexToRgba` from `paint.js` and `omni-widget.js`.
3. Perceptual functions from `colours.js`, brought back from unloaded code as plain exported functions.
4. `ColorEngine` diverging schemes as a "scales" section.
5. `paint.js` keeps drawing helpers (`roundRectPath`, `rrPath`) and re-exports the colour functions during transition. Then delete the private copies in `button-node.js`, `postit-node.js` and `mask-scene-nodes.js`, and the param-engine re-implementation.

### 3.3 Other copy clusters worth one fix each

| What | Copies |
|---|---|
| `drawWigglyLine`, `applyBend` | `2d-support/workhorse.js` = `nodes2d/jatex-twisty-node.js` |
| `_bboxFromCorners` | `jatex-node.js` = `multiscroller-nodes.js` = `warpable-grid-node.js` |
| `getCentreXY` | 8 node classes, identical. A shared helper or a `Utils` mediator; your scene.js header already argues for mediators |
| `layout` of jatex family | `JatexDrawnNode`, `JatexSymbolNode`, `JatexTileNode`, `Twisty`, identical |
| `makeGroundPlane`, `makeRibbon`, `makeBonds` | `apps/molam-widget.js` = `apps/scenes-molam.js` |
| `resolveButtonNode` / `resolveFrameNode` / `resolveNetworkNode` | `apps/scenes-button.js`, `scenes-frame.js`, `scenes-network.js`, identical bodies under three names |
| `findByToken` | `apps/scenes-mask.js` = `omni-support/layer-ops.js` |
| `formatAtom` | `parsers/bmcif-parser.js` = `parsers/mmcif-parser.js` |
| `Ribbon` class name | `2d-support/ribbon2d.js` and `3d-support/ribbon3d.js`, both loaded on d-plus and omni-scene. Not a runtime clash with ES modules, but ambiguous to read and search |

### 3.4 Themes for grouping

The function-name themes from the report, read against who imports what, suggest these domain folders as the target shape:

| Domain | Today scattered across |
|---|---|
| **core** — registry, walk, values, mediators | `omni-support/` (scene, sys, values, utils, subtree/flyweight iterators) |
| **colour** | paint, omni-widget, omni-param-engine, color-engine, colours, recoloring |
| **2D geometry** — vectors, paths, shapes, snapping | 2d-support (vector2d, path, shape, geo, snap-engine…), utilities2 (line-geometry, path-ast) |
| **3D support** | 3d-support, utilities2/spherical |
| **parsing & markup** | parsers, utilities2/ast-manager, deep-wiki md* |
| **page chrome** — nav, help, menu, control panel | utilities2, omni-support/omni-control-panel |
| **apps / scenes** | apps, models, data |

---

## 4. A safe order of work

1. **Archive unloaded code.** 50 `.js` files (first given as 52; see the status table) in `website/` are loaded by no page; Code Cartographer lists them under *Usage → Files no page loads*. No behaviour change. Grep each name once for string-built paths before moving.
2. **One colour module** (3.2). Small, self-contained, and removes most of the identical-body hits in the report.
3. **Move widget nodes and stray nodes into node folders** (2.3), and fix the `MorphSliderWidget` copy.
4. **Split multi-node files** (2.2), largest first: `omni-widget.js`, `mol-scene-nodes.js`, `hud-panel.js`.
5. **Put Zones files in their own sub-folders** (2.1), then converge twins one at a time.
6. Redo the README tree from the result. It currently lists `ksy/`, `stand-alones/` and `tools/`, which are now in `attic/`, and omits `models/`, `demos/` and `deep-wiki/`.

---

## Appendix — live node types (website/)

Container = has a `ctxMix` `before_*`/`after_*` handler. World: **O** = Omni pages, **Z** = Zones demos. Not listed: `stage` (`nodes-html/host-omni-scene.js`, class from `HtmlHostNode.typed`) and `ms-cell` (`nodes2d/table-cell-node.js`, class from `createCellClass`), which are live but built by factories.

### Containers (49)

| Type | Class | File | World | Container hooks |
|---|---|---|:-:|---|
| `animate-scene` | `AnimateSceneNode` | nodes2d/mol-scene-nodes.js | O | before_measure before_draw2d after_draw2d |
| `basic-collection` | `BasicCollectionNode` | nodes2d/basic-collection-node.js | Z | after_child_hit_test |
| `box` | `BoxNode` | nodes2d/sizing-nodes.js | O | before_measure before_draw2d after_draw2d before_hit_test after_hit_test |
| `card-grid` | `CardGridNode` | apps/scenes-cards.js | O | before_mount after_mount before_update after_teardown |
| `chip-layer` | `ChipLayerNode` | nodes2d/chip-layer-node.js | O | before_draw2d before_child_draw2d after_draw2d |
| `clip-node` | `ClipNode` | nodes2d/clip-node.js | Z | before_draw2d after_draw2d |
| `control-group` | `ControlGroupWidget` | omni-support/omni-widget.js | O | before_mount after_mount |
| `flyweight-array` | `FlyweightArrayNode` | nodes2d/flyweight-array-node.js | Z | before_layout before_draw2d before_hit_test after_child_hit_test |
| `frac` | `JatexFrac` | nodes2d/jatex-node.js | O | after_measure after_draw2d |
| `frame` | `FrameNode` | nodes2d/sizing-nodes.js | O | before_draw2d before_hit_test after_hit_test |
| `frame-node` | `FrameNode` | nodes2d/frame-node-zones.js | Z | before_draw2d after_draw2d before_hit_test after_child_hit_test after_hit_test |
| `handle-frame` | `HandleFrameNode` | nodes2d/handle-frame-node.js | O | before_measure after_measure before_child_layout after_child_layout before_draw2d before_child_draw2d after_child_draw2d before_hit_test before_child_hit_test after_child_hit_test |
| `hstack` | `StackNode` | nodes2d/multiscroller-nodes.js | O | before_hit_test before_child_hit_test before_draw2d before_child_draw2d after_child_draw2d after_draw2d before_measure |
| `html-box` | `HtmlBoxNode` | nodes-html/html-nodes.js | O | before_teardown before_mount after_mount before_update |
| `html-host` | `HtmlHostNode` | nodes-html/html-host-node.js | O | before_mount before_update before_resize before_teardown |
| `html-repeat` | `HtmlRepeatNode` | nodes-html/html-repeat-node.js | O | before_mount before_update before_teardown |
| `html-template` | `HtmlTemplateNode` | nodes-html/html-template-node.js | O | before_mount after_mount |
| `html-variants` | `HtmlVariantsNode` | nodes-html/html-repeat-node.js | O | before_mount before_update before_teardown |
| `hud-panel` | `HudPanelNode` | nodes-html/hud-panel.js | Z | before_mount after_mount |
| `jatex` | `JatexNode` | nodes2d/jatex-node.js | O | after_measure |
| `jexp` | `JatexExpNode` | nodes2d/jatex-node.js | O | after_measure after_layout |
| `label-layer` | `LabelLayerNode` | nodes2d/ring-label-node.js | Z | before_draw2d after_draw2d |
| `layer` | `LayerNode` | nodes2d/omni-scene-nodes.js | O | before_draw2d after_draw2d before_hit_test after_hit_test before_measure after_measure before_layout after_layout |
| `lloyd` | `LloydMaskNode` | nodes2d/lloyd-mask-node.js | O | before_draw2d |
| `mind-map` | `MindMapNode` | nodes2d/workhorse-nodes.js | O | before_draw2d after_draw2d before_child_draw2d before_hit_test before_child_hit_test |
| `multiscroller` | `MultiscrollerNode` | nodes2d/multiscroller-nodes.js | O | before_draw2d after_draw2d before_child_draw2d before_hit_test before_child_hit_test after_hit_test |
| `nav-submenu` | `NavSubmenuWidget` | omni-support/omni-widget.js | O | before_mount after_mount |
| `nm-box` | `NmBoxNode` | nodes2d/sizing-nodes.js | O | before_measure before_draw2d after_draw2d before_hit_test after_hit_test |
| `nm-frame` | `NmFrameNode` | nodes2d/sizing-nodes.js | O | before_draw2d after_draw2d before_hit_test after_hit_test |
| `optgroup` | `OptgroupWidget` | omni-support/omni-widget.js | O | before_mount after_mount |
| `pane-camera` | `PaneCameraNode` | nodes2d/pane-camera-node.js | Z | before_draw2d before_hit_test after_hit_test |
| `panel` | `PanelWidget` | omni-support/omni-widget.js | O | before_mount after_mount |
| `pipper-node` | `PipperNode` | nodes2d/pipper-node.js | Z | before_hit_test after_child_hit_test after_child_draw2d after_draw2d |
| `postit-node` | `PostitNode` | nodes2d/postit-node.js | O | after_measure before_layout before_draw2d after_draw2d before_hit_test after_hit_test |
| `presets` | `PresetWidget` | omni-support/omni-widget.js | O | before_mount after_mount |
| `ribbon` | `RibbonNode` | nodes2d/ribbon-node.js | O | before_draw2d after_draw2d before_child_draw2d before_hit_test before_child_hit_test |
| `scene` | `SceneNode3D` | nodes3d/scene-node-3d.js | O | before_build after_build before_update after_teardown |
| `scene-root` | `SceneRootNode` | nodes2d/omni-scene-nodes.js | O | before_draw2d after_draw2d before_hit_test |
| `select` | `SelectWidget` | omni-support/omni-widget.js | O | before_mount after_mount |
| `slider-group` | `SliderGroupWidget` | omni-support/omni-widget.js | O | before_mount after_mount |
| `stack` | `StackNode` | nodes2d/multiscroller-nodes.js | O | before_hit_test before_child_hit_test before_draw2d before_child_draw2d after_child_draw2d after_draw2d before_measure |
| `stamp-frame` | `FrameNode` | nodes2d/frame-node.js | O | before_draw2d after_draw2d before_hit_test after_hit_test |
| `stock-strip` | `StockStripNode` | nodes2d/stock-strip-node.js | Z | before_draw2d before_child_draw2d after_child_draw2d before_hit_test after_child_hit_test |
| `three-scene` | `ThreeSceneNode` | nodes3d/three-scene-node.js | O | before_build after_build after_update before_resize after_teardown |
| `topics` | `TopicsWidget` | omni-support/topics-widget.js | O | before_mount after_mount |
| `uncenter` | `UncenterNode` | nodes2d/sizing-nodes.js | O | before_draw2d after_draw2d before_hit_test after_hit_test |
| `vstack` | `StackNode` | nodes2d/multiscroller-nodes.js | O | before_hit_test before_child_hit_test before_draw2d before_child_draw2d after_child_draw2d after_draw2d before_measure |
| `warpable-grid` | `WarpableGridNode` | nodes2d/warpable-grid-node.js | O | before_hit_test before_child_hit_test before_draw2d before_child_draw2d |
| `zoom-pan` | `ZoomPanNode` | nodes2d/sizing-nodes.js | O | before_draw2d after_draw2d before_hit_test after_hit_test |

### Leaves (112)

| Type | Class | File | World | Handlers |
|---|---|---|:-:|---|
| `addbar` | `AddBarWidget` | omni-support/omni-widget.js | O | mount |
| `atom` | `AtomNode` | nodes2d/workhorse-nodes.js | O | draw2d _drawSubDiagram _drawJatex hit_test |
| `axis-node` | `AxisNode` | nodes2d/axis-node.js | Z | draw2d |
| `bar-element` | `BarElementNode` | nodes2d/bar-element-node.js | Z | draw2d hit_test |
| `bga-pin` | `BGAPinNode` | nodes2d/bga-zone.js | Z | drawBackground draw2d hit_test |
| `binding-arrow` | `BindingArrowNode` | nodes2d/mol-scene-nodes.js | O | draw2d |
| `bond` | `BondNode` | nodes2d/workhorse-nodes.js | O | draw2d |
| `button` | `ButtonWidget` | omni-support/omni-widget.js | O | mount |
| `button-group` | `ButtonGroupWidget` | omni-support/omni-widget.js | O | mount |
| `button-node` | `ButtonNode` | nodes2d/button-node-zones.js | Z | draw2d hit_test |
| `button-node` | `ButtonNode` | nodes2d/button-node.js | O | draw2d hit_test |
| `button-row` | `ButtonRowWidget` | omni-support/omni-widget.js | O | mount |
| `camera` | `CameraNode` | nodes3d/camera-node.js | O | build update resize teardown measure layout draw2d |
| `chain-block` | `ChainBlockNode` | nodes2d/mol-scene-nodes.js | O | draw2d |
| `chem` | `ChemNode` | nodes2d/workhorse-nodes.js | O | draw2d hit_test |
| `chrome-node` | `ChromeNode` | nodes2d/chrome-node.js | Z | draw2d |
| `chromosome-band` | `ChromosomeBandNode` | nodes2d/chromosome-zone.js | Z | clipPath draw2d drawOverlay hit_test |
| `clip-outline` | `ClipOutlineNode` | nodes2d/mask-scene-nodes.js | O | draw2d |
| `code` | `CodeIslandNode` | nodes-html/chat-nodes.js | O | mount |
| `color-picker` | `ColorPickerWidget` | omni-support/omni-widget.js | O | mount |
| `control` | `CssVarSliderNode` | nodes-html/chat-nodes.js | O | mount |
| `custom` | `CustomWidget` | omni-support/omni-widget.js | O | mount |
| `deep-sky` | `DeepSkyNode` | nodes2d/sky-nodes.js | Z | draw2d hit_test |
| `diagrams` | `DiagramsNode` | nodes-html/chat-nodes.js | O | mount |
| `divider` | `DividerWidget` | omni-support/omni-widget.js | O | mount |
| `drag-point` | `DragPointNode` | nodes2d/drag-point-node-zones.js | Z | draw2d hit_test |
| `drag-point` | `DragPointNode` | nodes2d/drag-point-node.js | O | draw2d hit_test |
| `dumbbell-node` | `DumbbellNode` | nodes3d/dumbbell-node.js | Z | build3d |
| `dynamic` | `DynamicWidget` | omni-support/omni-widget.js | O | mount |
| `edge-ref` | `EdgeRefNode` | nodes2d/edge-ref-node.js | O | draw2d hit_test |
| `f1-barrel` | `F1BarrelNode` | nodes2d/mol-scene-nodes.js | O | draw2d |
| `fe-atom` | `FeAtomNode` | nodes2d/mol-scene-nodes.js | O | draw2d |
| `field-star` | `FieldStarNode` | nodes2d/sky-nodes.js | Z | draw2d |
| `filedrop` | `FileDropWidget` | omni-support/omni-widget.js | O | mount |
| `flash-card` | `CardNode` | apps/scenes-cards.js | O | mount teardown |
| `fracture-cone` | `FractureConeNode` | nodes2d/fracture-cone-node.js | Z | draw2d |
| `gamma-shaft` | `GammaShaftNode` | nodes2d/mol-scene-nodes.js | O | draw2d |
| `grid-bg` | `GridBgNode` | nodes2d/mask-scene-nodes.js | O | draw2d |
| `ground-plane` | `GroundPlaneNode` | nodes3d/ground-plane-node-zones.js | Z | build3d update3d |
| `ground-plane` | `GroundPlaneNode` | nodes3d/ground-plane-node.js | O | build teardown measure layout update draw2d resize |
| `heatmap` | `HeatmapNode` | nodes2d/heatmap-node.js | O | measure draw2d |
| `hex-chunk` | `HexChunkNode` | nodes2d/hex-view-zone.js | Z | draw2d |
| `his-lever` | `HisLeverNode` | nodes2d/mol-scene-nodes.js | O | draw2d |
| `html` | `RawHtmlNode` | nodes-html/chat-nodes.js | O | mount |
| `html-adopt` | `HtmlAdoptNode` | nodes-html/html-nodes.js | O | mount |
| `html-text` | `HtmlTextNode` | nodes-html/html-nodes.js | O | mount update |
| `hud-button` | `HudButtonNode` | nodes-html/hud-panel.js | Z | mount |
| `hud-checkbox` | `HudCheckboxNode` | nodes-html/hud-panel.js | Z | mount |
| `hud-color` | `HudColorNode` | nodes-html/hud-panel.js | Z | mount |
| `hud-select` | `HudSelectNode` | nodes-html/hud-panel.js | Z | mount |
| `hud-separator` | `HudSeparatorNode` | nodes-html/hud-panel.js | Z | mount |
| `hud-slider` | `HudSliderNode` | nodes-html/hud-panel.js | Z | mount |
| `imposter-atom` | `ImposterAtomNode` | nodes3d/imposter-atom-node-zones.js | Z | build3d update3d |
| `imposter-atoms` | `ImposterAtomNode` | nodes3d/imposter-atom-node.js | O | build update teardown measure layout draw2d resize |
| `info` | `InfoWidget` | omni-support/omni-widget.js | O | mount |
| `jatex.drawn` | `JatexDrawnNode` | nodes2d/jatex-electronic-node.js | O | measure layout draw2d |
| `jatex.sym` | `JatexSymbolNode` | nodes2d/jatex-node.js | O | measure layout draw2d |
| `jatex.tile` | `JatexTileNode` | nodes2d/jatex-tile-node.js | O | measure layout draw2d |
| `jatex.twisty` | `Twisty` | nodes2d/jatex-twisty-node.js | O | measure layout draw2d |
| `jsymbol` | `JatexSymbolResolver` | nodes2d/jatex-node.js | O | measure |
| `label` | `LabelWidget` | omni-support/omni-widget.js | O | mount |
| `layers` | `LayersWidget` | omni-support/layers-widget.js | O | mount |
| `lights` | `LightsNode` | nodes3d/lights-node.js | O | build update teardown measure layout draw2d resize |
| `line-chart-node` | `LineChartNode` | nodes2d/line-chart-node.js | Z | draw2d |
| `line-dot-element` | `LineDotNode` | nodes2d/line-dot-node.js | Z | draw2d hit_test |
| `lloyd-directions` | `LloydDirectionsNode` | nodes2d/lloyd-mask-node.js | O | draw2d hit_test |
| `molam-atoms` | `MolamAtomNode` | nodes3d/molam-atom-node.js | O | build update teardown measure layout draw2d resize |
| `molam-bond` | `MolamBondNode` | nodes3d/molam-bond-node-zones.js | Z | build3d update3d |
| `molam-bonds` | `MolamBondNode` | nodes3d/molam-bond-node.js | O | build update teardown measure layout draw2d resize |
| `molam-ribbon` | `MolamRibbonNode` | nodes3d/molam-ribbon-node.js | O | build update teardown measure layout draw2d resize |
| `morph-slider` | `MorphSliderWidget` | nodes2d/pipped-edge-ref-node.js | Z | mount |
| `morph-slider` | `MorphSliderWidget` | omni-support/morph-slider-widget.js | O | mount update |
| `mouse-button` | `MouseButtonNode` | nodes2d/mouse-zone.js | Z | drawBackground draw2d drawOverlay hit_test |
| `nav-checkbox` | `NavCheckboxWidget` | omni-support/omni-widget.js | O | mount |
| `nav-divider` | `NavDividerWidget` | omni-support/omni-widget.js | O | mount |
| `nav-item` | `NavItemWidget` | omni-support/omni-widget.js | O | mount |
| `nav-link` | `NavLinkWidget` | omni-support/omni-widget.js | O | mount |
| `number-input` | `NumberInputWidget` | omni-support/omni-widget.js | O | mount |
| `o2-molecule` | `O2MoleculeNode` | nodes2d/mol-scene-nodes.js | O | draw2d |
| `option` | `OptionWidget` | omni-support/omni-widget.js | O | mount |
| `organ-region` | `OrganRegionNode` | nodes2d/heatmap-zone.js | Z | drawBackground draw2d hit_test |
| `phylo-node` | `PhyloNode` | nodes3d/phylo-node.js | Z | build3d update3d |
| `piano-key` | `PianoKeyNode` | nodes2d/piano-key-zone.js | Z | draw2d hit_test |
| `pipped-button-node` | `PippedButtonNode` | nodes2d/pipped-button-node.js | Z | draw2d hit_test |
| `pipped-edge` | `PippedEdgeRefNode` | nodes2d/pipped-edge-ref-node.js | Z | draw2d hit_test |
| `pipped-polygon` | `PippedPolygonNode` | nodes2d/pipped-polygon-node.js | Z | draw2d hit_test |
| `planet-node` | `PlanetNode` | nodes3d/planet-node-zones.js | Z | build3d update3d |
| `porphyrin-plane` | `PorphyrinPlaneNode` | nodes2d/mol-scene-nodes.js | O | draw2d |
| `preset-item` | `PresetItemWidget` | omni-support/omni-widget.js | O | mount |
| `proton-channel` | `ProtonChannelNode` | nodes2d/mol-scene-nodes.js | O | draw2d |
| `ramachandran-chart` | `RamachandranChartNode` | nodes2d/ramachandran-chart-node.js | Z | _geom draw2d |
| `ramachandran-point` | `RamachandranPointNode` | nodes2d/ramachandran-point-node.js | Z | draw2d hit_test |
| `rect` | `RectNode` | nodes2d/mask-scene-nodes.js | O | draw2d hit_test |
| `rect-grid-cell` | `RectGridCellNode` | nodes2d/warpable-grid-node.js | O | draw2d |
| `ribbon-point` | `RibbonPointNode` | nodes2d/ribbon-node.js | O | draw2d hit_test |
| `ribbon3d` | `RibbonNode3D` | nodes3d/ribbon-node3d.js | O | build update teardown measure layout draw2d resize |
| `ring-label` | `RingLabelNode` | nodes2d/ring-label-node.js | Z | draw2d hit_test |
| `rotation-arrow` | `RotationArrowNode` | nodes2d/mol-scene-nodes.js | O | draw2d |
| `ruler` | `RulerNode` | nodes2d/workhorse-nodes.js | O | draw2d |
| `salt-bridge` | `SaltBridgeNode` | nodes2d/mol-scene-nodes.js | O | draw2d |
| `selection-action-bar` | `SelectionActionBarWidget` | omni-support/layers-widget.js | O | mount |
| `sheet-cell` | `SheetCellNode` | nodes2d/table-cell-node.js | O | draw2d hit_test |
| `star` | `StarNode` | nodes2d/sky-nodes.js | Z | draw2d hit_test |
| `status` | `StatusWidget` | omni-support/omni-widget.js | O | mount |
| `tags` | `TagsNode` | nodes-html/chat-nodes.js | O | mount |
| `text-input` | `TextInputWidget` | omni-support/omni-widget.js | O | mount |
| `toggle` | `ToggleWidget` | omni-support/omni-widget.js | O | mount |
| `topic-link` | `TopicLinkWidget` | omni-support/topics-widget.js | O | mount |
| `tree-ring` | `TreeRingNode` | nodes2d/tree-ring-zone.js | Z | _ring drawBackground draw2d drawOverlay hit_test |
| `tree2` | `Tree2Node` | nodes2d/workhorse-nodes.js | O | draw2d |
| `warpable-cell` | `WarpableCellNode` | nodes2d/table-cell-node.js | O | hit_test draw2d |
| `word-node` | `WordNode` | nodes2d/word-node.js | Z | draw2d hit_test |

### Registered in files no page loads (38)

`card-set` (nodes-html/card-set-node.js), `alggrid` (nodes2d/algorithms-node.js), `link` (nodes2d/algorithms-node.js), `cellrect` (nodes2d/algorithms-node.js), `blob` (nodes2d/blob-node.js), `camera-node` (nodes2d/camera-node-zones.js), `net-node` (nodes2d/network-node.js), `default` (nodes2d/scorpio-nodes.js), `h-stack` (nodes2d/scorpio-nodes.js), `v-stack` (nodes2d/scorpio-nodes.js), `overlay` (nodes2d/scorpio-nodes.js), `transform` (nodes2d/scorpio-nodes.js), `image` (nodes2d/scorpio-nodes.js), `tile` (nodes2d/scorpio-nodes.js), `text` (nodes2d/scorpio-nodes.js), `circle` (nodes2d/scorpio-nodes.js), `rectangle` (nodes2d/scorpio-nodes.js), `spacer` (nodes2d/scorpio-nodes.js), `chart` (nodes2d/scorpio-nodes.js), `graph` (nodes2d/scorpio-nodes.js), `bugle` (nodes2d/scorpio-nodes.js), `sankey` (nodes2d/scorpio-nodes.js), `parliament` (nodes2d/scorpio-nodes.js), `path` (nodes2d/scorpio-nodes.js), `tree` (nodes2d/scorpio-nodes.js), `arrows` (nodes2d/scorpio-nodes.js), `spline` (nodes2d/scorpio-nodes.js), `draggable` (nodes2d/scorpio-nodes.js), `drag2` (nodes2d/scorpio-nodes.js), `prog` (nodes2d/scorpio-nodes.js), `overlay` (nodes2d/structural-nodesxxx.js), `rect` (nodes2d/structural-nodesxxx.js), `label` (nodes2d/structural-nodesxxx.js), `overlay` (nodes2d/structural-nodesxxx.js), `vstack` (nodes2d/structural-nodesxxx.js), `hstack` (nodes2d/structural-nodesxxx.js), `transform` (nodes2d/transform-node.js), `planet` (nodes3d/planet-node.js)
