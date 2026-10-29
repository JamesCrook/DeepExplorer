/*
The mask editor's plain nodes, one file each, and its nm coordinates. Importing
this file registers all three. The mask scenes use OmniScene's `layer`
(omni-scene-nodes.js); a mask-only LayerNode once registered here under the
same name never ran, and is gone.
*/

import './mask-rect-node.js';      // 'rect'          a filled rectangle in nm
import './grid-bg-node.js';        // 'grid-bg'       adaptive nm grid and origin
import './clip-outline-node.js';   // 'clip-outline'  dashed clip regions

export { RectNode } from './mask-rect-node.js';
export { GridBgNode } from './grid-bg-node.js';
export { ClipOutlineNode } from './clip-outline-node.js';
export { nm2screen, screen2nm, viewBounds } from '../2d-support/nm-coords.js';
