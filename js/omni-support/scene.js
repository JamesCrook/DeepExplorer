/*
# ESSENTIALS

SceneRegistry is a double-dispatch table with a recursive tree walker.

It maps (phase, nodeType) pairs to handler functions. You register a class; it scans the class for methods whose first parameter is named ctxMix and files each one under (methodName, nodeType). When you call dispatch(ctxMix, 'draw2d', node, params), it looks up handlers['draw2d'][node.type], falls back to handlers['draw2d']['default'], and calls whatever it finds.

walkPhase adds recursion, typically recursing into node.subtree, an array of nodes.
runPhases calls walkPhase for each of a sequence of passes.

Common patterns are:
* For canvas (2d) run phases of [ 'measure', 'layout', 'draw2d'] or ['hit_test']
* For canvas (3d) mediated by THREE.js, phases of ['build','update','teardown']
* For html dom phases of ['buildDom']

2d nodes differ in conventions as to what parameters for transformation they expect, and
where they expect the paramaters to come from. ctxMix.T carries the transform object, and methods
on T can deliver data in the convention the node requires, acting as an adapter of whatever
the current context actually supplied.

You will often see the signature of a node function, such as draw2d(ctxMix, node, params)

- ctxMix has the ctx, the transform T and data that is built up during walking the scene
- node holds the node itself. it may have a .value, serialisable as JSON, and a .inst instantiated during scene building for state and functions, but not persisted to storage. 
- params is a a dictionary of values that are usually global for the model, so for example params.cornerRadius to change the rounding of all nodes that can round their corners.

Because the conventions different parents of a node use are so flexible, we often access information through mediators, e.g. ctxMix.T.toScreen() to convert a coordinate and ctxMix.directCtx() to get a ctx we can draw to.

*/
// #node/spec/code

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

class SubtreeIterator {
  constructor() {
    this.index = 0;
  }

  next(subtree) {
    if (this.index >= subtree.length) return null;
    return subtree[this.index++];
  }
}

class SceneRegistry {
  constructor() {
    this.handlers = {};   // { phase: { nodeType: handler } }
    this.meta = {};       // { nodeType: { rebuildParams, updateParams } }
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
  
  _hasHandler(nodeType, name) {
    return !!this.handlers[nodeType]?.[name];
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
            this._registerHandler(nodeType, name, (ctxMix, node, params, child) => {
              return node.inst[name].call(node.inst, ctxMix, node, params, child);
            });
          }
        }
      }
    }

    this.meta[nodeType] = {
      nodeClass,
      defaultParams,
      rebuildParams: nodeClass.rebuildParams || [],
      updateParams:  nodeClass.updateParams  || []
    };

  }

  _registerHandler(nodeType, phase, handler) {
    if (!this.handlers[phase]) this.handlers[phase] = {};
    this.handlers[phase][nodeType] = handler;
  }

  // ── Double dispatch: (phase, nodeType) → handler ──

  dispatchXXX(ctxMix, phase, node, params, child) {
    const phaseHandlers = this.handlers[phase];
    if (!phaseHandlers) return;

    const handler = phaseHandlers[node.type] || phaseHandlers['default'];
    if (handler) handler(ctxMix, node, params, child);
  }

  dispatch(ctxMix, phase, node, params, child) {
    const phaseHandlers = this.handlers[phase];
    if (!phaseHandlers) return;

    const meta = this.meta[node.type];
    const mergedParams = meta?.defaultParams
      ? { ...meta.defaultParams, ...params }
      : params;

    const handler = phaseHandlers[node.type] || phaseHandlers['default'];
    if (handler) handler(ctxMix, node, mergedParams, child);
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
    return this.handlers[phase]?.[nodeType] || this.handlers[phase]?.['default'];
  }

  hasPhase(nodeType, phase) {
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
    // This fast path is an optimisation.
    if (!node?.subtree || node?.subtree?.length === 0) {
      this.dispatch(ctxMix, phase, node, params);
      return;
    }

    // Push default iterator; before_ hook may replace it
    ctxMix.iterators.push(new SubtreeIterator());

    this.dispatch(ctxMix, 'before_' + phase, node, params);

    let child;
    while ((child = ctxMix.iterators.at(-1).next(node.subtree)) !== null) {
      this.dispatch(ctxMix, 'before_child_' + phase, node, params, child);
      this.walkPhase(ctxMix, phase, child, params);
      this.dispatch(ctxMix, 'after_child_' + phase, node, params, child);
    }

    this.dispatch(ctxMix, 'after_' + phase, node, params);

    ctxMix.iterators.pop();
  }
}


let sceneRegistry = new SceneRegistry();
// Scenes are pushed onto this array
const SCENES = [];

// Addables (components) are pushed onto this array
const ADDABLES = [];
export { SceneNode, SceneRegistry, sceneRegistry, MiniAstNode, SubtreeIterator, SCENES, ADDABLES };