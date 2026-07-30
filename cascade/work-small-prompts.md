```json
{ "role": "PROMPT"}
```
---

# DONE
## [x] Small Graph Library  #util/graph
Nodes and edges, ingestible from the scene graph. Includes cycle-finding (ordered by ring size, for SMILES and elsewhere) and an MST implementation (for the Sankey diff and potentially bus detection in metro routing).

library and stnda exists

## [x] Set and Shape Operations #util/shape
Intersection, union, and exclusion operations for both discrete sets (selections, element groups) and geometric shapes (crop regions, bounding boxes). Shared by selections, freeze/crop, and any spatial query.

Library and stnda exists.

# Not Yet Done

## [ ] Provide packman chase dynamics #citadel
Should have cycles of chasing interspersed with calmer times. This should be triggered by tagging by ubiquitins children, which then brings hsp70.
## [ ] Implement histone room dynamics #citadel
This is mostly reading first. That in turn will inspire the dynamocs and the puzzle.
## [ ] Improve biome structure #citadel
This is mostly reading first. The reading will inform the shape and properties of the biomes.


## [ ] Z-Anatomy for Ultrasound #bio/ultrasound/zanat
Use z-anatomy to provide some slices for the ultrasound scanner

## [ ] Example charts #chart/examples USES #zoomyruler
There is considerable work to upgrade the existing charts to fully professional ones.
1 - Sticky headers, possibly using multiscroller styling.
2 - Key that has a smart position, e.g set by percentage aligns
3 - Overlays, e.g. for climate charts (see Wikipedia for examples)
4 - Zommyruler used for grid lines
5 - Hover behaviour to give more detail

## [ ] Haem 2d #mol/anim2d
Convert the haem animation to use a scen graph:
1 - Make a scene graph object type for each kind of visible entity in the original demo.

## [ ] Haem 3d #mol/anim3d USES #mol/anim2d
Convert the haem 2d animation to a version that uses 3d. 

## [ ] Updated zoned-stnda for array #collection/array USES #node
A draw2d collection node that places items in a regular 2d grid pattern. Can use a prototype or actual instantiated items. zoned-stnda is the obvious stnda to adapt for this. 

## [ ] A board-stnda for #chesse/fen USES #collection/array
A chess board drawn from a parsed fen representation or othello board, with pluggable movement rules

## [x] Spot Art #ai/art USES #node USES #icon/faces
A small icon that can be sized and positioned and adjusted

## [ ] Footprints #collection/arc
Look at line-geometry.js and line-markings.js

## [ ] Ultrasound #bio/ultrasound/asy USES #collection/arc
A particular example of using an arc collection to arrange icons and graphs

## [ ] Claude Importer based on Obsidian support #tools/import
An importer for an archive from Claude. Read the existing code. The most interesting part is how to produce an index that can be used from d-plus

## [ ] Interpreter #interpreter
Given a scene graph, this is a walk that calls step(mixCtx, node, params) on each node. This is a yielding version of the code in scene.js.

```javascript
  *runYieldingPhases(ctxMix, root, params, phases = ['step']) {
    ctxMix.iterators = [];
    ctxMix.flyweight = {};
    for (const phase of phases) {
      yield* this.walkYieldingPhase(ctxMix, phase, root, params);
    }
  }

  *walkYieldingPhase(ctxMix, phase, node, params) {
    if (!node) return;

    if (!node?.subtree || node?.subtree?.length === 0) {
      this.dispatch(ctxMix, phase, node, params);
  	  yield { ctxMix, phase, node };
      return;
    }

    ctxMix.iterators.push(new SubtreeIterator());

    this.dispatch(ctxMix, 'before_' + phase, node, params);

    let child;
    while ((child = ctxMix.iterators.at(-1).next(node.subtree)) !== null) {
      this.dispatch(ctxMix, 'before_child_' + phase, node, params, child);
      yield* this.walkYieldingPhase(ctxMix, phase, child, params);
      this.dispatch(ctxMix, 'after_child_' + phase, node, params, child);
    }

    this.dispatch(ctxMix, 'after_' + phase, node, params);
	yield { ctxMix, phase, node };

    ctxMix.iterators.pop();
  }
```

We can run without yielding like so:

```javascript
const gen = registry.runYieldingPhases(ctxMix, root, params, phases);
while (!gen.next().done) {}  // runs identically to the non-generator version
```
To test this, we will need some new nodes with step() functions.


## [ ] Asymptote Editor #asy/editor USES #interpreter
The main part of this work is making a viewer for asymptote files. You already have a grammar for asy, and we need nodes for each production in the grammar, each implementing the step() function. This will give us an interpreter for asy that produces a new scene graph of node3d nodes. These nodes can now be walked by the node3d walker to display and update the model.

## [ ] Count-Down Mode Shifts #util/countdown
Avoid stuck-in-a-mode by pre-declaring the exit condition when entering a mode. Already exists for the mask editor; needs to be generalised as infrastructure so other tools (tile tweaking, block assembly) can use it.

Some code already exists. Use it.

## [x] Snapping-Hint Object #block/snap
Carries snapping algorithms — different hint types for different contexts. May be zoom-sensitive. Also handles snap-to-angle (e.g. snap to 45° multiples for metro-map routing). Used by click-together, stretchable tiles, and freeze operations.

Possibly adapt from fracture-stnda code.

## [ ] Ultrasound demo #bio/ultrasound USES #collection/arc USES #block/mermaid 
Make the HUD display from MidJourney ultrasound. The key element is a hexagonal button arranged in a circle. Small sound graphs are arrayed around the circle, with styled connecting lines.

This prompt is not complete. It is a pointer to some of the reusable pieces that need to be made. 

## [ ] Parameterised faces #icon/faces
A node type that can do simple edits to an icon, most usually emoji. For example, apply expressions that are found on human-face emoji to animal faces. Also handle the hear-no-evil, see-no-evil, speak-no-evil monkey icons - which is mostly about hand positions - on other animal faces. Sunglasses, heart-eyes, scream.

The main innovation is using the flexible ribbon for the mouth (and teeth?) and being able to decorate it differently for different animals. We will start with a relatively crude version that is merely postioning adornments.

A demo initially will be drawing large emoji, using sliders to control details - using existing params infrastructure. Later we will provide a way to capture and package multiple emoji. 

## [ ] Icon library #icon/library
A node type that supports retrieval by name of icons/emjoi from a library.

## [ ] Library of organism icons #icon/organisms USES #icon/library
A demo of the icon library, using organisms icons. Possibly involves a tool to slice the icons out of a sprite sheet.

We already have a sprite sheet to slice up.

## [ ] Flow Layout Manager #node/flex
Layout algorithms akin to flex, but for positioning nodes on a 2D canvas. Built from composing nested AST-node structures. Can serve as a full layout manager — used by auto-chart, map/route layout, and anywhere boxes-and-arcs need automatic positioning.

## [ ] Random-Replacement Cache Library #util/rr
A general eviction cache with random replacement policy. Particular instances track loaded .md documents, loaded images, and row-range data. Shared by the multiscroller and infinite-scroll, and available to anything else that needs bounded-memory caching.

## [ ] Dataflow Infrastructure #util/dataflow
Minimal re-evaluation of a dependency graph when data changes. When an upstream value is modified, only the affected downstream nodes recompute. Foundation for reactive parameter updates, selection-dependent rendering, and overlayer blending.

## [ ] Bidirectional Pointer Infrastructure #util/pointer
Unidirectional pointers are a widespread optimisation, but code often needs to know "what points to me?" When the pointed-to thing is edited, we want to update or invalidate the pointers that reference it. Can be as simple as marking the source as dirty and needing re-hydration before next use. Foundation for selection maintenance and model-edit propagation.

## [ ] Selection Infrastructure #util/select
Layered on bidirectional pointers. A selection is a subset of model elements that survives model edits — when an object is updated, the selection still works. Supports fuzzy selection (graduated membership). Used by local params, overlayer controls, and eventually any "apply settings to subset" pattern.

## [ ] Delayed Availability Information #util/delay
Graceful handling of data that is not yet available — the UI can render placeholders, show loading state, and fill in when data arrives. Shared concern for infinite-scroll, multiscroller with large tables, and any server-backed view. To be addressed in a separate session.

## [ ] Data Binding for Scene Graph Nodes #node/databind
Node data comes in three forms, resolved in priority order: an accessor function `node.accessor(ctxMix, node, params)`, a literal `node.value`, or a default. The accessor signature matches `draw2d` so no new calling convention is needed. Accessors typically live on prototypes, values typically on instances. Container sizing follows the same pattern: `node.sizing(ctxMix, node, params) ?? node.size ?? default` determines child count, so data-driven structure works without special cases. 

## [ ] General SQLite Access Library (JavaScript) #sql/access USES #util/rr
Handles connection lifecycle including lost connections and reconnection. Provides the foundation for both auto-chart schema introspection and multiscroller table binding.

## [ ] Thaw/Freeze Infrastructure #block/thaw
General mechanism: freeze creates a local visual cache of a more flexible item, potentially applying snapping and other "roundings" during the freeze. Thaw reverses it using stored provenance. Used by blocks, stretchable tiles, and the tile-tweaking tool.