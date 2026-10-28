/* ============================================
   MolamWidget — embeddable 3D Protein Ribbon Viewer
   ============================================

   Usage:

     import { Molam } from './molam-widget.js';

     const viewer = Molam('#viewport')
       .preset('Standard')
       .params({ width: 0.5, thickness: 0.2 })
       .on('loaded', (info) => console.log(info));

     // Load a protein by PDB/mmCIF/BinaryCIF/AlphaFold ID
     await viewer.loadProtein('1GFL');
     await viewer.loadProtein('1CRN', 'mmcif');
     await viewer.loadProtein('Q5VSL9', 'af');

     // Load a local file
     await viewer.loadFile(file);

     // Reset to demo ribbon
     viewer.demo();

     // Animated preset morph
     viewer.preset('Ball and Stick');

     // Tear down
     viewer.destroy();
*/

import { MiniAstNode, sceneRegistry } from '../omni-support/scene.js';
import * as THREE                     from 'three';
import { OmniParamEngine }            from '../omni-support/omni-param-engine.js';
import { PDBParser }                  from '../parsers/pdb-parser.js';
import { MmCifParser }                from '../parsers/mmcif-parser.js';
import { BmCifParser }                from '../parsers/bmcif-parser.js';

import { CameraNode }                 from '../nodes3d/camera-node.js';
import { LightsNode }                 from '../nodes3d/lights-node.js';
import { GroundPlaneNode }            from '../nodes3d/ground-plane-node.js';
import { MolamRibbonNode }            from '../nodes3d/molam-ribbon-node.js';
import { MolamAtomNode }              from '../nodes3d/molam-atom-node.js';
import { MolamBondNode }              from '../nodes3d/molam-bond-node.js';
import { SceneNode3D }                from '../nodes3d/scene-node-3d.js';
import { ThreeSceneNode }             from '../nodes3d/three-scene-node.js';
import { ImposterAtomNode }           from '../nodes3d/imposter-atom-node.js';
import { Capturer }                   from '../3d-support/three-capturer.js';
import {
  CHAIN_COLORS, DEFAULT_CONTROL_POINTS,
  makeGroundPlane, makeRibbon, makeAtoms, makeBonds,
  buildProteinScene, buildThreeRoot,
} from './molam-parts.js';
import { Animator }                   from '../omni-support/animator.js';

// ── Constants ────────────────────────────────────────────────



// ── Presets ──────────────────────────────────────────────────

const PRESETS = {
  'Standard': {
    width: 0.34, thickness: 0.08, ribbonFade: 0, sidechainFade: 0,
    nodeScale: 0.5, controlNodeSize: 0, jointNodeSize: 0, nitroNodeSize: 0,
    smoothing: 0, controlNodeSmoothing: 0, normalIndicatorSize: 0,
    arrowHeads2: 0, arrowHeads: 0.5, colorSmoothing: 0,
    atomRadius: 0.0, atomOpacity: 1, atomRangeStart: 0, atomRangeEnd: 100,
    bondOpacity: 1, bondRadius: 0, bondHalfColor: 0.5, bondLightness: 0.5, bondRingPink: 0,
    bondColorByAminoAcid: 0,
    hydrophobicity: 0, charge: 0, size: 0, aromatics: 0,
    small: 0, hydroxyl: 0, hydrophobic: 0, negative: 0, polar: 0, aliphatic: 0,
    positive: 0, large: 0, sulfur: 0, aromatic: 0,
    mainLight: 3, fillLight: 1.5, backLight: 1,
  },
  'Springs': {
    width: 0.08, thickness: 0.34, ribbonFade: 0, sidechainFade: 0,
    nodeScale: 0.5, controlNodeSize: 0, jointNodeSize: 0, nitroNodeSize: 0,
    smoothing: 0, controlNodeSmoothing: 0, normalIndicatorSize: 0,
    arrowHeads2: 0.5, arrowHeads: 0, colorSmoothing: 0,
    atomRadius: 0.3, atomOpacity: 1, atomRangeStart: 0, atomRangeEnd: 100,
    bondOpacity: 0, bondRadius: 1, bondHalfColor: 0.5, bondLightness: 0.5, bondRingPink: 0,
    bondColorByAminoAcid: 0,
    hydrophobicity: 0, charge: 0, size: 0, aromatics: 0,
  },
  'Beads': {
    width: 0.16, thickness: 0.16, nodeScale: 0.5, controlNodeSize: 0.9, jointNodeSize: 0, nitroNodeSize: 0.8,
    smoothing: 0.5, controlNodeSmoothing: 0.5, normalIndicatorSize: 0,
    arrowHeads2: 0, arrowHeads: 0, colorSmoothing: 0,
    atomRadius: 0, atomOpacity: 0.3, atomRangeStart: 0, atomRangeEnd: 100,
    bondOpacity: 0, bondRadius: 0, bondHalfColor: 0.5, bondLightness: 0.5, bondRingPink: 0,
  },
  'Bootlace': {
    width: 0.08, thickness: 0.08, nodeScale: 0, controlNodeSize: 0.5, jointNodeSize: 0, nitroNodeSize: 0.5,
    smoothing: 0.5, controlNodeSmoothing: 0.5, normalIndicatorSize: 0,
    arrowHeads2: 0, arrowHeads: 0, colorSmoothing: 0,
    atomRadius: 0.14, atomOpacity: 1, atomRangeStart: 0, atomRangeEnd: 100,
    bondOpacity: 0, bondRadius: 1, bondHalfColor: 0.5, bondLightness: 0.5, bondRingPink: 0,
  },
  'Chunky': {
    width: 1.0, thickness: 0.25, ribbonFade: 0, sidechainFade: 0,
    nodeScale: 0.58, controlNodeSize: 0.82, jointNodeSize: 0, nitroNodeSize: 0.75,
    smoothing: 0, controlNodeSmoothing: 0, normalIndicatorSize: 0,
    arrowHeads2: 0, arrowHeads: 0, colorSmoothing: 0,
    atomRadius: 0, atomOpacity: 1, atomRangeStart: 0, atomRangeEnd: 100,
    bondOpacity: 0, bondRadius: 0, bondHalfColor: 0.5, bondLightness: 0.5, bondRingPink: 0,
    bondColorByAminoAcid: 0,
    hydrophobicity: 0, charge: 0, size: 0, aromatics: 0,
  },
  'Stubby': {
    width: 0, thickness: 0, ribbonFade: 0, sidechainFade: 0,
    nodeScale: 0.5, controlNodeSize: 0, jointNodeSize: 0, nitroNodeSize: 0,
    smoothing: 0, controlNodeSmoothing: 0, normalIndicatorSize: 0,
    arrowHeads2: 0, arrowHeads: 0.5, colorSmoothing: 0,
    atomRadius: 0.75, atomOpacity: 1, atomRangeStart: 0, atomRangeEnd: 100,
    bondOpacity: 0, bondRadius: 2.75, bondHalfColor: 0, bondLightness: 0.5, bondRingPink: 0,
    bondColorByAminoAcid: 0,
    hydrophobicity: 0, charge: 0, size: 0, aromatics: 0,
  },
  'Residue': {
    small: 1, hydroxyl: 1, hydrophobic: 1, negative: 1, polar: 1, aliphatic: 1,
    positive: 1, large: 1, sulfur: 1, aromatic: 1, bondRingPink: 0,
    bondColorByAminoAcid: 1,
  },
  'Electric': {
    small: 0, hydroxyl: 0, hydrophobic: 0, negative: 1, polar: 0, aliphatic: 0,
    positive: 1, large: 0, sulfur: 0, aromatic: 0, bondRingPink: 1,
    bondColorByAminoAcid: 1,
  },
  'Sulfur': {
    small: 0, hydroxyl: 0, hydrophobic: 0, negative: 0, polar: 0, aliphatic: 0,
    positive: 0, large: 0, sulfur: 1, aromatic: 0, bondRingPink: 0,
    bondColorByAminoAcid: 1,
  },
  'Ball and Stick': {
    width: 0, thickness: 0, nodeScale: 0, controlNodeSize: 0, jointNodeSize: 0, nitroNodeSize: 0,
    smoothing: 0.5, controlNodeSmoothing: 0.5, normalIndicatorSize: 0,
    arrowHeads2: 0, arrowHeads: 0, colorSmoothing: 0,
    atomRadius: 0.5, atomOpacity: 1, atomRangeStart: 0, atomRangeEnd: 100,
    bondOpacity: 1, bondRadius: 0.9, bondHalfColor: 0.5, bondLightness: 0.5, bondRingPink: 0,
  },
  'All Atoms': {
    width: 0, thickness: 0, nodeScale: 0, controlNodeSize: 0, jointNodeSize: 0, nitroNodeSize: 0,
    smoothing: 0.5, controlNodeSmoothing: 0.5, normalIndicatorSize: 0,
    arrowHeads2: 0, arrowHeads: 0, colorSmoothing: 0,
    atomRadius: 1.5, atomOpacity: 1, atomRangeStart: 0, atomRangeEnd: 100,
    bondOpacity: 0, bondRadius: 1, bondHalfColor: 0.5, bondLightness: 0.5, bondRingPink: 0,
  },
  'Translucence': {
    width: 0.35, thickness: 0.15, nodeScale: 0, controlNodeSize: 0, jointNodeSize: 0, nitroNodeSize: 0,
    smoothing: 0.5, controlNodeSmoothing: 0.5, normalIndicatorSize: 0,
    arrowHeads2: 0, arrowHeads: 0.5, colorSmoothing: 0,
    atomRadius: 1.2, atomOpacity: 0.3, atomRangeStart: 0, atomRangeEnd: 100,
    bondOpacity: 0, bondRadius: 1, bondHalfColor: 0.5, bondLightness: 0.5, bondRingPink: 0,
  },
  'Bendix': {
    width: 0.4, thickness: 0.10, nodeScale: 0.5, controlNodeSize: 0, jointNodeSize: 0, nitroNodeSize: 0,
    smoothing: 0.8, controlNodeSmoothing: 0.8, normalIndicatorSize: 0,
    arrowHeads2: 0, arrowHeads: 0, colorSmoothing: 0,
    atomOpacity: 0, bondOpacity: 0, bondRadius: 1, bondHalfColor: 0.5, bondLightness: 0.5, bondRingPink: 1,
  },
  'Smoothed': {
    width: 0.35, thickness: 0.15, nodeScale: 0.5, controlNodeSize: 0.5, jointNodeSize: 0, nitroNodeSize: 0.5,
    smoothing: 0.5, controlNodeSmoothing: 0.5, normalIndicatorSize: 0,
    arrowHeads2: 0, arrowHeads: 0, colorSmoothing: 0,
    atomOpacity: 0, bondOpacity: 0, bondRadius: 1, bondHalfColor: 0.5, bondLightness: 0.5, bondRingPink: 0,
  },
  'bright':    { mainLight: 3, fillLight: 1.5, backLight: 1 },
  'spotlight': { mainLight: 3, fillLight: 0.1, backLight: 0.1 },
};

const DEFAULT_PARAMS = {
  width: 0.34, thickness: 0.08, ribbonFade: 0, sidechainFade: 0,
  nodeScale: 0.5, controlNodeSize: 0, jointNodeSize: 0, nitroNodeSize: 0, nitroPos: 0.66,
  smoothing: 0, controlNodeSmoothing: 0, normalIndicatorSize: 0,
  arrowHeads: 0.5, arrowHeads2: 0, colorSmoothing: 0,
  atomRadius: 0.3, atomLightness: 0.5, atomOpacity: 1, atomRangeStart: 0, atomRangeEnd: 100,
  bondOpacity: 0, bondRadius: 1, bondHalfColor: 0.5, bondLightness: 0.5, bondRingPink: 0,
  bondColorByAminoAcid: 0,
  hydrophobicity: 0, charge: 0, size: 0, aromatics: 0,
  small: 0, hydroxyl: 0, hydrophobic: 0, negative: 0, polar: 0, aliphatic: 0,
  positive: 0, large: 0, sulfur: 0, aromatic: 0,
  mainLight: 3, fillLight: 1.5, backLight: 1,
  ortho: 0,
};

// ── Helpers ──────────────────────────────────────────────────

function resolveElement(el) {
  if (typeof el === 'string') el = document.querySelector(el);
  if (!el) throw new Error('Molam: element not found');
  return el;
}

// ── Internal AST builders ────────────────────────────────────





function buildRootAst(controlPoints, controlPointRolls) {
  return buildThreeRoot(buildDemoScene(controlPoints, controlPointRolls));
}

function buildDemoScene(controlPoints, controlPointRolls) {
  const ground = makeGroundPlane();
  const ribbon = makeRibbon('ribbon', 0x4fc3f7);
  ribbon.inst.setData(controlPoints, controlPointRolls, null);
  const scene = new MiniAstNode('scene', [ground, ribbon]);
  scene.inst = new SceneNode3D();
  return scene;
}


function replaceScene(root, ctxMix, newSceneNode) {
  const threeSceneInst = root.inst;
  const oldSceneNode = root.subtree[2];

  if (oldSceneNode.inst?.group) {
    threeSceneInst.scene.remove(oldSceneNode.inst.group);
  }
  sceneRegistry.runPhases(ctxMix, oldSceneNode, {}, ['teardown']);

  root.subtree[2] = newSceneNode;
  sceneRegistry.runPhases(ctxMix, newSceneNode, {}, ['build']);

  if (newSceneNode.inst.group) {
    threeSceneInst.scene.add(newSceneNode.inst.group);
  }
}

// ── Positional accessors ─────────────────────────────────────

function getCamera(root)     { return root.subtree[0].inst; }
function getThreeScene(root) { return root.inst; }

function collectDraggables(root) {
  const sceneNode = root.subtree[2];
  const all = [];
  for (const child of sceneNode.subtree) {
    if (child.inst?.getDraggables) all.push(...child.inst.getDraggables());
  }
  return all;
}

// ── Widget ───────────────────────────────────────────────────

class MolamWidget {

  /**
   * @param {string|HTMLElement} el — CSS selector or DOM element (div)
   * @param {Object} [opts]
   * @param {string} [opts.preset]        – initial preset name
   * @param {Object} [opts.params]        – initial param overrides
   * @param {number} [opts.morphDuration] – ms for animated transitions
   * @param {Animator} [opts.animator]    – frame loop to share (default: its own)
   */
  /**
   * @param {string|HTMLElement} el — CSS selector or DOM element (div)
   * @param {Object} [opts]
   * @param {HTMLElement} [opts.container] – outer container for sizing (defaults to el's parent)
   * @param {string} [opts.preset]        – initial preset name
   * @param {Object} [opts.params]        – initial param overrides
   * @param {number} [opts.morphDuration] – ms for animated transitions
   * @param {Animator} [opts.animator]    – frame loop to share (default: its own)
   */
  constructor(el, opts = {}) {
    const host = resolveElement(el);
    this._container = opts.container || host.parentElement || host;
    this._destroyed = false;
    this._listeners = {};

    // ── Demo state ───────────────────────────────────────────
    this._controlPoints = DEFAULT_CONTROL_POINTS.map(
      p => new THREE.Vector3(p[0], p[1], p[2])
    );
    this._controlPointRolls = Array(DEFAULT_CONTROL_POINTS.length).fill(0);

    // ── Protein state ────────────────────────────────────────
    this._chains            = null;
    this._currentProteinId  = null;
    this._currentProteinType = null;
    this._modelScale        = 1;
    this._normalizedAtoms   = [];
    this._referenceAxis     = null;
    this._axisLine          = null;

    // ── AST ──────────────────────────────────────────────────
    this._rootNode = buildRootAst(this._controlPoints, this._controlPointRolls);
    this._ctxMix   = { THREE, container: this._container };

    sceneRegistry.runPhases(this._ctxMix, this._rootNode, {}, ['build']);

    // ── Frame loop: shared by preset morphs and the render (orbit damping) ──
    this._animator = opts.animator || new Animator();

    // ── Param engine ─────────────────────────────────────────
    this._engine = new OmniParamEngine({
      params:  { ...DEFAULT_PARAMS, ...opts.params },
      presets: PRESETS,
      onUpdate: () => this._update(),
      morphDuration: opts.morphDuration,
      animator: this._animator,
    });

    if (opts.preset && PRESETS[opts.preset]) {
      this._engine.setPreset(opts.preset, false);
    }

    // ── Resize observer ──────────────────────────────────────
    this._resizeObserver = new ResizeObserver(() => {
      sceneRegistry.runPhases(this._ctxMix, this._rootNode, {}, ['resize']);
      // Render immediately after resize to avoid a blank frame
      const tsi = getThreeScene(this._rootNode);
      const cam = getCamera(this._rootNode);
      if (tsi?.renderer && tsi?.scene && cam?.camera) {
        tsi.renderer.render(tsi.scene, cam.camera);
      }
    });
    this._resizeObserver.observe(this._container);

    // ── Drag interaction ─────────────────────────────────────
    const cameraInst = getCamera(this._rootNode);
    ThreeSceneNode.setupDrag(this._ctxMix.canvas, cameraInst.camera, cameraInst.controls, {
      getDraggables: () => collectDraggables(this._rootNode),
      getParams:     () => this._engine.getParams(),
      onDirty:       () => this._update(),
    });

    // ── Depth sort on camera change ──────────────────────────
    cameraInst.controls.addEventListener('change', () => {
      const sceneNode = this._rootNode.subtree[2];
      for (const child of sceneNode.subtree) {
        if (child.inst?.sortInstances) child.inst.sortInstances(cameraInst.camera);
      }
    });

    // ── Animation loop (OrbitControls damping + render) ──────
    // Every frame, as before.  The render is deferred to the end of the
    // frame, so a preset morph stepping in the same frame is drawn at once.
    const threeSceneInst = getThreeScene(this._rootNode);
    const render = () => threeSceneInst.renderer.render(threeSceneInst.scene, cameraInst.camera);
    this._animator.add(this, () => {
      if (this._destroyed) return false;
      cameraInst.controls.update();
      this._animator.defer(render);
      return true;
    });

    // ── Initial update ───────────────────────────────────────
    this._update();
  }

  // ── Chained public API ─────────────────────────────────────

  /**
   * Switch to a named preset (animated by default).
   * @param {string} name
   * @param {boolean} [animate=true]
   * @returns {this}
   */
  preset(name, animate = true) {
    if (!PRESETS[name]) {
      console.warn(`Molam: unknown preset "${name}"`);
      return this;
    }
    this._engine.setPreset(name, animate);
    return this;
  }

  /**
   * Merge param overrides.
   * @param {Object} overrides
   * @returns {this}
   */
  params(overrides) {
    this._engine.setParams(overrides);
    return this;
  }

  /** Read current param snapshot (non-chainable). */
  getParams() { return this._engine.getParams(); }

  /** Currently active preset name, or null. */
  get activePreset() { return this._engine.activePreset; }

  /**
   * Register an event listener.
   * Supported: 'loaded', 'update', 'error'
   * @returns {this}
   */
  on(event, callback) {
    (this._listeners[event] ||= []).push(callback);
    return this;
  }

  /** Remove an event listener. @returns {this} */
  off(event, callback) {
    const arr = this._listeners[event];
    if (arr) this._listeners[event] = arr.filter(fn => fn !== callback);
    return this;
  }

  /** Register a custom preset. @returns {this} */
  addPreset(name, paramValues) {
    PRESETS[name] = paramValues;
    this._engine.presets[name] = paramValues;
    return this;
  }

  // ── Protein loading ────────────────────────────────────────

  /**
   * Load a protein by ID from RCSB / AlphaFold.
   * @param {string} proteinId
   * @param {string} [type='pdb'] — 'pdb' | 'mmcif' | 'bmcif' | 'af'
   * @returns {Promise<{success, totalResidues, chainIds, totalAtoms}>}
   */
  async loadProtein(proteinId, type = 'pdb') {
    try {
      let fetchUrl, parseMethod, responseType, labelType;

      if (type === 'af') {
        fetchUrl     = `https://alphafold.ebi.ac.uk/files/AF-${proteinId}-F1-model_v6.cif`;
        parseMethod  = (c) => MmCifParser.parse(c, true);
        responseType = 'text';
        labelType    = 'AlphaFold mmCIF';
      } else if (type === 'bmcif') {
        fetchUrl     = `https://models.rcsb.org/${proteinId}.bcif`;
        parseMethod  = (c) => BmCifParser.parse(new Uint8Array(c), true);
        responseType = 'arrayBuffer';
        labelType    = 'RCSB BinaryCIF';
      } else {
        const ext    = type === 'mmcif' ? 'cif' : 'pdb';
        fetchUrl     = `https://files.rcsb.org/download/${proteinId}.${ext}`;
        parseMethod  = (c) => type === 'mmcif' ? MmCifParser.parse(c, true) : PDBParser.parse(c, true);
        responseType = 'text';
        labelType    = type === 'mmcif' ? 'RCSB mmCIF' : 'RCSB PDB';
      }

      this._emit('status', `Fetching ${labelType} structure...`);
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const fileContent = await response[responseType]();
      this._emit('status', `Parsing ${labelType} file...`);
      const structure = parseMethod(fileContent);

      return this._processStructure(structure, proteinId, type, labelType);
    } catch (error) {
      console.error(`Error loading ${proteinId}:`, error);
      this._emit('error', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Load a local file (PDB, mmCIF, BinaryCIF).
   * @param {File} file
   * @returns {Promise<{success, totalResidues, chainIds, totalAtoms}>}
   */
  async loadFile(file) {
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let structure, labelType, type;

      if (ext === 'bcif') {
        structure = BmCifParser.parse(new Uint8Array(await file.arrayBuffer()), true);
        labelType = 'BinaryCIF'; type = 'bmcif';
      } else if (ext === 'cif') {
        structure = MmCifParser.parse(await file.text(), true);
        labelType = 'mmCIF'; type = 'mmcif';
      } else if (ext === 'pdb' || ext === 'ent') {
        structure = PDBParser.parse(await file.text(), true);
        labelType = 'PDB'; type = 'pdb';
      } else {
        throw new Error(`Unsupported file extension: ${ext}`);
      }

      this._emit('status', `Parsing ${labelType} file...`);
      return this._processStructure(structure, file.name, type, labelType);
    } catch (error) {
      console.error(`Error loading file ${file.name}:`, error);
      this._emit('error', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reset to demo ribbon.
   * @returns {this}
   */
  demo() {
    this._chains            = null;
    this._currentProteinId  = null;
    this._currentProteinType = null;
    this._modelScale        = 1;
    this._normalizedAtoms   = [];

    this._controlPoints = DEFAULT_CONTROL_POINTS.map(
      p => new THREE.Vector3(p[0], p[1], p[2])
    );
    this._controlPointRolls = Array(DEFAULT_CONTROL_POINTS.length).fill(0);

    const newScene = buildDemoScene(this._controlPoints, this._controlPointRolls);
    replaceScene(this._rootNode, this._ctxMix, newScene);

    this._resetCamera();
    this._update();
    return this;
  }

  /**
   * Capture a high-res screenshot.
   * @param {number} [scale=2]
   * @param {string} [filename='molam-capture.png']
   */
  capture(scale = 2, filename = 'molam-capture.png') {
    const tsi = getThreeScene(this._rootNode);
    const cam = getCamera(this._rootNode);
    if (!this._capturer) {
      this._capturer = new Capturer(THREE, tsi.renderer, tsi.scene, cam.camera);
    }
    this._capturer.capture(scale, filename);
  }

  // ── Axis ───────────────────────────────────────────────────

  /** Set reference axis from current camera up vector. @returns {this} */
  setAxis() {
    const cam = getCamera(this._rootNode);
    if (!cam?.camera) return this;
    const up = new THREE.Vector3(0, 1, 0);
    up.transformDirection(cam.camera.matrixWorld).normalize();
    return this.setAxisFromVector(up);
  }

  /** Set reference axis from a vector. @returns {this} */
  setAxisFromVector(vector) {
    const tsi = getThreeScene(this._rootNode);
    if (!tsi?.scene) return this;

    this._referenceAxis = vector.clone();
    this._removeAxisLine();

    const halfLength = 20;
    const points = [
      vector.clone().multiplyScalar(-halfLength),
      vector.clone().multiplyScalar(halfLength),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 0x4fc3f7, linewidth: 1, scale: 1,
      dashSize: 0.5, gapSize: 0.5,
      transparent: true, opacity: 0.5,
    });
    this._axisLine = new THREE.LineSegments(geometry, material);
    this._axisLine.computeLineDistances();
    tsi.scene.add(this._axisLine);

    this._update();
    return this;
  }

  /** Clear reference axis. @returns {this} */
  clearAxis() {
    this._referenceAxis = null;
    this._removeAxisLine();
    this._update();
    return this;
  }

  // ── Demo control points ────────────────────────────────────

  /** Get/set control points for demo mode. */
  get controlPoints()     { return this._controlPoints; }
  get controlPointRolls() { return this._controlPointRolls; }

  /** Update demo control point count. @returns {this} */
  setControlPointCount(newCount) {
    const oldCount = this._controlPoints.length;

    if (newCount > oldCount) {
      for (let i = oldCount; i < newCount; i++) {
        const last = this._controlPoints[this._controlPoints.length - 1];
        const prev = this._controlPoints[this._controlPoints.length - 2];
        const dir = new THREE.Vector3().subVectors(last, prev).normalize();
        const pt = last.clone().addScaledVector(dir, 3);
        pt.y += (Math.random() - 0.5) * 2;
        pt.z += (Math.random() - 0.5) * 2;
        this._controlPoints.push(pt);
        this._controlPointRolls.push(0);
      }
    } else if (newCount < oldCount) {
      this._controlPoints.length = newCount;
      this._controlPointRolls.length = newCount;
    }

    const sceneNode = this._rootNode.subtree[2];
    for (const child of sceneNode.subtree) {
      if (child.inst?.markDirty) child.inst.markDirty();
    }
    return this;
  }

  // ── State save/restore (for app-level persistence) ─────────

  /** Serialize viewer state. */
  getState() {
    const cam = getCamera(this._rootNode);
    return {
      proteinId:   this._currentProteinId,
      proteinType: this._currentProteinType,
      controlPoints:     this._controlPoints.map(p => p.toArray()),
      controlPointRolls: [...this._controlPointRolls],
      cameraPosition:    cam.camera.position.toArray(),
      cameraTarget:      cam.controls.target.toArray(),
      referenceAxis:     this._referenceAxis?.toArray() || null,
      params:            this._engine.getParams(),
    };
  }

  /** Restore viewer state. @returns {this} */
  async restoreState(state) {
    if (state.params) this._engine.setParams(state.params);

    if (state.proteinId) {
      await this.loadProtein(state.proteinId, state.proteinType);
    } else {
      this.demo();
      if (state.controlPoints) {
        this._controlPoints = state.controlPoints.map(p => new THREE.Vector3().fromArray(p));
        this._controlPointRolls = state.controlPointRolls ? [...state.controlPointRolls] : [];
        const newScene = buildDemoScene(this._controlPoints, this._controlPointRolls);
        replaceScene(this._rootNode, this._ctxMix, newScene);
      }
    }

    if (state.referenceAxis) {
      this.setAxisFromVector(new THREE.Vector3().fromArray(state.referenceAxis));
    } else {
      this.clearAxis();
    }

    const cam = getCamera(this._rootNode);
    if (state.cameraPosition && state.cameraTarget) {
      cam.camera.position.fromArray(state.cameraPosition);
      cam.controls.target.fromArray(state.cameraTarget);
      cam.controls.update();
    }

    return this;
  }

  /** Tear down. */
  destroy() {
    this._destroyed = true;
    this._resizeObserver.disconnect();
    this._removeAxisLine();
    this._listeners = {};
  }

  // ── Accessors for app-level wiring ─────────────────────────

  /** The widget's frame loop; a host panel can share it (OmniControlPanel's animator option). */
  get animator() { return this._animator; }

  /** @internal */ get rootNode()  { return this._rootNode; }
  /** @internal */ get ctxMix()    { return this._ctxMix; }
  /** @internal */ get chains()    { return this._chains; }
  /** @internal */ get modelScale() { return this._modelScale; }
  /** @internal */ get normalizedAtoms() { return this._normalizedAtoms; }
  /** @internal */ get currentProteinId() { return this._currentProteinId; }
  /** @internal */ get currentProteinType() { return this._currentProteinType; }
  /** @internal */ get referenceAxis() { return this._referenceAxis; }

  // ── Internal ───────────────────────────────────────────────

  _update() {
    if (this._destroyed) return;
    const params = { ...this._engine.getParams() };
    if (this._referenceAxis) params.referenceAxis = this._referenceAxis;
    sceneRegistry.runPhases(this._ctxMix, this._rootNode, params, ['update']);
    this._emit('update', params);
  }

  _processStructure(structure, proteinId, type, labelType) {
    const chainsCoords = PDBParser.extractChainsCoords(structure, THREE);
    const chainIds = Array.from(chainsCoords.keys());
    if (chainIds.length === 0) throw new Error('Not enough backbone atoms found');

    const { chains: normalizedChains, scale, centroid } =
      PDBParser.normalizeChainsCoordinates(chainsCoords, THREE, 15);

    this._modelScale      = scale;
    this._normalizedAtoms = PDBParser.normalizeAllAtoms(structure.allAtoms, centroid, scale, THREE);
    this._chains          = new Map();
    this._currentProteinId   = proteinId;
    this._currentProteinType = type;

    let totalResidues = 0;
    for (const [chainId, coords] of normalizedChains) {
      this._chains.set(chainId, { points: coords });
      totalResidues += coords.length;
    }

    const newScene = buildProteinScene(normalizedChains, structure.chains, this._normalizedAtoms, scale);
    replaceScene(this._rootNode, this._ctxMix, newScene);

    this._resetCamera();
    this._update();

    const info = {
      success: true, totalResidues, chainIds,
      totalAtoms: structure.totalAllAtoms,
      title: structure.title, labelType,
    };
    this._emit('loaded', info);
    return info;
  }

  _resetCamera() {
    const cam = getCamera(this._rootNode);
    cam.controls.target.set(0, 0, 0);
    cam.controls.update();
  }

  _removeAxisLine() {
    if (!this._axisLine) return;
    const tsi = getThreeScene(this._rootNode);
    if (tsi?.scene) tsi.scene.remove(this._axisLine);
    this._axisLine.geometry.dispose();
    this._axisLine.material.dispose();
    this._axisLine = null;
  }

  _emit(event, ...args) {
    for (const fn of this._listeners[event] || []) {
      try { fn(...args); } catch (err) { console.error(`Molam ${event} listener error:`, err); }
    }
  }
}

// ── Factory ──────────────────────────────────────────────────

function Molam(el, opts) {
  return new MolamWidget(el, opts);
}

// ── Preset constants ─────────────────────────────────────────

Molam.STANDARD       = 'Standard';
Molam.SPRINGS        = 'Springs';
Molam.BEADS          = 'Beads';
Molam.BOOTLACE       = 'Bootlace';
Molam.CHUNKY         = 'Chunky';
Molam.STUBBY         = 'Stubby';
Molam.RESIDUE        = 'Residue';
Molam.ELECTRIC       = 'Electric';
Molam.SULFUR         = 'Sulfur';
Molam.BALL_AND_STICK = 'Ball and Stick';
Molam.ALL_ATOMS      = 'All Atoms';
Molam.TRANSLUCENCE   = 'Translucence';
Molam.BENDIX         = 'Bendix';
Molam.SMOOTHED       = 'Smoothed';

Molam.PRESETS = PRESETS;

export { Molam, MolamWidget };
// Auto-generated exports
if (typeof window !== 'undefined') window.CHAIN_COLORS = CHAIN_COLORS;
export { CHAIN_COLORS };
if (typeof window !== 'undefined') window.DEFAULT_CONTROL_POINTS = DEFAULT_CONTROL_POINTS;
export { DEFAULT_CONTROL_POINTS };
if (typeof window !== 'undefined') window.DEFAULT_PARAMS = DEFAULT_PARAMS;
export { DEFAULT_PARAMS };
if (typeof window !== 'undefined') window.PRESETS = PRESETS;
export { PRESETS };
if (typeof window !== 'undefined') window.buildDemoScene = buildDemoScene;
export { buildDemoScene };
if (typeof window !== 'undefined') window.buildProteinScene = buildProteinScene;
export { buildProteinScene };
if (typeof window !== 'undefined') window.buildRootAst = buildRootAst;
export { buildRootAst };
if (typeof window !== 'undefined') window.collectDraggables = collectDraggables;
export { collectDraggables };
if (typeof window !== 'undefined') window.getCamera = getCamera;
export { getCamera };
if (typeof window !== 'undefined') window.getThreeScene = getThreeScene;
export { getThreeScene };
if (typeof window !== 'undefined') window.makeAtoms = makeAtoms;
export { makeAtoms };
if (typeof window !== 'undefined') window.makeBonds = makeBonds;
export { makeBonds };
if (typeof window !== 'undefined') window.makeGroundPlane = makeGroundPlane;
export { makeGroundPlane };
if (typeof window !== 'undefined') window.makeRibbon = makeRibbon;
export { makeRibbon };
if (typeof window !== 'undefined') window.replaceScene = replaceScene;
export { replaceScene };
if (typeof window !== 'undefined') window.resolveElement = resolveElement;
export { resolveElement };
