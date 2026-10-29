// AtomRenderer — Molam's atoms as one instanced mesh per element, CPK sizes, residue colour schemes
//
//import { OmniThreeScene } from '../omni-support/omni-three-scene.js';
import { ArcMath, LocalFrameComputer, BiarcSegment3D, RibbonGeometryBuilder,
Ribbon, RibbonUI, smoothPoints } from './ribbon3d.js';
import { CPK_ATOM_DATA } from '../parsers/pdb-parser.js';
import { MolamAtomMaterial } from './molam-atom-material.js';

// ============================================================

import {
  RESIDUE_COLORS,
  NEUTRAL_CHAIN_COLOR,
  RESIDUE_1L,
  standardColors,
  createScheme,
  SCHEME_SMALL,
  SCHEME_HYDROXYL,
  SCHEME_HYDROPHOBIC,
  SCHEME_NEGATIVE,
  SCHEME_POLAR,
  SCHEME_ALIPHATIC,
  SCHEME_POSITIVE,
  SCHEME_LARGE,
  SCHEME_SULFUR,
  SCHEME_AROMATIC,
  COLOR_SCHEMES,
  BOND_BLACK,
  BOND_WHITE,
  BOND_GREY,
  BOND_RING_PINK,
  colorFromStructure,
  getResidueColor,
  computeResidueTangents,
} from './residue-colours.js';
import { BondRenderer } from './bond-renderer.js';


// ============================================================
// ATOM RENDERER CLASS
// ============================================================

class AtomRenderer {
  constructor(THREE, sceneManager) {
    this.THREE = THREE;
    this.sceneManager = sceneManager;
    this.instancedMeshes = new Map(); // element -> InstancedMesh
    this.atoms = [];
    this.totalAtomCount = 0;
    this.rangeStart = 0;
    this.rangeEnd = 1;
    this.opacity = 0;
    this.sidechainFade = 0;
    this.referenceAxis = null;
    this.residueTangents = new Map();
  }

  setFade(fade, referenceAxis) {
    this.sidechainFade = fade || 0;
    this.referenceAxis = referenceAxis;
    this.updateVisibility();
  }

  setAtoms(atoms, scale, chainColors) {
    this.chainColors = chainColors || new Map();
    this.clear();
    this.atoms = atoms;
    this.totalAtomCount = atoms.length;
    this.modelScale = scale;

    if (atoms.length === 0) return;

    // Group atoms by element
    const elementGroups = new Map();

    atoms.forEach((atom, index) => {
      const element = (atom.element || 'C').toUpperCase();
      if (!elementGroups.has(element)) {
        elementGroups.set(element, []);
      }
      elementGroups.get(element).push({ atom, index });
    });

    const THREE = this.THREE;
    this.residueTangents = computeResidueTangents(atoms, THREE);

    // Create InstancedMesh for each element

    for (const [element, atomList] of elementGroups) {
      const atomData = CPK_ATOM_DATA[element] || CPK_ATOM_DATA['DEFAULT'];

      // Store base radius for later scaling updates
      const mesh = this.createInstancedMeshForElement(element, atomList, atomData, 1.0);
      this.instancedMeshes.set(element, mesh);
    }

    this.updateVisibility();
  }

  createInstancedMeshForElement(element, atomList, atomData, atomRadius) {
    const THREE = this.THREE;

    // Base scale: Van der Waals radius * model scale * default multiplier * user scale
    // Increased from 0.1 to 0.35 for better visibility
    const radius = atomData.radius * this.modelScale * 0.35 * atomRadius;

    const geometry = new THREE.SphereGeometry(radius, 10, 10); // was 16 16
    
/*  
    const material = new THREE.MeshStandardMaterial({
      color: atomData.color,
      metalness: 0.3,
      roughness: 0.4,
      emissive: 0x331111,
      transparent: this.opacity < 1,
      opacity: this.opacity,
      side: THREE.FrontSide
    });
*/


    const material1 = new MolamAtomMaterial(atomData.color, this.opacity);

    const material = new THREE.MeshPhongMaterial({
      color: atomData.color,
      specular: 0x888888,
      shininess: 60.0,
      emissive: 0x404040,
      transparent: this.opacity < 1,
      opacity: this.opacity,
      side: THREE.FrontSide
    });

    const mesh = new THREE.InstancedMesh(geometry, material1, atomList.length);
    mesh.frustumCulled = false;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();

    atomList.forEach(({ atom, index: globalIndex }, localIndex) => {
      position.set(atom.x, atom.y, atom.z);
      matrix.setPosition(position);
      mesh.setMatrixAt(localIndex, matrix);
      let color = this.atomColor( i, atomData.color)      
      mesh.setColorAt(localIndex, color);

      // Store mapping for filtering
      if (!mesh.userData.indexMap) {
        mesh.userData.indexMap = [];
      }
      mesh.userData.indexMap.push(globalIndex);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    mesh.userData.element = element;
    mesh.userData.atomData = atomData;

    return mesh;
  }

  atomColor(atom, baseColor) {
    const THREE = this.THREE;
    let color;
    if( this.params.atomLightness < 0.5 )
      color = new THREE.Color(baseColor).lerp(new THREE.Color(BOND_BLACK), 1 - this.params.atomLightness * 2);
    else
      color = new THREE.Color(baseColor).lerp(new THREE.Color(BOND_WHITE), this.params.atomLightness * 2 -1);
/*
    if (this.params && this.params.atomColorByAminoAcid > 0 && atom) {
      const ribbonColor = getResidueColor(atom, this.params, NEUTRAL_CHAIN_COLOR, THREE);
      color.lerp(ribbonColor, this.params.atomColorByAminoAcid);
    }
*/
    return color;
  }

  updateColors(params) {
    const THREE = this.THREE;
    this.params = params;

    if (this.totalAtomCount === 0 || !this.instancedMeshes) return;

    for (const [element, mesh] of this.instancedMeshes) {
      const atomData = mesh.userData.atomData;
      const indexMap = mesh.userData.indexMap;

      for (let i = 0; i < indexMap.length; i++) {
        const globalIndex = indexMap[i];
        const atom = this.atoms[globalIndex];

        let color = this.atomColor( i, atomData.color)
        mesh.setColorAt(i, color);
      }

      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  updateatomRadius(atomRadius) {
    this.atomRadius = atomRadius;
    if (!this.modelScale || this.totalAtomCount === 0) return;

    const THREE = this.THREE;

    // Rebuild geometries with new scale
    for (const [element, mesh] of this.instancedMeshes) {
      const atomData = mesh.userData.atomData;
      const radius = atomData.radius * this.modelScale * 0.35 * atomRadius;

      // Dispose old geometry and create new one
      mesh.geometry.dispose();
      mesh.geometry = new THREE.SphereGeometry(radius, 16, 16);
    }

    this.updateVisibility();
  }

  setOpacity(opacity) {
    this.opacity = opacity;
    this.updateVisibility();
  }

  setRange(startPercent, endPercent) {
    this.rangeStart = Math.max(0, Math.min(1, startPercent / 100));
    this.rangeEnd = Math.max(0, Math.min(1, endPercent / 100));
    this.updateVisibility();
  }

  updateVisibility() {
    const THREE = this.THREE;

    // Remove all meshes from scene
    for (const mesh of this.instancedMeshes.values()) {
      this.sceneManager.remove(mesh);
    }

    // If opacity is 0, don't add anything
    if (this.opacity <= 0.02 || this.totalAtomCount === 0 || this.atomRadius <= 0.001) {
      return;
    }

    // Always use min to max (no BackSide rendering)
    const start = Math.min(this.rangeStart, this.rangeEnd);
    const end = Math.max(this.rangeStart, this.rangeEnd);

    const startIndex = Math.floor(start * this.totalAtomCount);
    const endIndex = Math.ceil(end * this.totalAtomCount);

    // Update each mesh
    for (const mesh of this.instancedMeshes.values()) {
      const indexMap = mesh.userData.indexMap;

      // CRITICAL: Restore ALL matrices, then hide out-of-range ones
      const dummy = new THREE.Object3D();
      const position = new THREE.Vector3();
      const matrix = new THREE.Matrix4();
      let visibleCount = 0;

      for (let i = 0; i < indexMap.length; i++) {
        const globalIndex = indexMap[i];
        const atom = this.atoms[globalIndex];
        const isInRange = globalIndex >= startIndex && globalIndex < endIndex;

        let dotVisible = true;
        const key = (atom.chainID || '') + '_' + atom.resSeq;
        if (this.referenceAxis && this.sidechainFade > 0 && this.residueTangents.has(key)) {
          const T = this.residueTangents.get(key);
          const dot = Math.abs(T.dot(this.referenceAxis));
          dotVisible = dot >= this.sidechainFade;
        }

        if (isInRange && dotVisible) {
          position.set(atom.x, atom.y, atom.z);
          matrix.setPosition(position);
          mesh.setMatrixAt(i, matrix);
          visibleCount++;
        } else {
          dummy.position.set(0, 0, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
      }

      mesh.instanceMatrix.needsUpdate = true;

      // almost opaque is opaque.
      let transparent = this.opacity < 0.98
      // replaces mesh.material.opacity = ...; mesh.material.transparent = ...;
      mesh.material.setOpacity(this.opacity);
      //mesh.material.opacity = transparent ? this.opacity : 1.0;
      //mesh.material.transparent = transparent; 
      mesh.material.side = THREE.FrontSide;
      mesh.material.needsUpdate = true;

      if (visibleCount > 0) {
        this.sceneManager.add(mesh);
      }
    }
  }

  clear() {
    for (const mesh of this.instancedMeshes.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.sceneManager.remove(mesh);
    }
    this.instancedMeshes.clear();
    this.atoms = [];
    this.totalAtomCount = 0;
  }
}

// ============================================================
// BOND RENDERER CLASS
// ============================================================

// BondRenderer lives in bond-renderer.js (shared with the Zones world); re-exported below.

export { AtomRenderer, BondRenderer };

// Auto-generated exports
if (typeof window !== 'undefined') window.BOND_BLACK = BOND_BLACK;
export { BOND_BLACK };
if (typeof window !== 'undefined') window.BOND_GREY = BOND_GREY;
export { BOND_GREY };
if (typeof window !== 'undefined') window.BOND_RING_PINK = BOND_RING_PINK;
export { BOND_RING_PINK };
if (typeof window !== 'undefined') window.BOND_WHITE = BOND_WHITE;
export { BOND_WHITE };
if (typeof window !== 'undefined') window.COLOR_SCHEMES = COLOR_SCHEMES;
export { COLOR_SCHEMES };
if (typeof window !== 'undefined') window.NEUTRAL_CHAIN_COLOR = NEUTRAL_CHAIN_COLOR;
export { NEUTRAL_CHAIN_COLOR };
if (typeof window !== 'undefined') window.RESIDUE_1L = RESIDUE_1L;
export { RESIDUE_1L };
if (typeof window !== 'undefined') window.RESIDUE_COLORS = RESIDUE_COLORS;
export { RESIDUE_COLORS };
if (typeof window !== 'undefined') window.SCHEME_ALIPHATIC = SCHEME_ALIPHATIC;
export { SCHEME_ALIPHATIC };
if (typeof window !== 'undefined') window.SCHEME_AROMATIC = SCHEME_AROMATIC;
export { SCHEME_AROMATIC };
if (typeof window !== 'undefined') window.SCHEME_HYDROPHOBIC = SCHEME_HYDROPHOBIC;
export { SCHEME_HYDROPHOBIC };
if (typeof window !== 'undefined') window.SCHEME_HYDROXYL = SCHEME_HYDROXYL;
export { SCHEME_HYDROXYL };
if (typeof window !== 'undefined') window.SCHEME_LARGE = SCHEME_LARGE;
export { SCHEME_LARGE };
if (typeof window !== 'undefined') window.SCHEME_NEGATIVE = SCHEME_NEGATIVE;
export { SCHEME_NEGATIVE };
if (typeof window !== 'undefined') window.SCHEME_POLAR = SCHEME_POLAR;
export { SCHEME_POLAR };
if (typeof window !== 'undefined') window.SCHEME_POSITIVE = SCHEME_POSITIVE;
export { SCHEME_POSITIVE };
if (typeof window !== 'undefined') window.SCHEME_SMALL = SCHEME_SMALL;
export { SCHEME_SMALL };
if (typeof window !== 'undefined') window.SCHEME_SULFUR = SCHEME_SULFUR;
export { SCHEME_SULFUR };
if (typeof window !== 'undefined') window.colorFromStructure = colorFromStructure;
export { colorFromStructure };
if (typeof window !== 'undefined') window.computeResidueTangents = computeResidueTangents;
export { computeResidueTangents };
if (typeof window !== 'undefined') window.createScheme = createScheme;
export { createScheme };
if (typeof window !== 'undefined') window.standardColors = standardColors;
export { standardColors };

// Re-exported for callers that import it from here (nodes3d/molam-ribbon-node.js)
export { getResidueColor };
