// scenes-grid.js — OmniGrid matrix and heatmap viewer scene
/**
 * Brought back from attic/unfolded/omni-grid.js.  The renderer is wrapped
 * whole as one opaque grid-view node, for now:
 *
 *   scene-root > layer (grid options as params) > grid-view
 *
 * The app's other work lives here, as the model: choosing and loading data,
 * the dedup filter, and keeping the panel's sliders and info lines in step
 * with what the grid did under the pointer (layer.inst.updateValues).
 */

import { MiniAstNode, SCENES } from '../omni-support/scene.js';
import { AppUtils } from '../omni-support/app-utils.js';
import { CSVData, MiscData } from '../data/csv-data.js';
import { randomMatrix, waveMatrix, multiplicationTable, gradientMatrix } from '../data/demo-fns.js';
import { FilteredGridData, OMNIGRID_PRESETS } from '../2d-support/grid-scene.js';
import { GridViewNode } from '../nodes2d/grid-view-node.js';

// ── Data sources ─────────────────────────────────────────
// sized: takes 'small' | 'medium' | 'large'.
const SAMPLES = {
  pam250:         { label: 'PAM250 Matrix',        make: () => MiscData.pam250() },
  cities:         { label: 'City Distances',       make: s => MiscData.cities(s), sized: true },
  sales:          { label: 'Product Sales',        make: () => MiscData.productSales() },
  footfall:       { label: 'Location Footfall',    make: () => MiscData.locationFootfall() },
  random:         { label: 'Random Matrix',        make: randomMatrix,        sized: true },
  wave:           { label: 'Wave Pattern',         make: waveMatrix,          sized: true },
  multiplication: { label: 'Multiplication Table', make: multiplicationTable, sized: true },
  gradient:       { label: 'Diagonal Gradient',    make: gradientMatrix,      sized: true },
};

const COLOR_SCHEMES = [
  { value: 'red-green',     label: 'Red ↔ Green' },
  { value: 'blue-red',      label: 'Blue ↔ Red' },
  { value: 'purple-orange', label: 'Purple ↔ Orange' },
  { value: 'cyan-magenta',  label: 'Cyan ↔ Magenta' },
];

// ═══════════════════════════════════════════════════════
//  MODEL — data in, filters, keeping the panel in step
// ═══════════════════════════════════════════════════════

function isDistanceMatrix(data) {
  if (data.rowCount !== data.colCount) return false;
  for (let i = 0; i < data.rowCount; i++) {
    if (data.getRowName(i) !== data.getColName(i)) return false;
  }
  return true;
}

/** Show data: reset the view, and set the distance-matrix defaults as the old app did. */
function showData(layer, data, controls) {
  const p = layer.value.params, grid = layer.inst.grid;
  GridViewNode.setData(grid, data);
  const distance = isDistanceMatrix(data);
  Object.assign(p, {
    distanceMatrix: distance ? 0.7 : 0.5,
    reverseRows: distance ? 1 : 0,
    zoom: 1,
  });
  GridViewNode.markZoom(grid, 1);
  for (const id of ['distanceMatrix', 'reverseRows', 'zoom']) controls?.updateSliderDOM(id, p[id]);
}

function loadSample(layer, id, controls) {
  const src = SAMPLES[id];
  if (!src) return;
  const st = layer.inst;
  st.sampleId = id;
  st.original = null;                         // dedup works on loaded CSVs only
  resetDedup(layer, controls);
  showData(layer, src.make(st.size), controls);
}

function loadCsvText(layer, text, controls) {
  const st = layer.inst;
  const data = new CSVData(text);
  st.sampleId = '';
  st.original = data;
  st.dedupCol = data.headers.length > 1 ? 1 : 0;
  resetDedup(layer, controls);
  showData(layer, data, controls);
}

function resetDedup(layer, controls) {
  layer.value.params.dedupLevel = 0;
  layer.inst.dedupApplied = 0;
  controls?.updateSliderDOM('dedupLevel', 0);
}

/** Slider 0 → no filter, 0.5 → 12-character prefix, 1 → 1 character. */
function dedupPrefixLen(s) {
  if (s <= 0) return Infinity;
  if (s >= 1) return 1;
  return Math.round(1 / Math.pow(s, Math.log2(12)));
}

/** Keep the first row of each distinct prefix of the dedup column. */
function applyDedup(layer, controls) {
  const st = layer.inst, src = st.original;
  st.dedupApplied = layer.value.params.dedupLevel ?? 0;
  if (!src) return;
  const prefixLen = dedupPrefixLen(st.dedupApplied);
  const total = src.rows.length;
  let data = src;
  if (prefixLen !== Infinity) {
    const seen = new Set(), kept = [];
    for (let i = 0; i < total; i++) {
      const key = String(src.rows[i][st.dedupCol] ?? '').toLowerCase().substring(0, prefixLen);
      if (!seen.has(key)) { seen.add(key); kept.push(i); }
    }
    if (kept.length !== total) data = new FilteredGridData(src, kept);
  }
  const level = layer.value.params.dedupLevel;
  showData(layer, data, controls);
  layer.value.params.dedupLevel = level;      // showData leaves it; keep the slider's value
}

function dedupInfoText(layer) {
  const st = layer.inst, src = st.original;
  if (!src) return 'No CSV loaded';
  const total = src.rows.length;
  const prefixLen = dedupPrefixLen(st.dedupApplied);
  if (prefixLen === Infinity) return `${total} rows (no filter)`;
  const shown = layer.inst.grid.inst.renderer.gridData?.rowCount ?? total;
  return `${shown}/${total} rows (prefix ${prefixLen} char${prefixLen !== 1 ? 's' : ''})`;
}

function csvQuote(value, delim) {
  const s = value == null ? '' : String(value);
  if (!s.includes(delim) && !s.includes('"') && !s.includes('\n')) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** The data as shown (after dedup), as a CSV download. */
function saveCsv(layer) {
  const data = layer.inst.grid.inst?.renderer?.gridData;
  const raw = data?.grid;
  if (!raw?._colNames) { alert('No CSV data loaded'); return; }
  const delim = raw.delimiter || ',';
  const q = v => csvQuote(v, delim);
  const lines = [(raw._hasRowNames ? ['', ...raw._colNames] : [...raw._colNames]).map(q).join(delim)];
  for (let r = 0; r < data.rowCount; r++) {
    const row = raw._hasRowNames ? [q(data.getRowName(r))] : [];
    for (let c = 0; c < data.colCount; c++) row.push(q(data.getValue([r, c])));
    lines.push(row.join(delim));
  }
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'filtered.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The model step, before each render: apply a moved dedup slider, and bring
 * the panel up to date with the grid (zoom and focusAlign follow wheel and
 * drag; the info lines follow everything).
 */
function updateGridValues(layer, params, app) {
  const st = layer.inst;
  if ((params.dedupLevel ?? 0) !== st.dedupApplied) applyDedup(layer, app.controls);

  // What the pointer did to the grid since the last render, into params and sliders.
  const moved = GridViewNode.readBack(st.grid, params);
  for (const [id, v] of Object.entries(moved)) {
    params[id] = v;
    app.controls.updateSliderDOM(id, v);
  }

  const r = st.grid.inst?.renderer;
  const vis = document.getElementById('infoVisible');
  const tot = document.getElementById('infoTotal');
  if (vis && tot && r?.gridData) {
    const { startRow, endRow, startCol, endCol } = r.getVisibleRange();
    vis.textContent = `${endRow - startRow + 1}×${endCol - startCol + 1}`;
    tot.textContent = `${r.gridData.rowCount}×${r.gridData.colCount}`;
  }
  const info = document.getElementById('dedupInfo');
  if (info) info.textContent = dedupInfoText(layer);
}

// ═══════════════════════════════════════════════════════
//  CONTROLS — the old app's sections
// ═══════════════════════════════════════════════════════

function gridBuildUI(layer) {
  const st = layer.inst;
  return [
    {
      group: 'Load Data', id: 'grid-load', abbrev: 'Load',
      type: 'filedrop', label: 'Drop CSV file or click', accept: '.csv,.txt',
      onDrop: (files, lyr, app) => {
        const file = files?.[0];
        if (!file) return;
        file.text().then(text => {
          try { loadCsvText(lyr, text, app.controls); }
          catch (err) { alert('Error parsing CSV: ' + err.message); return; }
          app._rebuildContext();            // sample select and dedup column list change
          app.render();
        });
      },
    },
    {
      group: 'Sample Data', id: 'grid-sample', abbrev: 'Smp',
      type: 'select', selectId: 'sampleSelect',
      options: [
        { value: '', label: '-- Select sample --', selected: !st.sampleId },
        ...Object.entries(SAMPLES).map(([value, s]) => ({ value, label: s.label, selected: value === st.sampleId })),
      ],
      onChange: (value, controls) => { if (value) { loadSample(layer, value, controls); controls.render(); } },
    },
    {
      group: 'Sample Size', id: 'grid-size', abbrev: 'Size',
      type: 'custom',
      build: (groupEl, lyr, app) => groupEl.appendChild(AppUtils.createSizeSelector({
        defaultSize: st.size,
        onChange: (size) => {
          st.size = size;
          if (st.sampleId) { loadSample(lyr, st.sampleId, app.controls); app.render(); }
        },
      })),
    },
    { group: 'Data Options', id: 'grid-data', abbrev: 'Dat', sliders: [
      { id: 'distanceMatrix',     label: 'Distance matrix',      min: 0, max: 1, step: 0.01, default: 0 },
      { id: 'reverseRows',        label: 'Reverse Rows',         min: 0, max: 1, step: 0.01, default: 0 },
      { id: 'reverseCols',        label: 'Reverse Cols',         min: 0, max: 1, step: 0.01, default: 0 },
      { id: 'headersAffectWidth', label: 'Headers affect width', min: 0, max: 1, step: 0.01, default: 0 },
    ]},
    { group: 'Display', id: 'grid-display', abbrev: 'Dis', sliders: [
      { id: 'colorTarget',    label: 'Color target (bg↔fg)', min: 0, max: 1, step: 0.01, default: 0 },
      { id: 'smoothGradient', label: 'Smooth gradient',      min: 0, max: 1, step: 0.01, default: 1 },
      { id: 'blobMode',       label: 'Blob mode',            min: 0, max: 1, step: 0.01, default: 0 },
      { id: 'decimalPlaces',  label: 'Decimal places',       min: 0, max: 6, step: 1,    default: 2, format: 'int' },
      { id: 'textAlign',      label: 'Text align (L↔R)',     min: 0, max: 1, step: 0.01, default: 0.5 },
      { id: 'indexOverlay',   label: 'Index overlay',        min: 0, max: 1, step: 0.01, default: 0 },
    ]},
    {
      group: 'Display', id: 'grid-scheme',
      type: 'select', selectId: 'colorScheme', label: 'Color scheme',
      options: COLOR_SCHEMES.map(s => ({ ...s, selected: s.value === layer.value.params.colorScheme })),
      onChange: (value, controls) => { layer.value.params.colorScheme = value; controls.render(); },
    },
    { group: 'View', id: 'grid-view', abbrev: 'View', sliders: [
      { id: 'zoom', label: 'Zoom', min: 0.01, max: 2, step: 0.01, default: 1 },
    ]},
    {
      group: 'View', id: 'grid-view-actions',
      type: 'custom',
      build: (groupEl, lyr, app) => {
        groupEl.appendChild(AppUtils.createButton({
          text: 'Reset View',
          onClick: () => {
            GridViewNode.renderer(st.grid).resetView();
            lyr.value.params.zoom = 1;
            GridViewNode.markZoom(st.grid, 1);
            app.render();
          },
        }));
        groupEl.appendChild(AppUtils.createInfoRow({
          items: [
            { label: 'Visible', id: 'infoVisible', value: '0×0' },
            { label: 'Data',    id: 'infoTotal',   value: '0×0' },
          ],
          className: 'grid-info',
          style: { marginTop: '8px' },
        }));
      },
    },
    { group: 'Focus', id: 'grid-focus', abbrev: 'Foc', sliders: [
      { id: 'focusAlign', label: 'Focus align (top↔bot)', min: 0, max: 1, step: 0.001, default: 0.5 },
    ]},
    { group: 'Dedup Filter', id: 'grid-dedup', abbrev: 'Dup', sliders: [
      { id: 'dedupLevel', label: 'Dedup (none↔aggressive)', min: 0, max: 1, step: 0.01, default: 0 },
    ]},
    {
      group: 'Dedup Filter', id: 'grid-dedup-col',
      type: 'custom',
      build: (groupEl, lyr, app) => {
        const headers = st.original?.headers || [];
        groupEl.appendChild(AppUtils.createSelectRow({
          id: 'dedupColSelect', label: 'Column',
          options: headers.length
            ? headers.map((h, i) => ({ value: String(i), label: h || `Col ${i + 1}` }))
            : [{ value: '1', label: 'Column 2 (default)' }],
          onChange: (value) => {
            st.dedupCol = parseInt(value, 10);
            applyDedup(lyr, app.controls);
            app.render();
          },
        }));
        const sel = groupEl.querySelector('#dedupColSelect');
        if (sel && headers.length) sel.value = String(st.dedupCol);
        groupEl.appendChild(AppUtils.createInfoLine({ id: 'dedupInfo', text: dedupInfoText(lyr) }));
        groupEl.appendChild(AppUtils.createButton({
          text: 'Save CSV', style: { marginTop: '6px' }, onClick: () => saveCsv(lyr),
        }));
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════
//  SCENE
// ═══════════════════════════════════════════════════════

function createGridScene() {
  const grid = new MiniAstNode('grid-view', [], {});
  const layer = new MiniAstNode('layer', [grid], {
    name: 'Grid', visible: true,
    params: {
      ...OMNIGRID_PRESETS.Standard,
      colorScheme: 'red-green', zoom: 1, focusAlign: 0.5, dedupLevel: 0,
    },
  });
  layer.inst = {
    buildUI: gridBuildUI,
    presets: OMNIGRID_PRESETS,
    updateValues: updateGridValues,
    grid,
    sampleId: 'cities', size: 'medium',
    original: null, dedupCol: 1, dedupApplied: 0,
  };
  loadSample(layer, 'cities', null);
  return new MiniAstNode('scene-root', [layer]);
}

SCENES.push(
  { id: 'grid-viewer', label: 'Matrix viewer', group: 'Grid', hasLayers: false, create: createGridScene },
);

export { createGridScene, SAMPLES };
