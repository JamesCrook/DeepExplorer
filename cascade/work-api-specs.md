```json
{ "role": "SPEC"}
```
---

# Shared Infrastructure Libraries — API Specifications

The interfaces are kept as valid javascript rather than as pseudocode.
This allows us to parse the interfaces and create
* Mocks for the library
* Accessors for RPC (javascript end)
* Accessors for RPC (FastAPI end)

---


## [x] 0. AST Nodes utils #node/spec

```javascript
class MiniAstNode {
  constructor(token, subtree=[], value=null) {
    this.token = token; // a short string like 'ribbon' or 'icon'
    this.type = token;  // currently a synonym for token
    this.value = value; // A JSON serialisable value. No functions.
    //this.inst = inst; // An optional heavyweight class or struct with functions and state
    this.subtree = subtree; // An array of MiniAstNodes
  }
}

```

## [x] 1. Small Graph Library #util/graph

```javascript
// has a mature / tested implementation
// Methods will be added to serialise to/from scene graph nodes and edges
class Graph {
  constructor(directed = false) {}

  // --- Nodes ---
  addNode(id, data = {}) { return new Node(); }           // Node
  removeNode(id) { return false; }                        // boolean
  hasNode(id) { return false; }                           // boolean
  getNode(id) { return new Node(); }                      // Node | undefined
  nodes() { return new Iterator(); }                      // Iterator<Node>
  get nodeCount() { return 0; }                           // number

  // --- Edges ---
  addEdge(sourceId, targetId, weight = 1, data = {}) { return new Edge(); } // Edge
  removeEdge(sourceId, targetId) { return false; }        // boolean
  hasEdge(sourceId, targetId) { return false; }           // boolean
  getEdge(sourceId, targetId) { return new Edge(); }      // Edge | undefined
  edges() { return new Iterator(); }                      // Iterator<Edge>
  get edgeCount() { return 0; }                           // number

  // --- Queries ---
  neighbors(id) { return new Array(); }                   // Array<Node>
  degree(id) { return 0; }                                // number (in + out for directed)
  inDegree(id) { return 0; }                              // number (directed only)
  outDegree(id) { return 0; }                             // number (directed only)
  adjacencyList() { return new Map(); }                   // Map<id, Array<{target, weight}>>

  // --- Traversal ---
  bfs(startId, visitor) {}                                // visitor(node, depth, parent) -> void
  dfs(startId, visitor) {}                                // visitor(node, parent) -> void
  topologicalSort() { return new Array(); }               // Array<id> (directed acyclic only, throws on cycle)

  // --- Algorithms ---
  findCycles() { return new Array(); }                    // Array<Array<id>> (ordered ascending by ring size)
  findMolecularCycles() { return new Array(); }           // Array<Array<id>> (as above, but all rings of each size)
  minimumSpanningTree() { return new Graph(); }           // Graph (new graph containing MST edges)
  shortestPath(fromId, toId) { return new Object(); }     // { path: Array<id>, distance: number } | null
  connectedComponents() { return new Array(); }           // Array<Set<id>>

  // --- Serialisation ---
  static fromAdjacencyList(adj) { return new Graph(); }   // Graph
  static fromEdgeList(edges) { return new Graph(); }      // Graph
  toJSON() { return new Object(); }                       // object
  static fromJSON(obj) { return new Graph(); }            // Graph
}

// Node: { id, data }
// Edge: { source, target, weight, data }

```

## [ ] 2. Flow Layout Manager #util/flex

```javascript
/* 
This spec is a placeholder. 
The actual reusable spec will use MiniAstNodes, and addChild will be this.subtree.push( )
This spec completely ignores that the layout manager is itself a node, and that
it will use the scen.js mechanisms for measure and layout. 
*/
class LayoutNode {
  constructor(id, opts = {}) {}
  // opts: { width, height, minWidth, minHeight, padding, margin, flexGrow, flexShrink, alignSelf }
  get children() { return new Array(); }                  // Array<LayoutNode>
  addChild(node) { return this; }                         // this
  removeChild(id) { return false; }                       // boolean
  get computedBounds() { return new Object(); }           // { x, y, width, height } (populated after layout)
}

class FlexLayout {
  constructor(opts = {}) {}
  // opts: { direction: 'row'|'column', gap, justifyContent, alignItems, wrap }
  layout(children, bounds) { return new Array(); }        // Array<{ id, x, y, width, height }>
}

class StackLayout {
  constructor(opts = {}) {}
  // opts: { direction: 'row'|'column', gap }
  layout(children, bounds) { return new Array(); }        // Array<{ id, x, y, width, height }>
}

class LayoutManager {
  constructor(rootNode, strategy) {}                      // strategy: FlexLayout | StackLayout | custom
  compute(bounds) { return new Map(); }                   // Map<id, { x, y, width, height }>
  recompute(changedIds) { return new Map(); }             // Map<id, { x, y, width, height }> (incremental)
}

```

## [ ] 3. General SQLite Access Library #sql/access

```javascript
class SQLiteConnection {
  constructor(config = {}) {}
  // config: { path, maxRetries, retryDelayMs, onReconnect, busyTimeoutMs }

  open(path) { return new Promise(); }                       // Promise<void>
  close() { return new Promise(); }                          // Promise<void>
  get isOpen() { return false; }                             // boolean

  // --- Queries ---
  query(sql, params = []) { return new Promise(); }          // Promise<Array<Row>>
  execute(sql, params = []) { return new Promise(); }        // Promise<{ changes: number, lastInsertRowid }>
  batch(statements) { return new Promise(); }                // Promise<Array<Result>>  // [{sql, params}]

  // --- Schema introspection ---
  tables() { return new Promise(); }                         // Promise<Array<TableInfo>>
  columns(tableName) { return new Promise(); }               // Promise<Array<ColumnInfo>>
  indexes(tableName) { return new Promise(); }               // Promise<Array<IndexInfo>>
  foreignKeys(tableName) { return new Promise(); }           // Promise<Array<FKInfo>>

  // --- Transaction ---
  transaction(fn) { return new Promise(); }                  // Promise<T>     // fn(tx) => T; auto commit/rollback

  // --- Lifecycle events ---
  on(event, handler) { return this; }                        // this           // 'open', 'close', 'reconnect', 'error'
  off(event, handler) { return this; }                       // this
}

// TableInfo:  { name, sql }
// ColumnInfo: { name, type, notNull, defaultValue, primaryKey }
// IndexInfo:  { name, columns, unique }
// FKInfo:     { from, table, to, onDelete, onUpdate }

```

## [ ] 4. Random-Replacement Cache #util/rr

```javascript
/*
As currently specced all is in terms of number of items, and there is
no tracking of how much space in bytes is being consumed.
In some cases we'd like to set a ceiling, such as '1GB' for the data held 
in an RRCache, so we can automatically bump when memory is tight.
Also some way to coordinate the caches. E.g. dump from an esasily refilled
RRCache in preference to a more expensive one. 
*/
class RRCache {
  constructor(capacity, opts = {}) {}
  // opts: { onEvict: (key, value) => void }

  get(key) { return null; }                        // value | undefined
  set(key, value) { return this; }                 // this (evicts random entry if at capacity)
  has(key) { return false; }                       // boolean
  delete(key) { return false; }                    // boolean
  clear() {}                                       // void

  get size() { return 0; }                         // number
  get capacity() { return 0; }                     // number

  keys() { return new Iterator(); }                // Iterator<key>
  values() { return new Iterator(); }              // Iterator<value>
  entries() { return new Iterator(); }             // Iterator<[key, value]>

  stats() { return new Object(); }                 // { hits, misses, evictions, size, capacity }
  resetStats() {}                                  // void
}

```

## [ ] 5. Snapping-Hint Object #block/snap

```javascript
class SnapHint {
  constructor(opts = {}) {}
  // opts: { enabled, threshold, zoomSensitive }
  snap(value, context = {}) { return new Object(); } // { snapped: value, didSnap: boolean, delta }
  enable() { return this; }                          // this
  disable() { return this; }                         // this
}

class GridSnap extends SnapHint {
  constructor(gridSize, opts = {}) { super(opts); }
  // opts: { ...SnapHint opts, offset: {x,y} }
  snap({x, y}, context) { return new Object(); }     // { snapped: {x,y}, didSnap, delta }
}

// #ribbon/metro
class AngleSnap extends SnapHint {
  constructor(snapDegrees = 45, opts = {}) { super(opts); }
  snap(angleDeg, context) { return new Object(); }   // { snapped: angleDeg, didSnap, delta }
}

class PointSnap extends SnapHint {
  constructor(anchorPoints, opts = {}) { super(opts); }
  // opts: { ...SnapHint opts }
  snap({x, y}, context) { return new Object(); }     // { snapped: {x,y}, anchor, didSnap, delta }
  setAnchors(points) { return this; }                // this
}

class CompositeSnap {
  constructor(hints = []) {}                         // ordered by priority
  add(hint, priority = 0) { return this; }           // this
  snap(value, context) { return new Object(); }      // { snapped, source: SnapHint, didSnap, delta }
}

```

## [x] 6. Count-Down Mode Shifts #util/countdown

```javascript
class ModeManager {
  constructor() {}

  enter(name, exitCondition) { return new Object(); } // ModeHandle
  // exitCondition: { maxActions, maxDuration, predicate, onExit }
  get current() { return null; }                      // string | null
  isActive(name) { return false; }                    // boolean

  // called by consuming code on each action
  tick(action = {}) { return new Object(); }          // { exited: boolean, reason?: string }

  forceExit(reason) {}                                // void
  on(event, handler) { return this; }                 // this           // 'enter', 'exit', 'tick'
  off(event, handler) { return this; }                // this
}

// ModeHandle: { name, remaining, elapsed, exit() }

```

## [ ] 7. Dataflow Infrastructure #util/dataflow

```javascript
class DataflowGraph {
  constructor() {}

  // --- Nodes ---
  addSource(id, initialValue) { return new SourceNode(); }      // SourceNode
  addComputed(id, deps, computeFn) { return new ComputedNode(); } // ComputedNode
  // computeFn receives { [depId]: value } -> derivedValue
  remove(id) { return false; }                                  // boolean

  // --- Wiring ---
  connect(sourceId, targetId) {}                                // void
  disconnect(sourceId, targetId) {}                             // void
  dependentsOf(id) { return new Array(); }                      // Array<id>
  dependenciesOf(id) { return new Array(); }                    // Array<id>

  // --- Values ---
  setValue(id, value) {}                                        // void (marks downstream dirty, triggers recompute)
  getValue(id) { return null; }                                 // value
  isDirty(id) { return false; }                                 // boolean

  // --- Evaluation ---
  evaluate() { return new Map(); }                              // Map<id, value> (recomputes all dirty nodes)
  evaluateNode(id) { return null; }                             // value (recomputes one node + ancestors if dirty)

  // --- Events ---
  on(event, handler) { return this; }                           // this // 'change', 'error'
  off(event, handler) { return this; }                          // this
}

```

## [ ] 8. Bidirectional Pointer Infrastructure #util/pointer

```javascript
class PointerRegistry {
  constructor() {}

  // --- Registration ---
  pointTo(sourceId, targetId) {}                   // void
  unpoint(sourceId, targetId) {}                   // void

  // --- Queries ---
  getTarget(sourceId) { return null; }             // targetId | null
  getPointersTo(targetId) { return new Set(); }    // Set<sourceId>
  allPointers() { return new Iterator(); }         // Iterator<{ source, target }>

  // --- Invalidation ---
  markDirty(targetId) { return new Set(); }        // Set<sourceId> (returns affected sources)
  isDirty(sourceId) { return false; }              // boolean
  clean(sourceId) {}                               // void (marks re-hydrated)

  // --- Lifecycle ---
  removeSource(sourceId) {}                        // void
  removeTarget(targetId) { return new Set(); }     // Set<sourceId> (returns orphaned sources)

  on(event, handler) { return this; }              // this // 'dirty', 'orphaned'
  off(event, handler) { return this; }             // this
}

```

## [ ] 9. Selection Infrastructure #util/select

```javascript
class Selection {
  constructor(registry) {}                         // PointerRegistry instance

  // --- Membership ---
  add(elementId, weight = 1.0) { return this; }    // this (weight 0-1 for fuzzy membership)
  remove(elementId) { return this; }               // this
  has(elementId) { return false; }                 // boolean
  weight(elementId) { return 0; }                  // number (0 if absent)
  toggle(elementId) { return this; }               // this

  // --- Bulk ---
  set(elementIds) { return this; }                 // this (replace entire selection)
  clear() {}                                       // void
  toArray() { return new Array(); }                // Array<{ id, weight }>
  ids() { return new Set(); }                      // Set<id>
  get size() { return 0; }                         // number

  // --- Set operations (return new Selection) ---
  union(other) { return new Selection(); }         // Selection
  intersect(other) { return new Selection(); }     // Selection
  difference(other) { return new Selection(); }    // Selection

  // --- Integrity ---
  validate() { return this; }                      // this (re-checks all members against model)
  onModelEdit(editedIds) { return this; }          // this (updates or drops invalidated members)

  on(event, handler) { return this; }              // this // 'add', 'remove', 'invalidate', 'change'
  off(event, handler) { return this; }             // this
}

```

## [x] 10. Set and Shape Operations #util/shape

```javascript
// has a mature / tested implementation
// There is UI for creating the simple shapes too.

// --- Discrete Sets ---
class DiscreteSet {
  constructor(iterable = []) {}

  add(element) { return this; }                    // this
  delete(element) { return false; }                // boolean
  has(element) { return false; }                   // boolean
  get size() { return 0; }                         // number
  [Symbol.iterator]() { return new Iterator(); }   // Iterator

  // Returns new DiscreteSet
  union(other) { return new DiscreteSet(); }       // DiscreteSet
  intersect(other) { return new DiscreteSet(); }   // DiscreteSet
  difference(other) { return new DiscreteSet(); }  // DiscreteSet
  symmetricDifference(other) { return new DiscreteSet(); } // DiscreteSet
  isSubsetOf(other) { return false; }              // boolean
  isSupersetOf(other) { return false; }            // boolean
  equals(other) { return false; }                  // boolean
}

// --- Geometric Shapes ---
// D+ has a much more sophisticated Shape primitive which
// is about SVG shapes.
class Shape {
  // abstract
  containsPoint(x, y) { return false; }           // boolean
  boundingBox() { return new Object(); }          // { x, y, width, height }
  area() { return 0; }                            // number
  perimeter() { return 0; }                       // number
  translate(dx, dy) { return new Shape(); }       // Shape (new shape)
  scale(factor, origin) { return new Shape(); }   // Shape
  vertices() { return new Array(); }              // Array<{x,y}> (polygon approximation)
}

class Circle extends Shape {
  constructor(cx, cy, radius) { super(); }
}

class Rect extends Shape {
  constructor(x, y, width, height) { super(); }
}

class Polygon extends Shape {
  constructor(points) { super(); }                 // [{x,y}, ...]
  isConvex() { return false; }                     // boolean
}

// --- Shape operations (return Polygon or MultiPolygon) ---
function shapeUnion(a, b) { return new Polygon(); }       // Polygon | Array<Polygon>
function shapeIntersect(a, b) { return new Polygon(); }   // Polygon | null
function shapeDifference(a, b) { return new Array(); }    // Polygon | Array<Polygon>

// --- Utilities ---
function boundingBoxOverlap(a, b) { return false; }       // boolean
function boundingBoxUnion(a, b) { return new Object(); }  // { x, y, width, height }
function convexHull(points) { return new Polygon(); }     // Polygon
function pointInPolygon(pt, poly) { return false; }       // boolean

```

## [ ] 11. Thaw/Freeze Infrastructure #block/thaw

```javascript
class FreezeManager {
  constructor(opts = {}) {}
  // opts: { snapHints: CompositeSnap }

  freeze(element, opts = {}) { return new FrozenSnapshot(); } // FrozenSnapshot
  // opts: { applySnapping, roundingFn, metadata }
  // returns snapshot with provenance for thaw

  thaw(snapshot) { return new Element(); }                    // Element (restores flexible element)

  isFrozen(elementId) { return false; }                       // boolean
  getSnapshot(elementId) { return new FrozenSnapshot(); }     // FrozenSnapshot | undefined
  allFrozen() { return new Iterator(); }                      // Iterator<FrozenSnapshot>
}

// FrozenSnapshot: { elementId, frozenState, provenance, timestamp, snappingApplied }
// provenance: { originalState, snapDeltas, roundings, metadata }

```

## [ ] 12. Delayed Availability Information #util/delay

```javascript
// Delayed availability information actually has three distinct aspects
// each with different uncertainty
// * Liveness (is the connection/heartbeat still beating)
// * Worklist (what actions have been done and are to do)
// * Time estimate (unreliable estimate of time to completion)
//
// A crucial aspect of Delayed Availability Information is what do you show
// in its place, before it is ready? This can depend on the size of the area 
// available and on whether work in progress is meaningful as a partial result.

class Deferred {
  constructor(loader, opts = {}) {}
  // loader: () => Promise<value>
  // opts: { placeholder, retryCount, retryDelay, ttl }

  get value() { return null; }                      // value | placeholder
  get isAvailable() { return false; }               // boolean
  get isLoading() { return false; }                 // boolean
  get error() { return null; }                      // Error | null

  load() { return new Promise(); }                  // Promise<value>
  reload() { return new Promise(); }                // Promise<value>
  cancel() {}                                       // void

  onAvailable(callback) { return null; }            // unsubscribe
  onError(callback) { return null; }                // unsubscribe

  // --- Static helpers ---
  static all(deferreds) { return new Deferred(); }  // Deferred<Array>
  static race(deferreds) { return new Deferred(); } // Deferred
}

class DeferredMap {
  constructor(loaderFn, opts = {}) {}
  // loaderFn: (key) => Promise<value>

  get(key) { return new Deferred(); }               // Deferred
  preload(keys) {}                                  // void
  available() { return new Map(); }                 // Map<key, value>   // only resolved entries
  pending() { return new Set(); }                   // Set<key>
}

```