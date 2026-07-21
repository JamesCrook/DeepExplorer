```json
{ "role": "TODO"}
```
---

# D+ Development Bill of Materials
This emerged from the top level prompts, as specific things in different categories to do or make.
 A [x] for a todo does not mean done. It means that as a minimum there is a more detailed elicited prompt in the work bundle. 

## Scene Graph Nodes
These can relatively easily be worked up into node specs. The flow is now working so well that we can go from a spike solution that has the node(s) in it to actual deployable nodes. 

Two key steps in achieving this:
 * Spike_kit.py and the conventions associated with it, that keep the spike solutions live/working as we work on the main system and adapt the code.
 * Migration of WidgetFactory to use sceneRegistry. Html widgets are therefore now nodes too.

Background:
Masks for IC layers are made from 'a bag' of overlapping rectangles.
Icons, especially emoji, need a small combinatorial language, gaze, hand position etc.  

[ ] Icons: A :name: to retrieve from a library (such as catalog of organism icons) #icon/node
[ ] Icons: Programmatic modifiers (substitute one of the animals in a human face pose) #icon/node
[ ] Twisty: Programmatic modifier (substitute any ribbon/wire type for the default) #twisty/node
[ ] Blocks: Capturing a drawn element as a new cached block #block/node
[ ] Blocks: Pips and click-together drag functionality #block/node
[ ] Word Cloud Element: Text node with more custom formatting than running text. #wcloud/node
[x] Chromosomes: Function-generated nodes for human map, clickable bands #zone/node #mol/node
[ ] Zoomable ruler/grid: Container that repeats major and minor marks and is zoom aware. #zoomyruler/node
[ ] Tensor sensor: A presentation of tensor metadata, using standard elements (CAGs) #tensorsensor
[ ] Gguf weights: LOD-gated disk-resident data (CAGs) #cag/node
[ ] Damage chart: Particular use of heatmap overlay over a fixed graphic. Diseases as example (Biology) #heat/node
[ ] Ramachandran plot: Particular use of a standard chart #mol/ramachan/node
[ ] Chess-E board: Particular use of grid display #chesse/node

## Scene Graph examples
Caution - some of these require a combination of narratives and mining from oracles
[ ] Biochemical pathways diagram (Biology, container with sub-containers) #mol/example
[ ] Ring, sparkline and butterfly module leaf nodes (Ultrasound) #bio/example
[ ] tRNA viewers (Molam) #mol/example
[ ] Chess-E tree display #chesse/example
[ ] Charts demo (Graphs) #chart/example
[ ] Sankey-rearrangement diff (Obsidian, via Graphs) #git/example
[ ] Word cloud index node with user spot art (Obsidian) #wcloud/example

## Small Code
Will be written without AI help
[ ] Blocks: IC Masks <--> Node Connection <--> Tile #block/coding
[ ] Blocks: mermaid end-shape nodes #block/coding #mermaid/coding
[ ] 3D hover to 2D info-card layer (Ultrasound) #bio/coding
[ ] Full Markdown+ processing (Discord) #markdown/coding

## Small Portings
Will be done without AI help
[ ] Emoji chooser integrated into D+ (Discord) #dplus/porting
[ ] Blocks: Port examples from Scorpio #block/porting
[ ] JaTeX port from Scorpio #jatex/porting

## Specs, Standards and APIs
Often these translate directly into PEG grammars, from which code can be generated 
[x] Markdown+ grammar #markdown/grammar
[x] JaTeX grammar #jatex/grammar
[ ] Mermaid+ grammar #mermaid/grammar
[x] FEN grammar #chesse/fen/grammar
[x] PGN grammar #chesse/pgn/grammar
[x] SMILEs grammar #mol/smiles/grammar
[x] SQLite grammar #sql/grammar
[x] Svg grammar #svg/grammar
[ ] KaiTai specs bundle (external, large) #kaitai/grammar
[x] .asy grammar and spec #asy/spec/grammar
[ ] Chess-E tree detailed spec #chesse/tree
[x] Graphs package spec #chart/spec
[x] Occult API leaf transforms, pan/zoom/rotate order #node/spec
[x] Occult API node2d, node3d, nodehtml #node/spec
[x] Occult API do/undo/redo #editor/spec
[x] Occult API select/mod-selection/edit #editor/spec
[ ] IK spec for 3D molecules #mol/spec/ik
[ ] 2D scene graph animation language for molecules(Molam) #mol/anim2d/spec
[ ] 3D scene graph animation language for molecules(Molam) #mol/anim3d/spec
[ ] Help API #help/spec/api
[ ] Steps to screenshot API #help/spec/screenshot
[ ] Infinite scroll FastAPI endpoint #dplus/spec/fastapi
[ ] Chat FastAPI endpoint (Discord) #dplus/spec/fastapi
[ ] SQLite FastAPI endpoint #sql/spec/fastapi
[ ] FastAPI tool to coordinate running of the various scripts #scripts/spec/fastapi

## Scripts, Tools & Prompts
Tools to write as catalysts for the work
[ ] PromptCraft (Script) to extract idiolect / terminology dictionary (Obsidian, D+ Open Source) #idio/prompt
[ ] PromptCraft (Script) to tag / classify texts per user requests (Obsidian) #tags/prompt
[ ] PromptCraft (Script) to normalise a spike #spike/prompt
[ ] PromptCraft (Script) to capture spike and queue work into intents (RFCs) #spike/prompt
[ ] PromptCraft (Script) to convert RFCs into PEG grammars #spike/prompt #tcpip/prompt
[ ] Code movement and merging tool #code/tool
[ ] CSS manipulation tools #code/tool
[ ] Mono-repo → custom repo distiller #code/tool
[ ] Keyword-in-context index compiler (Obsidian) #kwic/tool
[ ] Claude content importer (Obsidian) #claude/tool
[ ] Playwright for capturing doc images (D+ Open Source) #help/tool
[ ] PEG parser consolidation sweep (replace spike mini-parsers) #code/tool
[ ] Security hardening pass (related to 'no hacky mini-parsers') #code/tool

## AI in the product
We can drop a SOTA AI in, but they may benefit from promptcraft
[ ] AI helper in chat (SQLite) #dplus/ai
[ ] Estimates of result sizes (SQLite — may be AI or heuristic) #sql/ai
[ ] Spot art generation for word clouds and pathways #art/ai

## Oracles
Typically installed software that grounds/informs other work
[ ] Stockfish setup as oracle (Chess-E) #chesse/oracle
[ ] SwissProt setup as oracle #mol/swiss/oracle
[ ] Tree-sitter comprehensive index generation (D+ Open Source) #code/oracle
[ ] Z-anatomy for pseudo-3D models (Ultrasound) #bio/oracle
[ ] tRNA folding and reference data collection (Molam) #mol/trna/oracle
[ ] KaiTai reference implementation #kaitai/oracle
[ ] TCP/IP RFCs #tcpip/oracle

## [Algorithm Design](work-algo-insights.md)
After design is done, these will likely generate new BOM items
[x] SMILEs → 2D structure #mol/smiles
[x] Auto-chart of table structure (SQLite) #sql/algo
[x] Multiscroller of any table (SQLite) #sql/algo
[x] Block ↔ ribbon thawing/freezing transforms #block/algo
[x] Map ↔ route interface with data routing shown (D+ Open Source) #map/route/algo
[x] Metro-map ribbon router (45°/90° pathing) #ribbon/metro/algo
[x] Stretchable tile system for blocks #block/algo
[x] Click-together and joining movement of blocks #block/algo
[x] Infinite-scroll with partial caching (Discord) #dplus/scroll/algo
[x] Cut-and-paste sankey/rearrangemnt diff algorithm using MST (Obsidian) #git/algo
[x] Overlayer controls over chain colouring (Molam) #mol/color
[x] Local params, e.g. per range, support (Molam) #mol/color

## [Product Design](work-product-insights.md)
These are higher level concepts of the products, often about how the user will interact.
[x] Moderation and permissions (Discord) #dplus/product
[x] Per-user and per-server customisation (Discord) #dplus/product
[x] MSA ↔ Molam integration #mol/product
[x] Blocks-based interpreter (Molam Animation) #mol/product
[x] Coarse-graining strategy refinement (Charts) #chart/coarseg
[x] Slicer design (Ultrasound) #bio/slicer
[x] gguf reader (CAGs) #cag/product
[x] KaiTai reader (CAGs) #cag/product

## Reading Research
Reading on the subject matter (with AI assistance) will inform the product 
[ ] Biome structure improvement (Cellular Citadel) #citadel/read
[ ] Packman chase dynamics (Cellular Citadel) #citadel/read
[ ] Histone room dynamics (Cellular Citadel) #citadel/read

## Algorithm Research
Unlike ordinary algorithm design, these are research projects. For this work tree,
simple versions - which can be treated as place holders - are just fine.
[ ] Water-wire identification protocol (Molam) — no known existing protocol #mol/research
[ ] Auto-dipole highlighter (Molam) — method TBD #mol/research
[ ] AI tree simplifier training for Chess-E - AI research program #chesse/research
[ ] SwissProt to function-invocation form #mol/research

## Narratives & Examples
Content rather than code

[ ] Road to hemoglobin D+ text (Molam) #mol/haem/arc
[ ] Receptor preamp D+ text (Molam) #mol/preamp/arc
[ ] Generated texts about pathways (SwissProt) #mol/swissft/pathw/arc
[ ] Generated texts about epitopes (SwissProt) #mol/swissft/epitope/arc
[ ] Help docs showing what the software can do, especially graphs. #code/help/arc

## Emerging BOM items
These now have outline APIs and some have implementation and test harness

[x] AST nodes #util/node/lib
[x] Small Graph Library #util/graph/lib
[x] Flow Layout Manager #util/flex/lib
[x] Random-Replacement Cache Library #util/rr/lib
[x] Count-Down Mode Shifts #util/countdown/lib
[x] Dataflow Infrastructure #util/dflow/lib
[x] Bidirectional Pointer Infrastructure #util/pointer/lib
[x] Selection Infrastructure #util/select/lib
[x] Set and Shape Operations #util/shape/lib
[x] Delayed Availability Information #util/delay/lib
[x] General SQLite Access Library (JavaScript) #sql/access/lib
[x] Snapping-Hint Object #block/snap/lib
[x] Thaw/Freeze Infrastructure #block/thaw/lib



Small Graph Library  #util/graph/lib/prompt
Nodes and edges, ingestible from the scene graph. Includes cycle-finding (ordered by ring size, for SMILES and elsewhere) and an MST implementation (for the Sankey diff and potentially bus detection in metro routing).

Flow Layout Manager #util/flex/lib/prompt
Layout algorithms akin to flex, but for positioning nodes on a 2D canvas. Built from composing nested AST-node structures. Can serve as a full layout manager — used by auto-chart, map/route layout, and anywhere boxes-and-arcs need automatic positioning.

Random-Replacement Cache Library #util/rr/lib/prompt
A general eviction cache with random replacement policy. Particular instances track loaded .md documents, loaded images, and row-range data. Shared by the multiscroller and infinite-scroll, and available to anything else that needs bounded-memory caching.

Count-Down Mode Shifts #util/countdown/lib/prompt
Avoid stuck-in-a-mode by pre-declaring the exit condition when entering a mode. Already exists for the mask editor; needs to be generalised as infrastructure so other tools (tile tweaking, block assembly) can use it.

Dataflow Infrastructure #util/flex/lib/prompt
Minimal re-evaluation of a dependency graph when data changes. When an upstream value is modified, only the affected downstream nodes recompute. Foundation for reactive parameter updates, selection-dependent rendering, and overlayer blending.

Bidirectional Pointer Infrastructure #util/pointer/lib/prompt
Unidirectional pointers are a widespread optimisation, but code often needs to know "what points to me?" When the pointed-to thing is edited, we want to update or invalidate the pointers that reference it. Can be as simple as marking the source as dirty and needing re-hydration before next use. Foundation for selection maintenance and model-edit propagation.

Selection Infrastructure #util/select/lib/prompt
Layered on bidirectional pointers. A selection is a subset of model elements that survives model edits — when an object is updated, the selection still works. Supports fuzzy selection (graduated membership). Used by local params, overlayer controls, and eventually any "apply settings to subset" pattern.

Set and Shape Operations #util/shape/lib/prompt
Intersection, union, and exclusion operations for both discrete sets (selections, element groups) and geometric shapes (crop regions, bounding boxes). Shared by selections, freeze/crop, and any spatial query.

Delayed Availability Information #util/delay/lib/prompt
Graceful handling of data that is not yet available — the UI can render placeholders, show loading state, and fill in when data arrives. Shared concern for infinite-scroll, multiscroller with large tables, and any server-backed view. To be addressed in a separate session.

Data Binding for Scene Graph Nodes #util/bind/lib/prompt
Node data comes in three forms, resolved in priority order: an accessor function `node.accessor(ctxMix, node, params)`, a literal `node.value`, or a default. The accessor signature matches `draw2d` so no new calling convention is needed. Accessors typically live on prototypes, values typically on instances. Container sizing follows the same pattern: `node.sizing(ctxMix, node, params) ?? node.size ?? default` determines child count, so data-driven structure works without special cases. 

General SQLite Access Library (JavaScript) #util/sql/lib/prompt
Handles connection lifecycle including lost connections and reconnection. Provides the foundation for both auto-chart schema introspection and multiscroller table binding.

Snapping-Hint Object #util/snap/lib/prompt
Carries snapping algorithms — different hint types for different contexts. May be zoom-sensitive. Also handles snap-to-angle (e.g. snap to 45° multiples for metro-map routing). Used by click-together, stretchable tiles, and freeze operations.

Thaw/Freeze Infrastructure #util/thaw/lib/prompt
General mechanism: freeze creates a local visual cache of a more flexible item, potentially applying snapping and other "roundings" during the freeze. Thaw reverses it using stored provenance. Used by blocks, stretchable tiles, and the tile-tweaking tool.
