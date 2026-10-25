/**
 * omni-scene-scenes.js  — v5
 *
 * Scene definitions: Canvas, Chart, Ribbon, Animate, Jatex, Molam.
 *
 * Changes from v4:
 *   - Molam (3D protein viewer) added as displayMode:'3d' scene
 *   - Conditional import: requires Three.js in importmap
 *
 * Place in: apps/omni-scene-scenes.js
 */

import { MiniAstNode, SCENES, ADDABLES } from '../omni-support/scene.js';

// ── Node registrations (side effects) ────────────────────
import '../nodes2d/warpable-grid-node.js';
import '../nodes2d/table-cell-node.js';

// ── Models ───────────────────────────────────────────────
// These add scenes into SCENES using SCENES.push()
import './scenes-chart.js';
import './scenes-animate.js';
import './scenes-molam.js';
import './scenes-jatex.js';
import './scenes-ribbon.js'
import './scenes-heatmap.js';
import './scenes-workhorse.js';
import './scenes-cards.js';
import './scenes-shapes.js';
import './scenes-network.js';
import './scenes-mask.js';
import './scenes-button.js';
import './scenes-frame.js';
import './scenes-postit.js';

// ── Palettes ─────────────────────────────────────────────
const PT_COLORS = [
  '#4fc3f7', '#81c784', '#ffb74d', '#f06292',
  '#ba68c8', '#4db6ac', '#fff176', '#a1887f',
];

const LAYER_COLORS = [...PT_COLORS];


// ═══════════════════════════════════════════════════════
//  CANVAS SCENE
// ═══════════════════════════════════════════════════════

function canvasBuildUI() {
  return [{ group: 'View', id: 'view', abbrev: 'View', sliders: [
    { id: 'zoom', label: 'Zoom', min: 0.1, max: 4, step: 0.01, default: 1 },
  ]}];
}

function createCanvasScene() {
  const rectDef   = ADDABLES.find(a => a.id === 'rect');
  const rectLayer = rectDef.create();
  rectLayer.value.name     = 'Rectangle 1';
  rectLayer.value.dotColor = LAYER_COLORS[0];
  const sceneLayer = new MiniAstNode('layer', [rectLayer], {
    name: 'Scene', visible: true, center: true,
    params: { zoom: 1, panX: 0, panY: 0 },
  });
  sceneLayer.inst = { buildUI: canvasBuildUI, presets: null };
  return new MiniAstNode('scene-root', [sceneLayer]);
}

// ═══════════════════════════════════════════════════════
//  SCENE REGISTRY
// ═══════════════════════════════════════════════════════
SCENES.push(
  { id: 'canvas',        label: 'Canvas',         group: 'Canvas',  hasLayers: true,  create: createCanvasScene, phases: ['measure', 'layout', 'draw2d'],
  })

export { SCENES , LAYER_COLORS };