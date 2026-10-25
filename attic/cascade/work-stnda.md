```json
{ "role": "STNDA"}
```
---

## [x] graph-library-stnda #util/graph
Nodes and straight lines between them. Nodes are draggable.

## [x] network-editor-stnda #util/network
Adaptation of graph-library-stnda to drop the operations on graphs library and provide the draggable nodes and edges, in scene graph format. 

## [x] biochem-pathway-stnda #mol/pathw/examples
Adaptation of pathway-importer-stnda that also provides spot art that can be individually zoomed. Based on network-editor, read/write files. Supports curved edges.

## [x] path-editor-stnda #mol/pathw
A simple SVG path editor

## [x] smiles-layout-stnda #mol/smiles 
Read a molecule in SMILEs format and display it. Use the PEG parser to do the reading.

## [x] heatmap-stnda #heat/diseasemap
Rework heatmap stnda to use the heatmap component. 

## [x] hr-stars-stnda #heat/stars
Rework existing main sequence display to use the heatmap component.

## [ ] damage-chart-stnda #heat/damage
Using the heatmap-stnda node, an outline of an aircraft with bullet holes. 

## [x] ramachandran-stnda #mol/node/ramachandran
Adapt heatmap-stnda to show allowed angles on a ramachandran plot. User can select the amino acid

## [ ] polygon-tile-stnda #util/graph
Simple polygons placed on a canvas

## [ ] wordcloud-node-stnda #wcloud 
Simple text placed on a canvas

## [ ] charts-demo-stnda #chart/examples 
A classic climate chart showing rainfall and temperature by month on the same graph. User can select a city.

## [ ] random-replacement-stnda #util/rr
Demo of random replacament cache using synthetic pseudo random data.

## [ ] general-editor-stnda #editor
A simple text editor with undo. The demo should have a clickable undo-line. The method for undo is to record the edit steps, and replay from a checkpoint, taking checkpoints every 10 edits (configurable). 

## [ ] jatex-grammar-stnda #jatex/grammar 
Colour highlighting and custom error reporting on JaTeX using PEG parser and grammar.

## [ ] kaitai-basic-stnda #kaitai
Read a ksy file using the PEG parser. Use it to dump a font file. 

## [ ] kaitai-interactive-stnda #kaitai
Based on kaitai-basic-stnda, read a ksy file using the PEG parser. Use it to explore a font file.

## [ ] packet-layout-stnda #tcpip USES #kaitai
An ASCI art tcpip packet diagram to/from an actual typedef, in kaitai format. Nicely drawn versions as well as ASCII. Ability to show values of an instance. Flag and Hex Options.

## [ ] kaitai-interactive-stnda #hexdump USES #kaitai
A hexdump that uses the InfoCard to give rich details.

## [ ] gguf-display-stnda #cag/gguf #util/rr
Based on kaitai-grammar-stnda, reads a .gguf file using kaitai and permits browsing of contents

## [ ] asy-grammar-stnda #asy/grammar 
Drop an asy file onto the file drop zone and see a 3d model from the file.

## [ ] ultrasound-modules-stnda #bio/ultrasound #collection/arc
Place hexagonal icons in a circle. A slider controls the start angle and range. Another slider tweens between level (all hexagons are oriented the same way) and radial (hexagons oriented by angle from centre)

## [x] lightcone-fracture-stnda #block/fracture
The code I've shared is great, but I want it refactored to use my scene graph approach. In particular I want some scene graph elements that expose draw2d() and hit_test() methods.



## [ ] mermaid-grammar-stnda #block/mermaid 
Entry box for end shapes, text like "> Label >" makes a label with chevron ends. 

## [ ] snapping-hint-stnda #block/snap 
A small library for snapping.
Should demonstrate placed objects that snap to a grid when dropped, and line directions that snap to some fraction, usually 1/8, of a full rotation.

## [ ] metro-router-stnda #ribbon/metro
Adaptation of network-editor-stnda that reads a network and automatically lays it out metro-map style. 

## [ ] ribbon-mods-stnda #twisty/ribbonsubst
Show the twisty node and allow variations in the display of the ribbon

## [ ] freeze-ribbon-stnda #block/thaw #twisty/ribbonsubst
Adaptation of lightcone-fracture-stnda and network-editor-stnda where the blocks hold circuit components and connections to the pips. A thaw operation hides the block outlines and remembers connectivity of the pips. Further dragging of the circuit elements maintains connectivity.

## [ ] ribbon-tile-stnda #block/stretch #twisty/ribbonsubst #block/thaw
A resizable container for a block that allows stretching of the block, extending internal connectors. 

## [ ] tensor-sensor-stnda #tensorsensor 
Show the tensor sensor tile and allow variations on it

## [ ] game-board-stnda #chesse/pgn 
A board game display that can show a chess board, an othello board or a Go board.

## [ ] icon-faces-stnda #icon/faces
Procedurally generated icons, e.g. with sunglasses or hearts for eyes. 

## [ ] icon-library-stnda #icon/library #icon/organisms
Use the emoji picker to browse our icon library 

## [ ] markdown-geshi-stnda #markdown/grammar #markdown/geshi #markdown/mount #node/walkers/colorize 
A small demo showing the existing PEG parsers parsing markdown. Drop a file system on the drop zone and see a list of .md files. Click on a .md file and see the decoded markdown. In particular GeSHi colouring of Javascript should be implemented. 

## [ ] ast-serialize-stnda #node/walkers/serialize 
Add a 'serialise' option to the walker and a default method that produces a string.

## [ ] expression-interpreter-stnda #interpreter 
Add a 'step' option to the walker. Extensive implementation details in work-interpreter.md. Demo will need some clever mocking.

## [x] mol-colorscheme-stnda #mol/color 
Convert the molecular colour scheme demo into a proper stnda

## [x] wordcloud-index-stnda #wcloud/examples 
A cheap wordcloud based on a list of words, with clickable words. A primitive version already exists.

## [x] zone-node-stnda #zone/node 
Already exists as a stnda

## [x] set-shape-stnda #util/shape 
Already exists as a stnda

## [x] kwic-index-stnda #obsidian/kwic 
Example exists in parables and miracles

## [ ] countdown-mode-stnda #util/countdown 
Exists in other code

## [ ] zoomable-ruler-stnda #zoomyruler 
Exists in other code

## [ ] cursor-state-stnda #util/cursor 
Extract [3,7,2] style cursor walking as a utility library. Buttons to call the various functions. 

## [ ] local-params-stnda 

## [ ] overlayer-params-stnda 

## [ ] procedural-params-stnda 

## [ ] data-binding-stnda #node/databind 

## [ ] fastapi-button-stnda #dplus/fastapi 





# Requires Molam

## [ ] dipole-renderer-stnda #mol/dipoles 

## [ ] trna-viewer-stnda #mol/trna 



# Tools

## [ ] obsidian-importer-stnda #tools/import/obsidian 

## [ ] claude-importer-stnda #tools/import/claude

## [x] css-tool-stnda #tools/csstool 
A version exists and can do some normalisation of colors etc

## [x] ast-tool-stnda #tools/ast 
A version exists and can read grammars and parse text

## [x] include-tool-stnda #tools/includetool
A version exists and can find includes that were lost via code movement

## [x] cascade-tool-stnda #tools/cascade 
A very good version of work cascade management exists

## [ ] monorepo-distiller-stnda #tools/monorepo 

## [ ] code-mover-stnda #spike 

## [ ] spike-normalise-stnda #spike/normalise 

## [ ] sqlite-access-stnda #sql/access #sql/fastapi
From API javascript stub, make FastAPI server stubs and a mocking/access library in javascript. 



# Requires external server

## [ ] promptcraft-button-stnda 
This is really an extension of the work cascade tool. It would gather the prompt bundle and send it to a weak LLM.

## [ ] sql-automap-stnda #sql/structure
Automatically produce a map of an sql database. 
Requires a live sql instance

## [ ] sql-multiscroller-stnda #sql/multi
Automatically make a multiscroller table from a SQL table, using a default sort order.
Requires a live sql instance??







## [ ] chess-tree-stnda #chesse/tree 

## [ ] perms-model-stnda #dplus/perms 

## [ ] infinite-scroll-stnda #dplus/scroll 

## [ ] sankey-diff-stnda #git/sankey 

## [ ] map-route-stnda #map/route 

## [ ] flow-layout-stnda #node/flex 
This is about div layout, but within a canvas.

## [ ] dataflow-stnda #util/dataflow 

## [ ] pushchildspace-stnda

## [ ] path-grammar-stnda #svg/grammar

## [ ] delayed-avail-stnda #util/delay 

## [ ] bidir-pointer-stnda #util/pointer 

## [ ] selection-stnda #util/select

## [ ] wordcloud-layout-stnda #wcloud 

