```json
{ "role": "TODO"}
```
---

# Work Prompts
A cascading prompt system 

>I am looking at doing a ridiculous amount of software development, for a solo developer. Instead of progressing little pieces of projects I plan to develop a process, using AI and harnesses...

## Top Level Prompts
[x] Specialise D+ for legacy and open source code, as a product. #dplus/code
[x] Specialise D+ for browsing one's own Obsidian and LLM transcripts #dplus/obsidian #dplus/claude
[x] Specialise D+ as a biology workbench, including WSG and biochemical pathways #mol/dplus 
[x] Specialise D+ as a Discord alternative #dplus/disco
[x] Specialise D+ for SQLite #sql #dplus/sql
[x] Create tools for working with code and AI faster #code
[x] Make the innovation features for Molam #mol/innovate
[x] Make the game 'Cellular Citadel' #citadel
[x] Make the fast text generator for SwissProt #mol/swissft
[x] Make Chess-e, the chess explainer along with the advanced tree #chesse
[x] Make a front end for MJ's ultrasound scanner #bio
[x] Package the charts/graphs as reusable widgets #chart
[x] Resurrection of blocks, mind maps, mermaidy specs. #block
[x] CAGs Server #cag #dplus

## D+ Open Source #dplus/code
[ ] Generate terminology for all specialist terms like BmLoop #dplus/code/terminology
[ ] Run tree-sitter to create a comprehensive index, as markdown #dplus/code/treesitter
[ ] Implement blocks suitable for block-based library diagram, and make it #dplus/code/libdiagram
[ ] Implement map <--> route interface, with data routing shown  #dplus/code/maproute
[ ] Automate writing of Playwright scripts to capture images for docs  #dplus/code/playwright

## D+ for Obsidian #dplus/obsidian
[ ] Make an LLM based process to read and classify content per user's requests #dplus/obsidian
[ ] Extract idiolect and make terminology/concept dictionary #dplus/obsidian
[ ] Revivify keyword in context index for all text with fast compact indexing #dplus/obsidian
[ ] Make generic wordcloud index #dplus/obsidian
[ ] Add option of user positioning constraints and AI generated spot-art to wordcloud   #dplus/obsidian
[ ] Implement dedup of text, particulalry identification of cut and paste #dplus/obsidian
[ ] Implement cut-and-paste aware diff that can produce a map of rearrangement #dplus/obsidian
[ ] Write importer for Claude content #dplus/obsidian

## D+ for Biology #mol
[x] Provide SwissProt in a multiscroller #mol/multi #sql 
[ ] Support MST protein distances with SwissProt #mol/mst 
[ ] Provide organism icons as UI enhancement #mol/icon #icon
[x] Provide heatmap for diseases #mol/heat 
[x] Provide clickable chromosome map #mol/chromosome 
[ ] Provide biochemical pathways diagram, with optional spot art #mol/pathw 
[ ] Improve BiarcRibbons #mol/color 
[x] SMILEs -> 2D structure #mol/smiles

## D+ Discord alternative #dplus
[ ] Design comms protocol #dplus/comms
[ ] Implement infinite-scroll (with partial caching) #dplus/infscroll
[ ] Provide chat server (database) and GitHub back ends #dplus/server
[ ] Implement emoji chooser #dplus/emoji
[ ] Implement full Markdown+ processing #markdown
[ ] Harden against arbitrary javascript exploits #markdown/security
[x] Add moderation and permissions features #dplus/perms
[ ] Add per-user customisation #dplus/perms
[ ] Add per-server customisation #dplus/perms

## D+ for SQLite #sql
[ ] Multiscroller on any table #sql
[ ] AI helper in chat #sql/ai
[ ] Estimates of result sizes #sql/ai
[ ] Auto chart of table structure #sql

## Coding Tools #code
[ ] Write specs for occult APIs, such as leaf transforms #code/tool
[ ] Script to normalise a spike #code/prompt
[ ] Script to capture intent from a spike, and queue work to do up for later #code/tool #code/prompt
[ ] Css manipulation tools #code/tool
[ ] Code movement and merging tools  #code/tool

## Molam #mol
[ ] 2D scene graph for molecules and animation language #mol/anim2d
[ ] 3D scene graph for molecules and animation language #mol/anim3d
[ ] Feature Map <--> 3D molecule unwrapping #mol/unwrap
[ ] MSA <--> Molam integration #mol/msa
[ ] Road to hemaglobin D+ text #mol/haem
[ ] Receptor preamp D+ text #mol/preamp
[ ] Overlayer controls over the chain colouring ones (electro/transmem colouring) #mol
[ ] Local params support #mol
[ ] Auto-dipole highlighter #mol/dipoles
[ ] Water-wire support #mol/waterwire
[ ] Ramachandran plots #mol/ramachandran
[ ] tRNA viewers #mol/trna

## Cellular Citadel #citadel
[ ] Improve biome structure #citadel
[ ] Provide packman chase dynamics #citadel
[ ] Implement histone room dynamics #citadel

## SwissProt Text generator #mol
[x] Parse SwissProt to function-invocation form (overnight intern) #mol/swissft
[ ] Generator of texts about pathways #mol/swissft/pathw
[ ] Generator of texts about epitopes #mol/swissft/epitope

## Chess-E #chesse
[ ] Write detailed spec for the Chess-E tree #chesse/tree/spec
[ ] Implement Chess-E Tree #chesse/tree
[ ] Setup Stockfish as oracle #chesse
[ ] Train an AI tree simplifier #chesse

## Ultrasound Scanner #bio
[ ] Extract pseudo-3d model from, say, z-anatomy #bio/zanat
[x] Implement Slicer #bio/slicer
[ ] Implement .asy editor in D+ #bio/asy #asy
[ ] Add ring, sparkline and butterfly module leaf nodes #bio/asy
[ ] Support 3D hover to 2D info-card layer #bio/3dnotes

## Charts Project #chart
[ ] Make spec for Charts/Graphs Package #chart/spec
[ ] Make mono-repo -> custom repo distiller #chart/monorepo
[ ] Make multiple examples of graph types #chart/example
[x] Refine coarse-graining strategy #chart/coarseg

## Blocks #block
[ ] Design click together paradigm #block
[ ] Design mermaid end-shape paradigm #block
[ ] Port examples from Scorpio #block
[ ] Design block <--> ribbon thawwing #block
[ ] Port JaTeX from Scorpio #block
[ ] Blocks-based interpretter #block

## CAGs #cag
[ ] Revivify tensor sensors #cag
[ ] Kaitai reader #cag
[ ] gguff reader #cag
[ ] Zoomable rulers and zoomable grids #cag
[ ] D+ based weights viewer #cag

