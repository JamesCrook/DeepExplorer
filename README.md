# DeepExplorer

DeepExplorer is an experiment in user interface. It creates a conversational UI, suitable for text messages and chats with AI bots, and with rich customisable diagrams. Open source, MIT licensed.

The project also has some tools for working with code.

## Current Status

Rich diagrams work. The chat interface is just a place holder.

## Project Structure

This ASCII tree needs redoing

```
DeepExplorer/                            #
├─ cascade/                              # Markdown documents with design blueprints
│  └─ ...                                #
├─ css/                                  # Shared css
│  └─ ...                                #
├─ html/                                 # --> START HERE. The top level programs
│  ├─ d-plus.html                        # The main 'everything app'
│  └─ ...                                #
├─ js/                                   #
│  ├─ 2d-support/                        # 2d helpers
│  │  └─ ...                             #
│  ├─ 3d-support/                        # 3d helpers
│  │  └─ ...                             #
│  ├─ apps/                              # Javascript for the apps
│  │  └─ ...                             #
│  ├─ data/                              # Sample data
│  │  └─ ...                             #
│  ├─ nodes-html/                        # Scene graph nodes for html widgets
│  │  └─ ...                             #
│  ├─ nodes2d/                           # Scene graph nodes for 2d canvas drawing
│  │  └─ ...                             #
│  ├─ nodes3d/                           # Scene graph nodes for 3d (mostly molecules)
│  │  └─ ...                             #
│  ├─ omni-support/                      # General support functions
│  │  └─ ...                             #
│  ├─ parsers/                           # My parser and grammars
│  │  └─ ...                             #
│  ├─ utilities/                         # General utilities
│  │  └─ ...                             #
│  └─ utilities2/                        # General utilities
│     └─ ...                             #
├─ ksy/                                  # Files from KaiTai
│  └─ ...                                #
├─ stand-alones/                         # All-in-one-file apps
│  ├─ block-fracture-stnda.html          # Tiles that click together, and raft together
│  ├─ zoned-heatmap-stnda.html           # Diagrams with hotspots
│  ├─ spike_kit.py                       # Tool to split stndas into reusable libraries
│  └─ ...                                #
├─ tools/                                # Tools for working with code
│  ├─ work-cascade-tool.html             # Organiser for work in progress
│  └─ ...                                #
├─ index.html                            # Clickable index of the html
└─ .gitignore                            #
```

## Scene graph nodes and demos

`website/js/` is the canonical home of the scene graph nodes: other projects copy the files they use to the same paths under their own `website/js/`, so a copy is byte-identical to its original and imports resolve the same way in both. Library files import each other only by relative paths within `website/js/`.

- `omni-support/`: the registry (`scene.js`), `SYS` (`sys.js`), `values.js`, iterators, `app.js` (the panopticon shell) and the demo harnesses.
- `models/`: models, each a scene ready to show. A model imports the nodes it draws with and registers itself in `SYS.MODELS`.
- `website/demos/`: small demo pages, each a few model imports and `new App()`: graphs, stock strip, charts, astronomy, 3D, widgets, and `panopticon.html` with everything.

The Zones nodes came from `attic/stand-alones/multi-zone-stnda.html`. Eight of them share a name with a different design already here, and keep a `-zones` suffix until the two are merged: `button-node`, `camera-node`, `drag-point-node`, `frame-node` (nodes2d) and `ground-plane-node`, `imposter-atom-node`, `molam-bond-node`, `planet-node` (nodes3d). `button-node`, `drag-point` and `ground-plane` are also the same node type name in both, so a page loading both versions gets a registry warning and the later one wins.

## Getting started

email james.k.crook@gmail.com if you are interested in this repo. 

**molam.html** for my molecular structure viewer

**d-plus.html** for my 'everything app' that uses Markdown+ and treats the UI as a chat interface. Three columns - Servers, Topics, Chat. The topic column can host controls such as sliders, the chat area can host interactive diagrams. Search is done by the chat prompt line.

**work-cascade-tool.html** for my development pipeline. To use, open in Chrome browser (Safari does not work for this) and drag the cascade folder into the file drop area. The app reads the files, organises the tags and can now browse extracts from those files. The five coloured status dots show progression along the pipeline. The file work-prefixes.md sets the status dot colours and names for the pipeline. The tool is all in one file so you can drop it into an LLM to ask the LLM what it does.

One use of the tool is to organise prompts for prompting an LLM.

**spike_kit.py** is a small utility that makes working with code with an LLM's help much more fluid. It assembles separate files into a single stand alone html file (a STNDA), which therefore has small context and is easy for an LLM to reason about. The components can be improved in that context. Later they can be split up again for resuse. The draw2d( ctxMix, node, params ) collection of conventions means that the small pieces so produced are compatible. They can be assembled into larger apps like d-plus.