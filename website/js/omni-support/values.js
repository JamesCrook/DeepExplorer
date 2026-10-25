export { Values };

/* ─────────────────────────────────────────────────────────────────────────────
Values — the one channel through which anything reads or writes a node, and
the identity resolver: the answer when there is no context to ask.

  getValue(res, node, params)         -> the node's value
  setValue(res, node, params, patch)  -> true if anything changed
  getNode (res, node, params)         -> the node itself, or its stand-in
  getParams(res, node, params)        -> the params object the node reads and
                                         writes: the walk's, unless an ancestor
                                         has set node.paramsFn

A *resolver* is anything answering those three.  A ctxMix is one, because the
pane spreads Values into it and may override a member; Values itself is the
other, for callers that are not inside a walk at all — the pip manager, the
controllers, a model building its scene.  So a geometry method is called
`fn(ctxMix, node, params)` inside a walk and `fn(Values, node, params)`
outside one, and never has to ask which it got.

A leaf asks for its value and gets everything: its data, its tooltip, whether
it is selected.  It never learns whether it is one node or one of a thousand,
nor whether an ancestor is rewriting what it reads.

Ephemeral keys are routed to node.state, so a universal write channel does not
become the way ephemera creeps back into value.  That rule lives here alone.

Params, like values, are asked for rather than assumed.  A widget bound to a
param (a slider, a colour) gets its params object from getParams, never
straight from the walk's argument, so a flyweight can bind one shared proto to
each item's own params by setting proto.paramsFn, as it sets flyFn for values.
The widget resolves the object once, at mount, and writes back to that same
object, ctxMix.setParam(id, value, p): by the time a widget is used the walk
is over, and with it any flyweight's position, so asking again then would
find the wrong item.

A note on the read discipline.  getValue may return a *copy* — it does so as
soon as a node carries ephemera.  So a value is for reading; to write, call
setValue.  A drag closure that captured `v` and assigned to `v.x` would work
until the node was first selected, and then quietly stop.
──────────────────────────────────────────────────────────────────────────── */
const EPHEMERAL = new Set(['selected', 'hovered']);

/* A plain node's value, with its ephemera folded in — but only when there
   is any, so the common case allocates nothing. */
function plainValue(node) {
  const s = node?.state;
  if (!s || (s.selected === undefined && s.hovered === undefined)) return node?.value;
  return { ...node.value, selected: s.selected, hovered: s.hovered };
}

function applyPlain(node, patch) {
  if (!node) return false;
  let changed = false;
  for (const key of Object.keys(patch)) {
    const target = EPHEMERAL.has(key) ? (node.state ||= {}) : node.value;
    if (target[key] === patch[key]) continue;
    target[key] = patch[key];
    changed = true;
  }
  return changed;
}

/* An object literal rather than a class: its members must be enumerable, so
   that a ctxMix is built by spreading these and overriding what it means to
   change.  A class's statics are not, which is how the pane came to carry a
   second copy of getValue that had drifted from this one. */
const Values = Object.freeze({

  getValue(res, node, params) {
    if (node?.flyFn) return node.flyFn(res, node, params);
    return plainValue(node);
  },

  setValue(res, node, params, patch) {
    if (node?.setFn) return node.setFn(res, node, params, patch);
    return applyPlain(node, patch);
  },

  getNode(res, node, params) {
    return node?.nodeFn ? node.nodeFn(res, node, params) : node;
  },

  getParams(res, node, params) {
    return node?.paramsFn ? node.paramsFn(res, node, params) : params;
  },

  plain: plainValue,
  applyPlain,

  /* Everything the app may do with a hit, whether it landed on an ordinary
     node or on one item of a flyweight.  The app calls these and nothing
     else — it never reaches into hit.node. */
  access(res, hit, params) {
    const i = hit?.interactions || {}, node = hit?.node;
    return {
      node,
      applyDrag:  i.applyDrag,
      endDrag:    i.endDrag,
      draggable:  !!i.applyDrag,
      getValue:   i.getValue   ?? (() => Values.getValue(res, node, params)),
      setValue:   i.setValue   ?? (patch => Values.setValue(res, node, params, patch)),
      getTooltip: i.getTooltip ?? (() => Values.getValue(res, node, params)?.tooltip ?? null),
    };
  },
});
