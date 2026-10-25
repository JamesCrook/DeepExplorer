import { SYS } from '../omni-support/sys.js';
import '../nodes2d/pane-camera-node.js';   // 'pane-camera'
export { autoFitCamera, makeZoomableCamera };

/* ─────────────────────────────────────────────────────────────────────────────
make-camera — wrap a node so a pane can pan and zoom over it.

Split out of ModelUtils, which had become a facade over six node types: any
model that called one builder appeared to depend on all of them.  Three
nuggets, three honest dependency sets.
──────────────────────────────────────────────────────────────────────────── */

function makeZoomableCamera(child, opts = {}) {
  const cam = SYS.makeNode('pane-camera', {
    centerOrigin: opts.centerOrigin || false,
    zoom: opts.zoom || 1,
    scrollX: opts.scrollX || 0,
    scrollY: opts.scrollY || 0,
  }, [child]);
  return cam;
}


function autoFitCamera(camNode, paneW, paneH) {
  const frame = camNode._frameNode;
  if (!frame || !paneW || !paneH) return;

  const cw = frame.value.cw || 700, ch = frame.value.ch || 400;
  const p = frame.value.padding;
  let pl = 80, pr = 80, pt = 100, pb = 100;
  if (p != null) {
    if (typeof p === 'number') { pl = pr = pt = pb = p; }
    else { pl = p.left ?? 80; pr = p.right ?? 80; pt = p.top ?? 100; pb = p.bottom ?? 100; }
  }
  const totalW = cw + pl + pr;
  const totalH = ch + pt + pb;
  camNode.value.zoom = Math.min(paneW / totalW, paneH / totalH) * 0.92;
  camNode.value.scrollX = 0;
  camNode.value.scrollY = 0;
}
