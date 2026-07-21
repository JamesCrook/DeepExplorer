```json
{ "role": "PROMPT"}
```
---


# Algorithm Design — Elicited Insights

These are the algorithmic cores for each item in the Algorithm Design section of the BOM.


## SMILEs → 2D Structure #mol/smiles/prompt

**Goal:** Render a 2D structural diagram of a small molecule from a SMILES string.

**Pipeline:**
1. Parse SMILES to a graph data structure (atoms as nodes, bonds as edges). Use our existing graph structure types.
2. Find all cycles, ordered by ring size: 3, 4, 5, 6, then larger.
3. Lay out rings greedily in that order, each as a regular polygon.
4. **Exterior-only constraint:** new bonds must always attach on the outside of placed rings, never crossing into the interior.
5. When two rings share an edge (fused rings, e.g. naphthalene), the second ring is placed on the opposite side of the shared edge.
6. Acyclic chains and branches are placed after all rings.
7. A final energy-minimising pass adjusts positions. This is parameterised: the parameter morphs layout from zigzag tails (120° convention) to straight chains. It is a simple spring/penalty model, not a physics simulation.

**Scope:** Handles 99% of real-world small molecules. No attempt to handle all difficult cases. Atoms are rendered as circles, no label concerns. Bond types (single, double, aromatic, etc.) are carried as edge metadata and handled entirely by the renderer. 2D only.


## Auto-Chart of Table Structure (SQLite) #sql/algo/prompt

**Goal:** Given a SQLite database, automatically produce a visual diagram of its table structure.

**Pipeline:**
1. Run a `TABLES` query (plus `PRAGMA` introspection) to extract the schema as a graph: tables as nodes, foreign keys as directed edges.
2. Apply a standard flow layout algorithm to position the boxes.
3. Draw arcs between connected boxes after boxes are in position.
4. User can drag and rearrange — this is already handled by the scene graph renderer, so no new work there.

**Notes:** This is a straightforward wiring of existing capabilities. The algorithm work is minimal; the value is in getting the schema introspection right and choosing sensible default box sizes.


## Multiscroller on Any Table (SQLite) #sql/algo/prompt

**Goal:** Bind the existing multiscroller (which works on in-memory tree-structured data) to a SQLite table.

**Key Insight:** Sorting gives you a virtual tree over flat rows. Sort the table by fields left to right (or use a user-specified sort order). This lets any flat table be viewed as if it were hierarchical.

**Pipeline:**
1. Sort the table by columns left to right (default) or by provided sort hints.
2. Allocate cell widths by default, or use width hints if available.
3. The table indexes by individual rows. The multiscroller indexes by row-ranges. Write a conversion function: for a given cell value in a row and column, the row-range is the set of contiguous rows sharing that value.
4. **Phase 1:** A single pass over the entire sorted table builds the index of cell → row-range. Feed that to the existing multiscroller.
5. **Phase 2 (deferred):** Replace the full-pass index with an incremental method that does not need the whole table in memory, enabling very large tables.

**Caching:** Both the multiscroller and the infinite-scroll (see below) will share a random-replacement cache for row data.


## Block ↔ Ribbon Thawing / Freezing Transforms #block/algo/prompt

**Goal:** Convert freely between two representations of the same structure — a tiled block layout and a node-and-ribbon graph.

**Thawing** (blocks → nodes and ribbons):
- Blocks remember their provenance (what they were cropped from), so thawing replays the crop in reverse. This is not a reconstruction problem.
- Where ribbons crossed the crop boundary, pip-affordances were placed. These become the ribbon endpoints in the thawed view.

**Freezing** (nodes and ribbons → blocks):
- Crop around a selected region. Ribbons crossing the crop boundary become pips on the new block's edges.
- Crop-to-new-block is the escape hatch — any selection can become a reusable block.

**Connection to stretchable tiles:** A block has pip positions as child nodes. The snapping-hint object on each pip ensures that blocks frozen with compatible hints have matching spacings and can snap together.

**Examples:**
- Circuit diagrams: each tile is a crop of a component (transistor, gate).
- Twisty/Penrose diagrams: cropping is around a drawn permutation.


## Map ↔ Route Interface with Data Routing Shown (D+ Open Source) #map/route/prompt

**Goal:** Show a full data-flow diagram (the "map") alongside a single highlighted path through it (the "route"), with the ability to tween between the two views.

**Analogy:** A full metro map vs. the map for one subway line.

**Structure:**
- Both map and route are scene graphs of nodes and arcs. They share the same topology (the route is a subgraph of the map).
- Styling differs: map nodes may have augmented spot art, fancy block shapes indicating role (Scratch/Blockly style, but more so). Route nodes are typically simpler (circles), with highlighting on the arcs involved.
- Styling is handled elsewhere, not part of this algorithm.

**The Interface:**
- Side-by-side display of map and route.
- Tween animation from the embedded-in-map view to the separated-route view.
- The tween is linear interpolation of node positions — nodes slide from their map coordinates to their route-layout coordinates.


## Metro-Map Ribbon Router (45°/90° Pathing) #ribbon/metro/algo/prompt

**Goal:** Route ribbons between pip endpoints on blocks using only 45° and 90° segments, metro-map style.

**Algorithm:** A* on an octagonal grid, with block bounding boxes as obstacles.

**Bus Support:** A tuneable cost-function parameter controls bus formation:
- With penalty: each ribbon routes independently, no bus preference.
- With reward: the router favours co-routing multiple signals along shared segments where it is easy to do so.

Same A* algorithm in both cases; the only change is the cost function.


## Stretchable Tile System for Blocks #block/algo/prompt

**Goal:** Allow blocks (tiles) to be resized while preserving connection points and internal structure.

**Mechanism:**
- Stretching a tile increases internal ribbon lengths. The snapping-hint system still determines where pips are placed.
- A pip can be dragged by the user to reposition it — pip positions are child nodes, so existing node-dragging works.
- The internal component (e.g. transistor icon) can be dragged to reposition within the tile.

**Conceptual Model:** This is actually a micro-thaw of a single tile. The user can drag tile size and internal contents, then the result is re-frozen. From the user's perspective, they are using a "tile tweaking tool" that surfaces normally-hidden affordances. From the code's perspective, it is thaw-edit-freeze on a single block.


## Click-Together and Joining Movement of Blocks #block/algo/prompt

**Goal:** Allow blocks to snap together at compatible pips, and then move as connected groups with physically intuitive behaviour.

**Snapping:** Proximity detection during drag → alignment to snapping hints → pip connection. Clicked-together blocks form a rigid group for movement.

**Light-Cone Fracture Model (the key insight):**
When multiple tiles are clicked together and you drag one, what moves depends on the *direction* of the drag:
- **Pushing:** connected blocks in the push direction stay together and move as a unit.
- **Pulling:** blocks behind the drag direction pull apart (fracture).
- The initial drag direction defines a "cone" (in the light-cone sense). All pip-connected blocks within that cone move together; those outside the cone stay put.

**Example:** In a 3×3 grid of tiles, dragging the centre tile in 8 different directions produces 8 different results for which tiles move.

**Implementation:** On drag start, compute the direction cone. Walk the pip-connection graph, including only blocks whose connection direction falls within the cone. That connected subset moves as a rigid body; everything else is stationary.


## Infinite-Scroll with Partial Caching (Discord) #dplus/scroll/algo/prompt

**Goal:** Scrollable chat/message view that handles arbitrarily long histories without loading everything.

**Approach:** Sliding window of rendered content (N screens), with virtualised content outside the window. Fetch on demand from the server.

**Caching:** Random-replacement cache for eviction decisions. This same cache implementation will be reused for the multiscroller's row-range data.

**See also:** *Delayed availability information* — handling graceful display when the server is slow or data is not yet available. To be addressed in a separate session.


## Cut-and-Paste Sankey / Rearrangement Diff Using MST (Obsidian) #git/algo/prompt

**Goal:** Detect that chunks of text were cut-and-pasted (reordered) between document versions, and visualise the rearrangement as a Sankey/stream-graph diagram. Designed for multiway diffs (A→B→C→D, a sequence of document versions).

**Pipeline:**
1. **Cheap hash matching:** Hash text chunks and sort. This finds candidate correspondences between versions — blocks of text that appear in multiple versions, possibly at different positions.
2. **MST pruning (N² → N):** The raw candidate connections are potentially quadratic (same chunk appearing many times). Build a minimum spanning tree over the found connections to reduce to a linear set. Without this step, repetitions in the text would be overwhelming.
3. **Diff alignment using MST links:** Feed only the MST-retained links to a diff algorithm. The diff aligns the two texts so as to best utilise these links — finding a non-crossing ordering. It will not be able to use them all; some MST links represent rearrangements and would require crossings in a sequential alignment.
4. **Stream graph from aligned links:** The links the diff *kept* define the in-band flow — text that maintained its relative order between versions. Render this as a stream graph (the backbone of the visualisation).
5. **Out-of-band Sankey flows:** The MST links the *diff dropped* (because accommodating them would require crossings) are added back as out-of-band Sankey flow lines. These are the rearrangements — text that was cut from one location and pasted to another.

**Result:** The stream graph shows text that flowed forward in order; the out-of-band Sankey crossings show the rearrangements. Together they give a visual map of how a document was restructured over time. The nodes are the same sequence in the diff-aligned texts, so the two layers (in-band and out-of-band) share a common backbone.


## Overlayer Controls over Chain Colouring (Molam) #mol/color/prompt

**Goal:** Layer alternative colouring schemes (electrostatic potential, transmembrane regions, etc.) over the existing per-residue chain colouring in Molam.

**Current State:** Molam has an advanced residue colouring scheme with a params slider per residue type. There is a PRESETS mechanism that allows morphing between presets of multiple settings.

**Generalisation:** The overlayer is a grouping of subsets of these residue-type sliders. Rather than binary "apply preset", each overlayer gets a slider — e.g. turning up "electrical" colouring blends it over the base. This is essentially the PRESETS mechanism with continuous blending instead of discrete switching.

**Note:** Understanding the existing PRESETS control design is prerequisite. The generalisation from binary-apply to slider-blend should then be clear.


## Local Params — Per-Range and Per-Selection Support (Molam) #mol/color/prompt

**Goal:** Allow parameter settings to apply to selections within a model, not just to the entire model.

**Current State:** All parameter settings apply to the whole model.

**Generalisation Path:**
1. **Molam as starting point:** The protein backbone gives natural, simple ranges (residue N to residue M). Implement per-range parameter overrides here first.
2. **Selections over models:** Implement a general selection mechanism. A selection is a subset of model elements that can receive its own parameter values.
3. **Selection maintenance:** Selections must update as the model is modified (elements added, removed, reordered).
4. **UI integration:** The parameters and PRESETS UI gains a selector for which selection (or ALL, the current default) the settings apply to.
5. **Future: fuzzy selections.** Selections that are not crisp subsets but have graduated membership — deferred, but the architecture should not preclude this.

**Scope:** This is a general mechanism, not Molam-specific. Molam is the natural first client because backbone ranges are simple and useful. But the selection + local-params system should work for any model type.


---

## Cross-Cutting Notes

**Shared cache:** The random-replacement cache is shared infrastructure for the multiscroller and infinite-scroll.

**Thaw/freeze as universal pattern:** Stretchable tiles, block editing, and the block↔ribbon transforms are all instances of the same thaw-edit-freeze cycle, surfaced through different UI affordances.

**Selections as general infrastructure:** The local-params work in Molam is really about building a selection mechanism for the whole platform. Other systems (blocks, charts, code views) may eventually want the same "apply settings to selection" pattern.

**Deferred topics:**
- Delayed availability information (graceful handling of slow data) — separate session.
- Fuzzy selections — architecture should allow, but implementation deferred.
- Incremental multiscroller indexing for large tables — Phase 2, prompted separately.