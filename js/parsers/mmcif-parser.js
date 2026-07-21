import { PDBParser } from './pdb-parser.js';

class MmCifParser {
  static parse(cifContent, includeAllAtoms = false) {
    const lines = cifContent.split('\n');
    const chains = new Map();
    const allAtoms = [];
    let title = '';

    // Extract title using regex
    const titleMatch = cifContent.match(/_struct\.title\s+((?:'[^']*')|(?:"[^"]*")|(?:;[^;]*;)|(?:\S+))/s);
    if (titleMatch) {
      let t = titleMatch[1].trim();
      if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
        t = t.substring(1, t.length - 1);
      } else if (t.startsWith(";") && t.endsWith(";")) {
        t = t.substring(1, t.length - 1);
      }
      title = t.replace(/\s+/g, ' ');
    }

    let parsingAtomSite = false;
    let atomSiteHeaders = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === 'loop_') {
        parsingAtomSite = false;
        atomSiteHeaders = [];
      } else if (trimmed.startsWith('_atom_site.')) {
        parsingAtomSite = true;
        atomSiteHeaders.push(trimmed.substring(11));
      } else if (parsingAtomSite && (trimmed.startsWith('ATOM') || trimmed.startsWith('HETATM'))) {
        // match non-whitespace strings OR strings enclosed in single or double quotes
        const parts = [];
        let match;
        const regex = /(?:[^\s"']+|"[^"]*"|'[^']*')/g;
        while ((match = regex.exec(trimmed)) !== null) {
          parts.push(match[0]);
        }

        if (parts.length === 0) continue;

        const atomData = {};
        for (let i = 0; i < Math.min(parts.length, atomSiteHeaders.length); i++) {
          let val = parts[i];
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
             val = val.substring(1, val.length - 1);
          }
          atomData[atomSiteHeaders[i]] = val;
        }

        const atom = this.formatAtom(atomData);
        if (!atom) continue;

        if (includeAllAtoms) {
          allAtoms.push(atom);
        }

        if (this.isBackboneAtom(atom)) {
          if (!chains.has(atom.chainId)) {
            chains.set(atom.chainId, []);
          }
          chains.get(atom.chainId).push(atom);
        }
      } else if (parsingAtomSite && trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('_')) {
        // End of atom_site loop
      } else if (parsingAtomSite && trimmed.startsWith('_')) {
        parsingAtomSite = false;
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

  static formatAtom(data) {
    try {
      const altLoc = data.label_alt_id === '.' || data.label_alt_id === '?' ? '' : data.label_alt_id;

      const seqId = parseInt(data.label_seq_id) || parseInt(data.auth_seq_id);
      if (isNaN(seqId)) return null;

      return {
        serial: parseInt(data.id),
        name: data.label_atom_id,
        altLoc: altLoc,
        resName: data.label_comp_id,
        chainId: data.label_asym_id || 'A',
        resSeq: seqId,
        x: parseFloat(data.Cartn_x),
        y: parseFloat(data.Cartn_y),
        z: parseFloat(data.Cartn_z),
        element: data.type_symbol || PDBParser.guessElement(data.label_atom_id)
      };
    } catch (e) {
      return null;
    }
  }

  static isBackboneAtom(atom) {
    return PDBParser.isBackboneAtom(atom);
  }

  static extractChainsCoords(structure, THREE) {
    return PDBParser.extractChainsCoords(structure, THREE);
  }

  static normalizeChainsCoordinates(chainsCoords, THREE, targetSize = 15) {
    return PDBParser.normalizeChainsCoordinates(chainsCoords, THREE, targetSize);
  }

  static normalizeAllAtoms(allAtoms, centroid, scale, THREE) {
    return PDBParser.normalizeAllAtoms(allAtoms, centroid, scale, THREE);
  }
}

export { MmCifParser };
