```json
{ "role": "IDIOLECT"}
```
---

# Project Idiolect

The idiolect is one of the most valuable things to elicit. It captures the unusual insights or ideas.

## Bijou

**Architecture & Scene Graph**
- Occult API — implicit contracts that need surfacing as typed signatures #node
- Node2d, node3d, nodehtml — occult API surface categories #node
- BiarcRibbon — a specific flexible curve renderer #mol/color
- Metro-map pathing — 45°/90° constrained ribbon routing #ribbon/metro
- Multiscroller — scrollable multi-panel viewer #sql/multi
- Spot art — decorative/illustrative generated imagery placed contextually #ai/art
- Overlayer — controls layered over existing renderers #mol/color

**Process**
- Fold — integrating a spike into the real codebase #spike
- Canonicalization — reshaping a spike to conform to node protocol #spike
- Consolidation sweep — automated pass replacing hacks with proper infra #tools
- Elicitation — extracting design decisions from the developer's head #spike

**Development Model**
- RFC — internal specification document at any maturity level #spec
- BOM — bill of materials for the full development effort #tools/cascade
- Horse-race item — first-past-the-post, value comes from completion #tools/cascade
- Multiplicative item — value compounds by combination with other items #tools/cascade
- Overnight intern — a generation task you can run unattended #spike
- Oracle — external installed software that grounds other work (Stockfish, SwissProt) #chesse/oracle #mol/swiss/oracle

**Specific Concepts**
- Thawing — converting abutted block tiles into node-and-ribbon graph #block/thaw
- Freezing — reverse of thawing, with crop-to-new-block as escape hatch #block/thaw
- Stretchable tiles — blocks that stretch while preserving connection points #block/stretch
- Grammar/typedef isomorphism — a grammar gives you SerDes, view/edit, free-text conversion #grammar
- PEG grammar — the universal spec format; specs, APIs, and UI layouts all expressible as grammars #grammar
- Idiolect — the developer's personal technical vocabulary #tools/terminology
- Unphysical unwrapping — flattening 3D protein to 2D ignoring physics #mol/unwrap

**Product Specification**
- Program fragment — short program specifying a custom ruleset (permissions, notifications, visibility) #dplus/perms
- Dry-run matrix — probe a rule system with test inputs, see evaluated outcomes #dplus/perms
- Permission Tag — named function in a permission program, displayed on channels it applies to #dplus/perms
- Ladder — ordered allow/deny rule list, evaluated top to bottom #dplus/perms
- Selection generator — query that produces a selection as output (e.g. 3D proximity sphere) #util/select
- Design-research — exploring constraints with prior knowledge to produce a design
- Reading-research — seeking new knowledge before design can proceed
- Co-simulation — multi-level simulation, choose granularity per component #wsi/sim
- Analytical bounding guarantee — bound on procedural structure extent derived from grammar, not expansion #grammar
- Data residency annotation — KaiTai extension marking where bytes live (disk, RAM, VRAM, generated) #kaitai


## Spike #spike
A one-page pure HTML+JS runnable app, usually produced by an LLM in a single shot, to demonstrate or explore a concept. No attention is paid to fitting the code into the OmniScene or d-plus systems. Standalone spike files are named `something-stnda.html`.

## Normalising a spike #spike
Making a spike as ready as possible for transfer to the larger codebase, while keeping it runnable as a standalone app. This typically involves better factorisation, generation of GUI from config data structures, and reforming canvas drawing code to use the ctxMix signature. The result is still a single HTML file, but its reusable parts are clearly separated from its throwaway parts.

## Nugget #spike #tools
The reusable code extracted from a spike. A nugget might be a scene graph node class, a utility library, a PEG grammar, or any other self-contained unit of functionality. After extraction it lives in its own .js file, ready to import into the larger system.

## Harness #spike
The throwaway portion of a spike that exists to demo the nugget. A harness shims the OmniScene interfaces (ctxMix, T, node structures) so the nugget can run standalone. The harness is not part of the deliverable.

## ctxMix signature #node
The calling convention for scene graph node methods: `draw2d(ctxMix, node, params)`. ctxMix carries the drawing context and transform. node is an AST node with a possibly non-empty `subtree: [node1, node2, ...]`. params is a flat data structure with named numerical and colour parameters. ctxMix.T carries the transform object with methods like `toScreen`, `toLocal`, and properties like `sx` (zoom scale).

## node.data vs node.value #node
THIS DESCRIPTION IS WRONG AND NEEDS FIXING
node.data holds domain data (e.g. chromosome band definitions, pin maps). node.value holds instance state (e.g. which zone is hovered, the selected set, references to class constructors).

## DemoHarness #spike #node
A small class in a normalised spike that is enough to demonstrate the nugget. For a scene graph node nugget it shims ctxMix and handles canvas sizing and mouse events. It calls ZonedNode.draw2d / hit_test with the exact signatures the real scene graph would use. Comments in the harness document what maps to what in the real system.

## PromptCraft #spike
A reusable prompt designed as a tool for LLM-assisted work. A PromptCraft prompt includes enough context (conventions, examples, interface contracts) that it can be run semi-unattended against new inputs. Different PromptCraft prompts exist for different categories of work.

## Intents RFC #spec
A planned specification, inspired by internet RFCs, that explains a component of the system in words — a protocol, API, or data format. Machine-readable parts use KaiTai .ksy format for type definitions and PEG grammar for grammars.

## >> and << markers (spike_kit) #spike #tools
Delimiters embedded in spike files to support mechanical extraction and reinlining of nuggets. `//>> code` marks lines that are dormant in the spike but active in the extracted file (imports, exports, registrations). `//<< code` marks lines that activate when the nugget is imported as a separate file. `//-- file: PATH --` and `//-- endfile --` delimit nugget regions. The spike_kit.py script performs extract, import-version, and remerge operations using these markers.



## Standard

**Architecture & Scene Graph**
- Leaf / leaf node — minimal render/hit-test/config node #node
- Container — behavioral node that composes others #node
- Composite pattern — shared interface, internal delegation distinction #node
- Scene graph — the node tree #node
- WidgetFactory — registration point for node types #node
- Adapter — parent node that fills capability gaps compositionally #node
- Flyweight / prototype / instance — container capability vocabulary #node

**Process**
- Spike / spike solution — disposable isolated prototype #spike
- Extraction mode — stenographic capture of already-formed ideas #spike
- Formulation mode — proposing candidates for the developer to react to #spike
- Collapsing insight — the structural trick that makes a hard problem tractable
- Spike-ready prompt — fully specified prompt for an AI to build against #spike
- Intent capture — extracting what a spike was trying to achieve #spike
- Harness — the system that manages elicitation and spike generation #spike

**Development Model**
- Maturity pipeline — research → product design → algorithm design → spec → implementation #tools/cascade

**Specific Concepts**
- Cheap dictionary — intentionally fast/coarse matching for cut-and-paste detection #git/sankey
- Kinematic chain — Ramachandran angle sequence defining protein backbone #mol/ramachandran

**Referenced External Patterns**
- TCP/IP Illustrated — model for D+ documentation via diagrams-as-typedefs #tcpip #tools/help
- STEPs program — diagrams treated as typedefs #grammar
- GTD — Getting Things Done, source of the multi-currency resource allocation insight #tools/cascade