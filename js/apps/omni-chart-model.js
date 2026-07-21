// OmniChartModel class.
//
// AST shape (flyweight):
//
//   grid (value = CSVData)
//     vstack (prototype — reused for every column)
//       grid-cell (prototype — reused for every row)
//
// WarpableNode manages column iteration via RepeatIterator.
// StackNode manages row iteration via ClippingIterator.
// Total AST nodes: 3, regardless of grid size.

import { GridData, CSVData, MiscData,FunctionData, DataAdapter} from '../data/csv-data.js'
import { MiniAstNode, sceneRegistry  } from '../omni-support/scene.js';
import {} from '../nodes2d/warpable-grid-node.js';
import {} from '../nodes2d/table-cell-node.js';
import {} from '../nodes2d/blob-node.js';
import { TreeChartData } from '../data/tree-chart-data.js';


class OmniChartModel {

  static COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ba68c8', '#4db6ac', '#fff176', '#a1887f'];

  static makeChartAst(numCategories, sampleType = 'sales') {
    const rawData = sampleType === 'footfall' ? MiscData.locationFootfall() : MiscData.productSales();

    // Slice rows to match numCategories (on raw data, before wrapping)
    rawData.rowCount = Math.min(numCategories, rawData._rowNames.length);
    rawData._rowNames = rawData._rowNames.slice(0, rawData.rowCount);
    rawData._data = rawData._data.slice(0, rawData.rowCount);
    rawData.rows = rawData.rows.slice(0, rawData.rowCount);
    rawData._isNumeric = rawData._isNumeric.slice(0, rawData.rowCount);
    if (rawData.rowMeta) rawData.rowMeta = rawData.rowMeta.slice(0, rawData.rowCount);
    rawData._globalRange = null;

    // Assign colors to columns via colMeta (on raw data)
    for (let c = 0; c < rawData.colCount; c++) {
      rawData.setColMeta(c, { color: OmniChartModel.COLORS[c % OmniChartModel.COLORS.length] });
    }

    // Wrap in DataAdapter
    const data = new DataAdapter( rawData );

    // Flyweight AST: 3 nodes total
    const blobProto   = new MiniAstNode('blob');
    const cellProto   = new MiniAstNode('warpable-cell');
    const vstackProto = new MiniAstNode('vstack', [cellProto]);
    return new MiniAstNode('warpable-grid', [vstackProto], data);
  }

  static makeTreeChartAst(tree, panelConfigs) {
    const treeData = new TreeChartData(tree, panelConfigs);
    return OmniChartModel.makeChartFromCsv(treeData);
  }

  /** Replace chart data entirely. Accepts DataAdapter or raw CSVData. */
  static makeChartFromCsv(dataAdapterOrRaw) {
    const data = dataAdapterOrRaw instanceof DataAdapter
      ? dataAdapterOrRaw
      : new DataAdapter(dataAdapterOrRaw);

    // Assign default colors where missing
    for (let c = 0; c < data.colCount; c++) {
      if (!data.getColMeta(c)?.color) {
        data.setColMeta(c, { color: OmniChartModel.COLORS[c % OmniChartModel.COLORS.length] });
      }
    }

    const blobProto   = new MiniAstNode('blob');
    const cellProto   = new MiniAstNode('warpable-cell');
    const vstackProto = new MiniAstNode('vstack', [cellProto/*, blobProto*/]);
    const rootNode     = new MiniAstNode('warpable-grid', [vstackProto], data);
    return rootNode;
  }
}

export { OmniChartModel }