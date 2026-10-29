import { SYS } from '../omni-support/sys.js';
import './html-nodes.js';   // the html-box nodes the passes make

// prepasses — turn a flat list of nodes into the nested scene D+ draws
/* ─────────────────────────────────────────────────────────────────────────────
Markdown+ rules emit nodes one block at a time, in document order: a header,
a card, a few messages.  D+'s _render then built structure by hand.  These
are that structure as pure functions, prepass.<name> in SYS.FUNCTIONS, each
(subtree, node) → new subtree.  A node asks for them with
value.prepare: ['scroller', 'zones'], and the harness runs them once, before
the first mount, then visits the result, so a pass may make a node that
asks for another.

  scroller   a node with opens: 'scroller' is followed by a scrolling box
             holding everything after it; that box asks for sections.  Its
             class is the node's scrollerClass, else 'scroller'.  Both may be
             said by the node or by its type's meta, so a template book can
             say it once: ```html template=chatheader opens=scroller```.
             (D+: the chat header opens the message scroller.)
  sections   a node with section: 'head', or whose class meta says sticky,
             opens a section whose head pins while the rest scrolls under it;
             the next head closes it.  (D+: sticky cards and stages.)
  zones      a node with zoneOut: 'name', anywhere below, moves under the box
             with zone: 'name'.  (D+: the chat input goes to its own zone.)
  fold       a node with fold: 'key' is not drawn: its value[key] goes to the
             node before it.  (D+: the '— …' line under a note's title is
             the chat header's subtitle.)

The passes are ordinary data in, data out, so a test can run one on a list
without a page.
──────────────────────────────────────────────────────────────────────────── */

/** A field from the node, else from its type's meta. */
const said = (n, key) => n.value?.[key] ?? SYS.registry.meta[n.type]?.[key];

function prepassScroller(list) {
  const i = list.findIndex(n => said(n, 'opens') === 'scroller');
  if (i < 0) return list;
  const cls = said(list[i], 'scrollerClass') ?? 'scroller';
  const box = SYS.makeNode('html-box', { class: cls, scroll: 'y', prepare: ['sections'] }, list.slice(i + 1));
  return [...list.slice(0, i + 1), box];
}

function prepassSections(list) {
  const out = [];
  let section = null;
  for (const n of list) {
    const head = n.value?.section === 'head' || SYS.registry.meta[n.type]?.sticky;
    if (head) {
      section = SYS.makeNode('html-box', { class: 'sticky-section' }, [
        SYS.makeNode('html-box', { class: 'sticky-head', sticky: true }, [n]),
      ]);
      out.push(section);
    } else if (section) section.subtree.push(n);
    else out.push(n);
  }
  return out;
}

function prepassZones(list, root) {
  const moving = [];
  const lift = (node) => {
    if (!node.subtree) return;
    node.subtree = node.subtree.filter(k => (k.value?.zoneOut ? (moving.push(k), false) : true));
    node.subtree.forEach(lift);
  };
  const holder = { subtree: list };
  lift(holder);
  const zoneOf = (node, name) => {
    if (node.value?.zone === name) return node;
    for (const k of node.subtree || []) { const z = zoneOf(k, name); if (z) return z; }
    return null;
  };
  for (const n of moving) {
    const z = zoneOf(holder, n.value.zoneOut);
    if (z) (z.subtree ||= []).push(n);
    else console.warn(`zoneOut '${n.value.zoneOut}': no box with that zone`);
  }
  return holder.subtree;
}

function prepassFold(list) {
  const out = [];
  for (const n of list) {
    const key = n.value?.fold;
    if (!key) { out.push(n); continue; }
    const prev = out[out.length - 1];
    if (prev) (prev.value ||= {})[key] = n.value[key];
  }
  return out;
}

SYS.FUNCTIONS.push(
  { name: 'prepass.fold',     fn: prepassFold },
  { name: 'prepass.scroller', fn: prepassScroller },
  { name: 'prepass.sections', fn: prepassSections },
  { name: 'prepass.zones',    fn: prepassZones },
);
