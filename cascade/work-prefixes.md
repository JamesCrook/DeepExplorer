# Prefix Instructions

```json
{ "role": "PREFIX" }
```

These prefix instructions are provided to an AI when generating code for this project. Each section is tagged so that the relevant prefix(es) can be included in a prompt by tag. Multiple prefixes may apply to a single task.

---

## Route Table

Maps the last segment(s) of a BOM tag to the prefix sections to include in a bundle. The cascade tool matches segments from right to left; first match wins. Format: `segment, segment → prefix, prefix, prefix`.

```routes
lib             → spike, lib, tags
node            → spike, node2d, databind, tags
node3d          → spike, node3d, tags
nodehtml        → spike, nodehtml, tags
grammar         → grammar, tags
spec, api       → spec, tags
algo            → spike, tags
code, coding    → spike, normalise, tags
example         → spike, node2d, tags
prompt          →
```

## Pipeline

```json
{
  "pipeline": [
    { "name": "TODO",   "color": "#f59e0b", "checkbox": true, "description": "Work item identified" },
    { "name": "PROMPT", "color": "#58a6ff", "ready_when_lacking": "CODE", "description": "Elicited design or algorithm prompt" },
    { "name": "SPEC",   "color": "#bc8cff", "description": "Detailed specification" },
    { "name": "CODE",   "color": "#3fb950", "description": "Implementation" },
    { "name": "STNDA",  "color": "#e877ec", "tab": true, "description": "Standalone normalised spike" }
  ],
  "tabs1": [{ "title": "STNDA", "with": ["STNDA"], "style": "role" }],
  "tabs2": [{ "title": "Quert", "with": ["PROMPT"], "without": ["CODE"], "style": "queue" }],
  "manifest": {
    "default_role": "CODE",
    "patterns": [
      { "match": "-grammar", "role": "SPEC" },
      { "match": "-stnda",   "role": "STNDA" }
    ]
  }   
}
```

## Suggested Attachments

Files to paste into the chat session alongside the bundle, keyed by prefix tag. Format: `prefix: path — reason`.

```attachments
node2d: js/omni-support/scene.js — SceneNode, sceneRegistry, MiniAstNode, SubtreeIterator
node2d: stand-alones/zoned-stnda.html — Working 2D node stnda example (ZonedNode, DemoHarness)
node3d: js/omni-support/scene.js — SceneNode base class, sceneRegistry
node3d: js/nodes3d/molam-atom-node.js — Working 3D node example (build/update/teardown)
nodehtml: js/omni-support/omni-widget.js — OmniWidget base class, WidgetContext, createWidget, parseDslValue
lib: stand-alones/graph-library-stnda.html — Working infrastructure library stnda example
grammar: js/parsers/parser.js — PEG parser (seq/or/rep combinators, AstNode)
normalise: js/omni-support/scene.js — Target interface for normalised nodes
databind: js/omni-support/scene.js — MiniAstNode (node.value, node.subtree)
```

---

## General Spike & Stnda Conventions #spike

**What a stnda is.** A standalone HTML file (`something-stnda.html`) that demonstrates and tests a reusable piece of work. It is a single `<!DOCTYPE html>` page with all CSS in a `<style>` block and all JS in a `<script>` block. It must open in a browser and work with no build step, no server, no imports. The file contains both the **nugget** (reusable code) and the **harness** (throwaway demo/test scaffolding).

**Nuggets and markers.** Reusable code is delimited with spike_kit markers so it can be mechanically extracted:

```
//<< import { Foo } from './foo.js';
//-- file: ./foo.js --
//>> import { sceneRegistry } from '../omni-support/scene.js';
//>> export { Foo };
class Foo { ... }
//-- endfile --
```

- `//-- file: PATH --` and `//-- endfile --` delimit a nugget region.
- `//>> CODE` — dormant in the spike, active in the extracted file. Use for: `import` statements that reference other project files, `export` statements, `sceneRegistry.registerNodeClass(...)` calls.
- `//<< CODE` — active in the spike (so it runs standalone), replaced by the real import when extracted. Place `<<` lines immediately before the `file:` marker.

**Tag comments.** Place a `# tag` comment (e.g. `// #util/graph/lib/code`) at the top of each nugget class, matching the BOM tag. This links code to its BOM item.

**File naming.** Standalone spikes: `something-stnda.html`. After extraction, nugget files get descriptive names matching the `file:` path.

**No external dependencies** in the harness unless absolutely required. The nugget itself may import project files via `>>` markers (dormant in standalone mode). CDN imports (e.g. THREE.js) are acceptable when the nugget genuinely requires them.

**Styling.** Dark theme. Use CSS custom properties. The infrastructure stnda files use this palette as a starting point:

```css
:root {
  --bg: #0e1117; --surface: #161b22; --border: #30363d;
  --text: #c9d1d9; --text-muted: #8b949e;
  --accent: #58a6ff; --green: #3fb950; --orange: #d29922;
  --red: #f85149; --purple: #bc8cff;
  --mono: 'SF Mono', 'Cascadia Code', Consolas, monospace;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

The 2D node stnda files (zoned-stnda) use a warmer palette (`#111210`, `#c8c0b0`, `#e4dac6`). Either is fine; be consistent within a file.

---

## 2D Scene Graph Node #node2d #spike

**Use when:** creating a canvas-drawn leaf or container node for the 2D scene graph.

### The ctxMix signature

All 2D node methods use this signature:

```js
static draw2d(ctxMix, node, params)
static hit_test(ctxMix, node, params)
static measure(ctxMix, node, params)
static layout(ctxMix, node, params)
```

The method must be `static` with the first parameter literally named `ctxMix` (the registry scans for this name to auto-register the method as a phase handler).

**ctxMix carries:**
- `ctxMix.ctx` — the Canvas 2D rendering context.
- `ctxMix.T` — the transform / iteration context. Properties set by the scene walker or by the parent container. Common properties: `.index`, `.pass`, `.isHovered`, `.isSelected`, `.sx` (zoom scale). Methods on T provide coordinate conversion: `.toScreen(point)`, `.toLocal(point)`.
- `ctxMix.W`, `ctxMix.H` — available width and height.
- `ctxMix.hitPoint` — `{x, y}` during hit testing, `null` otherwise.
- `ctxMix.hitResult` — set by hit_test to signal a hit. Typically `{ node, zoneIndex }` or similar.

**In the real system**, the raw context is accessed through mediators: `ctxMix.directCtx()` returns a context with no transforms applied; `ctxMix.scaledCtx()` returns one with transforms pre-applied. In a stnda harness, `ctxMix.ctx` is used directly.

**node carries:**
- `node.data` — domain data, typically set once (e.g. chromosome band definitions, pin maps, tree ring arrays). This is the "what to draw" data.
- `node.value` — instance state (e.g. which zone is hovered, the selected set, a class reference). Not serialised to storage.
- `node.subtree` — array of child `MiniAstNode`s (empty for leaf nodes).
- `node._layout` — cached layout calculations (convention: recomputed in `drawBackground` or `measure`, consumed in `draw2d` and `hit_test`).

**params carries:** a flat dictionary of named numerical and colour parameters, typically global for the scene. Example: `params.cornerRadius`, `params.atomOpacity`. The registry merges `defaultParams` from registration, so nodes can declare defaults.

### Phase patterns

Standard 2D phases, run in order by `runPhases`:

- **measure** — compute size requirements. Write to `node.value` or `node._layout`.
- **layout** — position children given allocated space.
- **draw2d** — render to canvas. Read from `ctxMix.ctx`, `ctxMix.T`, `node.data`, `node._layout`.
- **hit_test** — test `ctxMix.hitPoint` against geometry. If hit, set `ctxMix.hitResult`.

A node need not implement all phases. A simple leaf typically only implements `draw2d` and `hit_test`.

The scene walker also dispatches `before_draw2d`, `after_draw2d`, `before_child_draw2d`, `after_child_draw2d` (and likewise for other phases). Container nodes use these to set up clipping, transforms, or per-child iteration state.

### The ZonedNode pattern

For nodes that draw a collection of indexed zones (chromosome bands, piano keys, BGA pins, tree rings), use the ZonedNode orchestrator. The actual zone-specific code goes in a **zone class** with static methods:

```js
class MyZone {
  static getCount(data)                      // → number of zones
  static drawBackground(ctxMix, node, params) // before zone iteration
  static draw2d(ctxMix, node, params)         // draw zone at T.index
  static hit_test(ctxMix, node, params)       // test zone at T.index
  // optional:
  static drawOverlay(ctxMix, node, params)    // after all zones
  static getPasses(params)                    // → number (default 1)
  static getHitOrder(data, count)             // → index[] for hit priority
  static getZoneInfo(ctxMix, node, params)    // → { name, detail, extra }
}
```

`ZonedNode.draw2d` iterates zones, setting `T.index`, `T.isHovered`, `T.isSelected`, `T.pass` before each call. The zone class reads those from `ctxMix.T`.

`node.value` for a ZonedNode always has: `{ zoneClass, hovered: -1, selected: new Set() }`.

### Registration

In the extracted nugget (dormant in the spike via `>>` marker):

```js
//>> sceneRegistry.registerNodeClass('my-type', MyClass);
```

### The DemoHarness

Every 2D node stnda includes a `DemoHarness` class that:
1. Creates a canvas and handles sizing (DPR-aware).
2. Builds a `ctxMix` shim: `{ ctx, T: { index: 0, pass: 0, isHovered: false, isSelected: false }, W, H, hitPoint, hitResult }`.
3. Builds a `node` shim: `{ data: ..., value: ..., _layout: null }`.
4. Calls the real `draw2d` and `hit_test` with the exact signatures the scene graph would use.
5. Handles `mousemove`, `mouseleave`, `click` for hover/selection/tooltips.
6. Documents the mapping to the real system in comments:
   - `ctxMix.ctx` → `ctxMix.directCtx()`
   - `ctxMix.T` → the scene's transform (already has `.sx`, `.toScreen`…)
   - `ctxMix.W / .H` → already on ctxMix
   - `node.data` → populated from scene data
   - `node.value` → instance state on the scene node

---

## 3D Scene Graph Node #node3d

**Use when:** creating a THREE.js-based node for the 3D scene graph.

### Base class

Extend `SceneNode` from `scene.js`:

```js
import { SceneNode, sceneRegistry } from '../omni-support/scene.js';
import * as THREE from 'three';

class My3DNode extends SceneNode {
  static rebuildParams = [];       // params that require full rebuild
  static updateParams = ['opacity', 'radius'];  // params handled by update

  build(ctxMix, node, params)    { /* create THREE objects, assign to this.group */ }
  update(ctxMix, node, params)   { /* adjust materials, positions, visibility */ }
  teardown(ctxMix, node, params) { this.clear(); }

  clear() { /* dispose geometry, materials, remove from group */ }
}
```

**Instance methods**, not static. First parameter is `ctxMix`. The registry dispatches via `node.inst[name]`.

### Lifecycle

- **build** — create `this.group` (a `THREE.Group`), create meshes, add them. If data is not yet available, store as `this._pendingData` and apply in build when ready.
- **update** — called on every render when updateParams change. Adjust uniforms, opacity, range, colours. Do not recreate geometry here.
- **teardown** — called when the node is removed. Delegate to `clear()` which disposes all THREE resources.

### Data injection

Use a `setData(...)` method. It can be called before or after `build`:

```js
setData(atoms, scale, colorMap) {
  if (this.renderer) {
    this.renderer.setAtoms(atoms, scale, colorMap);
  } else {
    this._pendingData = { atoms, scale, colorMap };
  }
}
```

### Registration

```js
sceneRegistry.registerNodeClass('my-3d-type', My3DNode);
```

### Stnda for 3D nodes

The harness sets up a minimal THREE.js scene, camera, and renderer. Import THREE from the CDN import map:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>
```

The harness creates a scene shim: `{ add: obj => scene.add(obj), remove: obj => scene.remove(obj) }`, calls `build`, injects data via `setData`, and drives `update` from an animation loop or a slider.

---

## HTML Widget Node #nodehtml

**Use when:** creating a DOM-based widget that appears in the control panel, chat layout, or navigation menu.

### Base class

Extend `OmniWidget` from `omni-widget.js`:

```js
class MyWidget extends OmniWidget {
  constructor(config) { super(config); }

  mount(ctx, config, params) {
    // ctx is a WidgetContext (has .params, .panel, .render(), .setParam())
    // config is the node — has .type, .value, ._content
    // return a DOM element
    const el = document.createElement('div');
    // ... build DOM ...
    return el;
  }
}
```

### Registration

```js
sceneRegistry.registerNodeClass('my-widget', MyWidget, {
  wrapInGroup: false,   // true = wrapped in a .control-group with <h3>
  showInStrip: false,   // true = appears in multiscroller strip
  sticky: false,        // true = wraps in sticky-section in chat layout
});
```

The third argument to `registerNodeClass` is `defaultParams` — these are merged into `params` on every dispatch.

### Config via DSL

In the `# {Split}` / `## {Split}` markdown content, widgets are declared as:

```
## {Split}
:my-widget: {"key":"value","other":42}
```

The text after `:type:` is parsed by `parseDslValue()`, which tries JSON first, then falls back to legacy pipe format (`key=val | key2=val2`), then bare words. The result becomes `node.value`. Multi-line content after the first line becomes `node._content`.

### Stnda for widgets

The harness mounts widgets directly into a DOM container, optionally using a WidgetContext shim for parameter access. No canvas needed.

---

## Infrastructure Library Stnda #lib

**Use when:** implementing a utility library (graph, cache, shape operations, dataflow, etc.).

### Structure

The stnda is a fully interactive test harness for the library. Typical layout:

- **Left panel:** API reference (collapsible `<details>` sections listing methods and return types, using monospace font).
- **Main area:** interactive canvas, toolbar with algorithm buttons, output log.
- Alternatively: tabbed layout (e.g. set-shape-stnda has Discrete Sets tab + Geometric Shapes tab).

The library class is the nugget, delimited by `<<` / `file:` / `>>` / `endfile` markers. The interactive test UI is the harness.

### Nugget conventions

- The library class has no dependencies on scene.js, ctxMix, or any rendering code. It is pure data structure / algorithm.
- Export and import markers follow the standard spike_kit pattern.
- The class should be fully self-contained. No globals.

### Harness conventions

- Toolbar buttons exercise each major algorithm / operation and log results to the output panel.
- Canvas-based visualisation of the data structure where applicable (graph layout, shape drawing).
- "Load Sample" button to populate a useful test case.
- Mode indicator showing current interaction mode.
- ResizeObserver on the canvas for responsive sizing.

### Example: Graph Library stnda

```
//<< import { Graph } from './graph.js';
//-- file: ./graph.js --
//>> export { Graph };
// #util/graph/lib/code
class Graph {
  constructor(directed = false) { ... }
  addNode(id, data = {}) { ... }
  ...
}
//-- endfile --

// ... harness: canvas, toolbar, node drag, algorithm buttons ...
```

---

## PEG Grammar Conventions #grammar

**Use when:** writing a PEG grammar for a data format (SMILES, FEN, PGN, SQLite, SVG, Markdown+, JaTeX, Mermaid+, Asymptote).

### The parser

The project has a single PEG parser (`parser.js`) with three combinators:

- `seq(name, [A, B, C])` — match all in order, backtrack on failure.
- `or(name, [A, B, C])` — ordered choice, first match wins.
- `rep(name, [A, B])` — greedy repetition of cycle A, B, A, B…; must match at least one cycle.

Each item in the array is either a `string` (name of another rule) or a `RegExp` (terminal). A RegExp with a capture group records a value on the AST node; without a capture group it consumes silently (delimiters, whitespace).

### Conventions

- **Grammars are flat.** No deep nesting of alternatives. Use `or` at the top level to dispatch to named rules.
- **Repetition is flat, not recursive.** Use `rep` instead of right-recursive `list → item list | item`.
- **Grammars don't encode policy.** No operator precedence, no associativity in the grammar. The grammar does text-to-tree faithfully; a later pass over the AST handles semantics.
- **RegExp terminals do the local work.** Character classes, optional parts, and local greediness are handled within a single regex terminal. This gives local lookahead without complicating the grammar.
- **At most one capturing RegExp per production.** The first capture populates `ast.value`; a second would create an anonymous node (currently triggers a debugger halt — don't do it).

### Grammar definition pattern

```js
Parser
  .addRep('MyFormat', ['term'])
  .addOr('term', ['ruleA', 'ruleB', 'ruleC', 'text'])
  .addSeq('ruleA', [/^prefix/, 'inner', /^suffix/])
  .addSeq('text', [/^([^special]+)/])
```

### Grammars produce AST nodes

Each rule produces an `AstNode` with `.token` (rule name), `.value` (from capturing regex), `.subtree` (child nodes), `.jref` (start position), `.jend` (end position).

### Grammar / typedef isomorphism

A grammar gives you: SerDes (parsing and serialisation), view/edit (AST-aware rendering), and free-text conversion. This is a foundational principle — grammars are not just parsers, they define types.

### Stnda for grammars

The harness is a text input area and an AST tree viewer. Typing into the input parses live and renders the AST. Optionally includes a round-trip test (parse → serialise → reparse → compare).

---

## Spec Writing Conventions #spec

**Use when:** writing an API specification for a library, protocol, or component.

### Format

Specs live in `work-api-specs.md` as numbered sections. Each section has:

1. A BOM tag: `## N. Name #tag/api`
2. A JS pseudocode block showing the class signature — constructor, methods, getters, events.
3. Methods show `name(args) → ReturnType` with brief inline comments.
4. Data types described as type aliases below the class: `// Node: { id, data }`.
5. Notes on maturity: "has a mature/tested implementation" or "placeholder — actual spec will use MiniAstNodes".

### Principles

- Spec comes after algorithm design, before implementation.
- The spec is the contract that the stnda tests against.
- Method signatures use `→` for return type annotation (not TypeScript, not JSDoc).
- Event patterns use `.on(event, handler) → this` and `.off(event, handler) → this`.
- Specs reference the shared infrastructure they build on: "Layered on bidirectional pointers", "Uses random-replacement cache".

### Occult APIs

When a spec involves conventions that can vary between implementations (coordinate spaces, unit conventions, draw ordering), make the convention explicit in the function name. See `work-occult-api.md` for the pattern:

- `scaledCtx()` / `directCtx()` — has or hasn't had transforms applied.
- `getBigBox()` / `getAspectedBox()` / `getSmallBox()` — which sizing convention.
- `toLocal(point)` / `toScreen(point)` — coordinate direction.

The name of the function states the convention. The consumer does not need to know the implementation.

---

## Normalising a Spike #normalise

**Use when:** taking a working but messy spike and preparing it for extraction.

### Steps

1. **Identify the nugget.** What code is reusable? What is harness? The nugget is the thing you'd import into another file. The harness is everything that exists to demo or test the nugget.

2. **Reform canvas code to ctxMix.** Replace bare `ctx` access with the ctxMix signature. The method becomes `static draw2d(ctxMix, node, params)`. Canvas context comes from `ctxMix.ctx`. Dimensions from `ctxMix.W`, `ctxMix.H`. Hit test point from `ctxMix.hitPoint`.

3. **Separate data from rendering.** Domain data goes on `node.data`. Instance state (hovered index, selected set, cached layout) goes on `node.value`. Parameters that the user adjusts go in `params`.

4. **Place spike_kit markers.** Wrap the nugget in `//-- file: PATH --` / `//-- endfile --`. Add `//>> export` and `//>> import` lines. Add `//<< import` lines before the `file:` marker. Add `//>> sceneRegistry.registerNodeClass(...)` if it's a scene graph node.

5. **Build or preserve the DemoHarness.** The harness must call the nugget with the exact same signatures the real system uses. Document the mapping in comments.

6. **Generate GUI from config.** If the spike has hardcoded sliders or buttons, factor them into a config data structure. The harness reads config and generates UI. This makes the spike self-documenting.

7. **Test.** Open the stnda in a browser. It must work standalone. Then run `spike_kit.py extract` and verify the extracted files look correct.

### What NOT to do during normalisation

- Don't integrate into the real codebase. That's folding, a separate step.
- Don't add dependencies the nugget doesn't need.
- Don't optimise. The spike is for correctness and clarity.
- Don't build large assemblies. Keep nuggets small — one class, one concern.

---

## Data Binding for Nodes #databind

**Use when:** a node needs to source its data from different places depending on context.

Node data resolves in priority order:

1. `node.accessor(ctxMix, node, params)` — a function on the prototype that computes data from context.
2. `node.value` — a literal value set on the instance.
3. A default (defined by the node class or registration).

The accessor signature matches `draw2d` — same `(ctxMix, node, params)` — so no new calling convention is needed. Accessors typically live on prototypes (shared behaviour); values typically on instances (per-node data).

Container sizing follows the same pattern: `node.sizing(ctxMix, node, params) ?? node.size ?? default` determines child count, so data-driven structure works without special cases.

---

## BOM Tags and Dependency Map #ai/tags

Every piece of generated code should carry its BOM tag as a comment. Tags are hierarchical and use `/` separators: `#util/graph/lib`, `#mol/smiles/grammar`, `#block/algo`.

Suffixes indicate the artefact type:
- `/code` — implementation
- `/api` — API specification
- `/prompt` — elicited design / algorithm prompt
- `/grammar` — PEG grammar
- `/spec` — detailed specification
- `/node` — scene graph node
- `/lib` — infrastructure library
- `/example` — demonstration / example scene

The dependency map in `work-prompts.md` uses `USES` to declare dependencies: `#ribbon/metro USES #util/graph, #block/snap`. When generating code for a BOM item, check its dependencies and ensure the nugget imports them correctly via `>>` markers.