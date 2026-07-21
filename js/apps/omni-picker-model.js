import '../utilities2/tree-of-data.js';
const TreeOfData = window.TreeOfData;

import { MiniAstNode, sceneRegistry } from '../omni-support/scene.js';
import { CanvasScene, GenericScene } from '../../../q-legacy/js/omni-support/canvas-scene.js';
import { OmniApp } from '../omni-support/omni-app.js';
import { OmniControlPanel, AppUtils } from '../omni-support/omni-control-panel.js';
import { CSVData, MiscData, DataAdapter } from '../data/csv-data.js';
import { GridTreeAdapter } from '../data/grid-tree-adapter.js';
import { MultiscrollerNode, ScrollState } from '../nodes2d/multiscroller-nodes.js';
import { beveragesTree } from '../data/drinks-data.js';
import { kangxiCharacters } from '../data/k-data.js';
import {} from '../nodes2d/table-cell-node.js';


// ============================================================
// OmniPickerModel - multicolumn view of tree or grid
// Like miller columns except they scroll in a specially 
// synchronised way as you drag.
//
// A grid can have varying height of cells, and the columns 
// scroll as needed as you drag, to line things up.
// ============================================================
class OmniPickerModel {

  /**
   * Build a multiscroller AST from a TreeOfData and panel configs.
   *
   * @param {TreeOfData} tree
   * @param {Array} panelConfigs - [{ label, level, cursor, sameParent, itemSize, widthRatio }, ...]
   * @param {number[]} [categoryHues] - hue per top-level category
   * @returns {MiniAstNode} root 'multiscroller' node
   */
  static makeMultiscrollerTreeAst(tree, panelConfigs, categoryHues) {
    // Cell prototype — reused for every item in every panel
    const cellProto = new MiniAstNode('warpable-cell');

    // One VStack per panel
    const panelNodes = panelConfigs.map(cfg => {
      const vstack = new MiniAstNode('vstack', [cellProto]);
      // Store label for panel header rendering
      vstack.value = { label: cfg.label };
      return vstack;
    });

    // Layout container: HStack of panels (unmanaged — just divides space)
    const layout = new MiniAstNode('hstack', panelNodes);

    // Multiscroller wraps the layout.
    // node.inst carries config for MultiscrollerNode._wire
    const root = new MiniAstNode('multiscroller', [layout]);

    root.inst = {
      data: new DataAdapter(tree),
      panels: panelConfigs.map(cfg => ({
        level:       cfg.level ?? 0,
        cursor:      cfg.cursor ?? tree.first(cfg.level ?? 0),
        sameParent:  cfg.sameParent ?? false,
        itemSize:    cfg.itemSize ?? 40,
        scrollOffset: cfg.scrollOffset ?? 10,
      })),
      axis: 'y',
      categoryHues: categoryHues ?? null,
    };

    return root;
  }

  // Builds a multiscroller AST where each COLUMN of the grid data
  // becomes a scrollable panel. All panels share the same row set,
  // synced proportionally. Each column can have a different cell
  // height.
  //
  // Uses the same MultiscrollerNode infrastructure as Model1.
  // _wire detects bare-number cursors (grid mode) and creates
  // GridDataSource + GridNavigator automatically.
  //
  // AST shape:
  //   multiscroller
  //     hstack
  //       vstack (product 0) → [grid-scroll-cell]
  //       vstack (product 1) → [grid-scroll-cell]
  //       ...

  /**
   * Build a grid multiscroller from tabular data.
   *
   * @param {CSVData|GridData} data
   * @param {Object} [opts]
   * @param {number[]} [opts.columnHeights] — cell height per column
   * @param {number}   [opts.defaultHeight=36] — fallback cell height
   * @returns {MiniAstNode}
   */

  static makeMultiscrollerGridAst(data, opts = {}) {
    const numCols = data.colCount;
    const defaultHeight = opts.defaultHeight || 36;
    const columnHeights = opts.columnHeights;

    const panelNodes = [];
    for (let c = 0; c < numCols; c++) {
      const cellProto = new MiniAstNode('sheet-cell');
      const vstack = new MiniAstNode('vstack', [cellProto]);
      vstack.value = { label: data.getColName(c) };
      panelNodes.push(vstack);
    }

    const layout = new MiniAstNode('hstack', panelNodes);

    const root = new MiniAstNode('multiscroller', [layout]);
    root.inst = {
      data: new DataAdapter(data),
      minColWidth: opts.minColWidth || 100,
      panels: Array.from({ length: numCols }, (_, c) => ({
        cursor:     0,
        itemSize:   columnHeights?.[c] || ((c<=3)?(c+1):1)*defaultHeight,
        scrollOffset: 10,
      })),
      axis: 'y',
    };

    return root;
  }  

  /**
   * Build a drinks multiscroller (3 levels).
   */
  static makeDrinksAst() {
    const tree = new TreeOfData(beveragesTree);
    return OmniPickerModel.makeMultiscrollerTreeAst(tree, [
      { label: 'Types',      level: 0, cursor: [0],       sameParent: true,  itemSize: 52, widthRatio: 0.15 },
      { label: 'Categories', level: 1, cursor: [0, 0],    sameParent: false, itemSize: 40, widthRatio: 0.25 },
      { label: 'Items',      level: 2, cursor: [0, 0, 0], sameParent: false, itemSize: 32, widthRatio: 0.60 },
    ], null);
  }

  /**
   * Build a kanji multiscroller (3 levels).
   */
  static makeKanjiAst() {
    const tree = new TreeOfData(kangxiCharacters);
    return OmniPickerModel.makeMultiscrollerTreeAst(tree, [
      { label: 'Types',      level: 0, cursor: [0],       sameParent: true,  itemSize: 52, widthRatio: 0.15 },
      { label: 'Categories', level: 1, cursor: [0, 0],    sameParent: false, itemSize: 40, widthRatio: 0.25 },
      { label: 'Items',      level: 2, cursor: [0, 0, 0], sameParent: false, itemSize: 80, widthRatio: 0.60 },
    ], null);
  }

  /**
   * Build a product sales multiscroller (2 levels via GridTreeAdapter).
   */
  static makeProductsAst() {
    const csv = MiscData.productSales();
    const tree = new GridTreeAdapter(csv);
    return OmniPickerModel.makeMultiscrollerTreeAst(tree, [
      { label: 'Months',   level: 0, cursor: [0],    sameParent: true,  itemSize: 48, widthRatio: 0.30 },
      { label: 'Products', level: 1, cursor: [0, 0], sameParent: false, itemSize: 36, widthRatio: 0.70 },
    ], [210, 120, 45, 330, 270]);
  }
}


export { OmniPickerModel }

// Auto-generated exports
if (typeof window !== 'undefined') window.TreeOfData = TreeOfData;
export { TreeOfData };
