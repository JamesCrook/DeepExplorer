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

[x] Icons: A :name: to retrieve from a library (such as catalog of organism icons) #icon/library
[x] Icons: Programmatic modifiers (substitute one of the animals in a human face pose) #icon/faces
[x] Twisty: Programmatic modifier (substitute any ribbon/wire type for the default) #twisty/ribbonsubst
[x] Blocks: Capturing a drawn element as a new cached block #block/thaw
[x] Blocks: Pips and click-together drag functionality #block/fracture
[ ] Word Cloud Element: Text node with more custom formatting than running text. #wcloud
[x] Chromosomes: Function-generated nodes for human map, clickable bands zone/chromosome USES #mol
[x] Zoomable ruler/grid: Container that repeats major and minor marks and is zoom aware. #zoomyruler USES #util/spacings
[x] Tensor sensor: A presentation of tensor metadata, using standard elements (CAGs) #tensorsensor
[x] Gguf weights: LOD-gated disk-resident data (CAGs) #cag/gguf USES #util/rr
[x] Damage chart: Particular use of heatmap overlay over a fixed graphic. #heat/diseasemap
[x] 3D Atoms - spheres, using phantoms #mol/node/atom
[x] 3D molecular bonds #mol/node/bond
[x] 2D Chromosome diagram #mol/node/chromosome USES #zone/node
[x] 3D and 2D protein backbone ribbons #mol/node/ribbon
[x] Ramachandran plot: Particular use of a standard chart #mol/node/ramachandran USES #chart
[ ] Chess-E board: Particular use of grid display #chesse USES #collection/array
[x] General grid collection #collection/array #collection/arc

## Scene Graph examples
Caution - some of these require a combination of narratives and mining from oracles
[x] Biochemical pathways diagram (Biology, container with sub-containers) #mol/pathw/examples
[x] Ring, sparkline and butterfly module leaf nodes (Ultrasound) #bio/ultrasound USES #collection/arc
[ ] tRNA viewers (Molam) #mol/trna/examples
[ ] Chess-E tree display #chesse/tree/examples
[x] Charts demo (Graphs) #chart/examples
[ ] Sankey-rearrangement diff (Obsidian, via Graphs) #git/examples
[ ] Word cloud index node with user spot art (Obsidian) #wcloud/examples

## Specs, Standards and APIs
Often these translate directly into PEG grammars, from which code can be generated 
[x] Markdown+ #markdown
[x] Markdown+ GesHi formatting of Islands #markdown/geshi
[x] Markdown+ grammar #markdown/grammar
[x] Markdown+ display using PEG parser and AST #markdown/migrate
[x] Markdown+ AST walker to use 'mount' #markdown/mount
[x] Markdown+ widget creation with {Split} as a token #markdown/split2standard
[x] JaTeX grammar #jatex
[x] Mermaid+ grammar #block/mermaid
[x] FEN grammar #chesse/fen
[x] PGN grammar #chesse/pgn
[x] SMILEs grammar #mol/smiles
[x] SQLite grammar #sql/grammar
[x] Svg grammar #svg/grammar
[x] KaiTai specs bundle (external, large) #kaitai
[x] .asy grammar and spec #asy/grammar
[ ] Chess-E tree detailed spec #chesse/tree
[x] Graphs package spec #chart
[x] Occult API leaf transforms, pan/zoom/rotate order #node
[x] Occult API node2d, node3d, nodehtml #node
[x] Occult API do/undo/redo #editor
[x] Occult API select/mod-selection/edit #editor
[ ] IK spec for 3D molecules #mol/ik
[x] 2D scene graph animation language for molecules(Molam) #mol/anim2d USES #interpreter
[x] 3D scene graph animation language for molecules(Molam) #mol/anim3d USES #interpreter
[ ] Help API #help/api
[ ] Steps to screenshot API #help/screenshot
[x] Infinite scroll FastAPI endpoint #dplus/fastapi/scroll
[x] Chat FastAPI endpoint (Discord) #dplus/fastapi/chat
[x] Write a grammar for FastAPI enpoints. #dplus/fastapi/grammar
[x] A tool to generate python from a FastAPI spec #dplus/fastapi/gen
[x] SQLite FastAPI endpoint #sql/fastapi
[x] FastAPI tool to coordinate running of the various scripts #tools/fastapi

## Scripts, Tools & Prompts
Tools to write as catalysts for the work
[ ] PromptCraft (Script) to extract idiolect / terminology dictionary (Obsidian, D+ Open Source) #tools/terminology
[ ] PromptCraft (Script) to tag / classify texts per user requests (Obsidian) #ai/tags
[x] PromptCraft (Script) to normalise a spike #spike/normalise
[ ] PromptCraft (Script) to capture spike and queue work into intents (RFCs) #spike/rfc
[ ] PromptCraft (Script) to convert RFCs into PEG grammars #spike/rfc2tcpip
[ ] Code movement and merging tool #tools/merges
[x] Tool for tracking work cascade, todo->prompt->spec->code #tools/cascade
[x] Tool for finding lost includes #tools/includetool
[x] CSS manipulation tool #tools/csstool
[ ] Mono-repo → custom repo distiller #tools/monorepo
[ ] Keyword-in-context index compiler (Obsidian) #obsidian/kwic
[x] Claude content importer (Obsidian based) #tools/import/claude
[x] Obsidian content importer #tools/import/obsidian
[ ] Playwright for capturing doc images (D+ Open Source) #help/playwright
[ ] PEG parser consolidation sweep (replace spike mini-parsers) #tools/migrate2peg
[x] Security hardening pass (related to 'no hacky mini-parsers') #tools/harden USES #tools/parsers

## AI in the product
We can drop a SOTA AI in, but they may benefit from promptcraft
[ ] AI helper in chat (SQLite) #ai/sql
[ ] Estimates of result sizes (SQLite — may be AI or heuristic) #ai/sql
[x] Spot art generation for word clouds and pathways #ai/art

## Oracles
Typically installed software that grounds/informs other work
[ ] Stockfish setup as oracle (Chess-E) #chesse/oracle
[ ] SwissProt setup as oracle #mol/swiss/oracle
[ ] Tree-sitter comprehensive index generation (D+ Open Source) #tools/treesitter
[x] Z-anatomy for pseudo-3D models (Ultrasound) #bio/ultrasound/zanat NO-CODE NO-SPEC NO-PROMPT
[ ] tRNA folding and reference data collection (Molam) #mol/trna/oracle
[ ] KaiTai reference implementation #kaitai/oracle
[ ] TCP/IP RFCs #tcpip/oracle

## [Algorithm Design](work-algo-insights.md)
After design is done, these will likely generate new BOM items
[x] SMILEs → 2D structure #mol/smiles
[x] Auto-chart of table structure (SQLite) #sql/structure
[x] Multiscroller of any table (SQLite) #sql/multi
[x] Block ↔ ribbon thawing/freezing transforms #block/thaw
[x] Map ↔ route interface with data routing shown (D+ Open Source) #map/route
[x] Metro-map ribbon router (45°/90° pathing) #ribbon/metro
[x] Stretchable tile system for blocks #block/stretch
[x] Click-together and joining movement of blocks #block/fracture
[x] Infinite-scroll with partial caching (Discord) #dplus/scroll
[x] Cut-and-paste sankey/rearrangemnt diff algorithm using MST (Obsidian) #git/sankey
[x] Overlayer controls over chain colouring (Molam) #mol/color
[x] Local params, e.g. per range, support (Molam) #mol/color

## [Product Design](work-product-insights.md)
These are higher level concepts of the products, often about how the user will interact.
[x] Moderation and permissions (Discord) #dplus/perms
[x] Per-user and per-server customisation (Discord) #dplus/perms
[x] MSA ↔ Molam integration #mol/msa
[x] Blocks-based interpreter (Molam Animation) #mol/blocks
[x] Coarse-graining strategy refinement (Charts) #chart/coarseg
[x] Slicer design (Ultrasound) #bio/ultrasound/slicer
[x] gguf reader (CAGs) #cag/gguf
[x] KaiTai reader (CAGs) #kaitai

## Reading Research
Reading on the subject matter (with AI assistance) will inform the product 
[x] Biome structure improvement (Cellular Citadel) #citadel/read
[x] Packman chase dynamics (Cellular Citadel) #citadel/read
[x] Histone room dynamics (Cellular Citadel) #citadel/read

## Algorithm Research
Unlike ordinary algorithm design, these are research projects. For this work tree,
simple versions - which can be treated as place holders - are just fine.
[ ] Water-wire identification protocol (Molam) — no known existing protocol #mol/research
[ ] Auto-dipole highlighter (Molam) — method TBD #mol/research
[ ] AI tree simplifier training for Chess-E - AI research program #chesse/research
[ ] SwissProt to function-invocation form #mol/research

## Narratives & Examples
Content rather than code

[ ] Road to hemoglobin D+ text (Molam) #mol/haem
[ ] Receptor preamp D+ text (Molam) #mol/preamp
[ ] Generated texts about pathways (SwissProt) #mol/swiss/pathw
[ ] Generated texts about epitopes (SwissProt) #mol/swiss/epitope
[ ] Help docs showing what the software can do, especially graphs. #help/examples

## Emerging BOM items

[ ] Display of mouse action binding #node/mouse
[x] Extract [3,7,2] style cursor walking as a utility library #util/cursor
[x] mount() for html used to colorize GeSHi #node/walkers/colorize
[x] Bidirectional pointer via jref/jend is lossless #node/walkers/roundtrip
[x] astToString as a default walker (no code in the nodes) #node/walkers/serialize
[x] A way to connect data to a node, and update #node/databind
[x] Flex-like layout for nodes #node/flex
[x] A specification of what a node is and what its API is #node/spec
[x] Procedural tooltip zones #zone/node NO-SPEC
[x] Continuously zoomable ruler #zoomyruler  NO-SPEC

## Conventional libs
These now have outline APIs and some have implementation and test harness
[x] AST nodes #node NO-PROMPT
[x] Efficient protocol for updating a dataflow diagram #util/dataflow
[x] Small Graph Library #util/graph
[x] Flow Layout Manager #util/flex
[x] Random-Replacement Cache Library #util/rr
[x] Count-Down Mode Shifts #util/countdown
[x] Dataflow Infrastructure #util/dataflow
[x] Bidirectional Pointer Infrastructure #util/pointer
[x] Selection Infrastructure #util/select
[x] Set and Shape Operations #util/shape
[x] Delayed Availability Information #util/delay
[x] General SQLite Access Library (JavaScript) #sql/access
[x] Snapping-Hint Object #block/snap
[x] Thaw/Freeze Infrastructure #block/thaw




