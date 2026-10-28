import {CanvasScene} from '../omni-support/canvas-scene.js'
import {HtmlScene} from '../omni-support/html-scene.js'
import { OmniApp } from '../../../deep-explorer/js/omni-support/omni-app.js'
import { OmniControlPanel, AppUtils } from '../../../deep-explorer/js/omni-support/omni-control-panel.js'

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
// TEXT RENDERER - Generate text output
// ============================================================

class TextRenderer {
  constructor(outputElement) {
    this.outputElement = outputElement;
    this.htmlScene = new HtmlScene(this.outputElement);
  }

  render(modelData) {
    const lines = [];

    // Header
    lines.push('='.repeat(60));
    lines.push(`GGUF MODEL: ${modelData.file.name}`);
    lines.push('='.repeat(60));
    lines.push('');

    // File info
    lines.push('FILE INFO:');
    lines.push(`  Size: ${modelData.formatBytes(modelData.file.size)}`);
    lines.push(`  GGUF Version: ${modelData.version}`);
    lines.push(`  Tensor Count: ${modelData.tensorCount}`);
    lines.push(`  Metadata Items: ${modelData.metadataCount}`);
    lines.push('');

    // Metadata
    lines.push('METADATA:');
    lines.push('-'.repeat(60));
    modelData.metadata.forEach(kv => {
      const valueStr = modelData.formatMetadataValue(kv.value);
      lines.push(`  ${kv.key}:`);
      if (valueStr.includes('\n') || valueStr.length > 50) {
        valueStr.split('\n').forEach(line => {
          lines.push(`    ${line}`);
        });
      } else {
        lines.push(`    ${valueStr}`);
      }
    });
    lines.push('');

    // Tensors
    lines.push(`TENSORS (${modelData.tensors.length} of ${modelData.tensorCount}):`);
    lines.push('-'.repeat(60));
    modelData.tensors.forEach(tensor => {
      const dims = tensor.dimensions.join(' × ');
      const elements = tensor.dimensions.reduce((a, b) => a * b, 1);
      lines.push(`  ${tensor.name}`);
      lines.push(`    Shape: [${dims}] = ${modelData.formatNumber(elements)} elements`);
      lines.push(`    Type: ${tensor.type}`);
    });

    this.htmlScene.setContent(lines.join('\n'));
  }
}

// ============================================================
// GGUF RENDERER - Canvas visualization
// ============================================================

class GGUFRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvasScene = new CanvasScene(canvas);
    this.data = null;
    this.scale = 1;

    // Visual settings
    this.blockSpacing = 20;
    this.tensorScale = 1.0;
    this.showLabels = 'all';

    this.setupEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  set zoom(z) {
    this.canvasScene.camera.zoom = z;
  }

  get zoom() {
    return this.canvasScene.camera.zoom;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvasScene.resize(rect, window.devicePixelRatio);
    this.draw();
  }

  setupEvents() {
    this.canvasScene.attachEvents({
      onRender: () => this.draw(),
      getZoom: () => this.canvasScene.camera.zoom,
      setZoom: (z) => {
        this.canvasScene.camera.zoom = z;
        if (window.baseInstance) {
          window.baseInstance.updateSlider('zoom', z, false);
        }
      },
      isPanZoomEnabled: () => true,
      translateBeforeScale: true
    });
  }

  setData(data) {
    this.data = data;
    this.resetView();
  }

  resetView() {
    this.canvasScene.resetView();
    // Initially offset the view
    this.canvasScene.camera.x = 50;
    this.canvasScene.camera.y = 50;

    // Update zoom slider
    if (window.baseInstance) {
      window.baseInstance.updateSlider('zoom', 1, false);
    }

    this.draw();
  }

  draw() {
    if (!this.data) return;

    const ctx = this.ctx;
    const w = this.canvas.width / window.devicePixelRatio;
    const h = this.canvas.height / window.devicePixelRatio;

    // Clear
    ctx.fillStyle = '#0f0f23';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.canvasScene.camera.x, this.canvasScene.camera.y);
    const zoom = this.canvasScene.camera.zoom;
    ctx.scale(this.scale * zoom, this.scale * zoom); // Apply zoom

    this.drawBlocks();

    ctx.restore();
  }

  drawBlocks() {
    const { tensors } = this.data;
    if (!tensors.length) return;

    // Group tensors by block number
    const blocks = this.groupTensorsByBlock(tensors);

    const blocksPerRow = 10;
    const blockWidth = 180;
    const blockHeight = 120;
    const rowGap = this.blockSpacing;
    const colGap = this.blockSpacing;

    let yPos = 0;

    // Helper to draw a row of blocks
    const drawBlockRow = (blockList, label) => {
      if (!blockList.length) return 0;

      let rowHeight = blockHeight;
      let xPos = 0;
      let currentRow = 0;

      blockList.forEach((block, idx) => {
        if (idx > 0 && idx % blocksPerRow === 0) {
          // Wrap to next row
          yPos += rowHeight + rowGap;
          xPos = 0;
          currentRow++;
        }

        const height = this.drawSingleBlock(
          block.name,
          block.tensors,
          xPos,
          yPos,
          blockWidth,
          blockHeight
        );

        rowHeight = Math.max(rowHeight, height);
        xPos += blockWidth + colGap;
      });

      return rowHeight + rowGap;
    };

    // Draw embedding layer
    if (blocks.embedding.length) {
      const embeddingBlocks = [{ name: 'Embedding', tensors: blocks.embedding }];
      yPos += drawBlockRow(embeddingBlocks, 'Embedding');
    }

    // Draw transformer blocks - start new row when prefix changes
    let currentPrefix = null;
    let currentRowBlocks = [];

    blocks.layers.forEach((layerTensors, idx) => {
      const blockName = `Block ${idx}`;

      // Check if we should start a new row (prefix changed or hit limit)
      const prefix = Math.floor(idx / 10);
      if (currentPrefix !== null && prefix !== currentPrefix) {
        // Draw accumulated blocks
        yPos += drawBlockRow(currentRowBlocks, '');
        currentRowBlocks = [];
      }

      currentPrefix = prefix;
      currentRowBlocks.push({ name: blockName, tensors: layerTensors });
    });

    // Draw remaining blocks
    if (currentRowBlocks.length) {
      yPos += drawBlockRow(currentRowBlocks, '');
    }

    // Draw output head
    if (blocks.output.length) {
      const outputBlocks = [{ name: 'Output', tensors: blocks.output }];
      yPos += drawBlockRow(outputBlocks, 'Output');
    }
  }

  drawSingleBlock(name, tensors, x, y, maxWidth, maxHeight) {
    if (!tensors.length) return 0;

    const ctx = this.ctx;
    const padding = 8;
    const labelHeight = this.showLabels !== 'none' ? 20 : 0;

    // Calculate total dimensions for all tensors in block
    const totalElements = tensors.reduce((sum, t) =>
      sum + t.dimensions.reduce((a, b) => a * b, 1), 0);

    // Format dimensions
    const dimStr = this.formatNumber(totalElements);

    // Draw block background
    ctx.fillStyle = '#16213e';
    ctx.fillRect(x, y, maxWidth, maxHeight);

    // Draw block border
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, maxWidth, maxHeight);

    // Draw block label
    if (this.showLabels !== 'none') {
      ctx.fillStyle = '#4fc3f7';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(name, x + maxWidth / 2, y + 14);

      // Draw dimensions
      ctx.fillStyle = '#888';
      ctx.font = '9px monospace';
      ctx.fillText(dimStr, x + maxWidth / 2, y + maxHeight - 6);
    }

    // Draw simplified tensor representation
    const tensorArea = {
      x: x + padding,
      y: y + labelHeight + padding,
      width: maxWidth - padding * 2,
      height: maxHeight - labelHeight - padding * 2 - 15
    };

    // Draw a few key tensors
    const maxTensorsToDraw = 3;
    const tensorHeight = (tensorArea.height - (maxTensorsToDraw - 1) * 2) / maxTensorsToDraw;

    tensors.slice(0, maxTensorsToDraw).forEach((tensor, idx) => {
      const ty = tensorArea.y + idx * (tensorHeight + 2);
      const color = this.getTensorColor(tensor.name);

      ctx.fillStyle = color;
      ctx.fillRect(tensorArea.x, ty, tensorArea.width, tensorHeight);

      if (this.showLabels === 'all' && tensorHeight > 12) {
        ctx.fillStyle = '#fff';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        const label = tensor.name.length > 20 ?
          tensor.name.substring(0, 20) + '...' : tensor.name;
        ctx.fillText(label, tensorArea.x + 3, ty + tensorHeight / 2 + 3);
      }
    });

    // Show "... N more" if there are more tensors
    if (tensors.length > maxTensorsToDraw) {
      const remainingCount = tensors.length - maxTensorsToDraw;
      ctx.fillStyle = '#666';
      ctx.font = '8px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(
        `+${remainingCount} more`,
        tensorArea.x + tensorArea.width / 2,
        tensorArea.y + tensorArea.height + 10
      );
    }

    return maxHeight;
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  groupTensorsByBlock(tensors) {
    const embedding = [];
    const layers = {};
    const output = [];

    tensors.forEach(tensor => {
      const name = tensor.name;

      // Match layer patterns: blk.N, layer.N, block.N, h.N
      const layerMatch = name.match(/(?:blk|layer|block|h)\.(\d+)/i);

      if (layerMatch) {
        const layerNum = parseInt(layerMatch[1]);
        if (!layers[layerNum]) layers[layerNum] = [];
        layers[layerNum].push(tensor);
      } else if (name.match(/embed|token|wte/i)) {
        embedding.push(tensor);
      } else if (name.match(/lm_head|output/i)) {
        output.push(tensor);
      } else {
        // Put in first block if no clear category
        if (!layers[0]) layers[0] = [];
        layers[0].push(tensor);
      }
    });

    // Convert layers object to array
    const layerArray = [];
    const maxLayer = Math.max(...Object.keys(layers).map(Number));
    for (let i = 0; i <= maxLayer; i++) {
      if (layers[i]) layerArray.push(layers[i]);
    }

    return { embedding, layers: layerArray, output };
  }

  getTensorColor(name) {
    if (name.match(/attn.*q|attention.*query/i)) return '#ff6b6b';
    if (name.match(/attn.*k|attention.*key/i)) return '#4ecdc4';
    if (name.match(/attn.*v|attention.*value/i)) return '#45b7d1';
    if (name.match(/attn.*output|attn.*o/i)) return '#96ceb4';
    if (name.match(/ffn|mlp|fc/i)) return '#ffd93d';
    if (name.match(/norm|ln/i)) return '#a29bfe';
    return '#6c5ce7';
  }
}

// ============================================================
// OmniGgufApp
// ============================================================

class OmniGgufApp {
  constructor() {
    this.currentModel = null;
    this.currentFile = null;

    // Create app shell
    const shell = new OmniApp({
      title: 'GGUF Model Viewer',
      subtitle: 'Visualize transformer architecture and tensor structure',
      faviconPath: '../wheel.ico',
      navScript: '../js/utilities/nav.js',
      cssPath: 'omni-controls.css',
      displayElement: 'div',
      displayId: 'canvasContainer',
      createShell: true
    });

    this.canvasContainer = shell.display;
    this.canvasContainer.className = 'gguf-canvas-container';

    // Populate custom display structure
    this.canvasContainer.innerHTML = `
      <div class="text-output" id="textOutput">Drop a GGUF file to begin...</div>
      <canvas id="ggufCanvas"></canvas>
    `;

    this.textOutput = document.getElementById('textOutput');
    this.canvas = document.getElementById('ggufCanvas');

    this.renderer = new GGUFRenderer(this.canvas);
    this.textRenderer = new TextRenderer(this.textOutput);

    // Initialize OmniControlPanel
    this.base = new OmniControlPanel({
      elements: {
        container: this.canvasContainer,
        controls: shell.controls,
        multiscroller: shell.multiscroller
      },
      sliderConfig: this._buildSliderConfig(),
      enablePanZoom: false, // We handle our own pan/zoom
      aspectRatio: 1,
      hintHtml: '<b>Drag</b> to pan. <b>Scroll</b> to zoom.<br><b>maxTensors</b>: limits metadata entries loaded (change applies to next file)',

      onRender: (params, panZoom, instance) => {
        const viewMode = params.viewMode || 0;

        // Update view mode transition
        this.textRenderer.htmlScene.setOpacity(1 - viewMode);
        this.canvas.style.opacity = viewMode;

        const isCanvasMode = viewMode >= 0.5;
        this.textRenderer.htmlScene.toggleClass('active', !isCanvasMode);
        this.canvas.classList.toggle('active', isCanvasMode);
        this.canvasContainer.classList.toggle('scrolling', !isCanvasMode);

        // Update renderer settings
        this.renderer.blockSpacing = params.blockSpacing || 20;
        this.renderer.tensorScale = params.tensorScale || 1.0;
        this.renderer.zoom = params.zoom || 1.0;

        // Render if in canvas mode and have data
        if (viewMode > 0 && this.currentModel) {
          this.renderer.draw();
        }
      },

      onParamChange: (id, value, isData, instance) => {
        // Handle parameter changes that need immediate response
        if (id === 'zoom' && this.currentModel) {
          this.renderer.zoom = value;
          this.renderer.draw();
        }
        if (id === 'blockSpacing' && this.currentModel) {
          this.renderer.blockSpacing = value;
          this.renderer.draw();
        }
        if (id === 'tensorScale' && this.currentModel) {
          this.renderer.tensorScale = value;
          this.renderer.draw();
        }
      },

      onResize: (instance) => {
        this.renderer.resize();
      }
    });

    // Make base instance available globally for renderer zoom interaction
    window.baseInstance = this.base;

    // Initialize view mode state
    this.base.render();
  }

  _buildSliderConfig() {
    return [
      ...this._sectionLoadModel(),
      ...this._sectionMaxTensors(),
      ...this._sectionStats(),
      ...this._sectionVisualization(),
      ...this._sectionLabels(),
      ...this._sectionReset(),
      ...this._sectionModelInfo(),
      ...this._sectionActions()
    ];
  }


  _sectionLoadModel() {
    return [{
      group: 'Load Model',
      id: 'load',
      abbrev: 'Load',
      type: 'filedrop',
      label: 'Drop GGUF file or click',
      accept: '.gguf',
      onDrop: (files, base) => {
        if (files[0]) this.loadFile(files[0]);
      }
    }];
  }

  // The new version does not work.
  // However it does work in OmniTree
  // Most likely it is related to onEntries / onFiles
  _sectionLoadModelNew() {
    return [{
      group: 'Load Model',
      id: 'load',
      abbrev: 'Load',
      type: 'custom',
      build: (groupEl, base) => {
        groupEl.appendChild( AppUtils.createFileLoader({
          id: 'modelDrop',
          icon: '📁',
          text: 'Drop GGUF file or click',
          accept: '.gguf',
          multiple: false,
          onFiles: (files) => {
            if (files[0]) this.loadFile(files[0]);
          }
        }));
      }
    }];
  }

  _sectionMaxTensors() {
    return [{
      group: 'Max Tensors',
      id: 'maxTensors',
      type: 'custom',
      build: (groupEl, base) => {
        const container = document.createElement('div');
        container.className = 'control';

        const labelDiv = document.createElement('label');
        const labelSpan = document.createElement('span');
        labelSpan.textContent = 'Max Tensors to Load';
        const valueSpan = document.createElement('span');
        valueSpan.id = 'maxTensorsValue';
        valueSpan.textContent = '500';
        labelDiv.appendChild(labelSpan);
        labelDiv.appendChild(valueSpan);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = 'maxTensors';
        slider.min = '50';
        slider.max = '500';
        slider.step = '50';
        slider.value = '500';

        slider.addEventListener('input', (e) => {
          valueSpan.textContent = e.target.value;
          base.setParam('maxTensors', parseInt(e.target.value));
        });

        container.appendChild(labelDiv);
        container.appendChild(slider);

        const note = document.createElement('div');
        note.className = 'reload-note';
        note.textContent = 'Changes apply when loading next file';
        container.appendChild(note);

        groupEl.appendChild( container);

        // Initialize param
        base.setParam('maxTensors', 500);
      }
    }];
  }

  _sectionStats() {
    return [{
      group: 'Stats',
      id: 'modelStats',
      type: 'custom',
      build: (groupEl, base) => {
        const stats = document.createElement('div');
        stats.className = 'model-stats';
        stats.id = 'modelStats';
        stats.style.display = 'none';
        stats.innerHTML = `
          <div class="stat-item">
            <span>Architecture:</span>
            <span class="stat-value" id="statArch">-</span>
          </div>
          <div class="stat-item">
            <span>Layers:</span>
            <span class="stat-value" id="statLayers">-</span>
          </div>
          <div class="stat-item">
            <span>Tensors:</span>
            <span class="stat-value" id="statTensors">-</span>
          </div>
          <div class="stat-item">
            <span>File Size:</span>
            <span class="stat-value" id="statSize">-</span>
          </div>
        `;
        groupEl.appendChild( stats);
      }
    }];
  }

  _sectionVisualization() {
    return [{
      group: 'Visualization',
      id: 'viz',
      abbrev: 'Viz',
      sliders: [
        { id: 'viewMode', label: 'View Mode (Text→Canvas)', min: 0, max: 1, step: 0.01, default: 0, format: 'float1' },
        { id: 'blockSpacing', label: 'Block Spacing', min: 10, max: 50, default: 20, format: 'int' },
        { id: 'tensorScale', label: 'Tensor Size Scale', min: 0.5, max: 2.0, step: 0.1, default: 1.0, format: 'float1' },
        { id: 'zoom', label: 'Zoom', min: 0.1, max: 5, step: 0.1, default: 1.0, format: 'float1' }
      ]
    }];
  }

  _sectionLabels() {
    return [{
      group: 'Labels',
      id: 'showLabels',
      type: 'select',
      selectId: 'showLabelsSelect',
      label: 'Show Labels',
      options: [
        { value: 'all', label: 'All' },
        { value: 'blocks', label: 'Blocks Only' },
        { value: 'none', label: 'None' }
      ],
      onChange: (value, base) => {
        this.renderer.showLabels = value;
        this.renderer.draw();
      }
    }];
  }

  _sectionReset() {
    return [{
      group: 'Reset',
      id: 'resetView',
      type: 'custom',
      build: (groupEl, base) => {
        groupEl.appendChild( AppUtils.createButton({
          text: 'Reset View',
          onClick: () => this.renderer.resetView()
        }));
      }
    }];
  }

  _sectionModelInfo() {
    return [{
      group: 'Model Information',
      id: 'info',
      abbrev: 'Info',
      type: 'custom',
      build: (groupEl, base) => {
        const panel = document.createElement('div');
        panel.className = 'info-panel';
        panel.id = 'infoPanel';
        panel.innerHTML = '<p>Load a GGUF file to see model details.</p>';
        groupEl.appendChild( panel);
      }
    }];
  }

  _sectionActions() {
    return [{
      group: 'Actions',
      id: 'actions',
      type: 'custom',
      build: (groupEl, base) => {
        const container = document.createElement('div');
        container.id = 'actionButtons';
        container.style.display = 'none';

        container.appendChild( AppUtils.createButton({
          text: 'Copy Metadata',
          id: 'copyBtn',
          onClick: () => this.copyMetadata()
        }));

        container.appendChild( AppUtils.createButton({
          text: 'Download Metadata',
          className: 'btn secondary',
          id: 'downloadBtn',
          onClick: () => this.downloadMetadata()
        }));

        groupEl.appendChild( container);
      }
    }];
  }

  async loadFile(file) {
    try {
      this.base.setStatus('Loading GGUF file...', false);

      const reader = new DynamicFileReader(file);
      const maxTensors = this.base.getParams().maxTensors || 500;
      const parsedData = await GGUFParser.parseGGUF(reader, maxTensors);

      this.currentModel = new ModelData(file, parsedData);
      this.currentFile = file;

      // Update UI
      this.updateStats(this.currentModel);
      this.updateInfoPanel(this.currentModel);
      this.textRenderer.render(this.currentModel);
      this.renderer.setData(this.currentModel);

      // Show action buttons
      document.getElementById('actionButtons').style.display = 'block';

      this.base.clearStatus();

      // Trigger render if in canvas mode
      const viewMode = this.base.getParams().viewMode || 0;
      if (viewMode > 0) {
        this.renderer.draw();
      }

    } catch (err) {
      console.error('Error loading GGUF:', err);
      this.base.setStatus('Error: ' + err.message, true);
    }
  }

  updateStats(modelData) {
    const stats = modelData.getStats();
    const statsEl = document.getElementById('modelStats');

    if (statsEl) {
      statsEl.style.display = 'grid';
      document.getElementById('statArch').textContent = stats.arch;
      document.getElementById('statLayers').textContent = stats.layers;
      document.getElementById('statTensors').textContent = `${stats.tensors} / ${stats.totalTensors}`;
      document.getElementById('statSize').textContent = stats.size;
    }
  }

  updateInfoPanel(modelData) {
    const info = modelData.getInfoText();
    const panel = document.getElementById('infoPanel');

    if (panel) {
      panel.innerHTML = `
        <p><strong>Architecture:</strong> ${info.arch}</p>
        <p><strong>Context Length:</strong> ${info.context}</p>
        <p><strong>Embedding Dim:</strong> ${info.embedding}</p>
        <p><strong>Attention Heads:</strong> ${info.heads}</p>
        <p style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #333;">
          <strong>Tensors:</strong> ${info.tensorsLoaded} of ${info.totalTensors} loaded
        </p>
      `;
      panel.classList.add('visible');
    }
  }

  copyMetadata() {
    navigator.clipboard.writeText(this.textOutput.textContent).then(() => {
      const btn = document.getElementById('copyBtn');
      const oldText = btn.textContent;
      btn.textContent = 'Copied!';
      btn.style.background = '#10b981';
      setTimeout(() => {
        btn.textContent = oldText;
        btn.style.background = '';
      }, 2000);
    });
  }

  downloadMetadata() {
    if (!this.currentFile) return;

    const blob = new Blob([this.textOutput.textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentFile.name.replace('.gguf', '')}_metadata.txt`;
    a.click();
    URL.revokeObjectURL(url);

    const btn = document.getElementById('downloadBtn');
    const oldText = btn.textContent;
    btn.textContent = 'Downloaded!';
    btn.style.background = '#10b981';
    setTimeout(() => {
      btn.textContent = oldText;
      btn.style.background = '';
    }, 1000);
  }
}

export { OmniGgufApp };

// Auto-generated exports
if (typeof window !== 'undefined') window.DynamicFileReader = DynamicFileReader;
export { DynamicFileReader };
if (typeof window !== 'undefined') window.GGUFParser = GGUFParser;
export { GGUFParser };
if (typeof window !== 'undefined') window.GGUFRenderer = GGUFRenderer;
export { GGUFRenderer };
if (typeof window !== 'undefined') window.GGUFValueType = GGUFValueType;
export { GGUFValueType };
if (typeof window !== 'undefined') window.ModelData = ModelData;
export { ModelData };
if (typeof window !== 'undefined') window.TextRenderer = TextRenderer;
export { TextRenderer };
