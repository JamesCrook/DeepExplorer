/**
 * molam-scene.js — Molam scene definition for OmniScene
 *
 * Provides everything needed to run Molam inside OmniScene:
 *   - createMolamScene()  → scene-root with three-scene AST + layer.inst
 *   - PRESETS / DEFAULT_PARAMS
 *   - buildUI sections (protein selector, file drop, sliders)
 *   - Protein loading / file loading
 *   - Content factories (demo, protein)
 *
 * Does NOT import OmniSceneApp or Omni3d — it only uses the `app`
 * reference passed through _wrapBuildUI's custom-section signature
 * (groupEl, layer, app).
 *
 * Place in: apps/molam-scene.js
 */

import { MiniAstNode, SCENES, sceneRegistry } from '../omni-support/scene.js';
import * as THREE                     from 'three';

import { PDBParser }       from '../parsers/pdb-parser.js';
import { MmCifParser }     from '../parsers/mmcif-parser.js';
import { BmCifParser }     from '../parsers/bmcif-parser.js';

import { CameraNode }      from '../nodes3d/camera-node.js';
import { LightsNode }      from '../nodes3d/lights-node.js';
import { GroundPlaneNode }  from '../nodes3d/ground-plane-node.js';
import { MolamRibbonNode }  from '../nodes3d/molam-ribbon-node.js';
import { MolamBondNode }    from '../nodes3d/molam-bond-node.js';
import { SceneNode3D }      from '../nodes3d/scene-node-3d.js';
import { ThreeSceneNode }   from '../nodes3d/three-scene-node.js';
import { ImposterAtomNode } from '../nodes3d/imposter-atom-node.js';
import { Capturer }         from '../3d-support/three-capturer.js';


// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const CHAIN_COLORS = [
  0x4fc3f7, 0xff6b6b, 0x95e1d3, 0xf38181, 0xaa96da,
  0xfcbad3, 0xa8d8ea, 0xf9ed69, 0x6a0572, 0xf85f73,
];

const DEFAULT_CONTROL_POINTS = [
  [-6, 0, 0], [-3, 2, 2], [0, -1, -1], [3, 1, 2], [6, 0, 0],
];

const PROTEIN_OPTIONS = [
  { value: '',       label: '-- Select a protein --' },
  { value: '1GFL',   label: 'GFP (1GFL) — Green Fluorescent Protein' },
  { value: '1A3N',   label: 'Hemoglobin (1A3N)' },
  { value: '1CRN',   label: 'Crambin (1CRN) — Small protein' },
  { value: '1UBQ',   label: 'Ubiquitin (1UBQ)' },
  { value: '2PTC',   label: 'Trypsin (2PTC)' },
  { value: '1HHO',   label: 'Deoxy Hemoglobin (1HHO)' },
  { value: '4HHB',   label: 'Hemoglobin T-state (4HHB)' },
  { value: '1MBO',   label: 'Myoglobin (1MBO)' },
  { value: '2LZM',   label: 'Lysozyme (2LZM)' },
  { value: '1IGT',   label: 'Immunoglobulin (1IGT)' },
  { value: '1TIM',   label: 'Triose Phosphate Isomerase (1TIM)' },
  { value: '3CLN',   label: 'Calmodulin (3CLN)' },
  { value: 'Q5VSL9.af', label: 'STRIP1 (AlphaFold Q5VSL9)' },
  { value: 'P00519.af', label: 'ABL1 (AlphaFold P00519)' },
];


// ═══════════════════════════════════════════════════════
//  PRESETS + DEFAULT PARAMS
// ═══════════════════════════════════════════════════════

const PRESETS = {
  'Standard': {
    width: 0.34, thickness: 0.08, ribbonFade: 0, sidechainFade: 0,
    nodeScale: 0.5, controlNodeSize: 0, jointNodeSize: 0, nitroNodeSize: 0,
    smoothing: 0, controlNodeSmoothing: 0, normalIndicatorSize: 0,
    arrowHeads2: 0, arrowHeads: 0.5, colorSmoothing: 0,
    atomRadius: 0.0, atomOpacity: 1, atomRangeStart: 0, atomRangeEnd: 100,
    bondOpacity: 1, bondRadius: 0, bondHalfColor: 0.5, bondLightness: 0.5, bondRingPink: 0,
    bondColorByAminoAcid: 0,
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
  },
  'Stubby': {
    width: 0, thickness: 0, ribbonFade: 0, sidechainFade: 0,
    nodeScale: 0.5, controlNodeSize: 0, jointNodeSize: 0, nitroNodeSize: 0,
    smoothing: 0, controlNodeSmoothing: 0, normalIndicatorSize: 0,
    arrowHeads2: 0, arrowHeads: 0.5, colorSmoothing: 0,
    atomRadius: 0.75, atomOpacity: 1, atomRangeStart: 0, atomRangeEnd: 100,
    bondOpacity: 0, bondRadius: 2.75, bondHalfColor: 0, bondLightness: 0.5, bondRingPink: 0,
    bondColorByAminoAcid: 0,
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
  small: 0, hydroxyl: 0, hydrophobic: 0, negative: 0, polar: 0, aliphatic: 0,
  positive: 0, large: 0, sulfur: 0, aromatic: 0,
  mainLight: 3, fillLight: 1.5, backLight: 1,
  ortho: 0,
};


// ═══════════════════════════════════════════════════════
//  AST NODE FACTORIES
// ═══════════════════════════════════════════════════════

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

function makeAtoms() {
  const node = new MiniAstNode('imposter-atoms', [], {});
  node.inst = new ImposterAtomNode();
  return node;
}

function makeBonds() {
  const node = new MiniAstNode('molam-bonds', [], {});
  node.inst = new MolamBondNode();
  return node;
}


// ── Demo content (5-point ribbon) ───────────────────────

function buildDemoContent(state) {
  const points = state.controlPoints.map(
    p => new THREE.Vector3(p[0], p[1], p[2]));

  const ground = makeGroundPlane();
  const ribbon = makeRibbon('ribbon3d', 0x4fc3f7);
  ribbon.inst.setData(points, state.controlPointRolls, null);

  const scene = new MiniAstNode('scene', [ground, ribbon]);
  scene.inst = new SceneNode3D();
  return scene;
}


// ── Protein content (chains + atoms + bonds) ────────────

function buildProteinContent(normalizedChains, structureChains, normalizedAtoms, scale) {
  const children = [makeGroundPlane()];
  let chainIndex = 0;
  const chainColorMap = new Map();

  for (const [chainId, coords] of normalizedChains) {
    const color = CHAIN_COLORS[chainIndex % CHAIN_COLORS.length];
    chainColorMap.set(chainId, color);

    const chainAtoms = structureChains.get(chainId);
    const rolls      = new Array(coords.length).fill(0);
    const ribbon     = makeRibbon(`ribbon-${chainId}`, color);
    ribbon.inst.setData(coords, rolls, chainAtoms);
    children.push(ribbon);
    chainIndex++;
  }

  const imposters = makeAtoms();
  imposters.inst.setData(normalizedAtoms, scale, chainColorMap);
  children.push(imposters);

  const bonds = makeBonds();
  bonds.inst.setData(normalizedAtoms, scale, chainColorMap);
  children.push(bonds);

  const scene = new MiniAstNode('scene', children);
  scene.inst = new SceneNode3D();
  return scene;
}


// ── Three.js shell (camera + lights) ────────────────────

function buildThreeRoot(content) {
  const baseDistance = Math.sqrt(10 * 10 + 8 * 8 + 12 * 12);

  const camera = new MiniAstNode('camera', [], {
    fov: 60, near: 0.1, far: 1000,
    position: [10, 8, 12], baseDistance,
    zoomRange: [0.02, 20],
    enableDamping: true, dampingFactor: 0.05,
  });

  const lights = new MiniAstNode('lights', [], {
    ambient: { type: 'ambient',      color: 0x404040, intensity: 0.5 },
    main:    { type: 'directional',  color: 0xffffff, intensity: 1.2, position: [5, 15, 10],   param: 'mainLight' },
    fill:    { type: 'directional',  color: 0x4488ff, intensity: 0.5, position: [-10, 5, -5],  param: 'fillLight' },
    back:    { type: 'directional',  color: 0xffdddd, intensity: 1.2, position: [-5, -10, -10], param: 'backLight' },
  });

  const root  = new MiniAstNode('three-scene', [camera, lights, content], { background: 0x0f0f23 });
  root.inst   = new ThreeSceneNode();
  camera.inst = new CameraNode();
  lights.inst = new LightsNode();

  return root;
}


// ═══════════════════════════════════════════════════════
//  PROTEIN / FILE LOADING
// ═══════════════════════════════════════════════════════

function processStructure(state, structure, proteinId, type, labelType, app) {
  const chainsCoords = PDBParser.extractChainsCoords(structure, THREE);
  const chainIds     = Array.from(chainsCoords.keys());
  if (chainIds.length === 0) throw new Error('Not enough backbone atoms found');

  const { chains: normalizedChains, scale, centroid } =
    PDBParser.normalizeChainsCoordinates(chainsCoords, THREE, 15);

  state.modelScale      = scale;
  state.normalizedAtoms = PDBParser.normalizeAllAtoms(structure.allAtoms, centroid, scale, THREE);
  state.chains          = new Map();
  state.currentProteinId   = proteinId;
  state.currentProteinType = type;

  let totalResidues = 0;
  for (const [chainId, coords] of normalizedChains) {
    state.chains.set(chainId, { points: coords });
    totalResidues += coords.length;
  }

  const content = buildProteinContent(
    normalizedChains, structure.chains, state.normalizedAtoms, scale);

  const backend = app.activeBackend;
  backend.replaceContent(content);
  backend.resetCamera();
  backend.render(app.sceneLayer.value.params);

  const info = {
    totalResidues, chainIds,
    totalAtoms: structure.totalAllAtoms,
    title: structure.title, labelType,
  };
  displayProteinInfo(state, app, info);
  return { success: true, ...info };
}


async function loadProtein(state, value, app) {
  let proteinId = value, type = 'pdb';
  if (value.endsWith('.af'))   { type = 'af';    proteinId = value.replace('.af', ''); }
  else if (value.endsWith('.bcif')) { type = 'bmcif'; proteinId = value.replace('.bcif', ''); }
  else if (value.endsWith('.cif'))  { type = 'mmcif'; proteinId = value.replace('.cif', ''); }

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

    app.controls.setStatus(`Fetching ${labelType} structure...`);
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const fileContent = await response[responseType]();
    app.controls.setStatus(`Parsing ${labelType} file...`);
    const structure = parseMethod(fileContent);

    return processStructure(state, structure, proteinId, type, labelType, app);
  } catch (error) {
    console.error(`Error loading ${proteinId}:`, error);
    app.controls.setStatus(`Error: ${error.message}`, true);
    return { success: false, error: error.message };
  }
}


async function loadFile(state, file, app) {
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

    app.controls.setStatus(`Parsing ${labelType} file...`);
    return processStructure(state, structure, file.name, type, labelType, app);
  } catch (error) {
    console.error(`Error loading file ${file.name}:`, error);
    app.controls.setStatus(`Error: ${error.message}`, true);
    return { success: false, error: error.message };
  }
}


function resetToDemo(state, app) {
  state.chains            = null;
  state.currentProteinId  = null;
  state.currentProteinType = null;
  state.normalizedAtoms   = [];
  state.controlPoints     = DEFAULT_CONTROL_POINTS.map(p => [...p]);
  state.controlPointRolls = Array(DEFAULT_CONTROL_POINTS.length).fill(0);

  const content = buildDemoContent(state);
  const backend = app.activeBackend;
  backend.replaceContent(content);
  backend.resetCamera();
  backend.render(app.sceneLayer.value.params);

  app.controls.clearInfo();
  app.controls.clearStatus();
}


function displayProteinInfo(state, app, info) {
  let id = state.currentProteinId || '';
  if (id.length > 50) id = id.substring(0, 47) + '...';

  const chainInfo = info.chainIds
    ?.map(cId => `${cId}: ${state.chains.get(cId).points.length}`)
    .join(', ') || '';

  app.controls.setInfo(
    `<strong>${info.labelType} ID: ${id}</strong><br>` +
    `Chains: ${info.chainIds.join(', ')} (${info.chainIds.length} separate)<br>` +
    `Residues per chain: ${chainInfo}<br>` +
    `Total residues: ${info.totalResidues}<br>` +
    `Total atoms: ${info.totalAtoms}<br>` +
    (info.title ? `<br>${info.title}` : '')
  );

  app.controls.setStatus(
    `${id} loaded! (${info.chainIds.length} chain${info.chainIds.length > 1 ? 's' : ''}, ${info.totalAtoms} atoms)`
  );
}


// ═══════════════════════════════════════════════════════
//  BUILD UI
// ═══════════════════════════════════════════════════════

function molamBuildUI(layer, state) {
  return [
    ...sectionLoadProtein(state),
    ...sectionLoadFile(state),
    ...sectionProteinInfo(state),
    ...sectionMain(),
    ...sectionRibbon(),
    ...sectionRibbonNodes(),
    ...sectionRibbonColors(),
    ...sectionAtoms(),
    ...sectionBonds(),
    ...sectionAxisFilter(),
    ...sectionDisplay(),
    ...sectionLighting(),
  ];
}


// ── Load protein (select) ───────────────────────────────

function sectionLoadProtein(state) {
  return [{
    group: 'Load Protein', id: 'load', abbrev: 'Load',
    type: 'custom',
    build: (groupEl, layer, app) => {
      const sel = document.createElement('select');
      sel.id = 'proteinSelector';
      sel.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0f0f23;color:#ccc;font-size:12px;';

      for (const opt of PROTEIN_OPTIONS) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      }

      sel.addEventListener('change', async () => {
        const value = sel.value;
        if (value) {
          await loadProtein(state, value, app);
        } else {
          resetToDemo(state, app);
        }
      });

      groupEl.appendChild(sel);
    },
  }];
}


// ── Load data file (file drop) ──────────────────────────

function sectionLoadFile(state) {
  return [{
    group: 'Load Data', id: 'loadDataDrop', abbrev: 'File',
    type: 'custom',
    build: (groupEl, layer, app) => {
      const drop = document.createElement('div');
      drop.className = 'file-drop';
      drop.innerHTML = '<div class="file-drop-icon">🧬</div><div>Drop PDB, mmCIF or BinaryCIF file</div>';

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdb,.ent,.cif,.bcif';
      input.style.display = 'none';

      drop.addEventListener('click', () => input.click());
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('dragover');
        if (e.dataTransfer.files[0]) loadFile(state, e.dataTransfer.files[0], app);
      });
      input.addEventListener('change', () => {
        if (input.files[0]) loadFile(state, input.files[0], app);
      });

      groupEl.appendChild(drop);
      groupEl.appendChild(input);
    },
  }];
}


// ── Protein info + action buttons ───────────────────────

function sectionProteinInfo(state) {
  return [{
    group: 'Protein Info', id: 'protein-info',
    type: 'custom',
    build: (groupEl, layer, app) => {
      // ── Buttons ──
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';

      const resetBtn = document.createElement('button');
      resetBtn.className = 'preset-btn';
      resetBtn.style.flex = '1';
      resetBtn.textContent = 'Reset';
      resetBtn.addEventListener('click', () => resetToDemo(state, app));

      const captureBtn = document.createElement('button');
      captureBtn.className = 'preset-btn';
      captureBtn.style.flex = '1';
      captureBtn.textContent = 'Capture Hi-Res';
      captureBtn.addEventListener('click', () => {
        const backend = app.activeBackend;
        const tsi = backend.threeScene;
        const cam = backend.camera;
        if (tsi?.renderer && tsi?.scene && cam?.camera) {
          new Capturer(THREE, tsi.renderer, tsi.scene, cam.camera).capture(2, 'molam-capture.png');
        }
      });

      row.appendChild(resetBtn);
      row.appendChild(captureBtn);
      groupEl.appendChild(row);

      // ── Status ──
      const statusEl = document.createElement('div');
      statusEl.className = 'status-message';
      statusEl.id = 'status';
      app.controls.statusEl = statusEl;
      groupEl.appendChild(statusEl);

      // ── Info panel ──
      const infoEl = document.createElement('div');
      infoEl.className = 'info-panel';
      infoEl.id = 'info';
      app.controls.infoEl = infoEl;
      groupEl.appendChild(infoEl);
    },
  }];
}


// ── Slider sections ─────────────────────────────────────

function sectionMain() {
  return [{ group: 'Main', id: 'main', abbrev: 'mn', sliders: [
    { id: 'width',      label: 'Ribbon Width',    min: 0, max: 1,  step: 0.01, default: 0.34 },
    { id: 'thickness',  label: 'Ribbon Thickness', min: 0, max: 1,  step: 0.01, default: 0.08 },
    { id: 'atomRadius', label: 'Atom Size',        min: 0, max: 4,  step: 0.01, default: 0.5  },
    { id: 'bondRadius', label: 'Bond Size',        min: 0, max: 5,  step: 0.01, default: 3.0  },
  ]}];
}

function sectionRibbon() {
  return [{ group: 'Ribbon', id: 'ribbon', abbrev: 'Rib', sliders: [
    { id: 'smoothing',            label: 'CA Smoothing',   min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'controlNodeSmoothing', label: 'Node Smoothing', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'arrowHeads',           label: 'Arrow Heads',    min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'arrowHeads2',          label: 'Arrow Heads 2',  min: 0, max: 1, step: 0.01, default: 0 },
  ]}];
}

function sectionRibbonNodes() {
  return [{ group: 'Ribbon Nodes', id: 'ribbon-nodes', abbrev: 'Rbn', sliders: [
    { id: 'normalIndicatorSize', label: 'Normal Indicators',    min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'nodeScale',           label: 'Node Scale',           min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'controlNodeSize',     label: 'Control Nodes (grey)', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'jointNodeSize',       label: 'Joint Nodes (green)',  min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'nitroNodeSize',       label: 'Nitro Nodes (blue)',   min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'nitroPos',            label: 'Nitro Position',       min: 0, max: 1, step: 0.01, default: 0.66 },
  ]}];
}

function sectionRibbonColors() {
  return [{ group: 'Ribbon Colors', id: 'ribbon-colors', abbrev: 'Clr', sliders: [
    { id: 'colorSmoothing', label: 'Color Smoothing', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'small',       label: 'Small',       min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'hydroxyl',    label: 'Hydroxyl',    min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'hydrophobic', label: 'Hydrophobic', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'negative',    label: 'Negative',    min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'polar',       label: 'Polar',       min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'aliphatic',   label: 'Aliphatic',   min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'positive',    label: 'Positive',    min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'large',       label: 'Large',       min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'sulfur',      label: 'Sulfur',      min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'aromatic',    label: 'Aromatic',    min: 0, max: 1, step: 0.01, default: 0 },
  ]}];
}

function sectionAtoms() {
  return [{ group: 'Atoms', id: 'atoms', abbrev: 'Atm', sliders: [
    { id: 'atomLightness',  label: 'Lightness', min: 0, max: 1,   step: 0.01, default: 0.5 },
    { id: 'atomOpacity',    label: 'Opacity',   min: 0, max: 1,   step: 0.01, default: 1 },
    { id: 'atomRangeStart', label: 'Start',     min: 0, max: 100, step: 1,    default: 0 },
    { id: 'atomRangeEnd',   label: 'End',       min: 0, max: 100, step: 1,    default: 100 },
  ]}];
}

function sectionBonds() {
  return [{ group: 'Bonds', id: 'bonds', abbrev: 'Bnd', sliders: [
    { id: 'bondHalfColor',        label: 'Half Color',    min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'bondColorByAminoAcid', label: 'By Amino Acid', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'bondLightness',        label: 'Lightness',     min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'bondRingPink',         label: 'Pink Rings',    min: 0, max: 1, step: 0.01, default: 0.5 },
  ]}];
}

function sectionAxisFilter() {
  return [{ group: 'Axis Filter', id: 'axis-filter', abbrev: 'Filt', sliders: [
    { id: 'ribbonFade',    label: 'Ribbon Threshold',    min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'sidechainFade', label: 'Sidechain Threshold', min: 0, max: 1, step: 0.01, default: 0 },
  ]}];
}

function sectionDisplay() {
  return [{ group: 'Display', id: 'display', abbrev: 'Dis', sliders: [
    { id: 'ortho', label: 'Ortho Morph', min: 0, max: 1, step: 0.005, default: 0 },
  ]}];
}

function sectionLighting() {
  return [{ group: 'Lighting', id: 'lighting', abbrev: 'Lit', sliders: [
    { id: 'mainLight', label: 'Main Light', min: 0, max: 5, step: 0.05, default: 2 },
    { id: 'fillLight', label: 'Fill Light', min: 0, max: 5, step: 0.05, default: 2 },
    { id: 'backLight', label: 'Back Light', min: 0, max: 5, step: 0.05, default: 2 },
  ]}];
}


// ═══════════════════════════════════════════════════════
//  SCENE FACTORY
// ═══════════════════════════════════════════════════════

function createMolamScene() {

  // ── Closure state (persists for the lifetime of this scene) ──
  const state = {
    controlPoints:     DEFAULT_CONTROL_POINTS.map(p => [...p]),
    controlPointRolls: Array(DEFAULT_CONTROL_POINTS.length).fill(0),
    chains:            null,
    currentProteinId:  null,
    currentProteinType: null,
    modelScale:        1,
    normalizedAtoms:   [],
  };

  // ── Build initial content ──
  const content   = buildDemoContent(state);
  const threeRoot = buildThreeRoot(content);

  // ── Layer ──
  const layer = new MiniAstNode('layer', [threeRoot], {
    name:    'Molam',
    visible: true,
    params:  { ...DEFAULT_PARAMS },
  });

  layer.inst = {
    buildUI: (layer) => molamBuildUI(layer, state),
    presets: PRESETS,
  };

  return new MiniAstNode('scene-root', [layer]);
}

SCENES.push(
  { id: 'molam', label: 'Protein Viewer', group: 'Molam',
    displayMode: '3d', hasLayers: false,
    create: createMolamScene },
);
