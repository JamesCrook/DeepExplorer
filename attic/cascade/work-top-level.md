```json
{ "role": "TODO"}
```
---

# Work Prompts
A cascading prompt system 

>I am looking at doing a ridiculous amount of software development, for a solo developer. Instead of progressing little pieces of projects I plan to develop a process, using AI and harnesses...

## Top Level Prompts
[x] Specialise D+ for legacy and open source code, as a product. #dplus
[ ] Specialise D+ for browsing one's own Obsidian and Claude LLM transcripts #obsidian/index
[x] Specialise D+ as a biology workbench, including WSG and biochemical pathways #mol/dplus 
[ ] Specialise D+ as a Discord alternative #dplus/asdiscord
[x] Specialise D+ for SQLite #dplus/sql USES #sql
[ ] Create tools for working with code and AI faster #tools
[x] Make the innovation features for Molam #mol
[x] Make the game 'Cellular Citadel' #citadel
[x] Make the fast text generator for SwissProt #mol/swiss
[x] Make Chess-e, the chess explainer along with the advanced tree #chesse
[x] Make a front end for MJ's ultrasound scanner #bio/ultrasound
[x] Package the charts/graphs as reusable widgets #chart
[x] Resurrection of blocks, mind maps, mermaidy specs. #block
[x] CAGs Server #cag USES #dplus
[x] A runPhases based interpreter using yield #interpreter

## D+ Open Source
[ ] Generate terminology for all specialist terms like BmLoop #tools/terminology
[ ] Run tree-sitter to create a comprehensive index, as markdown #tools/treesitter
[ ] Implement blocks suitable for block-based library diagram, and make it #dplus/libdiagram USES #block/stretch
[ ] Implement map <--> route interface, with data routing shown  #dplus/maproute
[ ] Automate writing of Playwright scripts to capture images for docs  #help/playwright

## D+ for Obsidian
[ ] Make an LLM based process to read and classify content per user's requests #obsidian/index
[ ] Extract idiolect and make terminology/concept dictionary #obsidian
[ ] Revivify keyword in context index for all text with fast compact indexing #obsidian/kwic
[ ] Make generic wordcloud index #wcloud/obsidian
[ ] Add option of user positioning constraints and AI generated spot-art to wordcloud   #wcloud/obsidian
[ ] Implement dedup of text, particulalry identification of cut and paste #obsidian/dedup
[x] Implement cut-and-paste aware diff that can produce a map of rearrangement #git/sankey
[x] Write importer for Claude content #obsidian

## D+ for Biology
[x] Provide SwissProt in a multiscroller #mol/multi #sql 
[ ] Support MST protein distances with SwissProt #mol/swiss/mst 
[x] Provide organism icons as UI enhancement #icon/organisms USES #icon/library
[x] Provide heatmap for diseases #heat/diseasemap 
[x] Provide clickable chromosome map #mol/chromosome 
[x] Provide biochemical pathways diagram, with optional spot art #mol/pathw 
[x] Improve BiarcRibbons #mol/color 
[x] SMILEs -> 2D structure #mol/smiles

## D+ Discord alternative
[x] Design comms protocol #dplus/fastapi
[x] Implement infinite-scroll (with partial caching) #dplus/scroll
[ ] Provide chat server (database) and GitHub back ends #dplus/server
[x] Implement emoji chooser #dplus/emojipicker
[ ] Implement full Markdown+ processing #markdown
[ ] Harden against arbitrary javascript exploits #markdown/security
[x] Add moderation and permissions features #dplus/perms
[x] Add per-user customisation #dplus/perms
[x] Add per-server customisation #dplus/perms

## D+ for SQLite
[ ] Multiscroller on any table #sql
[ ] AI helper in chat #ai/sql
[ ] Estimates of result sizes #ai/sql
[ ] Auto chart of table structure #sql

## Coding Tools
[ ] Write specs for occult APIs, such as leaf transforms #tools
[ ] Script to normalise a spike #tools
[ ] Script to capture intent from a spike, and queue work to do up for later #tools #tools
[ ] Css manipulation tools #tools
[ ] Code movement and merging tools  #tools

## Molam
[x] 2D scene graph for molecules and animation language #mol/anim2d
[x] 3D scene graph for molecules and animation language #mol/anim3d
[x] Feature Map <--> 3D molecule unwrapping using ik chains #mol/ik
[x] MSA <--> Molam integration #mol/msa
[ ] Road to hemaglobin D+ text #mol/haem
[ ] Receptor preamp D+ text #mol/preamp
[x] Overlayer controls over the chain colouring ones (electro/transmem colouring) #mol/color
[x] Local params support #mol/color
[ ] Auto-dipole highlighter #mol/dipoles
[ ] Water-wire support #mol/waterwire
[x] Ramachandran plots #mol/node/ramachandran
[ ] tRNA viewers #mol/trna

## SwissProt Text generator
[x] Parse SwissProt to function-invocation form (overnight intern) #mol/swiss
[ ] Generator of texts about pathways #mol/swiss/pathw USES #mol/pathw
[ ] Generator of texts about epitopes #mol/swiss/epitope

## Chess-E
[ ] Write detailed spec for the Chess-E tree #chesse/tree
[ ] Implement Chess-E Tree #chesse/tree
[ ] Setup Stockfish as oracle #chesse
[ ] Train an AI tree simplifier #chesse

## Ultrasound Scanner
[x] Extract pseudo-3d model from, say, z-anatomy #bio/ultrasound/zanat USES #bio/ultrasound/oracle
[x] Implement Slicer #bio/ultrasound/slicer
[x] Implement .asy editor in D+ #asy/editor
[x] Add ring, sparkline and butterfly module leaf nodes #bio/ultrasound/asy
[x] Support 3D hover to 2D info-card layer #bio/ultrasound/3dnotes

## Charts Project
[x] Make spec for Charts/Graphs Package #chart
[ ] Make mono-repo -> custom repo distiller for charts #tools/monorepo
[x] Make multiple examples of graph types #chart/examples
[x] Refine coarse-graining strategy #chart/coarseg

## Blocks
[x] Design click together paradigm #block/fracture
[x] Design block <--> ribbon thawwing #block/thaw
[x] Port examples from Scorpio #block/scorpio
[x] Design mermaid end-shape paradigm #block/mermaid
[x] Port JaTeX from Scorpio #jatex
[x] Blocks-based interpretter #mol/blocks

## CAGs
[x] Revivify tensor sensors #cag USES #tensorsensor
[x] Kaitai reader #cag USES #kaitai
[x] gguff reader #cag/gguf
[x] Zoomable rulers and zoomable grids #cag USES #zoomyruler
[x] D+ based weights viewer #cag

