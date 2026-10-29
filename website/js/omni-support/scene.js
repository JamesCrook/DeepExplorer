// The scene registry and walker: node types, phase dispatch, walkPhase over subtrees
/*
# ESSENTIALS

SceneRegistry is a double-dispatch table with a recursive tree walker.

It maps (phase, nodeType) pairs to handler functions. You register a class, normally by pushing { name, cls } onto SYS.NODE_CLASSES (sys.js); it scans the class for methods whose first parameter is named ctxMix and files each one under (methodName, nodeType). When you call dispatch(ctxMix, 'draw2d', node, params), it looks up handlers['draw2d'][node.type], falls back to handlers['draw2d']['default'], and calls whatever it finds.

walkPhase adds recursion, typically recursing into node.subtree, an array of nodes.
runPhases calls walkPhase for each of a sequence of passes.

Common patterns are:
* For canvas (2d) run phases of [ 'measure', 'layout', 'draw2d'] or ['hit_test']
* For canvas (3d) mediated by THREE.js, phases of ['build','update','teardown']
* For html dom phases of ['mount', 'update', 'resize', 'teardown'] (omni-html.js and DemoHarnessHtml)

You will often see the signature of a node function, such as draw2d(ctxMix, node, params)

- ctxMix has the ctx, and data that is built up during walking the scene
- node holds the node itself. it may have a .value, serialisable as JSON, and a .inst instantiated during scene building for state and functions, but not persisted to storage. 
- params is a a dictionary of values that are usually global for the model, so for example params.cornerRadius to change the rounding of all nodes that can round their corners.

Because the conventions different parents of a node use are so flexible, we often access information through mediators, e.g. ctxMix.getXY() to get the x and y of an element. This is specially helpful when using 
flyweights, as where getXY() gets x and y from the node, the node can be fully instantiated, and where getXY()
is fetching computed values, the protoype node can be reused multiple times for that same parent. The code
for the node does not have to know whether it is being used for all its parameters.

*/
// #node/spec/code

import { SubtreeIterator } from './subtree-iterator.js';

class MiniAstNode {
  constructor(token, subtree=[], value=null) {
    this.token = token;
    this.type = token;
    this.value = value;
    //this.inst = inst;
    this.subtree = subtree;
  }
}

// Scene Node is used by the 3D system as a base class for many nodes.
class SceneNode {
  static rebuildParams = [];
  static updateParams = [];

  measure(ctxMix, node, params) { }
  layout(ctxMix, node, params)  { }
  build(ctxMix, node, params)   { }
  update(ctxMix, node, params)  { }
  draw2d(ctxMix, node, params)  { }
  resize(ctxMix, node, params)  { }
  teardown(ctxMix, node, params){ }
  clear() {}
}


/*
Node types reach the registry two ways.  registerNodeClass(name, cls) files a
class at once.  addSource(list, adapt) names a list that other modules push
records into, { name, cls, defaults? }; records not seen before are absorbed
before the next dispatch and whenever meta is read, so a push takes effect at
the next walk, from any module, at load or later.  SYS.NODE_CLASSES is such
a list (sys.js), and so is SYS.TEMPLATES through an adapter that makes each
template a node type of its own name (nodes-html/html-template-node.js).

A name registered twice: the later class wins, with a console warning, and
the earlier class's handlers are removed rather than left to mix with the
new one's.  Names are one namespace for every backend, so a warning here is
usually two modules meaning different things by one word.
*/
const EMPTY_SUBTREE = Object.freeze([]);

class SceneRegistry {
  constructor(source = null) {
    this.handlers = {};   // { phase: { nodeType: handler } }
    this._meta = {};      // { nodeType: { nodeClass, defaultParams, rebuildParams, updateParams, ...cls.meta } }
    this.sources = [];    // { list, adapt, seen }
    if (source) this.addSource(source);
  }

  addSource(list, adapt = (r) => r) {
    this.sources.push({ list, adapt, seen: 0 });
  }

  get meta() { this.absorb(); return this._meta; }

  absorb() {
    for (const src of this.sources) {
      while (src.seen < src.list.length) {
        const r = src.adapt(src.list[src.seen++]);
        if (r) this.registerNodeClass(r.name, r.cls, r.defaults ?? null);
      }
    }
  }

  hasCtxMix(fn,name){
    const fnStr = fn.toString().trim();
    
    // 1. Remove comments to avoid false positives/negatives
    const codeOnly = fnStr.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    
    // 2. Capture the content inside the first set of parentheses
    // This matches: methodName(param1, ...) or (param1) => ...
    const match = codeOnly.match(/^[^(]*\(\s*([^,)\s]+)/);

    let firstParam = ''
    // 3. Handle single-param arrow functions: mixCtx => ...
    if (match) {
      firstParam = match[1];
    } else {
      const arrowMatch = codeOnly.match(/^([^=()\s]+)\s*=>/);
      if( arrowMatch )
        firstParam = arrowMatch[1];
    }

    const bOk = firstParam === 'ctxMix';
//    if( !bOk )
//      console.log( `rejected ${name} "${firstParam}"`)
    return bOk;
  };
  
  /* Indexed phase first, as handlers is.  (It was indexed the other way round,
     so it never found anything; harmless only because every handler calls
     nodeClass[name], which resolves to the most-derived method anyway.) */
  _hasHandler(nodeType, name) {
    return !!this.handlers[name]?.[nodeType];
  }

// ── Register a node class by scanning its methods ─────
  //
  // Scans both the class chain (static methods called directly)
  // and the prototype chain (instance methods dispatched via node.inst).
  // Any function with a ctxMix first parameter becomes a handler
  // for that phase+nodeType.
  // walkPhase constructs before_/after_/before_child_/after_child_
  // variants dynamically, so all naming conventions just work.
  registerNodeClass(nodeType, nodeClass, defaultParams=null) {
    const prev = this._meta[nodeType];
    if (prev) {
      if (prev.nodeClass !== nodeClass) {
        console.warn(`node type '${nodeType}': ${prev.nodeClass.name} replaced by ${nodeClass.name}; the later registration wins`);
      }
      for (const phase in this.handlers) delete this.handlers[phase][nodeType];
    }
    const proto = nodeClass.prototype;

    // Scan class chain for static methods (own + inherited).
    // Walks from the concrete class up through parents, stopping
    // before Function.prototype, so inherited statics like draw2d
    // on a base class are registered. The handler closes over
    // nodeClass so `this` in the static method is always the
    // registered (most-derived) class — preserving access to
    // overridden static properties like `config`.
    for (let cls = nodeClass; cls && cls !== Function.prototype; cls = Object.getPrototypeOf(cls)) {
      for (const name of Object.getOwnPropertyNames(cls)) {
        if (['length', 'name', 'prototype'].includes(name)) continue;
        const method = cls[name];
        if (typeof method !== 'function') continue;
        if (this.hasCtxMix(method, name)) {
          // Only register the first (most-derived) definition of each name.
          if (!this._hasHandler?.(nodeType, name)) {
            this._registerHandler(nodeType, name, (ctxMix, node, params, child) => {
              return nodeClass[name](ctxMix, node, params, child);
            });
          }
        }
      }
    }

    // Scan prototype chain for instance methods (override static if both exist).
    // Walks from the concrete class up through parents (stopping before Object),
    // so that inherited methods like update/teardown are registered.
    // The handler calls node.inst[name] which resolves through normal prototype
    // lookup, always dispatching to the most-derived override.
    if (proto) {
      for (let p = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
        for (const name of Object.getOwnPropertyNames(p)) {
          if (name === 'constructor') continue;
          const method = p[name];
          if (typeof method !== 'function') continue;
          if (this.hasCtxMix(method, name)) {
            // node.inst is created on first use, so a node made by SYS.makeNode
            // (no instance) works the same as one an app instantiated by hand.
            // Every class with instance handlers has a no-argument constructor.
            this._registerHandler(nodeType, name, (ctxMix, node, params, child) => {
              const inst = node.inst ??= new nodeClass();
              return inst[name].call(inst, ctxMix, node, params, child);
            });
          }
        }
      }
    }

    // A class may declare static meta (sticky, editableFields, …); it is read
    // from here, so callers ask the registry rather than the class.
    this._meta[nodeType] = {
      nodeClass,
      defaultParams,
      rebuildParams: nodeClass.rebuildParams || [],
      updateParams:  nodeClass.updateParams  || [],
      ...(nodeClass.meta && typeof nodeClass.meta === 'object' ? nodeClass.meta : {}),
    };

  }

  _registerHandler(nodeType, phase, handler) {
    if (!this.handlers[phase]) this.handlers[phase] = {};
    this.handlers[phase][nodeType] = handler;
  }

  // ── Double dispatch: (phase, nodeType) → handler ──
  dispatch(ctxMix, phase, node, params, child) {
    this.absorb();
    const phaseHandlers = this.handlers[phase];
    if (!phaseHandlers) return;

    const meta = this._meta[node.type];
    const mergedParams = meta?.defaultParams
      ? { ...meta.defaultParams, ...params }
      : params;

    const handler = phaseHandlers[node.type] || phaseHandlers['default'];
    if (handler) return handler(ctxMix, node, mergedParams, child);
  }

  // ── Convenience: dispatch by phase name ──

  measure(ctxMix, node, params)   { this.dispatch(ctxMix, 'measure', node, params); }
  layout(ctxMix, node, params)    { this.dispatch(ctxMix, 'layout', node, params); }
  build(ctxMix, node, params)     { this.dispatch(ctxMix, 'build', node, params); }
  update(ctxMix, node, params)    { this.dispatch(ctxMix, 'update', node, params); }
  draw2d(ctxMix, node, params)    { this.dispatch(ctxMix, 'draw2d', node, params); }
  resize(ctxMix, node, params)    { this.dispatch(ctxMix, 'resize', node, params); }
  teardown(ctxMix, node, params)  { this.dispatch(ctxMix, 'teardown', node, params); }

  // ── Rebuild-vs-update decision ──

  needsRebuild(nodeType, changedParams) {
    const m = this.meta[nodeType];
    if (!m) return true;
    return m.rebuildParams.some(p => changedParams.includes(p));
  }

  // ── Query ──

  getHandler(nodeType, phase) {
    this.absorb();
    return this.handlers[phase]?.[nodeType] || this.handlers[phase]?.['default'];
  }

  hasPhase(nodeType, phase) {
    this.absorb();
    return !!this.handlers[phase]?.[nodeType];
  }

  // ── AST tree walk ──────────────────────────────────────────
  runPhases(ctxMix, root, params, phases = ['measure', 'position', 'draw']) {
    ctxMix.iterators = [];
    ctxMix.flyweight = {};
    for (const phase of phases) {
      this.walkPhase(ctxMix, phase, root, params);
    }
  }

  walkPhase(ctxMix, phase, node, params) {
    // Leaf node — dispatch directly, no iterator needed
    if( !node )
      return;
    // Leaf fast path.  A node with no children normally gets only the plain
    // phase.  But a container (before_/after_ handlers, no plain one) would
    // then get nothing at all — an empty frame was neither drawn nor
    // hit-testable — so it goes the full container way, with no children.
    const subtree = node.subtree || EMPTY_SUBTREE;
    if (subtree.length === 0) {
      this.absorb();
      const h = this.handlers;
      const isContainer = !h[phase]?.[node.type]
        && (h['before_' + phase]?.[node.type] || h['after_' + phase]?.[node.type]);
      if (!isContainer) {
        this.dispatch(ctxMix, phase, node, params);
        return;
      }
    }

    // Push default iterator; before_ hook may replace it
    if (!ctxMix.iterators) ctxMix.iterators = [];
    ctxMix.iterators.push(new SubtreeIterator());

    this.dispatch(ctxMix, 'before_' + phase, node, params);

    // A handler may set ctxMix.abortPhase to stop visiting this node's
    // children (a hit found, say); it is cleared before the after_ hook.
    let child;
    while ((child = ctxMix.iterators.at(-1).next(subtree)) !== null) {
      if (ctxMix.abortPhase) break;
      this.dispatch(ctxMix, 'before_child_' + phase, node, params, child);
      if (ctxMix.abortPhase) break;
      this.walkPhase(ctxMix, phase, child, params);
      if (ctxMix.abortPhase) break;
      this.dispatch(ctxMix, 'after_child_' + phase, node, params, child);
      if (ctxMix.abortPhase) break;
    }
    ctxMix.abortPhase = false;

    this.dispatch(ctxMix, 'after_' + phase, node, params);

    ctxMix.iterators.pop();
  }
}


let sceneRegistry = new SceneRegistry();
// Scenes are pushed onto this array
const SCENES = [];

// Addables (components) are pushed onto this array
const ADDABLES = [];
/** Stop the walk descending into this node's children (they belong to another
    backend, or the node is hiding them).  The walker pushed an iterator before
    calling before_*; replacing it ends the loop at once.  Only for before_*
    handlers: a leaf has no iterator of its own. */
function skipChildren(ctxMix) {
  ctxMix.iterators[ctxMix.iterators.length - 1] = { next: () => null };
}

export { SceneNode, SceneRegistry, sceneRegistry, MiniAstNode, SubtreeIterator, SCENES, ADDABLES, skipChildren };