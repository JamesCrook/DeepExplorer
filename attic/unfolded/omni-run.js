/* ============================================
   ChartScene - Unified Charting Engine
   ============================================
   
   Includes:
   - ChartScene: Core rendering engine with presets
   - Algorithm classes: FFT, SmithWaterman, MultiGrid
*/

import { AppUtils } from '../omni-support/app-utils.js';
import { SvgScene } from '../omni-support/svg-scene.js';
import { CanvasScene, GenericScene } from '../omni-support/canvas-scene.js';
import { sceneRegistry, MiniAstNode } from '../../../deep-explorer/js/omni-support/scene.js';
import { WarpedRectanglesNode, OverlayNode } from '../../../deep-explorer/js/nodes2d/structural-nodes.js';
import { WarpedPolygon } from '../../../deep-explorer/js/nodes2d/warped-polygon.js';
import { Vector2D } from '../../../deep-explorer/js/2d-support/vector2d.js';
import { OmniApp } from '../../../deep-explorer/js/omni-support/omni-app.js'
import { OmniControlPanel } from '../../../deep-explorer/js/omni-support/omni-control-panel.js'
import { } from '../../../deep-explorer/js/nodes2d/algorithms-node.js'

// ============================================================
// Algorithm Classes
// ============================================================

class FFT {
  static rows = 16;
  static cols = 5;

  static size = () => ({ rows: FFT.rows, cols: FFT.cols });

  // Returns cell state and its input connections
  // time is 0-100 representing progress
  static getCell = (row, col, time) => {
    const n = col * FFT.rows + row;
    const cellProgress = (n * 100) / (FFT.rows * FFT.cols);
    const isReady = cellProgress < time ? 1 : 0;

    const connections = [];

    if (col > 0) {
      const dftSize = 1 << (col - 1);
      const dDftSize = dftSize * 2;

      // Two inputs for FFT butterfly
      for (let input = 0; input < 2; input++) {
        const connectionProgress = ((n * 2 + input) * 100) / (2 * FFT.rows * FFT.cols);
        const connectionState = connectionProgress < time ? 1 : 0;

        const sourceRow = (input === 0) 
          ? row 
          : (row + dftSize) % dDftSize + Math.floor(row / dDftSize) * dDftSize;

        const bendDirection = input * 0.3 * (((row & dftSize) > 0) ? -1 : 1);

        connections.push({
          row: sourceRow,
          col: col - 1,
          state: connectionState,
          bendHint: bendDirection
        });
      }
    }

    return { isReady, connections };
  };

}


class SmithWaterman {
  static rows = 12;
  static cols = 12;

  static size = () => ({ rows: SmithWaterman.rows, cols: SmithWaterman.cols });

  // Smith-Waterman fills in same order as FFT (column-major)
  // Each cell depends on (i-1,j), (i,j-1), (i-1,j-1)
  static getCell = (row, col, time) => {
    const n = (col-1) * (SmithWaterman.rows-1) + row;
    let cellProgress = (n * 100) / ((SmithWaterman.rows-1) * (SmithWaterman.cols-1));
    let isReady = (cellProgress < time ? 1 : 0) ;

    const connections = [];

    if (row > 0 && col > 0) {
      // Three dependencies for Smith-Waterman
      const deps = [
        { row: row - 1, col: col, bendHint: 0 },      // from above
        { row: row, col: col - 1, bendHint: 0 },      // from left
        { row: row - 1, col: col - 1, bendHint: 0 }   // from diagonal
      ];
      for (const dep of deps) {
        const connectionState = cellProgress <= time ? 1 : 0;
        cellProgress -= 0.34; // three connections

        connections.push({
          row: dep.row,
          col: dep.col,
          state: connectionState,
          bendHint: dep.bendHint
        });
      }
    } else {
      isReady = true;
    } 

    return { isReady, connections };
  };

}


class MultiGrid {
  static levels = 4;
  static baseSize = 9;
  static rows = MultiGrid.baseSize;
  static cols = MultiGrid.baseSize;

  static size = () => ({ rows: MultiGrid.rows, cols: MultiGrid.cols });

  // Build the multigrid ordering: coarse to fine
  // Returns array of {row, col, level} in execution order
  static buildOrder = () => {
    const order = [];
    
    // For each V-cycle level (coarse to fine, then fine to coarse)
    for (let level = MultiGrid.levels - 1; level >= 0; level--) {
      const step = 1 << level;
      for (let r = 0; r <MultiGrid.rows; r += step) {
        for (let c = 0; c < MultiGrid.cols; c += step) {
          order.push({ row: r, col: c, level });
        }
      }
    }
    
    // Reverse pass (fine to coarse) for full V-cycle
    for (let level = 1; level < MultiGrid.levels; level++) {
      const step = 1 << level;
      for (let r = 0; r < MultiGrid.rows; r += step) {
        for (let c = 0; c < MultiGrid.cols; c += step) {
          order.push({ row: r, col: c, level, isUpward: true });
        }
      }
    }
    
    return order;
  };

  static executionOrder = MultiGrid.buildOrder();

  // Find the index of a cell in the execution order
  static findCellIndex = (row, col, time) => {
    const totalCells = MultiGrid.executionOrder.length;
    const currentIndex = Math.floor((time / 100) * totalCells);
    
    for (let i = 0; i < MultiGrid.executionOrder.length; i++) {
      if (MultiGrid.executionOrder[i].row === row && MultiGrid.executionOrder[i].col === col) {
        return { index: i, entry: MultiGrid.executionOrder[i], currentIndex };
      }
    }
    return { index: -1, entry: null, currentIndex };
  };

  static getCell = (row, col, time) => {
    const { index, entry, currentIndex } = MultiGrid.findCellIndex(row, col, time);
    
    // Cell is ready if its first occurrence has been processed
    const isReady = (index !== -1 && index < currentIndex) ? 1 : 0;
    
    const connections = [];

    // Only show connections for the currently active cell
    const isCurrentCell = (index === currentIndex);
    
    if (isCurrentCell && entry) {
      const step = 1 << entry.level;
      
      // Connections from neighboring cells at same level
      const neighbors = [
        { row: row - step, col: col },
        { row: row + step, col: col },
        { row: row, col: col - step },
        { row: row, col: col + step }
      ];

      for (const n of neighbors) {
        if (n.row >= 0 && n.row < MultiGrid.rows && n.col >= 0 && n.col < MultiGrid.cols) {
          const { index: nIndex } = MultiGrid.findCellIndex(n.row, n.col, time);
          const state = (nIndex !== -1 && nIndex < currentIndex) ? 1 : 0;
          
          connections.push({
            row: n.row,
            col: n.col,
            state,
            bendHint: 0
          });
        }
      }

      // Connection from coarser level (if in downward pass)
      if (!entry.isUpward && entry.level < MultiGrid.levels - 1) {
        const coarseStep = 1 << (entry.level + 1);
        const coarseRow = Math.floor(row / coarseStep) * coarseStep;
        const coarseCol = Math.floor(col / coarseStep) * coarseStep;
        
        if (coarseRow !== row || coarseCol !== col) {
          connections.push({
            row: coarseRow,
            col: coarseCol,
            state: 1,
            bendHint: 0.2
          });
        }
      }
    }

    return { isReady, connections };
  };
}

class OmniRunModel {
  
  static ALGORITHMS = {
    'FFT': FFT,
    'SmithWaterman': SmithWaterman,
    'MultiGrid': MultiGrid
  };

  static currentAlgorithm = 'FFT';
  
  static generateData = (numCategories) => {
    return { algorithm: this.ALGORITHMS[this.currentAlgorithm] };
  };

  static setAlgorithm = (name) => {
    if (this.ALGORITHMS[name]) {
      this.currentAlgorithm = name;
    }
  };

  static getAlgorithm = () => {
    return this.ALGORITHMS[this.currentAlgorithm];
  };

  static getAlgorithmNames = () => Object.keys(this.ALGORITHMS);

  // this AST uses a prototype, not an instantiated cell
  // for each node.
  static makeAlgorithmAst(algorithm) {
    let bg    = new MiniAstNode('cellrect');
    let label = new MiniAstNode('label');
    let link  = new MiniAstNode('link');

    // overlay draws its children in order
    let cell  = new MiniAstNode('overlay', [link, bg, label]);
    let grid  = new MiniAstNode('alggrid', [cell], algorithm);

    return grid;
  }
}

// ============================================================
// OmniRunApp — full application controller
// ============================================================

class OmniRunApp {

  static PRESETS = {
    'Wide': {
      fillOpacity: 0.1, strokeWidth: 1.3, topWidth: 0, zoom: 1, linkWidth: 2, time: 30,
    },
    'Tight': {
      fillOpacity: 0.1, strokeWidth: 1.3, topWidth: 2, zoom: 0.28, linkWidth: 1, time: 50,
    },
    'Done': {
      fillOpacity: 0.1, strokeWidth: 1.3, topWidth: 0, zoom: 1, linkWidth: 2, time: 100,
    },
  };

  static DEFAULT = 'Wide';

  constructor(options = {}) {
    const {
      title = 'Algorithm Explorer',
      subtitle = 'One engine, all trace inspectors. Drag to pan, scroll to zoom, use sliders to morph.',
      cssPath = 'omni-controls.css',
      mode = 'canvas',
    } = options;

    this.mode = mode;

    const shell = new OmniApp({
      title,
      subtitle,
      displayElement: mode === 'svg' ? 'svg' : 'canvas',
      displayId: 'algorithm'
    });
    this.container = shell.container;
    this.controlsEl = shell.controls;
    this.multiscrollerEl = shell.multiscroller;

    this.data = OmniRunModel.generateData();
    this.rootNode = OmniRunModel.makeAlgorithmAst(this.data.algorithm);

    if (this.mode === 'canvas') {
      this.canvas = shell.display;
      this.renderer = new CanvasScene(this.canvas, this.rootNode);
      this.ctx = this.renderer.ctx;
      this.ctxMix = { ctx: this.ctx}
    } else {
      // svg is legacy. Do not support it.
      this.svg = shell.display;
      this.svg.setAttribute('viewBox', '0 0 800 650');
      this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      this.ctxMix = { svg: this.svg}
    }

    // ── OmniControlPanel ───────────────────────────────────────────────
    this.base = new OmniControlPanel({
      elements: {
        container: this.container,
        controls: this.controlsEl,
        multiscroller: this.multiscrollerEl,
      },
      mode: this.mode,
      sliderConfig: this._buildSliderConfig(),
      presets: OmniRunApp.PRESETS,
      defaultPreset: OmniRunApp.DEFAULT,
      hintHtml: 'Drag to pan. Scroll to zoom.<br><b>bend</b>: curves shared baseline<br><b>bendStack</b>: bends each stack into donut<br><b>gridiness</b>: moves centers to grid<br><b>curviness</b>: scales edge bends (0=straight)',

      onRender: (params, panZoom, instance) => {
        const fullParams = {
          ...params, ...{fontSize:12, labelColor:'#aaa'}
        };
        GenericScene.renderAny(this.ctxMix, fullParams, panZoom, this.rootNode);
      },

      onParamChange: (id, value, isData) => {
        if (id === 'algorithm') {
          OmniRunModel.setAlgorithm( value );
          this.data = OmniRunModel.generateData();
          this.rootNode.value = this.data.algorithm;
        }
      },

      onLegendToggle: (showLegend) => {
        if (typeof updateLegend !== 'undefined') {
          updateLegend(this.base.getParams(), showLegend);
        }
      },

      onResize: () => {
        if (this.mode === 'canvas') {
          const rect = this.container.getBoundingClientRect();
          this.renderer.resize(rect, window.devicePixelRatio || 1);
          if (this.base) this.base.render();
        }
      }
    });

    if (this.base.onResize) {
      this.base.onResize();
    }
  }

  _buildSliderConfig() {
    return [
      ...this._sectionPresets(),
      ...this._sectionAlgorithm(),
      ...this._sectionArrangement(),
      ...this._sectionStyle()
    ];
  }

  _sectionPresets() {
    return [
      { group: 'Presets', id: 'presets', abbrev: 'Pre', type: 'presets' }
    ];
  }

  _sectionAlgorithm() {
    return [
      {
        group: 'Algorithm',
        id: 'algorithm',
        abbrev: 'Alg',
        type: 'select',
        selectId: 'algSelect',
        options: [
          { value: 'FFT', label: 'FFT' },
          { value: 'SmithWaterman', label: 'Smith Waterman' },
          { value: 'MultiGrid', label: 'MultiGrid' },
        ],
      }
    ];
  }

  _sectionArrangement() {
    return [
      {
        group: 'Arrangement', id: 'arrangement', abbrev: 'Arr', sliders: [
          { id: 'lcars', label: 'LCARS', min: 1, max: 12, step: 1, default: 6, isData: true, dataValue: 6 },
        ]
      }
    ];
  }

  _sectionStyle() {
    return [
      {
        group: 'Style', id: 'style', abbrev: 'Sty', sliders: [
          { id: 'fillOpacity', label: 'fillOpacity', min: 0, max: 1, step: 0.01, default: 1 },
          { id: 'strokeWidth', label: 'strokeWidth', min: 0, max: 3, step: 0.1, default: 0 },
          { id: 'topWidth', label: 'topWidth', min: 0, max: 5, step: 0.1, default: 0 },
          { id: 'linkWidth', label: 'linkWidth', min: 0, max: 5, step: 0.1, default: 1.7 },
          { id: 'time', label: 'time', min: 0, max: 100, step: 1, default: 20 },
          { id: 'zoom', label: 'zoom', min: 0.25, max: 2, step: 0.01, default: 1 },
        ]
      }
    ];
  }
}

export { OmniRunApp };

// Auto-generated exports
if (typeof window !== 'undefined') window.FFT = FFT;
export { FFT };
if (typeof window !== 'undefined') window.MultiGrid = MultiGrid;
export { MultiGrid };
if (typeof window !== 'undefined') window.OmniRunModel = OmniRunModel;
export { OmniRunModel };
if (typeof window !== 'undefined') window.SmithWaterman = SmithWaterman;
export { SmithWaterman };
