# unfolded

Four apps from before the scene graph, plus the reorganisation map and the
Code Cartographer tool that produced it. The apps were built on per-app
`CanvasScene` / `HtmlScene` / `SvgScene` base classes, which are not in this
repository, so none of them load as they are.

As of 28 Oct 2026 all four are rebuilt in `website/` on the OmniScene pattern:
each is one or more scenes in `SCENES` (so OmniScene and d-plus can show them
too), and a page in `website/html/` boots `OmniSceneApp` on its own scene
group. The files here are kept for reference.

| Old file | Page | Scenes and nodes | Notes |
|---|---|---|---|
| `omni-run.js` | `html/omni-run.html` | `apps/scenes-run.js`; `trace-cell`, `trace-link`; algorithms in `models/algorithm-traces.js` | Real nodes, written by the model from `time`. The old flyweight iterator (`attic/website-unloaded/js/nodes2d/algorithms-node.js`) and `structural-nodesxxx.js` are not used. |
| `omni-card.js` | `html/omni-card.html` | `apps/scenes-cards.js` (`card-grid`, `flash-card`) | The card scene already had everything except the CSV drop, which is added. `card-set-node.js` stays in the attic, superseded. |
| `omni-gguf.js` | `html/omni-gguf.html` | `apps/scenes-gguf.js`; `tensor-block`; parser in `parsers/gguf-parser.js` | Two scenes, Model blocks (2D) and Metadata (HTML), replace the text/canvas cross-fade. Test: `docs/tests/gguf-parse-test.mjs`. |
| `omni-grid.js` | `html/omni-grid.html` | `apps/scenes-grid.js`; `grid-view` wraps `2d-support/grid-scene.js` | **Opaque, for now.** `GridScene` is kept whole on a stand-in camera base. To unwrap later, with the sticky headers reusing the table's own cell drawing. |

## What the rebuild added to the framework

- `OmniSceneApp`: `layer.inst.updateValues(layer, params, app)` runs before
  each render. The model writes node values there; nodes only draw. Also a
  `groups` option, so a page offers only its own scenes, and `onDrop` for
  `filedrop` sections gets `(files, layer, app)`.
- `Omni2d`: a node under the cursor may own the wheel
  (`interactions.applyWheel`); pointer-down renders after the first
  `applyDrag`.
- `html-text`: `value.raw` shows text as it is (no `{param}` filling) and
  re-reads it on update.

A node cannot write params during a walk: the layer copies its params in on
the way down and restores them on the way up. Where the pointer changes
something a slider shows (the grid's zoom and focusAlign), the model reads it
back from the node (`GridViewNode.readBack`) and writes the layer's params.
