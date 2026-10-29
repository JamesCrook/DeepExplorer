import { SYS } from '../omni-support/sys.js';
import { HexChunkNode } from '../nodes2d/hex-view-zone.js';
import { makeArray } from '../2d-support/make-array.js';
import { makeZoomableCamera } from '../2d-support/make-camera.js';
export { HexViewModel };

// Model 'HexaView' — a hex dump of synthetic data, one hex-chunk per visible row

class HexViewModel {
  get name() { return 'HexaView'; }
  get displayType() { return '2d'; }
  get background() { return '#08090d'; }

  constructor() {
    this.visible = true;

// Generate synthetic mock data
    const DATA_SIZE = 4096;
    const data = new Uint8Array(DATA_SIZE);
    for(let i = 0; i < DATA_SIZE; i++) {
    data[i] = (Math.sin(i * 0.1) * 127 + 128) | 0; // Wavy binary data
    if (i % 64 < 16) data[i] = 0; // Inject some zeros
  }
  const msg = "Welcome to the Hexaview Shingled Canvas. This data overlaps intentionally.";
  for(let i = 0; i < msg.length; i++) if (128 + i < DATA_SIZE) data[128 + i] = msg.charCodeAt(i);

    const hexData = {
      buffer: data,
      layoutConfig: { log2: 5, gap: 22, renderW: 1850 },
      configs: {
        hex: { enabled: true, bgColor: '#141047', flashColor: '#5b8def', fontSize: 34, rowHeight: 75, bgHeight: 100, flashHeight: 0 },
        ascii: { enabled: false, bgColor: '#2d1b0b', flashColor: '#5b8def', fontSize: 46, rowHeight: 70, bgHeight: 70, flashHeight: 0 },
        bit10: { enabled: false, bgColor: '#0c0a08', flashColor: '#1b22d6', fontSize: 8, rowHeight: 75, bgHeight: 100, flashHeight: 100 },
        bitsym: { enabled: false, bgColor: '#0c0a08', flashColor: '#1b22d6', fontSize: 6, rowHeight: 170, bgHeight: 170, flashHeight: 40 }
      }
    };

    this.arrayNode = makeArray('hex-chunk', hexData, {
      getValue: (mix, n, p, i) => {
        const bpr = 1 << hexData.layoutConfig.log2, offset = i * bpr;
        const bytes = hexData.buffer.slice(offset, offset + bpr);
        const printable = [...bytes].filter(b => b >= 0x20 && b <= 0x7e).length;
        const chunkH = HexChunkNode.getChunkHeight(hexData);
        return { offset, bpr, chunkH, top: 20 + i * chunkH, data: hexData,
                 tooltip: { name: 'Chunk 0x' + offset.toString(16).padStart(4, '0').toUpperCase(),
                            detail: bpr + ' bytes · offset ' + offset,
                            extra: printable + ' printable' } };
      },
      // A large dump must not instantiate a chunk per row that is off screen.
      visibleRange: (mix, node, params) => {
        const chunkH = HexChunkNode.getChunkHeight(hexData);
        if (!chunkH) return [0, node.value.count];
        const { H, oy, Z } = mix.getWH(mix, node, params);
        const top = (oy || 0), bottom = top + (H / (Z || 1));
        const from = Math.max(0, Math.floor((top - 20) / chunkH) - 1);
        const to = Math.min(node.value.count, Math.ceil((bottom - 20) / chunkH) + 1);
        return [from, Math.max(from, to)];
      },
    });
    this.sceneRoot = makeZoomableCamera(this.arrayNode, { scrollX: -20, scrollY: -20 });

    this.controls = [
      {type:'separator', label:'Layout Settings'},
      {id:'layout_renderW', label:'Width px', min:400, max:4000, step:10, value:hexData.layoutConfig.renderW},
      {id:'layout_log2', label:'Log2 B/R', min:2, max:8, step:1, value:hexData.layoutConfig.log2},
      {id:'layout_gap', label:'Gap / 8B', min:0, max:64, step:1, value:hexData.layoutConfig.gap}
    ];

    ['hex', 'ascii', 'bit10', 'bitsym'].forEach(t => {
      const c = hexData.configs[t];
      const isBit = (t === 'bit10' || t === 'bitsym');
      this.controls.push({type:'separator', label: t.toUpperCase() + ' Settings'});
      this.controls.push({id: t+'_enabled', type:'checkbox', label:'Enabled', value: c.enabled});
      this.controls.push({id: t+'_bgColor', type:'color', label:'Bg Color', value: c.bgColor});
      this.controls.push({id: t+'_flashColor', type:'color', label:'Flash Color', value: c.flashColor});
      this.controls.push({id: t+'_fontSize', label:'Font Size', min:isBit?1:6, max:isBit?22:64, step:1, value: c.fontSize});
      this.controls.push({id: t+'_rowHeight', label:'Row %', min:0, max:200, step:1, value: c.rowHeight});
      this.controls.push({id: t+'_bgHeight', label:'Bg %', min:0, max:200, step:1, value: c.bgHeight});
      this.controls.push({id: t+'_flashHeight', label:'Flash %', min:0, max:200, step:1, value: c.flashHeight});
    });
  }

  onControl(id, val, getValues, app) {
    const hexData = this.arrayNode.value.data;
    if (id.startsWith('layout_')) {
      const prop = id.replace('layout_', '');
      if (hexData.layoutConfig[prop] !== undefined) hexData.layoutConfig[prop] = val;
    } else {
      const parts = id.split('_');
      if (parts.length === 2) {
        const type = parts[0];
        const prop = parts[1];
        if (hexData.configs[type] && hexData.configs[type][prop] !== undefined) {
          hexData.configs[type][prop] = val;
        }
      }
    }

// Request a redraw on the specific pane's harness
    if (app && app.paneEls) {
      const i = SYS.MODELS.indexOf(this);
      const pane = app.paneEls[i];
      if (pane) {
        const canvas = pane.querySelector('canvas');
        canvas?.harness?.draw();
      }
    }
  }
}
SYS.MODELS.push(new HexViewModel());
