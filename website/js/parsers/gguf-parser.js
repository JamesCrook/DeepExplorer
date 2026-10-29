// Read GGUF model files (llama.cpp's format) in the browser
/**
 *   DynamicFileReader  lazy, chunked reads from a File; never loads it whole
 *   GGUFParser         header, metadata key/values and tensor descriptors
 *                      (never the tensor data itself)
 *   ModelData          the parse result plus formatting and summary helpers
 *   ggufReport         the plain-text metadata report
 *   groupTensorsByBlock / tensorColor   how the block view groups and colours
 *
 * No drawing here: apps/scenes-gguf.js turns a ModelData into nodes.
 * Came from attic/unfolded/omni-gguf.js; the classes are unchanged.
 */

// ============================================================
// GGUF PARSER - Static parsing utilities
// ============================================================

const GGUFValueType = {
  UINT8: 0, INT8: 1, UINT16: 2, INT16: 3,
  UINT32: 4, INT32: 5, FLOAT32: 6, BOOL: 7,
  STRING: 8, ARRAY: 9, UINT64: 10, INT64: 11, FLOAT64: 12
};

class DynamicFileReader {
  constructor(file) {
    this.file = file;
    this.buffer = null;
    this.bufferStart = 0;
    this.bufferEnd = 0;
    this.chunkSize = 512 * 1024;
    this.totalBytesLoaded = 0;
    this.loadCount = 0;
  }

  async ensureBuffer(offset, length) {
    if (!this.buffer || offset < this.bufferStart || offset + length > this.bufferEnd) {
      this.bufferStart = offset;
      this.bufferEnd = Math.min(offset + Math.max(length, this.chunkSize), this.file.size);
      const slice = this.file.slice(this.bufferStart, this.bufferEnd);
      this.buffer = await slice.arrayBuffer();
      this.totalBytesLoaded += this.buffer.byteLength;
      this.loadCount++;
    }
  }

  async getUint8(offset) {
    await this.ensureBuffer(offset, 1);
    return new DataView(this.buffer).getUint8(offset - this.bufferStart);
  }

  async getInt8(offset) {
    await this.ensureBuffer(offset, 1);
    return new DataView(this.buffer).getInt8(offset - this.bufferStart);
  }

  async getUint16(offset, littleEndian = true) {
    await this.ensureBuffer(offset, 2);
    return new DataView(this.buffer).getUint16(offset - this.bufferStart, littleEndian);
  }

  async getInt16(offset, littleEndian = true) {
    await this.ensureBuffer(offset, 2);
    return new DataView(this.buffer).getInt16(offset - this.bufferStart, littleEndian);
  }

  async getUint32(offset, littleEndian = true) {
    await this.ensureBuffer(offset, 4);
    return new DataView(this.buffer).getUint32(offset - this.bufferStart, littleEndian);
  }

  async getInt32(offset, littleEndian = true) {
    await this.ensureBuffer(offset, 4);
    return new DataView(this.buffer).getInt32(offset - this.bufferStart, littleEndian);
  }

  async getFloat32(offset, littleEndian = true) {
    await this.ensureBuffer(offset, 4);
    return new DataView(this.buffer).getFloat32(offset - this.bufferStart, littleEndian);
  }

  async getBigUint64(offset, littleEndian = true) {
    await this.ensureBuffer(offset, 8);
    return new DataView(this.buffer).getBigUint64(offset - this.bufferStart, littleEndian);
  }

  async getBigInt64(offset, littleEndian = true) {
    await this.ensureBuffer(offset, 8);
    return new DataView(this.buffer).getBigInt64(offset - this.bufferStart, littleEndian);
  }

  async getFloat64(offset, littleEndian = true) {
    await this.ensureBuffer(offset, 8);
    return new DataView(this.buffer).getFloat64(offset - this.bufferStart, littleEndian);
  }

  async getString(offset, length) {
    await this.ensureBuffer(offset, length);
    const bytes = new Uint8Array(this.buffer, offset - this.bufferStart, length);
    return new TextDecoder().decode(bytes);
  }
}

class GGUFParser {
  static getValueTypeSize(type) {
    const sizes = {
      [GGUFValueType.UINT8]: 1,
      [GGUFValueType.INT8]: 1,
      [GGUFValueType.UINT16]: 2,
      [GGUFValueType.INT16]: 2,
      [GGUFValueType.UINT32]: 4,
      [GGUFValueType.INT32]: 4,
      [GGUFValueType.FLOAT32]: 4,
      [GGUFValueType.BOOL]: 1,
      [GGUFValueType.UINT64]: 8,
      [GGUFValueType.INT64]: 8,
      [GGUFValueType.FLOAT64]: 8
    };
    return sizes[type] || -1;
  }

  static async readValue(reader, offset, type) {
    switch (type) {
      case GGUFValueType.UINT8:
        return { value: await reader.getUint8(offset), nextOffset: offset + 1 };
      case GGUFValueType.INT8:
        return { value: await reader.getInt8(offset), nextOffset: offset + 1 };
      case GGUFValueType.UINT16:
        return { value: await reader.getUint16(offset, true), nextOffset: offset + 2 };
      case GGUFValueType.INT16:
        return { value: await reader.getInt16(offset, true), nextOffset: offset + 2 };
      case GGUFValueType.UINT32:
        return { value: await reader.getUint32(offset, true), nextOffset: offset + 4 };
      case GGUFValueType.INT32:
        return { value: await reader.getInt32(offset, true), nextOffset: offset + 4 };
      case GGUFValueType.FLOAT32:
        return { value: await reader.getFloat32(offset, true), nextOffset: offset + 4 };
      case GGUFValueType.BOOL:
        const boolVal = await reader.getUint8(offset);
        return { value: boolVal !== 0, nextOffset: offset + 1 };
      case GGUFValueType.UINT64:
        return { value: Number(await reader.getBigUint64(offset, true)), nextOffset: offset + 8 };
      case GGUFValueType.INT64:
        return { value: Number(await reader.getBigInt64(offset, true)), nextOffset: offset + 8 };
      case GGUFValueType.FLOAT64:
        return { value: await reader.getFloat64(offset, true), nextOffset: offset + 8 };
      case GGUFValueType.STRING:
        const len = Number(await reader.getBigUint64(offset, true));
        offset += 8;
        if (len > 10 * 1024 * 1024) throw new Error(`String too large: ${len}`);
        const str = await reader.getString(offset, len);
        return { value: str, nextOffset: offset + len };
      case GGUFValueType.ARRAY:
        const arrayType = await reader.getUint32(offset, true);
        offset += 4;
        const arrayLen = Number(await reader.getBigUint64(offset, true));
        offset += 8;

        if (arrayLen > 10000) {
          const itemSize = GGUFParser.getValueTypeSize(arrayType);
          if (itemSize > 0) {
            offset += arrayLen * itemSize;
          } else {
            for (let i = 0; i < arrayLen; i++) {
              const item = await GGUFParser.readValue(reader, offset, arrayType);
              offset = item.nextOffset;
            }
          }
          return { value: `[Array: ${arrayLen} items]`, nextOffset: offset };
        }

        const array = [];
        for (let i = 0; i < arrayLen; i++) {
          const item = await GGUFParser.readValue(reader, offset, arrayType);
          if (i < 100) array.push(item.value);
          offset = item.nextOffset;
        }
        return { value: array, nextOffset: offset };
      default:
        throw new Error(`Unknown GGUF value type: ${type}`);
    }
  }

  static async parseGGUF(reader, maxTensors = 500) {
    let offset = 0;

    // Read magic & version
    const magic = String.fromCharCode(
      await reader.getUint8(offset++),
      await reader.getUint8(offset++),
      await reader.getUint8(offset++),
      await reader.getUint8(offset++)
    );
    if (magic !== 'GGUF') throw new Error('Not a valid GGUF file');

    const version = await reader.getUint32(offset, true);
    offset += 4;
    const tensorCount = Number(await reader.getBigUint64(offset, true));
    offset += 8;
    const metadataCount = Number(await reader.getBigUint64(offset, true));
    offset += 8;

    // Read metadata
    const metadata = [];
    for (let i = 0; i < metadataCount; i++) {
      try {
        const keyLen = Number(await reader.getBigUint64(offset, true));
        offset += 8;
        if (keyLen > 10000) {
          throw new Error(`Key ${i} length too long: ${keyLen} at offset ${offset - 8}`);
        }
        const key = await reader.getString(offset, keyLen);
        offset += keyLen;
        const valueType = await reader.getUint32(offset, true);
        offset += 4;
        const valueResult = await GGUFParser.readValue(reader, offset, valueType);
        metadata.push({ key, valueType, value: valueResult.value });
        offset = valueResult.nextOffset;
      } catch (err) {
        console.error(`Error reading metadata item ${i}/${metadataCount}:`, err);
        throw new Error(`Failed at metadata item ${i}: ${err.message}`);
      }
    }

    // Read tensor info (metadata only, never the actual tensor data)
    const tensors = [];
    const maxToRead = Math.min(tensorCount, maxTensors);
    for (let i = 0; i < maxToRead; i++) {
      try {
        const nameLen = Number(await reader.getBigUint64(offset, true));
        offset += 8;
        if (nameLen > 10000) {
          console.warn(`Tensor ${i} name too long: ${nameLen}, stopping tensor read`);
          break;
        }
        const name = await reader.getString(offset, nameLen);
        offset += nameLen;
        const nDims = await reader.getUint32(offset, true);
        offset += 4;
        if (nDims > 10) {
          console.warn(`Tensor ${i} too many dims: ${nDims}, stopping tensor read`);
          break;
        }
        const dimensions = [];
        for (let j = 0; j < nDims; j++) {
          dimensions.push(Number(await reader.getBigUint64(offset, true)));
          offset += 8;
        }
        const type = await reader.getUint32(offset, true);
        offset += 4;
        const tensorOffset = Number(await reader.getBigUint64(offset, true));
        offset += 8;
        tensors.push({ name, dimensions, type, offset: tensorOffset });
      } catch (err) {
        console.warn(`Error reading tensor ${i}, stopping:`, err);
        break;
      }
    }

    return { version, tensorCount, metadataCount, metadata, tensors };
  }
}

// ============================================================
// MODEL DATA - Data model and formatters
// ============================================================

class ModelData {
  constructor(file, parsedData) {
    this.file = file;
    this.version = parsedData.version;
    this.tensorCount = parsedData.tensorCount;
    this.metadataCount = parsedData.metadataCount;
    this.metadata = parsedData.metadata;
    this.tensors = parsedData.tensors;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  }

  formatMetadataValue(value) {
    if (Array.isArray(value)) {
      if (value.length <= 5) {
        return `[${value.join(', ')}]`;
      } else {
        return `[${value.slice(0, 5).join(', ')}, ... (${value.length} items)]`;
      }
    } else if (typeof value === 'string' && value.startsWith('[Array:')) {
      return value;
    }
    return String(value);
  }

  getStats() {
    const archMeta = this.metadata.find(m =>
      m.key === 'general.architecture' || m.key.includes('architecture'));
    const arch = archMeta ? archMeta.value : 'unknown';

    const layersMeta = this.metadata.find(m =>
      m.key.includes('block_count') || m.key.includes('n_layer'));
    const layers = layersMeta ? layersMeta.value : 'unknown';

    return {
      arch,
      layers,
      tensors: this.tensors.length,
      totalTensors: this.tensorCount,
      size: this.formatBytes(this.file.size)
    };
  }

  getInfoText() {
    const archMeta = this.metadata.find(m =>
      m.key === 'general.architecture' || m.key.includes('architecture'));
    const arch = archMeta ? archMeta.value : 'unknown';

    const contextMeta = this.metadata.find(m => m.key.includes('context_length'));
    const context = contextMeta ? contextMeta.value : 'unknown';

    const embeddingMeta = this.metadata.find(m => m.key.includes('embedding'));
    const embedding = embeddingMeta ? embeddingMeta.value : 'unknown';

    const headsMeta = this.metadata.find(m => m.key.includes('head_count') && !m.key.includes('kv'));
    const heads = headsMeta ? headsMeta.value : 'unknown';

    return {
      arch,
      context,
      embedding,
      heads,
      tensorsLoaded: this.tensors.length,
      totalTensors: this.tensorCount
    };
  }
}

// ============================================================
// REPORT AND GROUPING - used by the GGUF scenes
// ============================================================

/** The plain-text report the old text view showed (TextRenderer.render). */
function ggufReport(modelData) {
  const lines = [];
  lines.push('='.repeat(60));
  lines.push(`GGUF MODEL: ${modelData.file.name}`);
  lines.push('='.repeat(60));
  lines.push('');
  lines.push('FILE INFO:');
  lines.push(`  Size: ${modelData.formatBytes(modelData.file.size)}`);
  lines.push(`  GGUF Version: ${modelData.version}`);
  lines.push(`  Tensor Count: ${modelData.tensorCount}`);
  lines.push(`  Metadata Items: ${modelData.metadataCount}`);
  lines.push('');
  lines.push('METADATA:');
  lines.push('-'.repeat(60));
  modelData.metadata.forEach(kv => {
    const valueStr = modelData.formatMetadataValue(kv.value);
    lines.push(`  ${kv.key}:`);
    if (valueStr.includes('\n') || valueStr.length > 50) {
      valueStr.split('\n').forEach(line => lines.push(`    ${line}`));
    } else {
      lines.push(`    ${valueStr}`);
    }
  });
  lines.push('');
  lines.push(`TENSORS (${modelData.tensors.length} of ${modelData.tensorCount}):`);
  lines.push('-'.repeat(60));
  modelData.tensors.forEach(tensor => {
    const dims = tensor.dimensions.join(' × ');
    const elements = tensor.dimensions.reduce((a, b) => a * b, 1);
    lines.push(`  ${tensor.name}`);
    lines.push(`    Shape: [${dims}] = ${modelData.formatNumber(elements)} elements`);
    lines.push(`    Type: ${tensor.type}`);
  });
  return lines.join('\n');
}

/** Embedding, numbered layers (blk.N, layer.N, block.N, h.N) and output head. */
function groupTensorsByBlock(tensors) {
  const embedding = [];
  const layers = {};
  const output = [];
  tensors.forEach(tensor => {
    const name = tensor.name;
    const layerMatch = name.match(/(?:blk|layer|block|h)\.(\d+)/i);
    if (layerMatch) {
      const layerNum = parseInt(layerMatch[1]);
      (layers[layerNum] ??= []).push(tensor);
    } else if (name.match(/embed|token|wte/i)) {
      embedding.push(tensor);
    } else if (name.match(/lm_head|output/i)) {
      output.push(tensor);
    } else {
      (layers[0] ??= []).push(tensor);       // no clear category: first block
    }
  });
  const layerArray = [];
  const keys = Object.keys(layers).map(Number);
  const maxLayer = keys.length ? Math.max(...keys) : -1;
  for (let i = 0; i <= maxLayer; i++) if (layers[i]) layerArray.push(layers[i]);
  return { embedding, layers: layerArray, output };
}

/** Colour by tensor role: attention q/k/v/o, feed-forward, norm, other. */
function tensorColor(name) {
  if (name.match(/attn.*q|attention.*query/i)) return '#ff6b6b';
  if (name.match(/attn.*k|attention.*key/i)) return '#4ecdc4';
  if (name.match(/attn.*v|attention.*value/i)) return '#45b7d1';
  if (name.match(/attn.*output|attn.*o/i)) return '#96ceb4';
  if (name.match(/ffn|mlp|fc/i)) return '#ffd93d';
  if (name.match(/norm|ln/i)) return '#a29bfe';
  return '#6c5ce7';
}

export {
  GGUFValueType, DynamicFileReader, GGUFParser, ModelData,
  ggufReport, groupTensorsByBlock, tensorColor,
};
