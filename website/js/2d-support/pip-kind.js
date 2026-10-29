export { PipKinds };

// PipKinds — frozen capability records describing what a pip may do
/* ─────────────────────────────────────────────────────────────────────────────
A kind record is never mutated in place.  To change a pip's capabilities at
run time, swap in a different frozen record.

A node class declares a uniform kind in meta.pipKind, or answers per pip with
a static getPipKinds(node) returning one record per pip — so a node may in
future anchor one pip and follow another (an 'in pip' and an 'out pip').

  anchors  the pip's position derives from the node's own geometry: it drives
  follows  the pip's position may be driven by another pip: it can be set
  splits   landing on an edge divides that edge in two
  absorbs  the pip may be dissolved when it is only a pass-through

PipSetManager owns the vocabulary of questions; node classes only answer.
Adding a question here does not disturb classes that never ask it.
──────────────────────────────────────────────────────────────────────────── */
const PipKinds = {
  TILE:     Object.freeze({ name: 'tile',     anchors: true,  follows: false, splits: false, absorbs: false }),
  EDGE_END: Object.freeze({ name: 'edge-end', anchors: false, follows: true,  splits: false, absorbs: false }),
  JUNCTION: Object.freeze({
    name: 'junction', anchors: false, follows: true, splits: true, absorbs: true,
    // A junction is a point.  Classes that want no more than that need not
    // implement getPips/setPipPos at all — the kind answers for them.
    getPips: (res, node, params) => {
      const v = res.getValue(res, node, params) || {};
      return [{ x: v.x || 0, y: v.y || 0, out: 0 }];
    },
    setPipPos: (res, node, params) => {
      res.setValue(res, node, params, { x: params.x, y: params.y });
    },
  }),
};

/* Pip geometry reads through the value channel, so a caller outside a walk
   passes Values and a caller inside one passes its ctxMix.  Both answer
   getValue/setValue; nothing else is required of a resolver. */
