import { SYS, sceneRegistry } from '../omni-support/sys.js';
export { HexChunkNode };

// `hex-chunk` — one chunk of a hex dump: address label and rows, culled to the view

const isPrint = (b) => b >= 0x20 && b <= 0x7e;
const SYMBOLS = ['FIN', 'SYN', 'RST', 'PSH', 'ACK', 'URG', 'ECE', 'CWR'];

class HexChunkNode {
  static getCount(data) {
    const currentBPR = 1 << data.layoutConfig.log2;
    return Math.ceil(data.buffer.length / currentBPR);
  }

  static getChunkHeight(data) {
    let chunkH = 0;
    ['hex', 'ascii', 'bit10', 'bitsym'].forEach(t => {
      const c = data.configs[t];
      if (c.enabled) chunkH += (c.fontSize * 1.25) * (c.rowHeight / 100);
    });
    return chunkH;
  }

  static draw2d(ctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const ctx = ctxMix.ctx;
    const state = ctxMix.state;
    const data = v.data;
    const { W, H, Z } = ctxMix.getWH(ctxMix, node, params);

    const currentBPR = 1 << data.layoutConfig.log2;
    const chunkH = this.getChunkHeight(data);
    if (chunkH === 0) return;

    const startChunk = v.offset / currentBPR;
    const chunkStart = startChunk * currentBPR;
    const chunkBytes = data.buffer.slice(chunkStart, chunkStart + currentBPR);

    let currentY = 20 + startChunk * chunkH;

// Fast Pan/Zoom Culling logic
    if (params && params.zoom) {
      const viewportTop = -params.panY / params.zoom;
      const viewportBottom = (-params.panY + H) / params.zoom;
      if (currentY > viewportBottom + chunkH || currentY < viewportTop - chunkH * 2) return;
    } else {
      if (currentY > H + chunkH || currentY < -chunkH * 2) return;
    }

  let currentX = 60; // offset padding for labels
  let renderW = data.layoutConfig.renderW;
  let availableW = renderW - 80;

  // Draw Chunk Address Label
  ctx.font = `14px monospace`;
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`0x${chunkStart.toString(16).padStart(4, '0').toUpperCase()}`, currentX - 10, currentY);

  // Draw active rows for this chunk
  const types = ['hex', 'ascii', 'bit10', 'bitsym'];
  types.forEach(type => {
    const config = data.configs[type];
    currentY += this.drawGenericRow(ctx, currentX, currentY, availableW, chunkBytes, currentBPR, type, config, data.layoutConfig.gap);
  });
  }

  static drawGenericRow(ctx, x, y, width, bytes, expectedLength, type, config, gap8) {
    if (!config.enabled) return 0;
    const baseH = config.fontSize * 1.25;
    const advanceY = baseH * (config.rowHeight / 100);
    const bgH = baseH * (config.bgHeight / 100);
    const flashH = baseH * (config.flashHeight / 100);

    // Backgrounds can explicitly overlap visually based on bgHeight/rowHeight ratio
    if (config.bgColor && config.bgColor !== 'transparent') {
      ctx.fillStyle = config.bgColor;
      ctx.fillRect(x, y, width, bgH);
    }

    ctx.font = `${config.fontSize}px "SF Mono", "Consolas", monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const textY = y + (bgH / 2);

    const isBitLevel = (type === 'bit10' || type === 'bitsym');
    const itemCount = isBitLevel ? bytes.length * 8 : bytes.length;

    const numGaps = Math.max(0, Math.floor((expectedLength - 1) / 8));
    const availableW = width - (numGaps * gap8);
    const byteW = availableW / expectedLength;

    for (let i = 0; i < itemCount; i++) {
      let itemX, itemW;
      const byteIdx = isBitLevel ? Math.floor(i / 8) : i;
      const gapOffset = Math.floor(byteIdx / 8) * gap8;
      const byteStartX = x + byteIdx * byteW + gapOffset;

      if (isBitLevel) {
        const groupGap = byteW * 0.15; 
        const activeByteW = byteW - groupGap;
        const bitW = activeByteW / 8;
        itemX = byteStartX + (i % 8) * bitW;
        itemW = bitW;
      } else {
        itemW = byteW;
        itemX = byteStartX;
      }

      const bitOffset = isBitLevel ? (7 - (i % 8)) : -1; 
      const b = bytes[byteIdx];
      if (b === undefined)
        continue;

      const val = isBitLevel ? ((b >> bitOffset) & 1) : b;

      if (flashH > 0) {
        let drawW;
        if (isBitLevel) {
          drawW = Math.max(1, itemW - 1);
          ctx.fillStyle = config.flashColor + (val ? '' : '66');
        } else {
          drawW = Math.max(1, itemW - 4);
          ctx.fillStyle = val !== 0 ? config.flashColor + '80' : 'rgba(255,255,255,0.03)';
        }
        ctx.fillRect(itemX, y, drawW, flashH);
      }

      let str = '';
      let color = '#ccc';
      let rotate = false;

      if (type === 'hex') {
        str = val.toString(16).padStart(2, '0').toUpperCase();
        if (val === 0) color = '#4a5468';
        else if (isPrint(val)) color = '#9ca8be';
        else color = '#7eaaef';
      } else if (type === 'ascii') {
        const print = isPrint(val);
        str = print ? String.fromCharCode(val) : '\u00b7';
        color = print ? '#e8b634' : '#2e2840';
      } else if (type === 'bit10') {
        str = val.toString();
        color = val ? '#c084fc' : '#586070';
      } else if (type === 'bitsym') {
        str = SYMBOLS[7 - bitOffset];
        color = val ? '#c084fc' : '#5a6278';
        rotate = true;
      }

      ctx.fillStyle = color;

      if (config.fontSize < 6) {
            // Minified representation
        const markW = Math.max(1, itemW * 0.5);
        const markH = Math.max(1, config.fontSize);
        ctx.fillRect(itemX + (itemW - markW) / 2, textY - markH / 2, markW, markH);
      } else {
        if (rotate) {
          ctx.save();
          ctx.translate(itemX + itemW / 2, textY);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(str, 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(str, itemX + itemW / 2, textY);
        }
      }
    }
    return advanceY;
  }
  /* PaneCameraNode has already put the hit point into world space, so the
     test is just the chunk's own band of rows. */
  static hit_test(XXXctxMix, node, params) {
    const v = ctxMix.getValue(ctxMix, node, params);
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    if (!v.chunkH) return;
    if (pt.y >= v.top && pt.y <= v.top + v.chunkH) ctxMix.hitResult = { node };
  }

}

SYS.NODE_CLASSES.push({ name: 'hex-chunk', cls: HexChunkNode });;
