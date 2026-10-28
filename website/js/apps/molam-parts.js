/**
 * molam-parts.js — scene-graph builders shared by the Molam widget
 * (molam-widget.js, html/molam.html) and the Molam scene in OmniScene
 * (scenes-molam.js), which had identical copies.
 *
 *   makeGroundPlane(), makeRibbon(key, color), makeAtoms(useImposters),
 *   makeBonds()                          one 3D node each, with its inst
 *   buildProteinScene(chains, structureChains, atoms, scale)
 *                                        ground + a ribbon per chain + atoms + bonds
 *   buildThreeRoot(content)              three-scene > camera, lights, content
 *   CHAIN_COLORS, DEFAULT_CONTROL_POINTS
 */

import { MiniAstNode } from '../omni-support/scene.js';
import { CameraNode }       from '../nodes3d/camera-node.js';
import { LightsNode }       from '../nodes3d/lights-node.js';
import { GroundPlaneNode }  from '../nodes3d/ground-plane-node.js';
import { MolamRibbonNode }  from '../nodes3d/molam-ribbon-node.js';
import { MolamAtomNode }    from '../nodes3d/molam-atom-node.js';
import { MolamBondNode }    from '../nodes3d/molam-bond-node.js';
import { SceneNode3D }      from '../nodes3d/scene-node-3d.js';
import { ThreeSceneNode }   from '../nodes3d/three-scene-node.js';
import { ImposterAtomNode } from '../nodes3d/imposter-atom-node.js';

const CHAIN_COLORS = [
  0x4fc3f7, 0xff6b6b, 0x95e1d3, 0xf38181, 0xaa96da,
  0xfcbad3, 0xa8d8ea, 0xf9ed69, 0x6a0572, 0xf85f73,
];

const DEFAULT_CONTROL_POINTS = [
  [-6, 0, 0], [-3, 2, 2], [0, -1, -1], [3, 1, 2], [6, 0, 0],
];

function makeGroundPlane() {
  const node = new MiniAstNode('ground-plane', [], {
    grid: { size: 20, divisions: 20, y: -4, color1: 0x444444, color2: 0x333333 },
    axes: { size: 2, position: [-9, -3.9, -9] },
  });
  node.inst = new GroundPlaneNode();
  return node;
}

function makeRibbon(key, color) {
  const node = new MiniAstNode('molam-ribbon', [], { key, color, samplesPerSegment: 40 });
  node.inst = new MolamRibbonNode();
  return node;
}

/** Imposter spheres by default; real meshes (molam-atoms) when asked. */
function makeAtoms(useImposters = true) {
  if (useImposters) {
    const node = new MiniAstNode('imposter-atoms', [], {});
    node.inst = new ImposterAtomNode();
    return node;
  }
  const node = new MiniAstNode('molam-atoms', [], {});
  node.inst = new MolamAtomNode();
  return node;
}

function makeBonds() {
  const node = new MiniAstNode('molam-bonds', [], {});
  node.inst = new MolamBondNode();
  return node;
}

/** Ground, one coloured ribbon per chain, then atoms and bonds coloured to match. */
function buildProteinScene(normalizedChains, structureChains, normalizedAtoms, scale) {
  const children = [makeGroundPlane()];
  let chainIndex = 0;
  const chainColorMap = new Map();

  for (const [chainId, coords] of normalizedChains) {
    const color = CHAIN_COLORS[chainIndex % CHAIN_COLORS.length];
    chainColorMap.set(chainId, color);
    const chainAtoms = structureChains.get(chainId);
    const rolls = new Array(coords.length).fill(0);
    const ribbon = makeRibbon(`ribbon-${chainId}`, color);
    ribbon.inst.setData(coords, rolls, chainAtoms);
    children.push(ribbon);
    chainIndex++;
  }

  const imposters = makeAtoms(true);
  imposters.inst.setData(normalizedAtoms, scale, chainColorMap);
  children.push(imposters);

  const bonds = makeBonds();
  bonds.inst.setData(normalizedAtoms, scale, chainColorMap);
  children.push(bonds);

  const scene = new MiniAstNode('scene', children);
  scene.inst = new SceneNode3D();
  return scene;
}

/** The three.js shell: camera and lights around the given scene content. */
function buildThreeRoot(content) {
  const baseDistance = Math.sqrt(10 * 10 + 8 * 8 + 12 * 12);

  const camera = new MiniAstNode('camera', [], {
    fov: 60, near: 0.1, far: 1000,
    position: [10, 8, 12], baseDistance,
    zoomRange: [0.02, 20],
    enableDamping: true, dampingFactor: 0.05,
  });

  const lights = new MiniAstNode('lights', [], {
    ambient: { type: 'ambient',     color: 0x404040, intensity: 0.5 },
    main:    { type: 'directional', color: 0xffffff, intensity: 1.2, position: [5, 15, 10],    param: 'mainLight' },
    fill:    { type: 'directional', color: 0x4488ff, intensity: 0.5, position: [-10, 5, -5],   param: 'fillLight' },
    back:    { type: 'directional', color: 0xffdddd, intensity: 1.2, position: [-5, -10, -10], param: 'backLight' },
  });

  const root  = new MiniAstNode('three-scene', [camera, lights, content], { background: 0x0f0f23 });
  root.inst   = new ThreeSceneNode();
  camera.inst = new CameraNode();
  lights.inst = new LightsNode();
  return root;
}

export {
  CHAIN_COLORS, DEFAULT_CONTROL_POINTS,
  makeGroundPlane, makeRibbon, makeAtoms, makeBonds,
  buildProteinScene, buildThreeRoot,
};
