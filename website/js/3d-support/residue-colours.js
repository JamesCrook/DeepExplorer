/*
residue-colours.js — residue and bond colour tables, and the two per-residue
helpers both 3D worlds share.  Free of any THREE import: the functions take
THREE as an argument, so importing this file never forces three.js to load
(three-boot.js loads it lazily on Zones pages).

Moved out of molam-objects.js unchanged, so the Zones nodes can use the real
getResidueColor instead of a stub.
*/
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


function getResidueColor(atom, params, chainColor, THREE) {
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

export {
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
};
