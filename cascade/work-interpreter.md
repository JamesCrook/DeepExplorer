```json
{ "role": "PROMPT"}
```
---

# Interpreter — Elicited Insights


## Interpreter Overview #interpreter #asy/editor #mol/anim2d #mol/anim3d

A general-purpose AST interpreter that walks a parsed program and executes it by dispatching `step` handlers via the scene registry. The same walker infrastructure (`walkPhase` / `runPhases`) used for `draw2d` and `mount` is reused for interpretation. Intelligence lives in the `step` handlers and in custom `SubtreeIterator` subclasses, not in a new framework.

The interpreter is grammar-agnostic. It executes any AST for which `step` handlers are registered. First clients are the Asymptote editor (`asy/editor`) and the molecular animation language (`mol/anim`). Each language registers its own step handlers for its grammar's productions.

## Architecture #interpreter

### State Machine on ctxMix

The interpreter's execution context lives on `ctxMix.state`. This is the program state — analogous to how `ctxMix.parentEl` threads DOM context through the `mount` phase.

```js
ctxMix.state = {
  stack: [],          // evaluation stack — expressions push, operators pop-and-push
  vars: {},           // variable bindings — assignment pops stack, writes here
  scene: null,        // the output scene graph (asy) or the scene being mutated (animation)
  callStack: [],      // for subroutine calls — pushed/popped frames
  timestamp: 0,       // current frame time, set before each run (for animation)
  error: null,        // set by handlers on runtime error
};
```

`step` handlers read and mutate `state`. The pattern is identical to `draw2d` handlers reading and drawing to `ctxMix.ctx` — same calling convention, different side-effect target.

### step Handlers

Registered on the scene registry as handlers for the `step` phase, keyed by grammar token name. Same registration pattern as `draw2d`:

```js
class MyLangNodes {
  static step(ctxMix, node, params) {
    // handle this node type
  }
}
sceneRegistry.registerNodeClass('my_assignment', MyLangNodes);
```

The walker dispatches: `registry.dispatch(ctxMix, 'step', node, params)`.

A handler typically does one of:
- **Push a value** onto `state.stack` (literals, variable references)
- **Pop operands, push result** (operators, function calls)
- **Pop and store** (assignment — pops value, writes to `state.vars`)
- **Mutate `state.scene`** (scene graph operations — add node, set property)
- **Install a custom iterator** (control flow — loops, conditionals)

### Yielding Walker

The yielding walker from `work-small-prompts.md` is the interpreter's execution engine:

```js
*runYieldingPhases(ctxMix, root, params, phases = ['step']) {
  ctxMix.iterators = [];
  ctxMix.flyweight = {};
  for (const phase of phases) {
    yield* this.walkYieldingPhase(ctxMix, phase, root, params);
  }
}
```

Each `yield` produces `{ ctxMix, phase, node }` — the debugger receives this and decides whether to pause (single-step) or continue (run). A full-speed run just drains the generator:

```js
const gen = registry.runYieldingPhases(ctxMix, root, params, ['step']);
while (!gen.next().done) {}
```

### One Run = One Frame

For animation, the caller sets `state.timestamp` before each run and drains the generator. The animation program reads `state.timestamp` to compute what mutations to apply. Tweening is the animation code computing interpolated values from timestamps — not an interpreter primitive. The interpreter runs to completion each frame.


## Expression Evaluation #interpreter

### The Problem

The PEG grammar produces flat expression structure: `js_expression` contains `[atom, operator, atom, operator, atom, ...]` as siblings. The walker visits left to right, but evaluation order depends on precedence and associativity. A naive left-to-right walk would push the left operand, then hit the operator before the right operand is available.

### The Solution: Expression Iterator

A custom `SubtreeIterator` for expression nodes, informed by `jsExprConfig` (precedence table, right-associativity set, prefix/postfix operators). The expression iterator reorders traversal to produce correct evaluation order — effectively converting the flat sibling list into postfix traversal.

```js
class ExpressionIterator extends SubtreeIterator {
  constructor(subtree, exprConfig) {
    super();
    // Build evaluation order from the flat atom/operator list
    // using precedence and associativity from exprConfig
    this.order = buildEvalOrder(subtree, exprConfig);
    this.index = 0;
  }

  next(subtree) {
    if (this.index >= this.order.length) return null;
    return this.order[this.index++];
  }
}
```

The `before_step` handler for `js_expression` (or the equivalent in other grammars) installs this iterator:

```js
// Registered as before_step for expression nodes
static before_step(ctxMix, node, params) {
  ctxMix.iterators.push(new ExpressionIterator(node.subtree, jsExprConfig));
}
```

The walker then visits children in evaluation order. Operands push onto `state.stack`, operators pop and push. No special case in the walker itself — it's all in the iterator.

### Debugger Granularity

The same iterator mechanism gives the debugger control over step-into vs step-over:

- **Step-into:** yield after every node (default). The debugger sees each atom evaluation and each operator application.
- **Step-over for expressions:** the expression iterator can signal that its traversal is atomic — the debugger skips yields within expression evaluation and only pauses at the expression boundary.
- **Step-over for subroutines:** a function-call handler can run the callee's body without yielding (drain an inner generator), or yield normally for step-into.

The signal mechanism: the iterator (or step handler) sets a flag on `state` — e.g. `state.stepGranularity = 'atomic'` — and the debugger checks it at each yield point.


## Control Flow via Custom Iterators #interpreter

Control flow constructs install custom iterators via `before_step`. The walker's architecture already supports this — `before_` hooks can replace the top iterator.

### Conditional (if/else)

The `before_step` handler for an `if` node evaluates the condition (steps through the condition subtree, pops the result from `state.stack`), then installs an iterator that exposes only the taken branch's children.

```js
class ConditionalIterator extends SubtreeIterator {
  constructor(conditionResult, thenChildren, elseChildren) {
    super();
    this.children = conditionResult ? thenChildren : elseChildren;
    this.index = 0;
  }
  next(subtree) {
    if (this.index >= this.children.length) return null;
    return this.children[this.index++];
  }
}
```

### Loop (for/while)

The loop iterator re-walks the body subtree until a condition on `state` says stop:

```js
class LoopIterator extends SubtreeIterator {
  constructor(conditionNode, bodyChildren, registry, ctxMix, params) {
    super();
    this.conditionNode = conditionNode;
    this.bodyChildren = bodyChildren;
    this.bodyIndex = 0;
    // ... store refs for re-evaluation
  }

  next(subtree) {
    if (this.bodyIndex < this.bodyChildren.length) {
      return this.bodyChildren[this.bodyIndex++];
    }
    // Body exhausted — re-evaluate condition
    // (step through conditionNode, check state.stack)
    if (this.evaluateCondition()) {
      this.bodyIndex = 0;
      return this.bodyChildren[this.bodyIndex++];
    }
    return null; // loop done
  }
}
```

### Function Call

A function call handler:
1. Pops arguments from `state.stack`.
2. Pushes a new frame onto `state.callStack` with local variable bindings.
3. The walker recurses into the function body's AST (which may be stored elsewhere — looked up by function name from `state.vars` or a function registry).
4. On return, pops the frame, pushes the return value onto `state.stack`.

Built-in functions (sin, cos, sqrt, etc.) skip the walker and directly push results.


## Scene Graph Access for Animation #interpreter #mol/anim2d #mol/anim3d

### Rooted Paths

A node in the scene graph is addressed by its path from root, not by a detached reference. `findByType()` and other query functions return `{ node, path }` where `path` is an array of indices or keys from root to the found node.

```js
// path: [2, 0, 3] means root.subtree[2].subtree[0].subtree[3]
state.scene.findByType('fe_atom')
  → { node: <the FeAtomNode>, path: [2, 0, 3] }

state.scene.findById('chain_a')
  → { node: <the chain node>, path: [1, 4] }

state.scene.findByPath([2, 0, 3])
  → <the node at that path>
```

Eventually multiple query styles: `findByType`, `findById`, `findByPath`, query by property. All return rooted paths.

### Binding Responsibility

Animation code is responsible for binding to scene nodes and maintaining bindings across structural mutations. A binding is a stored rooted path. If the animation code mutates scene structure (inserts or removes nodes), it must know that its bindings may be invalidated and re-resolve them.

Simple animations that only mutate values (position, colour, opacity) never invalidate bindings. Structural animations (adding particles, removing bonds) must re-bind. This is the animation author's responsibility, not the interpreter's — same as how JavaScript code must update references after DOM mutations.


## Unified Animation Language #mol/anim2d #mol/anim3d

The animation language for 2d and 3d is merged into one. The scene being mutated (`state.scene`) can contain both node2d and node3d types — it's just a scene graph. The animation code finds nodes by path and mutates their values. Whether the node is 2d or 3d is irrelevant to the mutation — setting `node.value.opacity = 0.5` works regardless.

This means the same animation program can drive a diagram that mixes 2d annotations with a 3d molecular view. The binding queries don't filter by dimensionality — they find nodes by type, id, or path.

### What Animation Code Does

Each frame, the animation program:
1. Reads `state.timestamp`.
2. Resolves bindings to scene nodes (cached paths, re-resolved on structural change).
3. Computes values — positions, colours, opacities, scales — from timestamp via whatever math the animation author writes (linear interp, easing, CORDIC trig, etc.).
4. Writes computed values to scene node properties.
5. Optionally mutates structure (add/remove nodes from `state.scene.subtree`).

The host system then renders the mutated scene graph with the normal `draw2d` / `update` phases.

### Scratch-Style Parallelism (Deferred)

Multiple animation threads (e.g. "move chain A" and "highlight residue 42" simultaneously) are implemented as round-robin scheduling in a user-space header. The interpreter runs one thread per `runYieldingPhases` call. A scheduler alternates between threads, calling each for one frame. This is not built into the interpreter — it's library code on top. To be implemented later.


## Asymptote Interpreter #asy/editor

The .asy interpreter is the first test client. The grammar (`asy-grammar.js`) already exists. Step handlers are registered for each .asy production.

The interpreter walks an .asy AST and produces a scene graph of node3d nodes on `state.scene`. This is a constructive walk — starting from an empty scene, each geometric statement (draw, fill, path) adds nodes. Variables (pair, path, pen, transform) live in `state.vars`.

The .asy interpreter doubles as a test bed for the expression evaluator, control flow iterators, and function call mechanism — .asy programs use all of these.


## Build Order #interpreter

1. **State object and basic step dispatch.** Set up `ctxMix.state` with stack, vars. Register step handlers for a minimal language — literals push, assignment pops-and-stores. Test with a trivial grammar (not .asy yet — something like `a = 5; b = a + 3`).

2. **Expression iterator.** Implement `ExpressionIterator` using `jsExprConfig` precedence rules. Test with arithmetic expressions — verify correct evaluation order and stack results.

3. **Control flow iterators.** `ConditionalIterator` and `LoopIterator`. Test with if/else and while loops in the trivial grammar.

4. **Yielding walker and debugger integration.** Wire up the yielding walker. Build a minimal debugger UI — step button, stack display, vars display, current node highlight. Test single-stepping through the trivial grammar.

5. **Scene graph access.** Implement `findByType`, `findById`, `findByPath` on scene graph nodes. Return `{ node, path }`. Test with a hand-built scene graph.

6. **Asy step handlers.** Register handlers for each .asy grammar production. Walk .asy ASTs, produce node3d scene graphs. Test with simple .asy programs (draw a path, fill a shape).

7. **Animation step handlers.** Register handlers for the animation language grammar. Walk animation ASTs, mutate an existing scene graph. Test with a molecule scene and simple property animations.

Steps 1–4 are the generic interpreter. Steps 5–7 are domain-specific clients. Each step is testable independently.


## Stnda Shape #interpreter

Split panel: source code on the left (editable textarea), execution view on the right. The execution view has:

- **Current node highlight** in the source (map AST node back to source range via `jref`/`jend`).
- **Stack display** — current contents of `state.stack`.
- **Variables display** — current contents of `state.vars`.
- **Scene preview** — if `state.scene` is populated, render it (canvas for 2d, THREE for 3d).
- **Controls** — step, step-over, run, reset.

The harness registers step handlers for whatever grammar is being tested and drives the yielding walker from the step button.

