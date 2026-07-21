/* ============================================
   ChartScene - Unified Charting Engine
   ============================================
   
   Includes:
   - ChartScene: Core rendering engine with presets
   - Algorithm classes: FFT, SmithWaterman, MultiGrid
*/

import { sceneRegistry, MiniAstNode } from '../omni-support/scene.js';
import { WarpedRectanglesNode, OverlayNode } from './structural-nodes.js';
import { WarpedPolygon } from './warped-polygon.js';
import { Vector2D } from '../2d-support/vector2d.js';


// ============================================================
// Nodes
// ============================================================

class AlgorithmGridIterator {
  constructor(algorithm) {
    this.algorithm = algorithm;
    const { rows, cols } = algorithm.size();
    this.totalRows = rows;
    this.totalCols = cols;

    this.row = 0;
    this.col = 0;
    this.childIndex = 0;

    // snapshot for downstream reads
    this._currentRow = 0;
    this._currentCol = 0;
  }

  next(subtree) {
    if (this.row >= this.totalRows) return null;

    this._currentRow = this.row;
    this._currentCol = this.col;

    const child = subtree[this.childIndex];

    this.childIndex++;
    if (this.childIndex >= subtree.length) {
      this.childIndex = 0;
      this.col++;
      if (this.col >= this.totalCols) {
        this.col = 0;
        this.row++;
      }
    }

    return child;
  }

  get gridPosition() {
    return {
      row: this._currentRow,
      col: this._currentCol,
      rows: this.totalRows,
      cols: this.totalCols
    };
  }
}

class LinkNode {
  static draw2d(ctxMix, node, params) {
    const { cellInfo, gridPosition } = ctxMix.flyweight;
    if (!cellInfo || !cellInfo.connections || cellInfo.connections.length === 0) return;

    const { row, col, rows, cols } = gridPosition;

    const zoom = params.zoom || 1;
    const cellW = ctxMix.flyweight.spacings.cellW * zoom;
    const cellH = ctxMix.flyweight.spacings.cellH * zoom;

    const cx = (node.xOffset ?? 0) * zoom;
    const cy = (node.yOffset ?? 0) * zoom;
    const dimensionW = node.width * zoom;
    const dimensionH = node.height * zoom;

    const gridPos = new Vector2D(cx-cellW/2, cy-cellH/2);

    const diagonal = new Vector2D(cellW, cellH);
    const diag = diagonal.scale(0.5);

    const shorten = (point, dist) => {
      let d = point[0].sub(point[1]).normalize().scale(-dist);
      return [point[0].add(d), point[1].sub(d)];
    };

    const geometries = [];

    for (const conn of cellInfo.connections) {
      const sourceCx = cx + (conn.col - col) * cellW; 
      const sourceCy = cy + (conn.row - row) * cellH; 
      const sourcePos = new Vector2D(sourceCx-cellW/2, sourceCy-cellH/2);

      const connectionColor = conn.state > 0 ? '#4a4' : '#333';
      const bend = conn.bendHint || 0;

      geometries.push({
        type: 'link',
        corners: shorten(
          [sourcePos.add(diag), gridPos.add(diag)],
          dimensionW / 2
        ),
        bends: [bend, -bend],
        color: connectionColor
      });
    }

    WarpedPolygon.render( ctxMix, geometries, params)
  }
}

class AlgorithmGridNode {
  static before_draw2d(ctxMix, node, params) {
    // Replace the default SubtreeIterator with AlgorithmGridIterator
    ctxMix.iterators[ctxMix.iterators.length - 1] =
      new AlgorithmGridIterator(node.value);
  }

  static before_child_draw2d(ctxMix, node, params, child) {
    const iter = ctxMix.iterators.at(-1);
    const { row, col, rows, cols } = iter.gridPosition;

    const cellW = node.width / cols;
    const cellH = node.height / rows;

    const cellInfo = iter.algorithm.getCell(row, col, params.time);

    ctxMix.flyweight.cellInfo = cellInfo;
    ctxMix.flyweight.gridPosition = { row, col, rows, cols };
    ctxMix.flyweight.value = `${row},${col}`;
    ctxMix.flyweight.spacings = { cellW, cellH };

    child.xOffset = (node.xOffset ?? 0) + (col - (cols - 1) / 2) * cellW;
    child.yOffset = (node.yOffset ?? 0) + (row - (rows - 1) / 2) * cellH;

    const dimension = Math.min(cellW, cellH);// * 0.7;
    child.width    = dimension;
    child.height   = dimension;
    child.color = cellInfo.isReady > 0 ? '#4a4' : '#333';
  }
}

class CellRectNode {
  static draw2d(ctxMix, node, params) {
    const zoom = params.zoom || 1;
    const cx = (node.xOffset ?? 0) * zoom;
    const cy = (node.yOffset ?? 0) * zoom;

    const cellW = ctxMix.flyweight.spacings.cellW * zoom;
    const cellH = ctxMix.flyweight.spacings.cellH * zoom;

    // 0.707 because diagonal of a square
    // 0.9 because we don't want the circles to touch.  
    const dimension = node.width * zoom *(0.707 * 0.9);

    const gridPos = new Vector2D(cx-dimension/2, cy-dimension/2);
    const diagonal = new Vector2D(dimension, dimension);

    let corners = [
      gridPos.add(diagonal),
      gridPos,
    ];

    const shorten = (point, dist) => {
      let d = point[0].sub(point[1]).normalize().scale(-dist);
      return [point[0].add(d), point[1].sub(d)];
    };

    //corners = shorten(corners, 6);

    const geom = [{
      type: 'warpedpoly',
      corners,
      bends: [-Math.PI, -Math.PI],
      color: node.color ?? '#333'
    }];

    WarpedPolygon.render( ctxMix, geom, params);
  }
}


// ============================================================
// RunScene Core Engine
// ============================================================

sceneRegistry.registerNodeClass('alggrid', AlgorithmGridNode);
sceneRegistry.registerNodeClass('link', LinkNode);
sceneRegistry.registerNodeClass('cellrect', CellRectNode);



// Auto-generated exports
if (typeof window !== 'undefined') window.AlgorithmGridIterator = AlgorithmGridIterator;
export { AlgorithmGridIterator };
if (typeof window !== 'undefined') window.AlgorithmGridNode = AlgorithmGridNode;
export { AlgorithmGridNode };
if (typeof window !== 'undefined') window.CellRectNode = CellRectNode;
export { CellRectNode };
if (typeof window !== 'undefined') window.LinkNode = LinkNode;
export { LinkNode };
