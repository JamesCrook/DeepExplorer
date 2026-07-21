import { PDBParser } from './pdb-parser.js';

class BmCifParser {
  static decodeMessagePack(buffer) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let offset = 0;

    const textDecoder = new TextDecoder();

    function parse() {
      if (offset >= bytes.length) throw new Error('Unexpected end of buffer');
      const byte = bytes[offset++];

      if (byte <= 0x7f) return byte; // positive fixint
      if (byte >= 0xe0) return byte - 0x100; // negative fixint

      if (byte >= 0x80 && byte <= 0x8f) { // fixmap
        const len = byte & 0x0f;
        const map = {};
        for (let i = 0; i < len; i++) {
          const key = parse();
          const value = parse();
          map[key] = value;
        }
        return map;
      }

      if (byte >= 0x90 && byte <= 0x9f) { // fixarray
        const len = byte & 0x0f;
        const arr = new Array(len);
        for (let i = 0; i < len; i++) {
          arr[i] = parse();
        }
        return arr;
      }

      if (byte >= 0xa0 && byte <= 0xbf) { // fixstr
        const len = byte & 0x1f;
        const str = textDecoder.decode(bytes.subarray(offset, offset + len));
        offset += len;
        return str;
      }

      switch (byte) {
        case 0xc0: return null;
        case 0xc2: return false;
        case 0xc3: return true;
        case 0xc4: return parseBin(bytes[offset++]); // bin 8
        case 0xc5: { const l = view.getUint16(offset, false); offset += 2; return parseBin(l); } // bin 16
        case 0xc6: { const l = view.getUint32(offset, false); offset += 4; return parseBin(l); } // bin 32

        case 0xca: { const v = view.getFloat32(offset, false); offset += 4; return v; } // float 32
        case 0xcb: { const v = view.getFloat64(offset, false); offset += 8; return v; } // float 64

        case 0xcc: return bytes[offset++]; // uint 8
        case 0xcd: { const v = view.getUint16(offset, false); offset += 2; return v; } // uint 16
        case 0xce: { const v = view.getUint32(offset, false); offset += 4; return v; } // uint 32

        case 0xd0: { const v = view.getInt8(offset); offset += 1; return v; } // int 8
        case 0xd1: { const v = view.getInt16(offset, false); offset += 2; return v; } // int 16
        case 0xd2: { const v = view.getInt32(offset, false); offset += 4; return v; } // int 32

        case 0xd9: return parseStr(bytes[offset++]); // str 8
        case 0xda: { const l = view.getUint16(offset, false); offset += 2; return parseStr(l); } // str 16
        case 0xdb: { const l = view.getUint32(offset, false); offset += 4; return parseStr(l); } // str 32

        case 0xdc: { const l = view.getUint16(offset, false); offset += 2; return parseArray(l); } // array 16
        case 0xdd: { const l = view.getUint32(offset, false); offset += 4; return parseArray(l); } // array 32

        case 0xde: { const l = view.getUint16(offset, false); offset += 2; return parseMap(l); } // map 16
        case 0xdf: { const l = view.getUint32(offset, false); offset += 4; return parseMap(l); } // map 32

        default:
          throw new Error('Unimplemented type: 0x' + byte.toString(16));
      }
    }

    function parseBin(len) {
      const bin = bytes.subarray(offset, offset + len);
      offset += len;
      return bin;
    }

    function parseStr(len) {
      const str = textDecoder.decode(bytes.subarray(offset, offset + len));
      offset += len;
      return str;
    }

    function parseArray(len) {
      const arr = new Array(len);
      for (let i = 0; i < len; i++) arr[i] = parse();
      return arr;
    }

    function parseMap(len) {
      const map = {};
      for (let i = 0; i < len; i++) {
        map[parse()] = parse();
      }
      return map;
    }

    return parse();
  }

  static parse(cifBuffer, includeAllAtoms = false) {
    const parsed = this.decodeMessagePack(cifBuffer);
    const dataBlocks = parsed.dataBlocks;
    if (!dataBlocks || dataBlocks.length === 0) return null;

    const block = dataBlocks[0];
    const chains = new Map();
    const allAtoms = [];
    let title = '';

    const struct = block.categories.find(c => c.name === "_struct");
    if (struct) {
      const titleCol = struct.columns.find(c => c.name === "title");
      if (titleCol) {
        const titleArr = this.decodeArray(titleCol.data);
        if (titleArr && titleArr.length > 0) {
          title = titleArr[0] || '';
        }
      }
    }

    const atomSite = block.categories.find(c => c.name === "_atom_site");
    if (atomSite) {
      const cols = {};
      atomSite.columns.forEach(c => {
        cols[c.name] = this.decodeArray(c.data);
      });

      const rowCount = atomSite.rowCount;
      for (let i = 0; i < rowCount; i++) {
        const atomData = {
          id: cols.id ? cols.id[i] : undefined,
          label_atom_id: cols.label_atom_id ? cols.label_atom_id[i] : undefined,
          label_alt_id: cols.label_alt_id ? cols.label_alt_id[i] : undefined,
          label_comp_id: cols.label_comp_id ? cols.label_comp_id[i] : undefined,
          label_asym_id: cols.label_asym_id ? cols.label_asym_id[i] : undefined,
          label_seq_id: cols.label_seq_id ? cols.label_seq_id[i] : undefined,
          auth_seq_id: cols.auth_seq_id ? cols.auth_seq_id[i] : undefined,
          Cartn_x: cols.Cartn_x ? cols.Cartn_x[i] : undefined,
          Cartn_y: cols.Cartn_y ? cols.Cartn_y[i] : undefined,
          Cartn_z: cols.Cartn_z ? cols.Cartn_z[i] : undefined,
          type_symbol: cols.type_symbol ? cols.type_symbol[i] : undefined
        };

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

  static decodeArray(encodedData) {
    let current = encodedData.data;
    for (let i = encodedData.encoding.length - 1; i >= 0; i--) {
        current = this.decodeStep(current, encodedData.encoding[i]);
    }
    return current;
  }

  static decodeStep(data, encoding) {
    if (encoding.kind === 'ByteArray') {
        const type = encoding.type;
        const byteOffset = data.byteOffset;
        const byteLength = data.byteLength;
        let alignedBuffer = data.buffer;

        switch (type) {
            case 1: {
                if (byteOffset % 1 !== 0) alignedBuffer = data.buffer.slice(byteOffset, byteOffset + byteLength);
                return new Int8Array(alignedBuffer, byteOffset % 1 === 0 ? byteOffset : 0, byteLength);
            }
            case 2: {
                if (byteOffset % 2 !== 0) alignedBuffer = data.buffer.slice(byteOffset, byteOffset + byteLength);
                return new Int16Array(alignedBuffer, byteOffset % 2 === 0 ? byteOffset : 0, byteLength / 2);
            }
            case 3: {
                if (byteOffset % 4 !== 0) alignedBuffer = data.buffer.slice(byteOffset, byteOffset + byteLength);
                return new Int32Array(alignedBuffer, byteOffset % 4 === 0 ? byteOffset : 0, byteLength / 4);
            }
            case 4: {
                if (byteOffset % 1 !== 0) alignedBuffer = data.buffer.slice(byteOffset, byteOffset + byteLength);
                return new Uint8Array(alignedBuffer, byteOffset % 1 === 0 ? byteOffset : 0, byteLength);
            }
            case 5: {
                if (byteOffset % 2 !== 0) alignedBuffer = data.buffer.slice(byteOffset, byteOffset + byteLength);
                return new Uint16Array(alignedBuffer, byteOffset % 2 === 0 ? byteOffset : 0, byteLength / 2);
            }
            case 6: {
                if (byteOffset % 4 !== 0) alignedBuffer = data.buffer.slice(byteOffset, byteOffset + byteLength);
                return new Uint32Array(alignedBuffer, byteOffset % 4 === 0 ? byteOffset : 0, byteLength / 4);
            }
            case 32: {
                if (byteOffset % 4 !== 0) alignedBuffer = data.buffer.slice(byteOffset, byteOffset + byteLength);
                return new Float32Array(alignedBuffer, byteOffset % 4 === 0 ? byteOffset : 0, byteLength / 4);
            }
            case 33: {
                if (byteOffset % 8 !== 0) alignedBuffer = data.buffer.slice(byteOffset, byteOffset + byteLength);
                return new Float64Array(alignedBuffer, byteOffset % 8 === 0 ? byteOffset : 0, byteLength / 8);
            }
            default: throw new Error("Unknown ByteArray type: " + type);
        }
    } else if (encoding.kind === 'FixedPoint') {
        const n = data.length;
        const output = new Float32Array(n);
        const f = 1 / encoding.factor;
        for (let i = 0; i < n; i++) output[i] = f * data[i];
        return output;
    } else if (encoding.kind === 'RunLength') {
        let typeArr = new Int32Array(encoding.srcSize);
        let dataOffset = 0;
        for (let i = 0, il = data.length; i < il; i += 2) {
            const value = data[i];
            const length = data[i + 1];
            for (let j = 0; j < length; ++j) {
                typeArr[dataOffset++] = value;
            }
        }
        return typeArr;
    } else if (encoding.kind === 'Delta') {
        const n = data.length;
        const output = new Int32Array(n);
        if (!n) return data;
        output[0] = data[0] + (encoding.origin || 0);
        for (let i = 1; i < n; ++i) {
            output[i] = data[i] + output[i - 1];
        }
        return output;
    } else if (encoding.kind === 'IntegerPacking') {
        const isUnsigned = encoding.isUnsigned;
        const upperLimit = encoding.byteCount === 1 ? (isUnsigned ? 0xFF : 0x7F) : (isUnsigned ? 0xFFFF : 0x7FFF);
        const lowerLimit = isUnsigned ? 0 : -upperLimit - 1;
        const n = data.length;
        const output = new Int32Array(encoding.srcSize);
        let i = 0;
        let j = 0;
        while (i < n) {
            let value = 0, t = data[i];
            while (t === upperLimit || t === lowerLimit) {
                value += t;
                i++;
                t = data[i];
            }
            value += t;
            output[j] = value;
            i++;
            j++;
        }
        return output;
    } else if (encoding.kind === 'StringArray') {
        const offsets = this.decodeArray({ encoding: encoding.offsetEncoding, data: encoding.offsets });
        const indices = this.decodeArray({ encoding: encoding.dataEncoding, data });
        const str = encoding.stringData;
        const strings = new Array(offsets.length);

        let start = 0;
        for (let i = 0; i < offsets.length; i++) {
            strings[i] = str.substring(start, offsets[i]);
            start = offsets[i];
        }

        const result = new Array(indices.length);
        for (let i = 0, _i = indices.length; i < _i; i++) {
            const index = indices[i];
            result[i] = index >= 0 ? strings[index] : '';
        }
        return result;
    } else if (encoding.kind === 'IntervalQuantization') {
        const n = data.length;
        const output = new Float32Array(n);
        const delta = (encoding.max - encoding.min) / (encoding.numSteps - 1);
        const min = encoding.min;
        for (let i = 0; i < n; i++) {
            output[i] = min + delta * data[i];
        }
        return output;
    }
    throw new Error("Unknown encoding kind: " + encoding.kind);
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

export { BmCifParser };
