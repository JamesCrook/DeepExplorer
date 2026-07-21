// ============================================================
// CPK ATOM DATA (Colors & Van der Waals Radii)
// ============================================================

const CPK_ATOM_DATA = {
  'H': { color: 0xFFFFFF, radius: 1.20, atomicNumber: 1 },   // Hydrogen - White
  'C': { color: 0x909090, radius: 1.70, atomicNumber: 6 },   // Carbon - Gray
  'N': { color: 0x3050F8, radius: 1.55, atomicNumber: 7 },   // Nitrogen - Blue
  'O': { color: 0xFF0D0D, radius: 1.52, atomicNumber: 8 },   // Oxygen - Red
  'F': { color: 0x90E050, radius: 1.47, atomicNumber: 9 },   // Fluorine - Green
  'P': { color: 0xFF8000, radius: 1.80, atomicNumber: 15 },  // Phosphorus - Orange
  'S': { color: 0xFFFF30, radius: 1.80, atomicNumber: 16 },  // Sulfur - Yellow
  'CL': { color: 0x1FF01F, radius: 1.75, atomicNumber: 17 }, // Chlorine - Green
  'CA': { color: 0x3DFF00, radius: 2.00, atomicNumber: 20 }, // Calcium - Green
  'FE': { color: 0xE06633, radius: 2.00, atomicNumber: 26 }, // Iron - Orange
  'BR': { color: 0xA62929, radius: 1.85, atomicNumber: 35 }, // Bromine - Dark Red
  'I': { color: 0x940094, radius: 1.98, atomicNumber: 53 },  // Iodine - Purple
  'DEFAULT': { color: 0xFF1493, radius: 1.70, atomicNumber: 6 } // Unknown - Pink
};

// ============================================================
// PDB PARSER CLASS
// ============================================================

class PDBParser {
  static parse(pdbContent, includeAllAtoms = false) {
    const lines = pdbContent.split('\n');
    const chains = new Map();
    const allAtoms = [];
    let title = '';

    for (const line of lines) {
      if (line.startsWith('TITLE')) {
        title += line.substring(10).trim() + ' ';
      }

      if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
        const isHetatm = line.startsWith('HETATM'); // Track if it's a HETATM
        const atom = this.parseAtomLine(line);
        if (!atom) continue;
        
        atom.isHetatm = isHetatm; // Store this on the atom object

        if (includeAllAtoms) {
          allAtoms.push(atom);
        }

        if (this.isBackboneAtom(atom)) {
          if (!chains.has(atom.chainId)) {
            chains.set(atom.chainId, []);
          }
          chains.get(atom.chainId).push(atom);
        }
      }
    }

    return {
      title: title.trim(),
      chains: chains,
      allAtoms: allAtoms,
      totalAtoms: Array.from(chains.values()).reduce((sum, c) => sum + c.length, 0),
      totalAllAtoms: allAtoms.length
    };
  }

  static parseAtomLine(line) {
    if (line.length < 54) return null;

    try {
      return {
        serial: parseInt(line.substring(6, 11).trim()),
        name: line.substring(12, 16).trim(),
        altLoc: line.substring(16, 17).trim(),
        resName: line.substring(17, 20).trim(),
        chainId: line.substring(21, 22).trim() || 'A',
        resSeq: parseInt(line.substring(22, 26).trim()),
        x: parseFloat(line.substring(30, 38).trim()),
        y: parseFloat(line.substring(38, 46).trim()),
        z: parseFloat(line.substring(46, 54).trim()),
        element: line.length >= 78 ? line.substring(76, 78).trim() : this.guessElement(line.substring(12, 16).trim())
      };
    } catch (e) {
      return null;
    }
  }

  static guessElement(atomName) {
    const clean = atomName.replace(/[0-9'"]/g, '').trim();
    if (clean.length === 0) return 'C';

    const firstChar = clean[0].toUpperCase();
    const firstTwo = clean.substring(0, 2).toUpperCase();

    if (CPK_ATOM_DATA[firstTwo]) return firstTwo;
    if (CPK_ATOM_DATA[firstChar]) return firstChar;

    return 'C';
  }

  static isBackboneAtom(atom) {
    // A backbone atom MUST be an 'ATOM' record, never a 'HETATM'
    return !atom.isHetatm && atom.name === 'CA' && (!atom.altLoc || atom.altLoc === 'A');
  }

  // --------------------------------------------------------
  // NEW: Secondary Structure Assignment Logic
  // --------------------------------------------------------
  static assignSecondaryStructure(structure, THREE) {
    const { chains } = structure;
    const structureMap = new Map(); // Key: atom.serial, Value: { type, id }
    
    // Constants for types
    const TYPE_HELIX = 'HELIX';
    const TYPE_SHEET = 'SHEET';
    const TYPE_LOOP = 'LOOP';


    // Helper to assign type to a chain segment
    const assignSegment = (startAtom, endAtom, type, id) => {
      for (let i = startAtom; i <= endAtom; i++) {
        // We need the actual atom object to get the serial. 
        // Since we iterate by index in the sorted array, we reconstruct the atom.
        // Note: The 'atoms' array passed here is the sorted backbone chain.
        const atom = chainAtoms[i];
        structureMap.set(atom.serial, { type, id });
      }
    };

    // Process each chain independently
    for (const [chainId, atoms] of chains) {
      if (atoms.length < 3) continue;

      // Sort by residue sequence
      const sortedAtoms = [...atoms].sort((a, b) => a.resSeq - b.resSeq);
      const n = sortedAtoms.length;
      
      for( let i =0; i< n;i++) {
        sortedAtoms[i].type == TYPE_LOOP;
      }

      // Simple DSSP-lite logic:
      for (let i = 0; i < n - 3; i++) {
        const a = sortedAtoms[i];
        const b = sortedAtoms[i+1];
        const c = sortedAtoms[i+2];
        const d = sortedAtoms[i+3];

        // If the vector from i to i+2 is roughly parallel to i+1 to i+3, it's a sheet.
        const v1 = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
        const v2 = new THREE.Vector3(c.x - b.x, c.y - b.y, c.z - b.z);

        const v3 = new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z);
        const v4 = new THREE.Vector3(d.x - b.x, d.y - b.y, d.z - b.z);
        
        const dot1 = v1.dot(v2);
        const dot2 = v3.dot(v4);
        const mag1 = v1.length();
        const mag2 = v2.length();
        const mag3 = v3.length();
        const mag4 = v4.length();
        
        let type = TYPE_LOOP
        if (mag1 > 0.001 && mag2 > 0.001 & mag3 > 0.001 && mag4 > 0.001) {
          const cosTheta1 = dot1 / (mag1 * mag2); // 1 step
          const cosTheta2 = dot2 / (mag3 * mag4); // 2 step
          if (cosTheta2 > 0.9 && cosTheta1 > 0.3) { // Very similar 2-step and 1-step direction
            type = TYPE_SHEET;
          } else if( cosTheta2 < 0.3 && cosTheta1 < 0.5) { // nearly orthogonal 2 step-direction
            type = TYPE_HELIX;
          }
        }
        if( type != TYPE_LOOP){
          sortedAtoms[i].type = type;
          sortedAtoms[i+3].type = type;
        }
        sortedAtoms[i+1].type = type;
        sortedAtoms[i+2].type = type;
      }      

      let currentStructureType = null;
      let currentStructureId = -1;
      for( let i =0; i< n;i++) {
        const type = sortedAtoms[i].type
        if (type != currentStructureType) {
          currentStructureType = type;
          currentStructureId++;
        }
        sortedAtoms[i].structureId = currentStructureId;
      }
    }
  }

  // --------------------------------------------------------
  // Helper for extraction
  // --------------------------------------------------------
  static extractChainsCoords(structure, THREE) {
    const chainsCoords = new Map();

    for (const [cId, atoms] of structure.chains) {
      atoms.sort((a, b) => a.resSeq - b.resSeq);
      const coords = atoms.map(atom => new THREE.Vector3(atom.x, atom.y, atom.z));
      if (coords.length >= 2) {
        chainsCoords.set(cId, coords);
      }
    }

    return chainsCoords;
  }

  // --------------------------------------------------------
  // Helper for normalization
  // --------------------------------------------------------
  static normalizeChainsCoordinates(chainsCoords, THREE, targetSize = 15) {
    const allPoints = [];
    for (const coords of chainsCoords.values()) {
      allPoints.push(...coords);
    }

    if (allPoints.length === 0) return { chains: chainsCoords, scale: 1, centroid: new THREE.Vector3() };

    const centroid = new THREE.Vector3();
    for (const p of allPoints) {
      centroid.add(p);
    }
    centroid.divideScalar(allPoints.length);

    let maxDist = 0;
    for (const p of allPoints) {
      const d = p.clone().sub(centroid).length();
      maxDist = Math.max(maxDist, d);
    }

    const scale = maxDist > 0 ? targetSize / (2 * maxDist) : 1;

    const normalizedChains = new Map();
    for (const [cId, coords] of chainsCoords) {
      const normalized = coords.map(p => p.clone().sub(centroid).multiplyScalar(scale));
      normalizedChains.set(cId, normalized);
    }

    return { chains: normalizedChains, scale, centroid };
  }

  // --------------------------------------------------------
  // Helper for atom normalization
  // --------------------------------------------------------
  static normalizeAllAtoms(allAtoms, centroid, scale, THREE) {
    return allAtoms.map(atom => ({
      ...atom,
      x: (atom.x - centroid.x) * scale,
      y: (atom.y - centroid.y) * scale,
      z: (atom.z - centroid.z) * scale
    }));
  }
}

export { PDBParser, CPK_ATOM_DATA };
