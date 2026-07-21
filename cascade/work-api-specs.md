```json
{ "role": "SPEC"}
```
---

# Shared Infrastructure Libraries — API Specifications

---

## 0. AST Nodes #util/node/lib/api

```js
class MiniAstNode {
  constructor(token, subtree=[], value=null) {
    this.token = token; // a short string like 'ribbon' or 'icon'
    this.type = token;  // currently a synonym for token
    this.value = value; // A JSON serialisable value. No functions.
    //this.inst = inst; // An optional heavyweight class or struct with functions and state
    this.subtree = subtree; // An array of MiniAstNodes
  }
}
````

## 1. Small Graph Library #util/graph/lib/api

```js
// has a mature / tested implementation
// Methods will be added to serialise to/from scene graph nodes and edges
class Graph {
  constructor(directed = false)

  // --- Nodes ---
  addNode(id, data = {})           → Node
  removeNode(id)                   → boolean
  hasNode(id)                      → boolean
  getNode(id)                      → Node | undefined
  nodes()                          → Iterator<Node>
  nodeCount                        → number

  // --- Edges ---
  addEdge(sourceId, targetId, weight = 1, data = {}) → Edge
  removeEdge(sourceId, targetId)   → boolean
  hasEdge(sourceId, targetId)      → boolean
  getEdge(sourceId, targetId)      → Edge | undefined
  edges()                          → Iterator<Edge>
  edgeCount                        → number

  // --- Queries ---
  neighbors(id)                    → Array<Node>
  degree(id)                       → number        // in + out for directed
  inDegree(id)                     → number         // directed only
  outDegree(id)                    → number         // directed only
  adjacencyList()                  → Map<id, Array<{target, weight}>>

  // --- Traversal ---
  bfs(startId, visitor)            → void           // visitor(node, depth, parent)
  dfs(startId, visitor)            → void           // visitor(node, parent)
  topologicalSort()                → Array<id>      // directed acyclic only, throws on cycle

  // --- Algorithms ---
  findCycles()                     → Array<Array<id>>  // ordered ascending by ring size
  findMolecularCycles()            → Array<Array<id>>  // as above, but all rings of each size
  minimumSpanningTree()            → Graph             // new graph containing MST edges
  shortestPath(fromId, toId)       → { path: Array<id>, distance: number } | null
  connectedComponents()            → Array<Set<id>>

  // --- Serialisation ---
  static fromAdjacencyList(adj)    → Graph
  static fromEdgeList(edges)       → Graph
  toJSON()                         → object
  static fromJSON(obj)             → Graph
}

// Node: { id, data }
// Edge: { source, target, weight, data }
```

---

## 2. Flow Layout Manager #util/flex/lib/api

```js
/* 

This spec is a placeholder. 

The actual reusable spec will use MiniAstNodes, and addChild will be this.subtree.push( )

*/
class LayoutNode {
  constructor(id, opts = {})
  // opts: { width, height, minWidth, minHeight, padding, margin, flexGrow, flexShrink, alignSelf }
  children                         → Array<LayoutNode>
  addChild(node)                   → this
  removeChild(id)                  → boolean
  computedBounds                   → { x, y, width, height }   // populated after layout
}

class FlexLayout {
  constructor(opts = {})
  // opts: { direction: 'row'|'column', gap, justifyContent, alignItems, wrap }
  layout(children, bounds)         → Array<{ id, x, y, width, height }>
}

class StackLayout {
  constructor(opts = {})
  // opts: { direction: 'row'|'column', gap }
  layout(children, bounds)         → Array<{ id, x, y, width, height }>
}

class LayoutManager {
  constructor(rootNode, strategy)  // strategy: FlexLayout | StackLayout | custom
  compute(bounds)                  → Map<id, { x, y, width, height }>
  recompute(changedIds)            → Map<id, { x, y, width, height }>  // incremental
}
```

---

## 3. General SQLite Access Library (JavaScript) #util/sql/access/lib/api

```js
class SQLiteConnection {
  constructor(config = {})
  // config: { path, maxRetries, retryDelayMs, onReconnect, busyTimeoutMs }

  open(path)                       → Promise<void>
  close()                          → Promise<void>
  isOpen                           → boolean

  // --- Queries ---
  query(sql, params = [])          → Promise<Array<Row>>
  execute(sql, params = [])        → Promise<{ changes: number, lastInsertRowid }>
  batch(statements)                → Promise<Array<Result>>  // [{sql, params}]

  // --- Schema introspection ---
  tables()                         → Promise<Array<TableInfo>>
  columns(tableName)               → Promise<Array<ColumnInfo>>
  indexes(tableName)               → Promise<Array<IndexInfo>>
  foreignKeys(tableName)           → Promise<Array<FKInfo>>

  // --- Transaction ---
  transaction(fn)                  → Promise<T>     // fn(tx) => T; auto commit/rollback

  // --- Lifecycle events ---
  on(event, handler)               → this           // 'open', 'close', 'reconnect', 'error'
  off(event, handler)              → this
}

// TableInfo:  { name, sql }
// ColumnInfo: { name, type, notNull, defaultValue, primaryKey }
// IndexInfo:  { name, columns, unique }
// FKInfo:     { from, table, to, onDelete, onUpdate }
```

---

## 4. Random-Replacement Cache #util/rr/lib/api

```js
class RRCache {
  constructor(capacity, opts = {})
  // opts: { onEvict: (key, value) => void }

  get(key)                         → value | undefined
  set(key, value)                  → this           // evicts random entry if at capacity
  has(key)                         → boolean
  delete(key)                      → boolean
  clear()                          → void

  size                             → number
  capacity                         → number

  keys()                           → Iterator<key>
  values()                         → Iterator<value>
  entries()                        → Iterator<[key, value]>

  stats()                          → { hits, misses, evictions, size, capacity }
  resetStats()                     → void
}
```

---

## 5. Snapping-Hint Object #block/snap/lib/api

```js
class SnapHint {
  constructor(opts = {})
  // opts: { enabled, threshold, zoomSensitive }
  snap(value, context = {})        → { snapped: value, didSnap: boolean, delta }
  enable()                         → this
  disable()                        → this
}

class GridSnap extends SnapHint {
  constructor(gridSize, opts = {})
  // opts: { ...SnapHint opts, offset: {x,y} }
  snap({x, y}, context)            → { snapped: {x,y}, didSnap, delta }
}

// #ribbon/metro
class AngleSnap extends SnapHint {
  constructor(snapDegrees = 45, opts = {})
  snap(angleDeg, context)          → { snapped: angleDeg, didSnap, delta }
}

class PointSnap extends SnapHint {
  constructor(anchorPoints, opts = {})
  // opts: { ...SnapHint opts }
  snap({x, y}, context)            → { snapped: {x,y}, anchor, didSnap, delta }
  setAnchors(points)               → this
}

class CompositeSnap {
  constructor(hints = [])          // ordered by priority
  add(hint, priority = 0)         → this
  snap(value, context)             → { snapped, source: SnapHint, didSnap, delta }
}
```

---

## 6. Count-Down Mode Shifts #util/countdown/lib/api

```js
class ModeManager {
  constructor()

  enter(name, exitCondition)       → ModeHandle
  // exitCondition: { maxActions, maxDuration, predicate, onExit }
  current                          → string | null
  isActive(name)                   → boolean

  // called by consuming code on each action
  tick(action = {})                → { exited: boolean, reason?: string }

  forceExit(reason)                → void
  on(event, handler)               → this           // 'enter', 'exit', 'tick'
  off(event, handler)              → this
}

// ModeHandle: { name, remaining, elapsed, exit() }
```

---

## 7. Dataflow Infrastructure #util/dflow/lib/api

```js
class DataflowGraph {
  constructor()

  // --- Nodes ---
  addSource(id, initialValue)      → SourceNode
  addComputed(id, deps, computeFn) → ComputedNode
  // computeFn receives { [depId]: value } → derivedValue
  remove(id)                       → boolean

  // --- Wiring ---
  connect(sourceId, targetId)      → void
  disconnect(sourceId, targetId)   → void
  dependentsOf(id)                 → Array<id>
  dependenciesOf(id)               → Array<id>

  // --- Values ---
  setValue(id, value)               → void           // marks downstream dirty, triggers recompute
  getValue(id)                     → value
  isDirty(id)                      → boolean

  // --- Evaluation ---
  evaluate()                       → Map<id, value>  // recomputes all dirty nodes
  evaluateNode(id)                 → value            // recomputes one node + ancestors if dirty

  // --- Events ---
  on(event, handler)               → this            // 'change', 'error'
  off(event, handler)              → this
}
```

---

## 8. Bidirectional Pointer Infrastructure #util/pointer/lib/api

```js
class PointerRegistry {
  constructor()

  // --- Registration ---
  pointTo(sourceId, targetId)      → void
  unpoint(sourceId, targetId)      → void

  // --- Queries ---
  getTarget(sourceId)              → targetId | null
  getPointersTo(targetId)          → Set<sourceId>
  allPointers()                    → Iterator<{ source, target }>

  // --- Invalidation ---
  markDirty(targetId)              → Set<sourceId>   // returns affected sources
  isDirty(sourceId)                → boolean
  clean(sourceId)                  → void             // marks re-hydrated

  // --- Lifecycle ---
  removeSource(sourceId)           → void
  removeTarget(targetId)           → Set<sourceId>    // returns orphaned sources

  on(event, handler)               → this             // 'dirty', 'orphaned'
  off(event, handler)              → this
}
```

---

## 9. Selection Infrastructure #util/select/lib/api

```js
class Selection {
  constructor(registry)            // PointerRegistry instance

  // --- Membership ---
  add(elementId, weight = 1.0)     → this             // weight 0–1 for fuzzy membership
  remove(elementId)                → this
  has(elementId)                   → boolean
  weight(elementId)                → number            // 0 if absent
  toggle(elementId)                → this

  // --- Bulk ---
  set(elementIds)                  → this              // replace entire selection
  clear()                          → void
  toArray()                        → Array<{ id, weight }>
  ids()                            → Set<id>
  size                             → number

  // --- Set operations (return new Selection) ---
  union(other)                     → Selection
  intersect(other)                 → Selection
  difference(other)                → Selection

  // --- Integrity ---
  validate()                       → this              // re-checks all members against model
  onModelEdit(editedIds)           → this              // updates or drops invalidated members

  on(event, handler)               → this              // 'add', 'remove', 'invalidate', 'change'
  off(event, handler)              → this
}
```

---

## 10. Set and Shape Operations  #util/shape/lib/api

```js
// has a mature / tested implementation
// There is UI for creating the simple shapes too.

// --- Discrete Sets ---
class DiscreteSet {
  constructor(iterable = [])

  add(element)                     → this
  delete(element)                  → boolean
  has(element)                     → boolean
  size                             → number
  [Symbol.iterator]()              → Iterator

  // Returns new DiscreteSet
  union(other)                     → DiscreteSet
  intersect(other)                 → DiscreteSet
  difference(other)                → DiscreteSet
  symmetricDifference(other)       → DiscreteSet
  isSubsetOf(other)                → boolean
  isSupersetOf(other)              → boolean
  equals(other)                    → boolean
}

// --- Geometric Shapes ---
// D+ has a much more sophisticated Shape primitive which
// is about SVG shapes.
class Shape {
  // abstract
  containsPoint(x, y)             → boolean
  boundingBox()                    → { x, y, width, height }
  area()                           → number
  perimeter()                      → number
  translate(dx, dy)                → Shape           // new shape
  scale(factor, origin)            → Shape
  vertices()                       → Array<{x,y}>    // polygon approximation
}

class Circle extends Shape {
  constructor(cx, cy, radius)
}

class Rect extends Shape {
  constructor(x, y, width, height)
}

class Polygon extends Shape {
  constructor(points)              // [{x,y}, ...]
  isConvex()                       → boolean
}

// --- Shape operations (return Polygon or MultiPolygon) ---
function shapeUnion(a, b)          → Polygon | Array<Polygon>
function shapeIntersect(a, b)      → Polygon | null
function shapeDifference(a, b)     → Polygon | Array<Polygon>

// --- Utilities ---
function boundingBoxOverlap(a, b)  → boolean
function boundingBoxUnion(a, b)    → { x, y, width, height }
function convexHull(points)        → Polygon
function pointInPolygon(pt, poly)  → boolean
```

---

## 11. Thaw/Freeze Infrastructure #block/thaw/lib/api

```js
class FreezeManager {
  constructor(opts = {})
  // opts: { snapHints: CompositeSnap }

  freeze(element, opts = {})       → FrozenSnapshot
  // opts: { applySnapping, roundingFn, metadata }
  // returns snapshot with provenance for thaw

  thaw(snapshot)                   → Element          // restores flexible element

  isFrozen(elementId)              → boolean
  getSnapshot(elementId)           → FrozenSnapshot | undefined
  allFrozen()                      → Iterator<FrozenSnapshot>
}

// FrozenSnapshot: { elementId, frozenState, provenance, timestamp, snappingApplied }
// provenance: { originalState, snapDeltas, roundings, metadata }
```

---

## 12. Delayed Availability Information #util/delay/lib/api

```js
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
  constructor(loader, opts = {})
  // loader: () => Promise<value>
  // opts: { placeholder, retryCount, retryDelay, ttl }

  get value()                      → value | placeholder
  isAvailable                      → boolean
  isLoading                        → boolean
  error                            → Error | null

  load()                           → Promise<value>
  reload()                         → Promise<value>
  cancel()                         → void

  onAvailable(callback)            → unsubscribe
  onError(callback)                → unsubscribe

  // --- Static helpers ---
  static all(deferreds)            → Deferred<Array>
  static race(deferreds)           → Deferred
}

class DeferredMap {
  constructor(loaderFn, opts = {})
  // loaderFn: (key) => Promise<value>

  get(key)                         → Deferred
  preload(keys)                    → void
  available()                      → Map<key, value>   // only resolved entries
  pending()                        → Set<key>
}
```
