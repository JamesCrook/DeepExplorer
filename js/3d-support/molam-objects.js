//import { OmniThreeScene } from '../omni-support/omni-three-scene.js';
import { ArcMath, LocalFrameComputer, BiarcSegment3D, RibbonGeometryBuilder,
Ribbon, RibbonUI, smoothPoints } from './ribbon3d.js';
import { CPK_ATOM_DATA } from '../parsers/pdb-parser.js';
import { MolamAtomMaterial } from './molam-atom-material.js';

// ============================================================

const RESIDUE_COLORS = {
  'ALA': 0x8CFF8C,
  'ARG': 0x00007C,
  'ASN': 0xFF7C70,
  'ASP': 0xA00042,
  'CYS': 0xFFFF70,
  'GLN': 0xFF4C4C,
  'GLU': 0x660000,
  'GLY': 0xFFFFFF,
  'HIS': 0x7070FF,
  'ILE': 0x004C00,
  'LEU': 0x455E45,
  'LYS': 0x4747B8,
  'MET': 0xB8A042,
  'PHE': 0x534C52,
  'PRO': 0x525252,
  'SER': 0xFF7042,
  'THR': 0xB84C00,
  'TRP': 0x4F4600,
  'TYR': 0x8C704C,
  'VAL': 0xFF8CFF,
  'DEFAULT': 0xFF1493
};

const NEUTRAL_CHAIN_COLOR = 0x908882;

const RESIDUE_1L = {
  'ALA': 'A', 'ARG': 'R', 'ASN': 'N', 'ASP': 'D', 'CYS': 'C',
  'GLN': 'Q', 'GLU': 'E', 'GLY': 'G', 'HIS': 'H', 'ILE': 'I',
  'LEU': 'L', 'LYS': 'K', 'MET': 'M', 'PHE': 'F', 'PRO': 'P',
  'SER': 'S', 'THR': 'T', 'TRP': 'W', 'TYR': 'Y', 'VAL': 'V',
  'DEFAULT': 'X'
};

/** Keep this comment
 * The order of amino acids and the colour scheme is designed
 * to group by properties.
 * 
 * By many conventions:
 * Red/Blue for -ve / +ve
 * Yellow for sulfur
 * Greens for hydrophobic.
 * 
 * The remaining freedom gives us aromatic colouring that
 * Allows Histidine to be a blue and still in the aromatic group.
 * 
 * I've chosen a greeny yellow for Methionine to bring it in with 
 * VLI.
 * G and A are light with a very slight blusih tinge, to relate 
 * them to proline, but with ample distance from K/R/H
 * S/Q is probably the most infelicitious of the colour similarities
 */ 
const standardColors = {
  // ── Small ─────────────────────────────
  'G': 0xC9B3D0,
  'A': 0x9CABC7,
  // ── Hydroxyl (salmon) ─────────────────
  'S': 0xFF9419,
  'T': 0xFFB762,
  // ── Negative charge (red) ─────────────
  'D': 0xD73F31,
  'E': 0xFF534A,
  // ── Polar amide (brown) ───────────────
  'Q': 0xC58846,
  'N': 0xA1682A,
  // ── Aliphatic (greens, wide spread) ───
  'V': 0x228B22,
  'L': 0x18C61A,
  'I': 0x53D785,
  // ── Positive charge (cyan–blue) ───────
  'K': 0x3A93FF,
  'R': 0x22BBFF,
  // ── Sulfur (yellow) ───────────────────
  'M': 0xBAEE60,
  'C': 0xEEEE00,
  // ── Aromatic (pink → purple → blue) ───
  'F': 0xFF96CB,
  'Y': 0xD285E4,
  'W': 0xA556D3,
  'H': 0x7461DB,
  // ── Structural AND Aromatic ───────────
  'P': 0xDFAFFB,
  // ── Unknown ───────────────────────────
  'X': 0x666666,
};

const createScheme = (colors, residues) => {
  const result = {};
  for (const aa of Object.keys(colors)) {
    result[aa] = residues.includes(aa) ? colors[aa] : 0x000000;
  }
  return result;
};

const SCHEME_SMALL = createScheme(standardColors, "GA");
const SCHEME_HYDROXYL = createScheme(standardColors, "ST");
const SCHEME_HYDROPHOBIC = createScheme(standardColors, "AVLIMFWP");
const SCHEME_NEGATIVE = createScheme(standardColors, "DE");
const SCHEME_POLAR = createScheme(standardColors, "NQ");
const SCHEME_ALIPHATIC = createScheme(standardColors, "VLI");
const SCHEME_POSITIVE = createScheme(standardColors, "KRH");
const SCHEME_LARGE = createScheme(standardColors, "FYWRMHKEQ");
const SCHEME_SULFUR = createScheme(standardColors, "MC");
const SCHEME_AROMATIC = createScheme(standardColors, "FYWP");

const COLOR_SCHEMES = [
  { id: 'small', scheme: SCHEME_SMALL },
  { id: 'hydroxyl', scheme: SCHEME_HYDROXYL },
  { id: 'hydrophobic', scheme: SCHEME_HYDROPHOBIC },
  { id: 'negative', scheme: SCHEME_NEGATIVE },
  { id: 'polar', scheme: SCHEME_POLAR },
  { id: 'aliphatic', scheme: SCHEME_ALIPHATIC },
  { id: 'positive', scheme: SCHEME_POSITIVE },
  { id: 'large', scheme: SCHEME_LARGE },
  { id: 'sulfur', scheme: SCHEME_SULFUR },
  { id: 'aromatic', scheme: SCHEME_AROMATIC },
];



const BOND_BLACK = 0x000000;
const BOND_WHITE = 0xFFFFFF;

const BOND_GREY = 0xC0C0C0; // Lighter grey than carbon for blending
const BOND_RING_PINK = 0xFF1493; // Neon pink for ring bonds (trumps grey)



// ============================================================
// SHARED UTILITIES
// ============================================================



function colorFromStructure( atom, THREE ){
  // Define colors for types
  const colors = {
    HELIX: new THREE.Color(0xFF5555), // Red
    SHEET: new THREE.Color(0x55FF55), // Green
    LOOP:  new THREE.Color(0x5555FF)  // Blue
  };

  return colors[ atom.type ];
}


export function getResidueColor(atom, params, chainColor, THREE) {
  if (!atom) return new THREE.Color(chainColor);

  //if( atom.type )
  //  return colorFromStructure( atom, THREE );

  let sumWeights = 0;
  for (const { id } of COLOR_SCHEMES) {
    sumWeights += params[id] || 0;
  }

  const schemeColor = (c, weight) => {
    if (c != 0) 
      return [new THREE.Color(c), weight];
    return [new THREE.Color(chainColor), 0.01];
  };

  if (sumWeights > 0) {
    const res1L = RESIDUE_1L[atom.resName] || RESIDUE_1L['DEFAULT'];

    const finalColor = new THREE.Color(0x000000);
    let sumW = 0;

    for (const { id, scheme } of COLOR_SCHEMES) {
      const weight = params[id] || 0;
      const [color, w] = schemeColor(scheme[res1L], weight);
      finalColor.r += color.r * w;
      finalColor.g += color.g * w;
      finalColor.b += color.b * w;
      sumW += w;
    }

    finalColor.r /= sumW;
    finalColor.g /= sumW;
    finalColor.b /= sumW;
    return finalColor;
  } else {
    //const resColor = RESIDUE_COLORS[atom.resName] || RESIDUE_COLORS['DEFAULT'];
    const c = new THREE.Color(chainColor);
    //c.lerp(new THREE.Color(resColor), params.colorMode);
    return c;
  }
}

function computeResidueTangents(atoms, THREE) {

  const residueTangents = new Map();
  const residues = new Map(); // chainID + resSeq -> array of atoms
  atoms.forEach((atom) => {
    const key = (atom.chainID || '') + '_' + atom.resSeq;
    if (!residues.has(key)) {
      residues.set(key, []);
    }
    residues.get(key).push(atom);
  });

  for (const [key, resAtoms] of residues) {
    const caAtom = resAtoms.find(a => a.name === 'CA');
    if (caAtom) {
      // Find previous and next CA in same chain based on resSeq
      const [chainID, resSeqStr] = key.split('_');
      const resSeq = parseInt(resSeqStr, 10);

      const prevRes = residues.get(chainID + '_' + (resSeq - 1));
      const nextRes = residues.get(chainID + '_' + (resSeq + 1));

      const prevCA = prevRes ? prevRes.find(a => a.name === 'CA') : null;
      const nextCA = nextRes ? nextRes.find(a => a.name === 'CA') : null;

      let T;
      if (prevCA && nextCA) {
        T = new THREE.Vector3(nextCA.x - prevCA.x, nextCA.y - prevCA.y, nextCA.z - prevCA.z);
      } else if (prevCA) {
        T = new THREE.Vector3(caAtom.x - prevCA.x, caAtom.y - prevCA.y, caAtom.z - prevCA.z);
      } else if (nextCA) {
        T = new THREE.Vector3(nextCA.x - caAtom.x, nextCA.y - caAtom.y, nextCA.z - caAtom.z);
      } else {
        T = new THREE.Vector3(1, 0, 0);
      }
      T.normalize();
      residueTangents.set(key, T);
    }
  }
  return residueTangents;
}

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

class BondRenderer {
  constructor(THREE, sceneManager) {
    this.THREE = THREE;
    this.sceneManager = sceneManager;
    this.bonds = [];
    this.bondMesh = null;
    this.atoms = [];
    this.atomRangeStart = 0;
    this.atomRangeEnd = 1;
    this.totalAtomCount = 0;
    this.opacity = 0;
    this.radius = 0.1;
    this.halfColor = 0.5;
    this.bondLightness = 0;
    this.ringPink = 0;
    this.modelScale = 1;
    this.sidechainFade = 0;
    this.referenceAxis = null;
    this.residueTangents = new Map();

    // Reusable objects for transforms
    this._matrix = null;
    this._position = null;
    this._quaternion = null;
    this._scale = null;
    this._yAxis = null;
    this._hiddenMatrix = null;
  }

  _initTransformObjects() {
    const THREE = this.THREE;
    if (!this._matrix) {
      this._matrix = new THREE.Matrix4();
      this._position = new THREE.Vector3();
      this._quaternion = new THREE.Quaternion();
      this._scale = new THREE.Vector3();
      this._yAxis = new THREE.Vector3(0, 1, 0);

      const dummy = new THREE.Object3D();
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      this._hiddenMatrix = dummy.matrix.clone();
    }
  }

  setFade(fade, referenceAxis) {
    this.sidechainFade = fade || 0;
    this.referenceAxis = referenceAxis;
    this.updateVisibility();
  }

  detectAndSetBonds(atoms, scale, chainColors) {
    this.chainColors = chainColors || new Map();
    this.clear();
    this.atoms = atoms;
    this.totalAtomCount = atoms.length;
    this.modelScale = scale;

    if (atoms.length === 0) return;

    this.residueTangents = computeResidueTangents(atoms, this.THREE);

    this.bonds = this.detectBonds(atoms);
    console.log(`Detected ${this.bonds.length} bonds`);

    if (this.bonds.length > 0) {
      this.detectRings();
      const ringBondCount = this.bonds.filter(b => b.isRing).length;
      console.log(`Detected ${ringBondCount} ring bonds`);
      this.createBondGeometry();
    }
  }

  detectBonds(atoms) {
    const BOND_CUTOFF = 1.9;
    const CELL_SIZE = 2.0;
    const bonds = [];
    const grid = new Map();
    const scaledCellSize = CELL_SIZE * this.modelScale;

    atoms.forEach((atom, index) => {
      const cellX = Math.floor(atom.x / scaledCellSize);
      const cellY = Math.floor(atom.y / scaledCellSize);
      const cellZ = Math.floor(atom.z / scaledCellSize);
      const key = `${cellX},${cellY},${cellZ}`;

      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(index);
    });

    const scaledCutoffSq = Math.pow(BOND_CUTOFF * this.modelScale, 2);
    const checked = new Set();

    atoms.forEach((atom1, i) => {
      const cellX = Math.floor(atom1.x / scaledCellSize);
      const cellY = Math.floor(atom1.y / scaledCellSize);
      const cellZ = Math.floor(atom1.z / scaledCellSize);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const neighbors = grid.get(`${cellX + dx},${cellY + dy},${cellZ + dz}`);
            if (!neighbors) continue;

            for (const j of neighbors) {
              if (j <= i) continue;

              const pairKey = `${i},${j}`;
              if (checked.has(pairKey)) continue;
              checked.add(pairKey);

              const atom2 = atoms[j];
              if (atom1.element === 'H' || atom2.element === 'H') continue;

              const dx = atom2.x - atom1.x;
              const dy = atom2.y - atom1.y;
              const dz = atom2.z - atom1.z;
              const distSq = dx * dx + dy * dy + dz * dz;

              if (distSq <= scaledCutoffSq && distSq > 0.01) {
                bonds.push({
                  atomIndex1: i,
                  atomIndex2: j,
                  element1: atom1.element || 'C',
                  element2: atom2.element || 'C'
                });
              }
            }
          }
        }
      }
    });

    return bonds;
  }

  detectRings() {
    const adjacency = new Map();

    this.bonds.forEach((bond, bondIndex) => {
      const a1 = bond.atomIndex1;
      const a2 = bond.atomIndex2;

      if (!adjacency.has(a1)) adjacency.set(a1, []);
      if (!adjacency.has(a2)) adjacency.set(a2, []);

      adjacency.get(a1).push({ neighbor: a2, bondIndex });
      adjacency.get(a2).push({ neighbor: a1, bondIndex });
    });

    const ringBonds = new Set();

    this.bonds.forEach((bond, bondIndex) => {
      const start = bond.atomIndex1;
      const end = bond.atomIndex2;
      const queue = [{ atom: end, path: [end], bondPath: [] }];
      const visited = new Set([end]);

      while (queue.length > 0) {
        const { atom, path, bondPath } = queue.shift();

        if (atom === start && path.length >= 2) {
          if (path.length === 5 || path.length === 6) {
            ringBonds.add(bondIndex);
            bondPath.forEach(bi => ringBonds.add(bi));
          }
          break;
        }

        if (path.length > 6) continue;

        for (const { neighbor, bondIndex: bi } of (adjacency.get(atom) || [])) {
          if (bi === bondIndex || visited.has(neighbor)) continue;
          visited.add(neighbor);
          queue.push({ atom: neighbor, path: [...path, neighbor], bondPath: [...bondPath, bi] });
        }
      }
    });

    this.bonds.forEach((bond, index) => { bond.isRing = ringBonds.has(index); });
  }

  createBondGeometry() {
    if (this.bonds.length === 0) return;

    const THREE = this.THREE;
    const instanceCount = this.bonds.length * 2;

    const geometry = new THREE.CylinderGeometry(
      this.radius * this.modelScale * 0.1,
      this.radius * this.modelScale * 0.1,
      1.0, 8, 1, true
    );

/*
    const material = new THREE.MeshStandardMaterial({
      metalness: 0.3,
      roughness: 0.4,
      transparent: this.opacity < 1,
      opacity: this.opacity,
      side: THREE.FrontSide
    });
*/
    const material = new THREE.MeshPhongMaterial({
      shininess: 30,
      transparent: this.opacity < 1,
      opacity: this.opacity,
      side: THREE.FrontSide
    });

    this.bondMesh = new THREE.InstancedMesh(geometry, material, instanceCount);
    this.bondMesh.frustumCulled = false;
    this.bondMesh.userData.bonds = this.bonds;

    this._initTransformObjects();
    this.updateAllBondInstances();
  }

  bondColor(bond, baseColor, atom) {
    const THREE = this.THREE;
    let color = new THREE.Color(baseColor);

    if (this.params && this.params.bondColorByAminoAcid > 0 && atom) {
      const ribbonColor = getResidueColor(atom, this.params, NEUTRAL_CHAIN_COLOR, THREE);
      color.lerp(ribbonColor, this.params.bondColorByAminoAcid);
    }

    let lightness = this.params?.bondLightness ?? 0.5;
    if( lightness < 0.5 )
      color.lerp(new THREE.Color(BOND_BLACK), 1 - lightness * 2);
    else
      color.lerp(new THREE.Color(BOND_WHITE), lightness * 2 -1);

    let ringPink = this.params?.bondRingPink ?? 0;
    if (bond.isRing && ringPink > 0) {
      color.lerp(new THREE.Color(BOND_RING_PINK), ringPink);
    }

    return color;
  }

  // Core method: set transform and color for a single bond (two segments)
  setBondInstance(bondIndex, visible = true) {
    const THREE = this.THREE;
    const bond = this.bonds[bondIndex];
    const atom1 = this.atoms[bond.atomIndex1];
    const atom2 = this.atoms[bond.atomIndex2];

    let dotVisible = true;
    if (this.referenceAxis && this.sidechainFade > 0) {
      const t1 = this.residueTangents.get((atom1.chainID || '') + '_' + atom1.resSeq);
      const t2 = this.residueTangents.get((atom2.chainID || '') + '_' + atom2.resSeq);

      let dot = 1.0;
      if (t1 && t2) {
        dot = (Math.abs(t1.dot(this.referenceAxis)) + Math.abs(t2.dot(this.referenceAxis))) / 2;
      } else if (t1) {
        dot = Math.abs(t1.dot(this.referenceAxis));
      } else if (t2) {
        dot = Math.abs(t2.dot(this.referenceAxis));
      }
      dotVisible = dot >= this.sidechainFade;
    }

    if (!visible || !dotVisible) {
      this.bondMesh.setMatrixAt(bondIndex * 2, this._hiddenMatrix);
      this.bondMesh.setMatrixAt(bondIndex * 2 + 1, this._hiddenMatrix);
      return;
    }

    const start = new THREE.Vector3(atom1.x, atom1.y, atom1.z);
    const end = new THREE.Vector3(atom2.x, atom2.y, atom2.z);
    const direction = new THREE.Vector3().subVectors(end, start).normalize();

    this._quaternion.setFromUnitVectors(this._yAxis, direction);

    const data1 = CPK_ATOM_DATA[bond.element1.toUpperCase()] || CPK_ATOM_DATA['DEFAULT'];
    const data2 = CPK_ATOM_DATA[bond.element2.toUpperCase()] || CPK_ATOM_DATA['DEFAULT'];

    const isAtom1Lower = data1.atomicNumber <= data2.atomicNumber;
    const lowerData = isAtom1Lower ? data1 : data2;
    const higherData = isAtom1Lower ? data2 : data1;
    const lowerStart = isAtom1Lower ? start : end;
    const higherStart = isAtom1Lower ? end : start;

    const splitPoint = new THREE.Vector3().lerpVectors(lowerStart, higherStart, this.halfColor);

    // First segment (lower atomic number side)
    const length1 = lowerStart.distanceTo(splitPoint);
    this._position.lerpVectors(lowerStart, splitPoint, 0.5);
    this._scale.set(1, length1, 1);
    this._matrix.compose(this._position, this._quaternion, this._scale);
    this.bondMesh.setMatrixAt(bondIndex * 2, this._matrix);
    this.bondMesh.setColorAt(bondIndex * 2, this.bondColor(bond, lowerData.color, isAtom1Lower ? atom1 : atom2));

    // Second segment (higher atomic number side)
    const length2 = splitPoint.distanceTo(higherStart);
    this._position.lerpVectors(splitPoint, higherStart, 0.5);
    this._scale.set(1, length2, 1);
    this._matrix.compose(this._position, this._quaternion, this._scale);
    this.bondMesh.setMatrixAt(bondIndex * 2 + 1, this._matrix);
    this.bondMesh.setColorAt(bondIndex * 2 + 1, this.bondColor(bond, higherData.color, isAtom1Lower ? atom2 : atom1));
  }

  updateAllBondInstances() {
    if (!this.bondMesh || this.bonds.length === 0) return;

    for (let i = 0; i < this.bonds.length; i++) {
      this.setBondInstance(i, true);
    }

    this.bondMesh.instanceMatrix.needsUpdate = true;
    if (this.bondMesh.instanceColor) this.bondMesh.instanceColor.needsUpdate = true;
  }

  updateBondRadius(radius) {
    this.radius = radius;
    if (!this.bondMesh || this.bonds.length === 0) return;

    const THREE = this.THREE;
    this.bondMesh.geometry.dispose();
    this.bondMesh.geometry = new THREE.CylinderGeometry(
      radius * this.modelScale * 0.1,
      radius * this.modelScale * 0.1,
      1.0, 8, 1, true
    );

    this.updateVisibility();
  }

  setOpacity(opacity) { this.opacity = opacity; this.updateVisibility(); }
  setRadius(radius) { this.updateBondRadius(radius); }

  setHalfColor(halfColor) {
    this.halfColor = halfColor;
    if (this.bondMesh) { this.updateAllBondInstances(); this.updateVisibility(); }
  }

  setbondLightness(bondLightness) {
    this.bondLightness = bondLightness;
    if (this.bondMesh) { this.updateAllBondInstances(); this.updateVisibility(); }
  }

  setRingPink(ringPink) {
    this.ringPink = ringPink;
    if (this.bondMesh) { this.updateAllBondInstances(); this.updateVisibility(); }
  }

  setAtomRange(startPercent, endPercent) {
    this.atomRangeStart = Math.max(0, Math.min(1, startPercent / 100));
    this.atomRangeEnd = Math.max(0, Math.min(1, endPercent / 100));
    this.updateVisibility();
  }

  updateVisibility() {
    if (!this.bondMesh) return;

    this.sceneManager.remove(this.bondMesh);

    if (this.opacity <= 0 || this.bonds.length === 0) return;

    const start = Math.min(this.atomRangeStart, this.atomRangeEnd);
    const end = Math.max(this.atomRangeStart, this.atomRangeEnd);
    const startIndex = Math.floor(start * this.totalAtomCount);
    const endIndex = Math.ceil(end * this.totalAtomCount);

    let visibleCount = 0;

    for (let i = 0; i < this.bonds.length; i++) {
      const bond = this.bonds[i];
      const atom1InRange = bond.atomIndex1 >= startIndex && bond.atomIndex1 < endIndex;
      const atom2InRange = bond.atomIndex2 >= startIndex && bond.atomIndex2 < endIndex;
      const visible = atom1InRange && atom2InRange;

      this.setBondInstance(i, visible);
      if (visible) visibleCount++;
    }

    this.bondMesh.instanceMatrix.needsUpdate = true;
    if (this.bondMesh.instanceColor) this.bondMesh.instanceColor.needsUpdate = true;

    let transparent = this.opacity < 0.98
    this.bondMesh.material.opacity = transparent ? this.opacity : 1.0;
    this.bondMesh.material.transparent = transparent;
    this.bondMesh.material.needsUpdate = true;

    if (visibleCount > 0) this.sceneManager.add(this.bondMesh);
  }

  clear() {
    if (this.bondMesh) {
      this.bondMesh.geometry.dispose();
      this.bondMesh.material.dispose();
      this.sceneManager.remove(this.bondMesh);
      this.bondMesh = null;
    }
    this.bonds = [];
    this.atoms = [];
    this.totalAtomCount = 0;
  }
}

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
