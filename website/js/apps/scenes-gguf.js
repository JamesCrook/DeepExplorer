/**
 * scenes-gguf.js — GGUF model viewer scenes
 *
 * Brought back from attic/unfolded/omni-gguf.js onto the scene graph.  The old
 * app cross-faded a text view and a canvas view; here they are two scenes over
 * the same loaded file:
 *
 *   gguf-blocks    (2D)    scene-root > layer (centred, zoomable) > tensor-block…
 *   gguf-metadata  (HTML)  scene-root > layer > html-box > html-text (raw report)
 *
 * The loaded file lives in GGUF (below), shared by both.  Each scene's
 * layer.inst.updateValues writes its nodes from it before every render, so
 * loading a file, or changing blockSpacing, needs nothing more than a render.
 */

import { MiniAstNode, SCENES } from '../omni-support/scene.js';
import { Values } from '../omni-support/values.js';
import {
  DynamicFileReader, GGUFParser, ModelData,
  ggufReport, groupTensorsByBlock, tensorColor,
} from '../parsers/gguf-parser.js';
import '../nodes2d/tensor-block-node.js';
import '../nodes-html/html-nodes.js';

// ── The loaded file, shared by both scenes ──────────────
const GGUF = { model: null, report: '', fileName: '' };

const EMPTY_REPORT = 'Drop a GGUF file to begin...';

async function loadGguf(file, maxTensors) {
  const parsed = await GGUFParser.parseGGUF(new DynamicFileReader(file), maxTensors);
  GGUF.model = new ModelData(file, parsed);
  GGUF.report = ggufReport(GGUF.model);
  GGUF.fileName = file.name;
}

// ═══════════════════════════════════════════════════════
//  BLOCK LAYOUT — the old GGUFRenderer.drawBlocks, as values
// ═══════════════════════════════════════════════════════

const BLOCK_W = 180, BLOCK_H = 120, PER_ROW = 10;

function formatCount(num) {
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return String(num);
}

/** Block values in local units, origin at the layout's centre. */
function layoutBlocks(model, gap) {
  const blocks = groupTensorsByBlock(model.tensors);
  const out = [];
  let y = 0;
  const row = (list) => {           // a run of blocks, wrapping every PER_ROW
    if (!list.length) return;
    let x = 0;
    list.forEach((b, i) => {
      if (i > 0 && i % PER_ROW === 0) { y += BLOCK_H + gap; x = 0; }
      out.push({ ...b, x, y });
      x += BLOCK_W + gap;
    });
    y += BLOCK_H + gap;
  };
  if (blocks.embedding.length) row([{ name: 'Embedding', tensors: blocks.embedding }]);
  // Transformer blocks in rows of ten: a new row whenever the tens digit changes.
  for (let start = 0; start < blocks.layers.length; start += PER_ROW) {
    row(blocks.layers.slice(start, start + PER_ROW).map((t, i) => ({ name: `Block ${start + i}`, tensors: t })));
  }
  if (blocks.output.length) row([{ name: 'Output', tensors: blocks.output }]);

  const width = Math.max(0, ...out.map(b => b.x + BLOCK_W));
  const height = Math.max(0, y - gap);
  return out.map(b => {
    const total = b.tensors.reduce((sum, t) => sum + t.dimensions.reduce((a, d) => a * d, 1), 0);
    return {
      x: b.x - width / 2, y: b.y - height / 2, w: BLOCK_W, h: BLOCK_H,
      name: b.name, total: formatCount(total),
      tensors: b.tensors.slice(0, 3).map(t => ({ name: t.name, color: tensorColor(t.name) })),
      more: Math.max(0, b.tensors.length - 3),
    };
  });
}

/**
 * The model step for the block view.  The node set is rebuilt only when the
 * file or the spacing changes; otherwise the values already written stand.
 */
function updateBlockValues(layer, params) {
  const gap = params.blockSpacing ?? 20;
  const key = `${GGUF.fileName}|${gap}`;
  if (layer.inst.layoutKey === key) return;
  layer.inst.layoutKey = key;
  const values = GGUF.model
    ? layoutBlocks(GGUF.model, gap)
    : [{ x: -BLOCK_W, y: -BLOCK_H / 2, w: BLOCK_W * 2, h: BLOCK_H, name: 'Drop a GGUF file to begin', tensors: [], more: 0 }];
  layer.subtree = values.map(v => new MiniAstNode('tensor-block', [], v));
}

/** The model step for the metadata view. */
function updateReportValues(layer) {
  Values.setValue(Values, layer.inst.textNode, null, { text: GGUF.report || EMPTY_REPORT });
}

// ═══════════════════════════════════════════════════════
//  CONTROLS — shared by both scenes
// ═══════════════════════════════════════════════════════

function mkButton(text, onClick, secondary = false) {
  const btn = document.createElement('button');
  btn.className = secondary ? 'btn secondary' : 'btn';
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = old; }, 1500);
}

function sectionLoad() {
  return [{
    group: 'Load Model', id: 'gguf-load', abbrev: 'Load',
    type: 'filedrop',
    label: 'Drop GGUF file or click',
    accept: '.gguf',
    onDrop: async (files, layer, app) => {
      const file = files?.[0];
      if (!file) return;
      app.controls.setStatus('Loading GGUF file...', false);
      try {
        await loadGguf(file, layer.value.params.maxTensors ?? 500);
        app.controls.clearStatus();
      } catch (err) {
        console.error('Error loading GGUF:', err);
        app.controls.setStatus('Error: ' + err.message, true);
      }
      app._rebuildContext();          // the stats and info sections show the new file
      app.render();
    },
  }, {
    group: 'Max Tensors', id: 'gguf-max', abbrev: 'Max', sliders: [
      { id: 'maxTensors', label: 'Max tensors to load (next file)', min: 50, max: 500, step: 50, default: 500, format: 'int' },
    ],
  }];
}

function sectionStats() {
  return [{
    group: 'Model', id: 'gguf-model', abbrev: 'Info',
    type: 'custom',
    build: (groupEl) => {
      const m = GGUF.model;
      if (!m) {
        groupEl.insertAdjacentHTML('beforeend', '<div class="info-panel visible"><p>Load a GGUF file to see model details.</p></div>');
        return;
      }
      const stats = m.getStats(), info = m.getInfoText();
      const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      groupEl.insertAdjacentHTML('beforeend', `
        <div class="model-stats" style="display:grid">
          <div class="stat-item"><span>Architecture:</span><span class="stat-value">${esc(stats.arch)}</span></div>
          <div class="stat-item"><span>Layers:</span><span class="stat-value">${esc(stats.layers)}</span></div>
          <div class="stat-item"><span>Tensors:</span><span class="stat-value">${stats.tensors} / ${stats.totalTensors}</span></div>
          <div class="stat-item"><span>File Size:</span><span class="stat-value">${esc(stats.size)}</span></div>
        </div>
        <div class="info-panel visible">
          <p><strong>Context Length:</strong> ${esc(info.context)}</p>
          <p><strong>Embedding Dim:</strong> ${esc(info.embedding)}</p>
          <p><strong>Attention Heads:</strong> ${esc(info.heads)}</p>
        </div>`);
      const copy = mkButton('Copy Metadata', () =>
        navigator.clipboard.writeText(GGUF.report).then(() => flash(copy, 'Copied!')));
      const download = mkButton('Download Metadata', () => {
        const url = URL.createObjectURL(new Blob([GGUF.report], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${GGUF.fileName.replace(/\.gguf$/, '')}_metadata.txt`;
        a.click();
        URL.revokeObjectURL(url);
        flash(download, 'Downloaded!');
      }, true);
      groupEl.append(copy, download);
    },
  }];
}

function blocksBuildUI(layer) {
  return [
    ...sectionLoad(),
    ...sectionStats(),
    { group: 'Visualization', id: 'gguf-viz', abbrev: 'Viz', sliders: [
      { id: 'blockSpacing', label: 'Block spacing', min: 10, max: 50, step: 1, default: 20, format: 'int' },
      { id: 'zoom',         label: 'Zoom',          min: 0.1, max: 5, step: 0.1, default: 1 },
    ]},
    {
      group: 'Labels', id: 'gguf-labels', abbrev: 'Lbl',
      type: 'select', selectId: 'ggufLabels',
      options: [
        { value: 'all',    label: 'All',         selected: layer.value.params.showLabels === 'all' },
        { value: 'blocks', label: 'Blocks only', selected: layer.value.params.showLabels === 'blocks' },
        { value: 'none',   label: 'None',        selected: layer.value.params.showLabels === 'none' },
      ],
      onChange: (value, controls) => { layer.value.params.showLabels = value; controls.render(); },
    },
    {
      group: 'Reset', id: 'gguf-reset', abbrev: 'Rst',
      type: 'custom',
      build: (groupEl, lyr, app) => groupEl.appendChild(mkButton('Reset View', () => {
        Object.assign(lyr.value.params, { zoom: 1, panX: 0, panY: 0 });
        app.controls.updateSliderDOM('zoom', 1);
        app.render();
      })),
    },
  ];
}

function metadataBuildUI() {
  return [...sectionLoad(), ...sectionStats()];
}

// ═══════════════════════════════════════════════════════
//  SCENES
// ═══════════════════════════════════════════════════════

function createBlockScene() {
  const layer = new MiniAstNode('layer', [], {
    name: 'GGUF blocks', visible: true, center: true,
    params: { zoom: 1, panX: 0, panY: 0, blockSpacing: 20, showLabels: 'all', maxTensors: 500 },
  });
  layer.inst = { buildUI: blocksBuildUI, presets: null, updateValues: updateBlockValues, layoutKey: null };
  return new MiniAstNode('scene-root', [layer]);
}

function createMetadataScene() {
  const textNode = new MiniAstNode('html-text', [], { tag: 'pre', raw: true, text: EMPTY_REPORT });
  const box = new MiniAstNode('html-box', [textNode], {
    scroll: 'y',
    style: 'height:100%;box-sizing:border-box;padding:16px 20px;margin:0;'
      + 'font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#c9d1d9;'
      + 'white-space:pre;overflow:auto;',
  });
  const layer = new MiniAstNode('layer', [box], {
    name: 'GGUF metadata', visible: true, params: { maxTensors: 500 },
  });
  layer.inst = { buildUI: metadataBuildUI, presets: null, updateValues: updateReportValues, textNode };
  return new MiniAstNode('scene-root', [layer]);
}

SCENES.push(
  { id: 'gguf-blocks',   label: 'Model blocks', group: 'GGUF', hasLayers: false, create: createBlockScene },
  { id: 'gguf-metadata', label: 'Metadata',     group: 'GGUF', hasLayers: false, displayMode: 'html', create: createMetadataScene },
);

export { GGUF, loadGguf };
