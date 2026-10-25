import { SYS } from '../omni-support/sys.js';
import '../nodes2d/frame-node-zones.js';   // 'frame-node'
import '../nodes2d/pane-camera-node.js';   // 'pane-camera'
export { makeZoomableFrame };

/* ─────────────────────────────────────────────────────────────────────────────
make-frame — a frame with content padding, wrapped in a pane camera.

The only builder that needs frame-node, which is the largest nugget in the
substrate.  A model that wants an array and no frame no longer pays for it.
──────────────────────────────────────────────────────────────────────────── */

function makeZoomableFrame(frameValue, children) {
  const frame = SYS.makeNode('frame-node', frameValue, children);
  const cam = SYS.makeNode('pane-camera', {
    centerOrigin: true,
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
  }, [frame]);
  cam._frameNode = frame;
  return cam;
}
