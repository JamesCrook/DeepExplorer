/**
 * cif-atom.js — one atom record from an mmCIF / BinaryCIF atom_site row.
 *
 * Shared by mmcif-parser.js and bmcif-parser.js, which had identical copies.
 */

import { PDBParser } from './pdb-parser.js';

function formatCifAtom(data) {
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

export { formatCifAtom };
