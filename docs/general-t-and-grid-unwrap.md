# A general T, and unwrapping OmniGrid

Design note, 28 Oct 2026, written against commit `66e5775`. Covers items 1
and 6 of the end-of-day list in `twin-merge-plan.md`. **Built 29 Oct**, in
the order of section 5, one commit per step (`7fe51e4` … `62f917e`). Section
0 says what was built and where it differs from the design; sections 1–6 are
the design as written, kept for its reasoning.

## 0. As built (29 Oct)

**Decisions taken** (section 6): OmniGrid is built on the chart code (4.5 a).
Text stays rigid; labels on biarcs, using the warping code, are for later.
Local units are pixels along the spine. `zoom-pan > frame` retired from the
chart only: jatex, heatmap and animate still use `zoom-pan`.

**What exists now**

| Piece | Where |
|---|---|
| The T interface on the affine `Transform`: `isAffine`, `affine`, `scaleAt`, `scaleX/Y`, `angleAt`, `frameAt`, `mapQuad`, `mapRect`, `localBounds`, `pinned`, `ctxMatrix` | `omni-support/transform.js` |
| `PathTransform(path, parentT, {length, cross})`, `NestedTransform` (affine child), `blendedTransform` | `2d-support/path-transform.js` |
| `pathPointAt` with `pointAt` on `SectorPath` and `BlendedPath` (a sector's cross section is an arc, not a chord) | `2d-support/path.js` |
| The chart on T: `warpable-grid` pushes `PathTransform(outer)`, each `vstack` replaces it with `PathTransform(inner)`, the cell maps a quad | `nodes2d/warpable-grid-node.js`, `multiscroller-nodes.js` |
| One cell, `table-cell`, for chart and table | `nodes2d/table-cell-node.js` |
| Variable column widths (`colWeights`) and column culling | `warpable-grid-node.js` |
| `sticky`: a band that pins T on one axis | `nodes2d/sticky-node.js` |
| OmniGrid's pane: `grid-viewport` | `nodes2d/grid-viewport-node.js` |

`grid-scene.js` (GridScene), `grid-view`, `warpable-cell`, `sheet-cell`,
`ms-cell`, `rect-grid-cell` and `blob` are gone (`blob` to the attic).

**Where it differs from the design**

- **Paths live in the parent's local space, not the screen's.** A
  `PathTransform` is the path composed with its affine parent (2.3's "affine
  outside" case), so the chart's path code is unchanged and every number it
  computes is what it was. Exact under any similarity; under a non-uniform
  parent the corners are exact and the arc bends approximate.
- **`length` is the stack's nominal length, not the path's.** A sector's
  radial length is half its stack height, but the chart's pixels run over the
  full height, so the stack passes its height and t = x / length as before.
- **`mapQuad` goes through `cornersAt` for full-width quads.** Segment gaps,
  wedges and the neighbourliness trapezoid then come out exactly as before;
  a quad inside the band interpolates with `pathPointAt`.
- **Rows never enter T, and `sticky` pins at a band.** As corrected in 4.1:
  the viewport's T has x pan and zoom; `sticky` is `T.pinned(axis, band
  edge)` plus a clip, a fill, a fade and param overrides for its subtree.
  The bands' rects come from the parent in `ctxMix.bands`.
- **Focus is the multiscroller's focal block.** GridScene's focus ranges and
  `focusAlign` are what the `SyncOrchestrator` already does: the run of
  same-initial rows is the focal block of every data column and the row
  names, the letter that of the A–Z index (a cyclic column), and focusAlign
  is the shared ratio, so the index moves at its own speed. Two orchestrator
  changes made it general: a source column's focal block may be several
  items, and `select` anchors on its first.
- **Data shaping went into the cell's value through `flyFn`**, as 3.2 says;
  OmniGrid's table is a transposed, permuted view of the data
  (`TableView`), so a chart column is a table column.

**Checks**

- Golden images (`docs/tests/golden-images.py`): every chart preset ×
  dataset at zoom 1 pixel-identical to before; at zoom 0.6 the same
  geometry, with strokes that no longer zoom and text scaled by the zoom
  (it was the zoom squared). OmniGrid within 1.6 % of the old renderer's
  pixels at every sample and zoom.
- `docs/tests/path-transform-test.mjs`: 6333 checks, every path type.
- `docs/tests/multiscroller-drag-test.py`: 15 cases, both bend axes, zoom, pan.
- `docs/tests/omnigrid-test.py`: 40 checks — pointer, alignment, clamping,
  GridScene's runs, focusAlign with the index, readBack, culling, speed (a
  1000 × 1000 table: 26 columns walked, 21 ms a frame).

**Size.** The chart's own code went from 2897 to 2461 lines (the cell 799 →
443, the sizers 230 → 75; the grid grew 84 lines for variable widths,
culling and the table hooks), about 15 % less, with 255 lines of
`PathTransform` shared by everything. OmniGrid went from 1521 lines
(GridScene, its wrapper and the scene) to 1273 (viewport, sticky, scene),
and draws with the chart's cell.

**Bugs fixed on the way:** `RoundedWarpedPolygon.renderCtx`/`renderSvg` drew
the top line on a side edge; `transformedCtx` ignored rotation; the chart's
CSV loader looked for node types that no longer existed; `DataAdapter` made
NaN sizes from text cells.

**Left as they are**

- Column culling only while the chart is straight; a bent chart walks every
  column (`localBounds` of a bent T is conservative, but inner paths reach
  outside the outer band).
- Gridiness keeps equal cells when columns have weights; donuts keep one
  common size.
- A rotated child in a bent band maps its corners exactly and its edges
  approximately (`approx` on the result).
- The A–Z index draws rounded cells where GridScene drew circles.
- Text is rigid (biarc labels: later).

## Summary

**Would OmniChart be tidier and more general? Yes on both counts, but the
gain is more in generality and one shared contract than in line count.**

- **What already exists.** OmniChart already contains a non-affine coordinate
  system. The `Path` classes in `2d-support/path.js` map "along/across"
  parameters to screen, can bend, fold into a grid and blend.
- **What's wrong with how it's used.** That system is wired in by hand:
  - side channels on `ctxMix` (`innerPath`, `outerPath`, `flyweight.corners/bends/t0/t1`);
  - bounding-box stamping onto child nodes;
  - a cell that does its own geometry, text tilt and hit testing;
  - the old ctx-scaling contract underneath (`zoom-pan > frame`, `params.zoom` in the cells).
- **The proposal.** Make the `Path` system the general `T`. The chart then
  works the way every other container does since D3: it pushes `T` and its
  cells draw a rectangle in their own local units.
- **Size.** About a fifth less code in the chart. More importantly, a chart
  cell becomes the same cell as a table cell. Whatever you put inside a
  chart's band (a caption, a sparkline, a jatex, a drag-point) follows the
  bend without knowing it.
- **What stays.** The part that is genuinely the chart, `InnerPathBuilder`
  with its baseline, alignment, selfLevel and rotateStack, stays as it is.
  It is the chart's content, not plumbing.

**Unwrapping OmniGrid falls out of the same move.** The table is the chart
with a straight path. The sticky headers become a generic `sticky` container
that drops one axis of the camera from `T`. Under it sits the same cell code
as the table body, which is the reuse you asked for.

## 1. What is there now

### 1.1 T

`omni-support/transform.js` is affine: `origin`, `sx`, `sy`, and since
today an optional `rot`.

- **Readers:** containers push it (layer, handle-frame, stamp-frame,
  composite, fit-stage), and D3 nodes read it through `toScreen`, `toLocal`
  and `uniformScale`.
- **Code that assumes affine:** thirteen lines in eight files read
  `T.sx`, `T.sy`, `T.origin` or `T.rot` directly. Four are in
  `omni-scene-nodes.js` (mostly `transformedCtx`), three in
  `button-node.js`, and one each in `shape-node`, `caption-node`,
  `ribbon-node`, `postit-node`, `handle-frame-node` and `edge-ref-node`.

### 1.2 OmniChart

The AST is a three-node flyweight, built in `apps/omni-chart-model.js`:

```
zoom-pan > frame > warpable-grid (value = DataAdapter)
                     vstack            one prototype, one per category column
                       warpable-cell   one prototype, one per product row
```

| Node | What it does today |
|---|---|
| `warpable-grid` (`nodes2d/warpable-grid-node.js`) | In `before_draw2d` it builds the **outer path**: a `BlendedPath` of linear ↔ arc (`bend`), then ↔ grid (`gridiness`), rotated by `rotateChart`. For each column it asks `InnerPathBuilder` for an **inner path**, a blend of linear, sector and donut (`bendStack`), anchored on the outer path's frame at that column. It hands the inner path down as `ctxMix.innerPath`. It also stamps `child.width/height/xOffset/yOffset` for the clipping iterator, and writes two diagnostic points, `ctxMix.outerPos` and `outerPos2`. |
| `vstack` (`StackNode`, `nodes2d/multiscroller-nodes.js`) | Iterates rows with a `ClippingIterator` working in **pixels**. It converts to path parameter `t` with `_pixelToT` / `_sizeToT`, whose comment says they disappear "when ClippingIterator moves to t-space". It writes `flyweight.corners`, `bends`, `t0` and `t1`, and stamps the child's **bounding box of the warped corners**, which is meaningless once the cell curves. |
| `warpable-cell` (`nodes2d/table-cell-node.js`, about 230 lines of `draw2d`) | Looks up the segment (`y0`/`y1`, stacked or not). Applies neighbourliness: the far edge takes the next column's values. Calls `innerPath.cornersAt(t0, t1, t0A, t1A)` and `edgeBends`, and renders through `WarpedPolygon` (arc edges). It also does the flash accent along an arc, the blob at the centroid, and the text. Text tilt is computed from the corners, size uses `params.zoom`, and it is drawn on raw ctx. Hit test builds a `Path2D` and calls `isPointInPath` with the ctx transform reset. |

The geometry library under all this is good. Every path implements one
interface (`path.js` header):

- `positionAt(t)`, `angleAt(t)`, `frameAt(t)`;
- `cornersAt(t0, t1, t0Alt, t1Alt)`, `edgeBends(t0, t1)`;
- `childCentreDirAt(t)`, `tFromScreen`, `screenToT`, `isVisible`.

The paths are `LinearPath`, `ArcPath`, `SectorPath`, `GridPath`
(`WrappedPath`) and `BlendedPath`, plus `buildBentChild` for the cascade.

### 1.3 OmniGrid

`2d-support/grid-scene.js`, today's opaque `grid-view`, is about 830 lines
of one class. It provides:

- a camera `{x, y, zoom}` with clamping, edge-anchored zoom and zoom-to-fit;
- **semantic zoom**: cell height and column widths blend from a 4 px heatmap
  to measured table sizes between zoom 0.12 and 0.5, and text and headers
  fade in;
- content-measured column widths, optionally including the header;
- visible-range culling, which matters because the large wave sample is
  1000 × 1000;
- **sticky** column headers and row names, drawn by a second and third
  pass with their own clip and part of the camera;
- a cyclic A–Z index column with its own scroll;
- focus ranges and `focusAlign` scrolling;
- distance-matrix fade, `colorTarget`, smooth/stepped colour scales, blob
  mode, text alignment and reversed rows/columns.

### 1.4 Three copies of one cell

The value-to-look logic exists three times:

1. GridScene's cell loop.
2. `CellConfig.resolveVisuals` in `table-cell-node.js`, used by
   `sheet-cell`. It is GridScene's colour, distance-fade and blob logic,
   nearly line for line.
3. `warpable-cell`, which uses `CellConfig` for state and hue but draws
   its own way.

`multiscroller-nodes.js` already describes itself as morphing "between the
multiscroller table, to stacked bar charts, and further … to donut charts
and spider diagrams". The chart presets include **Grid** (`useValue: 0,
showValue: 1`), which is a table.

The unification is half-built. The missing half is a coordinate contract
that lets one cell be drawn under any of those geometries.

## 2. A general T

### 2.1 Interface

`T` becomes an interface with two implementations. Everything a node needs
goes through methods, never fields.

| Method | Affine (`Transform`, today's) | `PathTransform` (new) |
|---|---|---|
| `toScreen(p)` | as now | `positionAt(u)` plus `v` along the normal (radially for arcs and sectors) |
| `toLocal(q)` | exact inverse | closed form for linear and arc; for sector, grid and blend, `tFromScreen` plus a projection. May be approximate (see 2.4). |
| `isAffine` | `true` | `false` |
| `scaleAt(p)` | `uniformScale` | √\|det J\| at `p` (stretches along a bend) |
| `frameAt(p)` → `{ origin, ex, ey }` | constant axes | tangent and normal at `p`, scaled |
| `mapQuad(q0..q3)` → `{ corners, bends }` | 4 mapped corners, bends 0 | the image of a local quadrilateral. Edges along the spine get arc bends from `edgeBends`; others are straight. |
| `mapRect(x0, y0, x1, y1)` | `mapQuad` of the rect | the same |
| `child(offset, sx, sy, rot)` | as now | an affine child **inside** the path's local space (2.3) |
| `localBounds(screenRect)` | exact | conservative, for culling |

- **`uniformScale`** stays as a getter equal to `scaleAt(origin)`, so the
  seven files that use it keep working.
- **`mapQuad` is the one new idea.** A cell no longer computes corners. It
  says which local quad it occupies, and `T` says how that quad looks on
  screen, as corners plus arc bends. That pair is what `WarpedPolygon`
  already renders.

### 2.2 PathTransform

`PathTransform` wraps any `Path`:

- **Local `x`** is distance along the spine, in pixels, from 0 to
  `path.length`.
- **Local `y`** is distance across, from −`crossSize`/2 to +`crossSize`/2.
- The corner and edge conventions are the ones `path.js` already documents.

Working in pixels rather than `t` is what lets the clipping iterator stay in
pixels and delete the `_pixelToT` bridge. The conversion happens once,
inside `T`.

`BlendedPath` gets the same treatment, as `BlendedTransform(A, B, k)`.
Preset morphs between a bar chart and a pie then animate a single `k` on a
single `T`.

### 2.3 Composition

Composition is the hard part, so the rule is simple:

- **Affine inside non-affine is allowed.** An affine child of a
  `PathTransform` maps child → path-local (affine), then path-local → screen.
  `toScreen` and `toLocal` are exact.
  - `mapRect` is exact when the child's axes stay aligned with the path's.
    That covers translation and scale, which is the chart and the table.
  - With rotation, an edge of a rotated rect is not an arc after a bend.
    `mapQuad` then **samples** each edge (eight points) and returns a
    polyline, flagged `approx`.
- **Non-affine inside non-affine is a cascade, not a composition.** The
  chart's inner paths are not the outer path composed with something. They
  are new paths built in screen space from the outer path's frame
  (`InnerPathBuilder`, `buildBentChild`). So the column container
  **replaces** `T` with `PathTransform(innerPath)` rather than composing it.
  That is honest about what the maths does, and it keeps every per-cell
  operation exact.

### 2.4 Hit testing

The default is `T.toLocal(screenHitPoint)` followed by a test in local
units. Where `toLocal` is approximate (blends, grids), a node can instead
test against the screen polygon from `mapQuad`, which is today's
`isPointInPath` approach and is exact. Drags capture `T` as now and invert
with `toLocal`. For a drag along a bent band, the result is "distance along
the spine", which is what a value handle on a curved bar should change.

### 2.5 Text and level of detail

ctx-drawn text cannot be bent by a ctx transform:

- **Rigid placement:** labels are placed at `frameAt(centre)`, so they rotate
  with the band. That is what `tiltText` does by hand today, as a lerp
  between screen-horizontal and the band's direction.
- **Bent text** (glyphs along an arc) would be a separate option that places
  glyph by glyph. Nothing needs it yet.
- **Level of detail:** `scaleAt` gives semantic zoom one shared input. A
  cell hides its text when its mapped height is under a threshold, and a
  grid switches from heatmap to table.

### 2.6 What changes for existing nodes

- **Code assuming affine.** The thirteen direct field reads (1.1) move to
  methods or get an `isAffine` guard:
  - `transformedCtx` only makes sense for affine `T`, so it asserts that;
  - `shape` and `caption` use `frameAt` for their rotation;
  - `button`, `ribbon`, `edge-ref`, `postit` and `handle-frame` read
    `toScreen` / `scaleAt`.
- **Nothing else changes until a container pushes a `PathTransform`.** Until
  then every `T` is affine and behaves exactly as today.

## 3. OmniChart on the general T

### 3.1 The tree, after

```
layer (T: centre, zoom)
  warpable-grid          pushes PathTransform(outerPath), sizes from the box it is given
    vstack (per column)  replaces T with PathTransform(innerPath(col)); clips rows in local px
      table-cell         draws local quad [x0, y0 .. x1, y1A]
```

The old `zoom-pan > frame` pair goes. The layer's `T` already carries zoom
and centring for every other scene, and `frame`'s ctx scaling is the
convention-A behaviour the frame work removed from everything else.

### 3.2 The cell, after (sketch)

```js
static draw2d(ctxMix, node, params) {
  const T   = ctxMix.T;
  const seg = ctxMix.getValue(ctxMix, node, params);      // y0, y1, next-column y0A/y1A, text, colour
  const { corners, bends } = T.mapQuad(                    // neighbourliness = a trapezoid in local units
    { x: 0, y: seg.y0 }, { x: 0, y: seg.y1 },
    { x: seg.w, y: seg.y1A }, { x: seg.w, y: seg.y0A });
  drawWarped(ctxMix, corners, bends.map(b => b * params.curviness), seg.colour, params);
  drawAccentAndBlob(ctxMix, corners, bends, T.scaleAt(seg.centre), params);
  drawLabel(ctxMix, seg.text, T.frameAt(seg.centre), params.tiltText);
}
```

- **Where the data shaping goes.** Stack, normalise and neighbourliness move
  into the value the cell reads, via the flyweight resolver, which is where
  D3 says data comes from.
- **What's left in the cell.** Drawing. A straight `T` gives the sheet look,
  a bent one gives a radial bar, and the cell can't tell the difference.

### 3.3 What disappears and what stays

| Goes | Stays |
|---|---|
| `ctxMix.innerPath`, `ctxMix.outerPath`, `outerPos` / `outerPos2` | `InnerPathBuilder` and its specials: baseline, alignment, selfLevel, rotateStack, centreDir |
| `flyweight.corners`, `bends`, `t0`, `t1` | every `Path` class and `buildBentChild` |
| `StackNode._pixelToT`, `_sizeToT`, `_stampChild`, `_buildPath` (about 45 lines) | `ClippingIterator`, `SizeCache` and `SyncOrchestrator` (in local px now) |
| corner arithmetic and text tilt in the cell (about 90 of 230 lines) | `WarpedPolygon` / `RoundedWarpedPolygon` as renderers |
| `params.zoom` in cells; the `frame` / `zoom-pan` wrapper | `DataAdapter.getSegment` and the prefix-sum cache |
| `sheet-cell`, `ScrollCellNode` and `warpable-cell` as separate draw paths | `CellConfig` as the style policy (hue, state, `resolveVisuals`) |

**Estimate:** the chart path shrinks by about 15–20 %. The bigger change is
conceptual surface:

- one coordinate contract across the library, where today the chart is the
  last big holdout of the old one;
- one cell type where there are three;
- the only `ctxMix` side channels left are iterators and flyweight cursors.

### 3.4 More general, concretely

- **Anything in a band follows the band.** Children of a cell (a sparkline,
  a jatex value, a drag-point handle on a bar end) draw in the cell's local
  units and bend with it. Today they would have to reimplement
  `cornersAt`.
- **Variable band widths.** The outer path currently splits evenly
  (`bandW = w / rowCount`). If columns take spine intervals from a size
  function, the same code draws Marimekko and variable-width bars. OmniGrid
  needs exactly this for its measured column widths (4.4).
- **Hit testing and drags become uniform.** A value handle on a curved bar
  gets "distance along the spine" from `toLocal`.
- **Blends are a `T`.** `BlendedTransform` animates any content, not only
  chart cells. A ribbon in a post-it could morph from straight to arc.
- **Not overclaimed:** the radial label code (`annular-labels.js`,
  `ring-label`) does little of its own geometry, so it gains little.

### 3.5 Costs

- **Rotated children in bent bands are approximate** (sampled edges). That's
  acceptable for decoration; it would not be for a precise diagram.
- **Some inverses are approximate.** `toLocal` is approximate for blends and
  grids, so hit tests there keep the polygon test.
- **Rigid text.** Text stays rigid unless glyph-by-glyph placement is added.
- **Regression surface.** There are 17 presets over four datasets (two flat,
  two trees), so verification has to be by image (section 5).

## 4. Unwrapping OmniGrid

### 4.1 The tree

```
layer
  grid-viewport            camera {x, zoom}; clip; pushes T = inset · scale(zoom) · translate(-x)
    table-body             columns culled by T.localBounds; each column a multiscroller stack
      table-cell           the same cell as the chart (3.2), under a straight T
    sticky pin=y           column headers: a band above the body, outside the row scroll
      table-body (header row: getColName)   ← same flyweight, same cell
    sticky pin=x           row names: T with the camera's x dropped; a synced column like the others
      table-body (row-name column)
    sticky pin=x,y         corner
    sticky pin=x scroll=index   A–Z index: its own scroll, a cyclic data source
      table-body (letters)
```

**Rows scroll in the columns, not in T.** The camera has no y. Vertical
scroll stays where the multiscroller keeps it: each column's anchor item
and offset, walked outward by the `ClippingIterator`, so no column ever
needs its total size or a position for row 0. A y translation in T would
need both, and would put rows a million down at float positions far from
the viewport. T carries only the x pan and the zoom; `T.localBounds` culls
columns, and each column's own clip decides its rows.

### 4.2 Sticky headers that reuse the table's drawing

`sticky` is a small generic container:

- **What it does:** it takes the parent `T` and replaces the translation on
  its pinned axis (`T.pinned('y', bandTop)`), then clips to its band.
- **What its children are:** the same table flyweight and the same cell, fed
  a header data source (row −1 → `getColName`).
- **What you get:** header cells line up with body columns by construction,
  because they share the column layout and the cell code. They also pick up
  every cell option (alignment, colour scheme, LOD) for free.
- **Wider use:** charts can use the same node for axis labels and legends.

### 4.3 Semantic zoom

GridScene's heatmap ↔ table blend is layout responding to zoom, not just
scale:

- `grid-viewport` publishes its zoom as a param; the column and row size
  functions read it, as GridScene's `getCellDimensions` does today.
- Cells pick their detail from `T.scaleAt`: text alpha, header alpha.

The rule is the same one the chart would use for hiding labels on thin
segments.

### 4.4 Columns and culling

- **Column widths:** measured widths become per-column intervals along the
  straight outer path. That is the variable-band-width generalisation in
  3.4, built once and used by both.
- **Culling:** in both axes, through `T.localBounds(viewport)` →
  `[firstCol, lastCol] × [firstRow, lastRow]`. It's exact for the straight
  `T`.
- **What the chart gains:** the chart iterates every column today (a
  `RepeatIterator` over the categories), so it gets column culling for free.

### 4.5 Grid as a chart preset, or a sibling

The apparent difference is that a grid's columns scroll together while a
multiscroller's scroll at different speeds. It isn't a second mode.
`SyncOrchestrator` keeps each column's focal block at the same ratio of
that column's own travel, `offset / (viewport − focalSize)`. In a grid the
active cursor translates to one row in every column, all the same height,
so every `focalSize` is equal, and equal ratios mean equal offsets: the
columns move together. The grid is the degenerate case of proportional
sync, and needs no locked mode. (Verified by
`docs/tests/multiscroller-drag-test.py` for the tree case: ratios agree to
four decimals at every step, straight and bent on both axes.)

So the choice is only about sharing:

- **(a)** OmniGrid is the chart machinery with a straight path and
  equal-height rows. One table/chart implementation; the Grid preset and
  OmniGrid converge.
- **(b)** OmniGrid is a sibling that shares only `T`, the cell and `sticky`.

I'd take (a). It's the generalisation this project is about, and it makes
"table → bar chart → donut" one continuous slider in OmniGrid too. Try (b)
if the multiscroller's per-column state turns out too costly at 1000
columns.

### 4.6 What moves where

| GridScene part | Goes to |
|---|---|
| camera, clamp, edge-anchored zoom, zoom-to-fit | `grid-viewport` (about 150 lines) |
| cell loop, colours, distance fade, blob | `table-cell` + `CellConfig.resolveVisuals` (already there) |
| header and row-name passes | `sticky` + the same cells (about 40 lines, generic) |
| A–Z index | a cyclic data source and its own scroll (about 60) |
| focus ranges, `focusAlign` | the grid model (`apps/scenes-grid.js`, which already owns readback) |
| column measuring | a size function on the outer path |

GridScene's 830 lines would become roughly 350 new lines plus reuse. The
`grid-view` wrapper and `GridCamera` go.

## 5. Order of work and checks

Each step is a commit, and the repo works after any of them.

1. **Golden images first.** Screenshot every chart preset × dataset, and
   OmniGrid at three zooms × four samples, using the headless runner from
   this session. Every later step diffs against these.
2. **Interface, affine only:** add `isAffine`, `scaleAt`, `frameAt`,
   `mapQuad`, `mapRect`, `localBounds` and `pinned` to `Transform`, and move
   the thirteen direct field reads onto methods. No pixel changes.
3. **`PathTransform` + `BlendedTransform`,** with a node test that compares
   `mapRect` against `cornersAt` / `edgeBends` for every path type over a
   grid of `t` values.
4. **Chart onto `T`:** grid and vstack push `T`, cells read it, the side
   channels go, and `zoom-pan > frame` is dropped. Diff all presets.
5. **One cell:** `warpable-cell` and `sheet-cell` become `table-cell`.
6. **Variable band widths and column culling** in the outer path.
7. **OmniGrid unwrap:** `grid-viewport`, `sticky` and the shared flyweight,
   with rows scrolled by the columns' own sync (4.1, 4.5). Then delete
   `grid-scene.js`.

Steps 2 and 3 are worth doing on their own. Step 4 is the one that pays.

## 6. Decisions (taken 29 Oct)

1. **4.5:** OmniGrid as the chart machinery (a). *Built.*
2. **Text:** rigid, frame-aligned for now; labels on biarcs, using the
   existing warping code, later.
3. **Local units:** pixels along the spine.
4. **The old chart contract:** `zoom-pan > frame` retired from the chart;
   `zoom-pan` stays for jatex, heatmap and animate.
