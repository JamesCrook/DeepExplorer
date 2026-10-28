/**
 * scenes-run.js — algorithm trace scenes (FFT, Smith-Waterman, MultiGrid)
 *
 * Brought back from attic/unfolded/omni-run.js onto the scene graph.  The old
 * app drew one prototype cell per grid position through a custom iterator,
 * writing positions onto the shared prototype as it went.  Here every cell and
 * link is a real node, and the model writes their values:
 *
 *   scene-root > layer (centred, zoomable) > [trace-link…, trace-cell…]
 *
 * layer.inst.updateValues(layer, params) runs before each render (see
 * OmniSceneApp.render).  It reads params.time, asks the algorithm about every
 * cell, and writes colours and links.  The nodes have no logic of their own.
 */

import { MiniAstNode, SCENES } from '../omni-support/scene.js';
import { Values } from '../omni-support/values.js';
import { ALGORITHM_TRACES } from '../models/algorithm-traces.js';
import '../nodes2d/trace-cell-node.js';
import '../nodes2d/trace-link-node.js';

const READY = '#4a4';
const WAITING = '#333';

// Local area the grid is laid out in, centred on the origin.
const AREA_W = 760;
const AREA_H = 600;

const PRESETS = {
  Wide:  { fillOpacity: 0.1, strokeWidth: 1.3, topWidth: 0, zoom: 1,    linkWidth: 2, time: 30 },
  Tight: { fillOpacity: 0.1, strokeWidth: 1.3, topWidth: 2, zoom: 0.28, linkWidth: 1, time: 50 },
  Done:  { fillOpacity: 0.1, strokeWidth: 1.3, topWidth: 0, zoom: 1,    linkWidth: 2, time: 100 },
};

function runBuildUI() {
  return [
    { group: 'Time', id: 'run-time', abbrev: 'Time', sliders: [
      { id: 'time', label: 'time', min: 0, max: 100, step: 1, default: 20 },
    ]},
    { group: 'Style', id: 'run-style', abbrev: 'Sty', sliders: [
      { id: 'fillOpacity', label: 'fillOpacity', min: 0, max: 1, step: 0.01, default: 1 },
      { id: 'strokeWidth', label: 'strokeWidth', min: 0, max: 3, step: 0.1, default: 0 },
      { id: 'topWidth',    label: 'topWidth',    min: 0, max: 5, step: 0.1, default: 0 },
      { id: 'linkWidth',   label: 'linkWidth',   min: 0, max: 5, step: 0.1, default: 1.7 },
    ]},
    { group: 'View', id: 'run-view', abbrev: 'View', sliders: [
      { id: 'zoom', label: 'zoom', min: 0.25, max: 2, step: 0.01, default: 1 },
    ]},
  ];
}

/** Grid geometry for an algorithm: cell spacing, dot size, and each cell's centre. */
function gridGeometry(alg) {
  const { rows, cols } = alg.size();
  const cellW = AREA_W / cols, cellH = AREA_H / rows;
  return {
    rows, cols, cellW, cellH,
    size: Math.min(cellW, cellH),
    at: (row, col) => ({ x: (col - (cols - 1) / 2) * cellW, y: (row - (rows - 1) / 2) * cellH }),
  };
}

/**
 * The model step: write every cell's colour, and rebuild the links, for the
 * current time.  Links come and go with time (MultiGrid shows only the
 * current cell's inputs), so they are replaced rather than updated.
 */
function updateRunValues(layer, params) {
  const { alg, geo, cells, linkGroupIndex } = layer.inst;
  const time = params.time ?? 20;
  const links = [];
  for (let row = 0; row < geo.rows; row++) {
    for (let col = 0; col < geo.cols; col++) {
      const info = alg.getCell(row, col, time);
      Values.setValue(Values, cells[row * geo.cols + col], null, { color: info.isReady > 0 ? READY : WAITING });
      const to = geo.at(row, col);
      for (const conn of info.connections) {
        const from = geo.at(conn.row, conn.col);
        links.push(new MiniAstNode('trace-link', [], {
          x1: from.x, y1: from.y, x2: to.x, y2: to.y,
          color: conn.state > 0 ? READY : WAITING,
          bend: conn.bendHint || 0,
          inset: geo.size * 0.45,   // the circle radius (trace-cell draws 0.9 * size across)
        }));
      }
    }
  }
  layer.subtree[linkGroupIndex].subtree = links;
}

function createRunScene(algName) {
  const alg = ALGORITHM_TRACES[algName];
  const geo = gridGeometry(alg);

  const cells = [];
  for (let row = 0; row < geo.rows; row++) {
    for (let col = 0; col < geo.cols; col++) {
      cells.push(new MiniAstNode('trace-cell', [], {
        ...geo.at(row, col), size: geo.size, color: WAITING, label: `${row},${col}`,
      }));
    }
  }

  // Links are drawn first, under the cells.  An unnamed 'layer' is just a group.
  const linkGroup = new MiniAstNode('layer', [], { visible: true });
  const cellGroup = new MiniAstNode('layer', cells, { visible: true });

  const layer = new MiniAstNode('layer', [linkGroup, cellGroup], {
    name: algName, visible: true, center: true,
    params: { ...PRESETS.Wide, fontSize: 12 },
  });
  layer.inst = {
    buildUI: runBuildUI,
    presets: PRESETS,
    updateValues: updateRunValues,
    alg, geo, cells, linkGroupIndex: 0,
  };
  return new MiniAstNode('scene-root', [layer]);
}

SCENES.push(
  { id: 'run-fft',      label: 'FFT',            group: 'Algorithms', hasLayers: false, create: () => createRunScene('FFT') },
  { id: 'run-sw',       label: 'Smith-Waterman', group: 'Algorithms', hasLayers: false, create: () => createRunScene('SmithWaterman') },
  { id: 'run-multigrid', label: 'MultiGrid',     group: 'Algorithms', hasLayers: false, create: () => createRunScene('MultiGrid') },
);

export { createRunScene };
