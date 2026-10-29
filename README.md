# DeepExplorer

DeepExplorer is an experiment in user interface. It creates a conversational UI, suitable for text messages and chats with AI bots, and with rich customisable diagrams. Open source, MIT licensed.

The project also has some tools for working with code.

## Current Status

Rich diagrams work. The chat interface is just a place holder.

## Project Structure

```
DeepExplorer/
├─ website/                     # everything that is served
│  ├─ index.html                # clickable index of the pages
│  ├─ html/                     # --> START HERE. The top level programs
│  │  ├─ omni-scene.html        #   the scene editor
│  │  ├─ molam.html             #   molecular structure viewer
│  │  ├─ omni-run.html          #   algorithm traces     } OmniScene scenes,
│  │  ├─ omni-card.html         #   card grid from CSV   } one page each,
│  │  ├─ omni-gguf.html         #   GGUF model viewer    } from attic/unfolded
│  │  ├─ omni-grid.html         #   matrix/heatmap viewer}
│  │  └─ ...                    #   aa-colors, cmos-viewer, tree-browse
│  ├─ deep-wiki/d-plus.html     # the main 'everything app' (Markdown+ chat UI)
│  ├─ demos/                    # Zones demo pages; panopticon.html has them all
│  ├─ css/                      # shared css
│  └─ js/
│     ├─ omni-support/          # the framework: scene.js (registry, walker), sys.js,
│     │                         #   values.js, harnesses, control panel, param engine
│     ├─ nodes2d/               # scene graph nodes, 2D canvas
│     ├─ nodes3d/               # scene graph nodes, three.js
│     ├─ nodes-html/            # scene graph nodes, HTML
│     │  └─ widgets/            #   panel and nav widgets, one file per type
│     ├─ models/                # ready-made scenes (Zones), registered in SYS.MODELS
│     ├─ apps/                  # app and scene code behind the pages
│     ├─ 2d-support/            # 2D geometry, paths, ribbons, snapping, paint
│     ├─ 3d-support/            # three.js boot, molecule objects, ribbons, colours
│     ├─ colour/                # colour.js (hex/rgb arithmetic), perceptual.js (LCH)
│     ├─ parsers/               # my parser, grammars, AST manager, file formats
│     ├─ data/                  # sample data and data adapters
│     └─ page/                  # page chrome: nav (hamburger menu), help
├─ docs/                        # plans (twin-merge-plan.md, general-t-and-grid-unwrap.md) and tests
│  └─ tests/                    # node docs/tests/<name>.mjs; python3 docs/tests/<name>.py (headless Chromium)
│     ├─ load-graph.mjs         #   broken imports, unloaded files
│     ├─ frame-drag-test.mjs    #   nested-frame drags; content-hit-test, hit-space-probe
│     ├─ cartographer-headless.py #  duplicate type names (python3 + Playwright)
│     ├─ pages-smoke.py         #   every page in headless Chromium: errors, 404s
│     └─ gguf-parse-test.mjs    #   GGUF parser on a synthetic file
├─ tools/
│  ├─ tree.py                   # the file tree with each file's title line beside it
│  └─ titles.py                 # check and fix titles as devsrv's Trees page shows them
├─ attic/                       # not loaded by any page; kept for reference
│  ├─ unfolded/                 #   pre-scene-graph apps, now rebuilt in website/html/
│  ├─ website-unloaded/         #   files no page reached, at their old paths
│  ├─ stand-alones/             #   all-in-one-file apps (STNDAs) and spike_kit.py
│  ├─ tools/                    #   work-cascade-tool.html and other code tools
│  ├─ cascade/                  #   design blueprints
│  └─ ksy/                      #   files from KaiTai
└─ LICENSE.md
```

Every `.js` file under `website/js/` except some parsers is reached from a page;
`node docs/tests/load-graph.mjs --unloaded` lists the exceptions.

Every `.js` file under `website/js/` opens with a comment whose first line says
what the file is; a node file's starts with the type names it registers.
`python3 tools/tree.py website/js` prints the tree with those lines beside the
names, and is the quickest map of the code. `--untitled` lists any file that
lacks one.

## Scene graph nodes and demos

`website/js/` is the canonical home of the scene graph nodes: other projects copy the files they use to the same paths under their own `website/js/`, so a copy is byte-identical to its original and imports resolve the same way in both. Library files import each other only by relative paths within `website/js/`.

- `omni-support/`: the registry (`scene.js`), `SYS` (`sys.js`), `values.js`, iterators, `app.js` (the panopticon shell) and the demo harnesses.
- `models/`: models, each a scene ready to show. A model imports the nodes it draws with and registers itself in `SYS.MODELS`.
- `website/demos/`: small demo pages, each a few model imports and `new App()`: graphs, stock strip, charts, astronomy, 3D, widgets, and `panopticon.html` with everything.

Generic diagram nodes (`nodes2d/`): `shape` (rounded rect with label; a circle when the corner radius is half the size), `caption`, `polyline` (dashes, arrowheads, sampled arcs), `composite` (a group with its own position, rotation and scale, pushed as `T`) and `fit-stage` (a reference area fitted to its box). They have no logic: a model writes their values before each render through `layer.inst.updateValues`. The Haemoglobin and ATP Synthase animations (`apps/omni-animate-model.js`) are built this way: the rules are written in the subject's own names (`O2`, `Fe`, `His`…), and a facade, `update()`, maps those onto the nodes' general fields. `Transform` carries an optional rotation for this.

Animation runs on one loop, `omni-support/animator.js`: preset morphs and layer ticks (`layer.inst.tick(layer, params, dt)`) are tracks on the same `Animator`, which the control panel shares with `OmniSceneApp`. Renders requested while tracks run are coalesced into one per frame; the loop stops when no track is live. The other loops use it too: Omni3d's camera loop (on the app's animator), the Zones `App` (its harnesses' per-frame work and the 2D/HTML harnesses' batched redraws) and the Molam widget (render and preset morphs; molam.html's panel shares it).

The Zones nodes came from `attic/stand-alones/multi-zone-stnda.html`. Where one shared a name with a different design here, the two are being merged into one class that serves both worlds (see `docs/twin-merge-plan.md`). All seven pairs are merged. `frame-node-zones.js` remains, as its own type, `ContentFrameNode`.

## Getting started

email james.k.crook@gmail.com if you are interested in this repo. 

**molam.html** for my molecular structure viewer

**d-plus.html** for my 'everything app' that uses Markdown+ and treats the UI as a chat interface. Three columns - Servers, Topics, Chat. The topic column can host controls such as sliders, the chat area can host interactive diagrams. Search is done by the chat prompt line.

**work-cascade-tool.html** for my development pipeline. To use, open in Chrome browser (Safari does not work for this) and drag the cascade folder into the file drop area. The app reads the files, organises the tags and can now browse extracts from those files. The five coloured status dots show progression along the pipeline. The file work-prefixes.md sets the status dot colours and names for the pipeline. The tool is all in one file so you can drop it into an LLM to ask the LLM what it does.

One use of the tool is to organise prompts for prompting an LLM.

**spike_kit.py** is a small utility that makes working with code with an LLM's help much more fluid. It assembles separate files into a single stand alone html file (a STNDA), which therefore has small context and is easy for an LLM to reason about. The components can be improved in that context. Later they can be split up again for resuse. The draw2d( ctxMix, node, params ) collection of conventions means that the small pieces so produced are compatible. They can be assembled into larger apps like d-plus.