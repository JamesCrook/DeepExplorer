/*
# ESSENTIALS

SYS — the things that exist once, for modules that register themselves.

Three sinks, each a plain array that any module pushes records into at load
(or later):

  NODE_CLASSES   { name, cls, defaults? }   a node type.  The scene registry
                                            absorbs these before its next walk.
  TEMPLATES      { name, markup, attrs, from }   an HTML template.  A book of
                                            ```html template=name``` fences is
                                            pushed one record per fence, and
                                            every template is also a node type
                                            of its own name.
  FUNCTIONS      { name, fn, args?, label? }    named behaviour, dotted by kind:
                                            action.*, prepass.*, template.*,
                                            source.*, format.*.  The name is
                                            what a serialised node refers to.

When a name occurs twice, the last record pushed wins: named() searches from
the end.  audit() reports such names once, so an accident shows and an
override is still possible.

Two shared drawing parameters come with it, from the Zones nodes (once the
multi-zone stand-alone's own sys.js):

  R              a base radius, 30.
  P              a parameter bag many 2D nodes read: opacity, edge width,
                 outline and bend, chart bounds, screen mode, colours.

The registry is the library's one sceneRegistry (scene.js), shared by every
backend, so node-type names are one namespace.
*/

import { sceneRegistry } from './scene.js';

const NODE_CLASSES = [];
const TEMPLATES = [];
const FUNCTIONS = [];
sceneRegistry.addSource(NODE_CLASSES);

const R = 30;
const P = {
  opacity: 80, edgeWidth: 5, edgeOutline: 1.5, edgeBend: 0,
  showChartBounds: false, screenMode: false,
  colors: { 4: { fill: '#c08428', stroke: '#9a6a1e' } },
};

const MODELS = [];
const STOCK = [];
const CONTROLS = [];

let _nodeId = 0;
function makeNode(type, value, subtree) {
  return { type, value: { ...value, id: ++_nodeId }, subtree: subtree || [] };
}
function cloneProto(proto, overrides) {
  const { id: _, ...rest } = proto.value;
  return makeNode(proto.type, { ...rest, ...overrides });
}

/** The record with this name that was pushed last, or null. */
function named(list, name) {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].name === name) return list[i];
  return null;
}
/** Distinct names in a sink, in push order, optionally only those with a prefix. */
function namesIn(list, prefix = '') {
  return [...new Set(list.map(r => r.name))].filter(n => n.startsWith(prefix));
}
/** Warn once about names pushed more than once.  NODE_CLASSES is left out:
    the registry warns as it absorbs, which also covers pushes made later. */
function audit() {
  for (const [sink, list] of Object.entries({ TEMPLATES, FUNCTIONS })) {
    const count = new Map();
    for (const r of list) count.set(r.name, (count.get(r.name) || 0) + 1);
    for (const [name, n] of count) {
      if (n > 1) console.warn(`SYS.${sink}: '${name}' pushed ${n} times; the last one wins`);
    }
  }
}

const SYS = {
  R, P,
  MODELS, STOCK, CONTROLS, NODE_CLASSES, TEMPLATES, FUNCTIONS,
  named, namesIn, audit,
  makeNode, cloneProto,
  registry: sceneRegistry,
};

// Old code registered with sceneRegistry
// Newer code pushes to the relevant array in SYS
export { SYS, sceneRegistry };
