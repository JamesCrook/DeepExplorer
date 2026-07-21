```json
{ "role": "PROMPT"}
```
---

# Product Design — Elicited Insights

## Moderation and Permissions (Discord Alternative) #dplus/perms/prompt

### Core Insight: Program Fragments as the Universal Configuration Surface

Discord's permission system suffers from scattered, implicit rule evaluation — a bitfield computed across 8 layers with inconsistent combination rules (additive at server level, deny-wins at channel level), spread across dozens of UI panels. Email filter systems (Gmail, Outlook) suffer a parallel problem: rules that can't compose, can't be named, can't be debugged.

The D+ approach uses **program fragments** — short, readable programs that specify permissions directly. The UI to construct these is Scratch-like.

```
allow send_message if role has 'member'
deny send_message if channel in ['announcements', 'rules']
allow manage_message if role has 'mod'
deny manage_role if target_role above own_role
```

**Key arguments for programs over toggle-based permissions:**
- A program is the most concise way to specify a custom ruleset, and therefore the most legible.
- Any custom ruleset an admin actually wants can be stated in 5–20 lines. The equivalent Discord configuration touches 30+ channel override panels.
- Scratch demonstrates that even children can grasp programming with the right tooling. Baroque option trees are harder to understand than short programs.
- One skill to learn, applied everywhere: permissions, notifications, channel visibility, cross-server groupings — all the same authoring model.

**Program authoring support:**
- Provide templates and help for creating tags, but tag naming is freeform.
- A structured editor that only produces valid programs (Scratch-style).
- Claude as authoring assistant: users describe intent in natural language, Claude generates the program fragment, users review in the dry-run matrix.

### Permisison tags as Named Functions, Displayed on Channels #dplus/perms/prompt

Named rules such as `judges-only`, `read-only-announcements`, `nsfw-gated` are displayed on the channels they apply to as tags. When exploring permsiions, the channel list becomes a readable summary of the permission state.

This solves Discord's category sync problem: instead of a binary "synced/not synced" state, you see the tags. If a channel has the same tags as its category, it's effectively synced. If someone added an extra tag, you see it immediately — no hidden desync.

### Dry-Run Matrix for Inspection #dplus/perms/prompt

A matrix view where you probe with particular users and see what they are allowed and not allowed to do. This replaces Discord's limited "View as Role" (which only shows one role, not a specific user's role combination).

**Scaling the matrix:** The naive grid of (users × channels × 40+ permission types) is unusable. The solution is sorting by tag importance. Some tags are critical (`mod`), some are minor (`emoji-curator`). Sort outcomes by tag with high-importance tags first. For any intelligently configured permission set, this produces legible groupings automatically. Edge cases where the admin goes baroque produce a noisy sorted matrix — which is fine, because that admin presumably knows what they are doing.

## Per-User and Per-Server Customisation (Discord Alternative) #dplus/perms/prompt

### Program Everywhere

The "program fragments" model extends beyond permissions to all advanced configuration: notification filtering, channel visibility, cross-server groupings. The user learns one authoring paradigm and applies it everywhere.

### User Channel Configuration

D+ allows users to configure which channels they see and which they search. Discord makes this selection server-controlled, which means users don't have to configure — but also can't.

**Design principle:** Noob users get server defaults. Power users can flexibly reconfigure server set and channels. A per-server toggle lets any user see the default view for that server, acting as a safety net.

### Guardrails Against Accidental Configuration

The primary failure mode is **accidental configuration** — the user changes their view without intending to, doesn't know the feature exists, and now channels have vanished. (Discord already has this problem: users drag a server icon into a folder without realising.)

**Guardrail approach:**
- Configuration actions require a deliberate gesture distinct from normal navigation. You wouldn't accidentally type a program fragment.
- The real problem is a user getting the interface into a state that makes it unusable. Design ensures you can't hide all channels, and similar structural guards.
- "Reset to server defaults" is always visible and one-tap.
- Intermediate users who get confused can ask Claude for help — the program fragment is a legible artifact inspectable by both humans and AI.


## MSA ↔ Molam Integration #mol/msa/prompt

### Bidirectional Highlighting Through Proximity

Both displays (MSA and 3D Molam) exist. The integration is about how they connect: **shared proximity zones** using the selection architecture.

**3D → MSA direction:** Proximity in 3D is a spherical zone of variable radius around a selected residue. The sphere captures everything nearby in physical space. When projected onto the MSA, the result is discontinuous — residues that are 3D neighbours may be hundreds of positions apart in sequence. The MSA highlighting becomes scattered islands. These islands are the informative part: they show which distant sequence regions are in physical contact.

**MSA → 3D direction:** A contiguous range highlighted on the MSA highlights a corresponding zone on the 3D model (a backbone segment as ribbon or tube). For aligned sequences, equivalent structural regions across aligned proteins are highlighted.

**Proximity radius:** User-adjustable slider, fits naturally into the existing params slider infrastructure. Could snap to chemically meaningful thresholds (4Å for van der Waals contact, 8Å for interaction neighbourhood).

**Selection architecture integration:** The scattered islands on the MSA are a selection — a non-contiguous subset of residues derived from a spatial query. This is a first-class selection object that can receive local params, be named, be saved, and serve as input to the overlayer colouring. The proximity query is a **selection generator**, not just a highlighting effect.


## Blocks-Based Interpreter (Molam Animation) #mol/blocks/prompt

A Scratch-based animation language for molecules. The design follows standard Scratch/blocks paradigms adapted to the molecular scene graph. Straightforward application of the blocks infrastructure.


## Coarse-Graining Strategy Refinement (Charts) #chart/coarseg

### Automatic Coarse-Graining by Data Type

- **Time series:** Standard min-max bucketing for rendering performance. Well-understood.
- **Scatter → heatmap:** Density-based binning. Well-understood.
- **High-dimensional sparse data:** Requires clustering to coarse-grain.

### Mapper + HDBSCAN for High-Dimensional Coarse-Graining

**Mapper** (from topological data analysis) fits the need precisely:
1. Choose a filter function (projection, density, eccentricity).
2. Cover the filter's range with overlapping intervals.
3. Cluster data points within each interval independently.
4. Build a graph where nodes are clusters and edges connect clusters sharing data points (due to interval overlap).

The output is a coarse-grained graph of the high-dimensional point cloud — directly ingestible by the Graphs library. It handles sparsity naturally: dense regions produce more clusters (finer grain), sparse regions collapse into fewer nodes (coarser). Inherently LOD-capable — wider intervals give coarser graphs.

**HDBSCAN** as the clustering engine within each Mapper interval: produces density-based cluster hierarchies, doesn't force every point into a cluster, handles sparse outliers gracefully.


## Slicer Design (Ultrasound) #bio/slicer/prompt

**Core Insight:** The Slicer's Input is a Program, Not Geometry

The slicer does not voxelise the model and then slice. The model is defined as a procedural function (e.g. an L-system for lung airways) and evaluated only on the slice plane. The 3D model never fully materialises.

### Lazy Evaluation with Analytical Bounding Guarantees

The L-system cannot be fully expanded at startup because it is infinitely zoomable. Instead:

- **Bounding guarantees are analytical properties of the L-system grammar**, not computed from expansion. E.g. "this production rule can generate structures extending at most R from the parent branch axis, where R is a function of the recursion depth remaining."
- Bounding volumes must encompass the **entire subtree including terminal structures** — an airway that passes far from the slice plane may have alveolar clusters that reach it.
- Bounding hierarchy is bottom-up: leaf structures define their bounds, parent branches take the union of their own geometry plus all children's bounds.

### L-System Unfolding via Random Replacement Cache

The unfolding of the L-system is tracked using the random replacement cache. Materialised subtrees are cached; when evicted, they can be regenerated deterministically from the pseudo-random seed. The model is fully defined by seed + L-system parameters.

### Tractable Unphysical Models

Real biological structure is not wholly locally determined — locals equilibrate for the resulting structure. But for what is essentially a schematic, using a tractable constructed L-system with local-only generation rules is acceptable. The goal is illustrative, not simulational.

### Branch Interaction and Space-Filling

Branches interacting — important for space-filling structures — acts as a law of growth. This is a constraint on the L-system rules rather than a post-hoc collision resolution.

### Smooth Slice Dragging

As the user drags the slice plane, the cross-section evolves smoothly: branches appear as dots, grow into circles, merge at bifurcations, split again.


## GGUF Reader (CAGs) #cag/prompt #sql/algo/prompt
* Display involves queries against data too large to materialise

### Presentation, Not Raw Display

An extremely dense tensor of weights without processing looks like noise. The raw weight display is not the useful artefact.

### Two Valuable Layers Above Raw Weights

1. **Data flow diagram:** The architecture as a graph of operations with metadata (tensor shapes, dtypes, quantisation) on the nodes, and compute cost (FLOPs, memory movement) as annotations. Immediately legible and actionable — shows where the model spends its time. **This is a new BOM item: Data Flow Diagram.**

2. **MechInterp probes:** Rather than displaying raw weights, run probe queries and display what responds. The tensor view becomes an instrument panel — "what lights up" — not a data dump. The overall framework is customisable coarse-graining of a view of tensors.

### Query Pattern Parallel with SQL

GGUF display involves queries against data too large to materialise, sharing the same infrastructure pattern as SQLite access:
- Result size estimation before committing to a query (exact for gguf from tensor metadata, heuristic for SQL).
- Caching recently accessed regions via the random replacement cache.
- Estimate-then-fetch-then-cache as a shared pattern.

### Data Residency Annotations

Extension to KaiTai's model: annotate where bytes live — disk, RAM, VRAM — turning KaiTai from a parser into a data access planner. Informs caching decisions through the random replacement cache.

## KaiTai Reader (CAGs) #cag/prompt

### Unifying Insight: Variable-Length String as Primitive

Adding variable-length string to KaiTai's primitives unifies KaiTai iterators and PEG parser iterators. The scene graph's binary form and text form use the same infrastructure. Binary data and text data become two dialects of the same parsing system.

This is the grammar/typedef isomorphism made concrete: a grammar gives you SerDes, display, and editing for free, regardless of whether the source is binary or text.

### KaiTai as Universal Base Layer for Data Inspection

Any format with a grammar gets a vanilla display automatically — productions in the grammar are types, and scene graph elements exist to display and edit types. Selective augmentation replaces vanilla elements with richer visualisers where warranted. The gguf reader is not a bespoke tool — it is a KaiTai grammar for gguf plus selective augmentation (data flow diagram, MechInterp probe panel).

### GGUF Implemented Through KaiTai

The gguf reader should be implemented as a KaiTai grammar, not as standalone code. This validates the KaiTai infrastructure and establishes the augmentation pattern.

### IDE-Style Data Exploration

KaiTai is the data exploring and editing system analogous to a debugger's data view in an IDE. It provides the vanilla display of any binary data. Productions in the grammar are types; scene graph elements display and edit types. Selective augmentation layers richer visualisers on top.

### SQL Expression Duality

When working on SQLite code, expressions should exist in both text and binary form — the grammar bridges between them. This connects to the grammar/typedef isomorphism: the SQL expression grammar gives you parsing (text→binary), serialisation (binary→text), and editing (via type-aware scene graph elements).

### Architectural Note on Random Replacement Cache

The random replacement cache is a foundational utility (like vectors or node/edge graphs). Wherever it appears in use, ask: "Does the extended infrastructure that includes KaiTai apply?" The cache often signals a data access pattern that KaiTai can formalise.

## Cellular Citadel (Biome, Packman, Histone) #citadel/read/prompt

### Design-Research vs Reading-Research

These three features are **reading-research** items, not design-research. The distinction matters:

- **Design-research** uses prior knowledge and explores constraints — the developer already has the domain knowledge and is working out how the pieces fit.
- **Reading-research** requires seeking out new knowledge before design can proceed.

### Specific Reading-Research Needed

- **Biome structure:** Biomes are local structure in cells. From our implementation perspective, this is an L-system. The reading-research is about what structures exist and how they are organised.
- **Histone room dynamics:** Need to enumerate more specifically how histones operate, to design the corresponding game mechanic.
- **Packman chase dynamics:** Need more reading on the ubiquitin tagging and HSP70 process to design the chase/tag/capture mechanic.


## Data Flow Diagram #util/dflow/prompt

A scene graph element representing operations as nodes with metadata (tensor shapes, dtypes, quantisation, compute cost) and data movement as edges with cost annotations. Reusable across:

- GGUF reader (model architecture visualisation)
- Any system where graphing compute cost through a dataflow is valuable

Should support interactive cost annotation — clicking a node or edge shows detailed breakdown of FLOPs, memory reads/writes, and latency.


---

## Cross-Cutting Themes

**Program everywhere:** Program fragments are the universal advanced configuration surface — permissions, notifications, channel visibility, user customisation. One skill, applied everywhere. Claude assists authoring. The dry-run matrix is the universal inspection tool.

**Grammar/typedef isomorphism as infrastructure:** KaiTai + PEG unification means binary and text formats share parsing infrastructure. A grammar gives SerDes, display, editing. Wherever the random replacement cache is in use, ask whether the KaiTai infrastructure applies.

**Selection architecture as shared foundation:** MSA ↔ Molam proximity zones, local params, overlayer controls, and eventually any "apply settings to subset" pattern all use the same selection infrastructure.

**Coarse-graining as universal pattern:** Time series bucketing, scatter → heatmap, Mapper for high-dimensional data, L-system lazy evaluation, and multi-level co-simulation are all instances of the same idea: don't materialise what you don't need, provide analytical guarantees about what you're omitting, and let the user choose the granularity level.

**Design-research vs reading-research:** Distinguish between work that explores constraints within existing knowledge (design) and work that requires acquiring new knowledge first (reading). They have different workflows and different AI assistance patterns.


