# website-unloaded

Files moved out of `website/` on 28 Oct 2026 because no page in `website/`
loads them, directly or through imports. Paths below this folder mirror their
old place under `website/`, so any one comes back with

    git mv attic/website-unloaded/js/<path> website/js/<path>

`node docs/tests/load-graph.mjs --unloaded` lists what is currently unloaded.
The parsers and grammars (`website/js/parsers/`) were left in place: nothing
loads them yet, but the work plans in `attic/cascade/` intend to.

Brought back since: `data/demo-fns.js` (28 Oct, for omni-grid's generated
samples). Superseded by the rebuilt `attic/unfolded` apps, so left here:
`nodes2d/algorithms-node.js`, `nodes2d/structural-nodesxxx.js` (omni-run now
uses `trace-cell` / `trace-link`) and `nodes-html/card-set-node.js` (omni-card
now uses `card-grid`).

Moved here later (28 Oct): `nodes2d/mol-scene-nodes.js` and
`2d-support/mol-primitives.js`, the special-purpose animation nodes, replaced by
the generic shape / caption / polyline / composite / fit-stage nodes.

Moved here 29 Oct: `nodes2d/blob-node.js`, a debugging dot pair that read the
chart's `ctxMix.outerPos` side channel, which went when the chart moved onto
the general T.

Some of these are used from elsewhere. `apps/omni-picker-model.js` and
`omni-support/tree-browser.js` import from a sibling `q-legacy/` checkout, and
`nodes2d/algorithms-node.js` imports `./structural-nodes.js`, which no longer
exists (`structural-nodesxxx.js` is the nearest).
