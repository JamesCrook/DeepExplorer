import { MiniAstNode, sceneRegistry  } from '../omni-support/scene.js';
import { WarpedPolygon } from './warped-polygon.js';
import { Vector2D, lerp } from '../2d-support/vector2d.js';


class WarpedRectanglesNode {
  static draw2d(ctxMix, node, params) {
    const zoom  = params.zoom || 1;
    const space = params.space ?? 10;

    const cx = (node.xOffset ?? 0) * zoom;
    const cy = (node.yOffset ?? 0) * zoom;
    const w  = (node.width   ?? 0) * zoom;
    const h  = (node.height  ?? 0) * zoom;

    // Cell top-left, derived from center
    const left = cx - w / 2;
    const top  = cy - h / 2;

    // Inset by space to create gaps between adjacent cells.
    // Space is subtracted from right and bottom edges,
    // matching KeyboardNode's original layout.
    const geom = [{
      type   : 'warpedpoly',
      corners: [
        new Vector2D(left + w - space, top + h - space),   // BR
        new Vector2D(left, top + h - space),   // BL
        new Vector2D(left, top),                // TL
        new Vector2D(left + w - space, top),                // TR
      ],
      bends  : [0.1, 0, 0, 0],
      color  : node.color ?? '#449',
      opacity: params.fillOpacity,
    }];
    WarpedPolygon.render( ctxMix, geom, params);
  }
}

class LabelNode {
  static draw2d(ctxMix, node, params) {
    const iter = ctxMix.iterators.at(-1);
    const text = ctxMix.flyweight.value ?? '-';

    if (!text) return;

    const zoom = params.zoom || 1;

    const cx = (node.xOffset ?? 0) * zoom;
    const cy = (node.yOffset ?? 0) * zoom;
 
    const geom = [];

    geom.push({
      type : 'label',
        x    : cx,
        y    : cy,
        text : text,
      });
    WarpedPolygon.render( ctxMix, geom, params);
  }
}

class OverlayNode {
  static before_child_draw2d(ctxMix, node, params, child) {
    child.width     = node.width;
    child.height    = node.height;
    child.xOffset   = node.xOffset;
    child.yOffset   = node.yOffset;
    child.cellValue = node.cellValue;
  }

  //static draw2d() {}
}

sceneRegistry.registerNodeClass('overlay', OverlayNode);
class VStackNode {
  static before_draw2d(ctxMix, node, params, child){
    node.nodeCount = 0;
  }
  static before_child_draw2d(ctxMix, node, params, child){
    const n = node.subtree.length;
    child.xOffset = node.xOffset;
    child.yOffset = ((node.nodeCount-(n-1)/2) * node.width) + node.yOffset 
    child.width = node.width;
    child.height = node.height;
    node.nodeCount++;
  }
  static draw2d(ctxMix, data, params)  { 
    debugger;
  }  
}

class HStackNode {
  static before_draw2d(ctxMix, node, params, child){
    node.nodeCount = 0;
  }
  static before_child_draw2d(ctxMix, node, params, child){
    const n = node.subtree.length;
    child.xOffset = ((node.nodeCount-(n-1)/2) * node.width) + node.xOffset;
    child.yOffset = node.yOffset;
    child.width = node.width;
    child.height = node.height;
    node.nodeCount++;
  }
  static draw2d(ctxMix, data, params)  { 
    debugger;
  }  
}

sceneRegistry.registerNodeClass('rect', WarpedRectanglesNode)
sceneRegistry.registerNodeClass('label', LabelNode);
sceneRegistry.registerNodeClass('overlay', OverlayNode)
sceneRegistry.registerNodeClass('vstack', VStackNode)
sceneRegistry.registerNodeClass('hstack', HStackNode)

export { WarpedRectanglesNode, OverlayNode, VStackNode, HStackNode }
// Auto-generated exports
if (typeof window !== 'undefined') window.LabelNode = LabelNode;
export { LabelNode };
