/**
 * jatex-node.js
 *
 */

import { WarpedPolygon } from './warped-polygon.js';
import { Vector2D, lerp } from '../2d-support/vector2d.js';
import { LinearPath, ArcPath, SectorPath, GridPath, BlendedPath } from '../2d-support/path.js';
import { SizeCache } from './multiscroller-nodes.js';
import { sceneRegistry } from '../omni-support/scene.js';

// ============================================================
// BlobNode
// used for diagnostics/debugging
// ============================================================

class BlobNode {

  static draw2d(ctxMix, node, params){ 
    let ctx = ctxMix.ctx;
    // hotspots don't draw the ruler markings...
    //if( this.P.mayOutHotBox( ctx, ast ))
    //  return;

    //var v = ast.box.vecs[0];
    //var dv = ast.box.diagonal();

    //const fwCorners = ctxMix.flyweight?.corners;
    //var v = fwCorners[0];
    var v = ctxMix.outerPos;
    var u = ctxMix.outerPos2;

//    var v = new Vector2D( 200, 200);
//    var dv = new Vector2D( 80,60 );
    var r = 7;

    ctx.save();
    ctx.beginPath();
    // Outer circle...
    ctx.fillStyle = "#ccc";
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = params?.color ?? "#559";
    ctx.arc(v.x, v.y, r, 0, 2 * Math.PI);
    ctx.arc(u.x, u.y, 5, 0, 2 * Math.PI);
    ctx.fill();

    ctx.stroke();
    ctx.restore();
    //this.P.outBox( ctx, ast.box );
  }
}

sceneRegistry.registerNodeClass('blob', BlobNode);


// Auto-generated exports
if (typeof window !== 'undefined') window.BlobNode = BlobNode;
export { BlobNode };
