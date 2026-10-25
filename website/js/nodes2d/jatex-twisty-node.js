import '../2d-support/vector2d.js'
import '../2d-support/box.js'

//import '../utilities2/ast-manager.js'
//import '../parsers/parser.js'
//import '../parsers/jatex.js'

import { Vector2D, lerp } from '../2d-support/vector2d.js';


// At the mid point we apply half the bend vector.
// But we are using a cubic bezier to the canvas...
function applyBend( bender, p, t)
{
  var bend = bender.mul( 2*t*(1-t));
  return p.add( bend );
}

function drawWigglyLine( ctx, v0, v1, wiggleCount, bend){

  var along = v1.sub(v0);
  var bender = along.perp( bend );
  if( wiggleCount <=1){
    //ctx.lineTo( v1.x, v1.y);

    bender = bender.mul( 2*0.3333);
    p = v0.add( along.mul( 0.3)).add(bender);
    q = v1.sub( along.mul( 0.3)).add(bender);

    ctx.bezierCurveTo( p.x, p.y, q.x, q.y, v1.x,v1.y);
    return;
  }
  //wiggleCount=2;
  var along = along.mul( 1/wiggleCount );
  var disp = along.perp(0.3);

  var t;
  var p,q,r;

  for(var j=0;j<wiggleCount;j++){
    p = v0.add( along.mul(j+0.333 ).add( disp.mul( (j%2)?-1:1)));
    q = v0.add( along.mul(j+0.666 ).add( disp.mul( (j%2)?-1:1)));
    r = v0.add( along.mul(j+1 ));
    p = applyBend( bender, p, (j+0.333)/wiggleCount);
    q = applyBend( bender, q, (j+0.666)/wiggleCount);
    r = applyBend( bender, r, (j+1)/wiggleCount);

    var m = v0.add( along.mul(j+0.5 ).add( disp.mul( (j%2)?-1:1)));
    m = applyBend( bender, m, (j+0.5)/wiggleCount);
    ctx.quadraticCurveTo( m.x, m.y, r.x, r.y );

//    ctx.bezierCurveTo( p.x, p.y, q.x, q.y, r.x,r.y);
//    ctx.lineTo( r.x,r.y);
  }

}


/**
 * A class for creating and managing "twisty" diagrams.
 * @class
 */
class Twisty {
  constructor() {
    this.offset = 5;
    this.twistySpacing = 8;
  }

  static measure(ctxMix, node, params){ 
    node.box = new Box(40,20)
  }
  static layout(ctxMix, node, params){ 
    node.box.move( ctxMix.layout.x, ctxMix.layout.y)
    ctxMix.layout.x += node.box.width();
  } 

  //const fns = "\\twisty \\twistyup \\twistyc";

  /**
   * Joins two vectors with an offset path.
   * If halfPath is set, a blob is placed at v1 without drawing its offset dog-leg.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The abstract syntax tree node.
   * @param {Vector2D} v0 - The starting vector.
   * @param {Vector2D} offset0 - The offset for the starting vector.
   * @param {Vector2D} v1 - The ending vector.
   * @param {Vector2D} offset1 - The offset for the ending vector.
   * @param {string} color - The color of the path.
   * @param {boolean} halfPath - If true, draws a half path.
   */
  joinv(ctx, ast, v0, offset0, v1, offset1, color, halfPath) {
    ctx.save();
    for(var pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.strokeStyle = pass ? color : "#DDD";
      ctx.lineWidth = pass ? 2 : 4;
      ctx.moveTo(v0.x, v0.y);
      ctx.lineTo(v0.x + offset0.x, v0.y + offset0.y);
      if(!halfPath)
        ctx.lineTo(v1.x + offset1.x, v1.y + offset1.y);
      ctx.lineTo(v1.x, v1.y);
      ctx.stroke();
      if(halfPath && pass) {
        ctx.beginPath();
        ctx.fillStyle = pass ? color : "#DDD";
        ctx.arc(v1.x, v1.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  /**
   * Gets the direction vector for a given side.
   * @param {number} side - The side index (0-3).
   * @returns {Vector2D} The direction vector.
   */
  directionOfSide(side) {
    return (side < 2) ? new Vector2D(1, 0) : new Vector2D(0, 1);
  }
  /**
   * Calculates the middle point of a given side of an AST node's box.
   * @param {object} ast - The abstract syntax tree node.
   * @param {number} side - The side index (0-3).
   * @returns {Vector2D} The middle point of the side.
   */
  middleOfSide(ast, side) {
    var box = ast.box;
    var w = box.width();
    var h = box.height();
    // mid points of the sides.
    var v0 = box.vecs[0];
    if(side == 0)
      return v0.add(w / 2 + ast.xShift, 0);
    if(side == 1)
      return v0.add(w / 2 + ast.xShift, h);
    if(side == 2)
      return v0.add(0, h / 2);
    if(side == 3)
      return v0.add(w, h / 2);
    alert("Bad value for side");
  }
  /**
   * Calculates the connection point for a given index on a side.
   * @param {object} ast - The abstract syntax tree node.
   * @param {number} side - The side index (0-3).
   * @param {number} p - The positional index along the side.
   * @returns {Vector2D} The connection point vector.
   */
  connectionOfIndex(ast, side, p) {
    var dv = this.directionOfSide(side);
    dv = dv.mul(this.twistySpacing);
    // mid points of the sides.
    var v = this.middleOfSide(ast, side);
    // now take account of mid point and i and j.
    v = v.add(dv.mul(p));
    return v;
  }
  /**
   * Calculates the offset vector for a given index on a side.
   * @param {object} ast - The abstract syntax tree node.
   * @param {number} side - The side index (0-3).
   * @param {number} p - The positional index (unused).
   * @returns {Vector2D} The offset vector.
   */
  offsetOfIndex(ast, side, p) {
    var offset = this.directionOfSide(3 - side);
    var sign = (side % 2) ? -1 : 1;
    offset = offset.mul(sign * this.offset);
    return offset;
  }
  /**
   * Joins two points on the sides of a twisty diagram.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The abstract syntax tree node.
   * @param {number} sideFrom - The starting side index.
   * @param {number} sideTo - The ending side index.
   * @param {number} p - The positional index on the starting side.
   * @param {number} q - The positional index on the ending side.
   * @param {string} color - The color of the join.
   * @param {number} t - The blend factor for three-way joins.
   * @param {Vector2D} v - The vector for a three-way join.
   * @param {Vector2D} offset - The offset for a three-way join.
   */
  join(ctx, ast, sideFrom, sideTo, p, q, color, t, v, offset) {
    var v0 = this.connectionOfIndex(ast, sideFrom, p);
    var v1 = this.connectionOfIndex(ast, sideTo, q);
    var offset0 = this.offsetOfIndex(ast, sideFrom, p);
    var offset1 = this.offsetOfIndex(ast, sideTo, p);
    // if v, it's a 3 way join.
    if(v) {
      var blob = v0.add(offset0).blend(v1.add(offset1), t);
      return this.joinv(ctx, ast, v, offset, blob, null, color, true);
    }
    return this.joinv(ctx, ast, v0, offset0, v1, offset1, color, false);
  }
  /**
   * Draws a wiggling line based on a pattern.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The abstract syntax tree node.
   * @param {string} pattern - The pattern for the wiggle.
   * @param {Vector2D} v0 - The starting vector.
   * @param {Vector2D} dv - The direction vector.
   * @param {string} color - The color of the wiggle.
   */
  drawWiggle(ctx, ast, pattern, v0, dv, color) {
    var bend = 0;
    var pass = 1;
    ctx.save();
    for(let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.strokeStyle = pass ? color : "#DDD";
      ctx.lineWidth = pass ? 3 : 5;
      //ctx.moveTo( v0.x, v0.y );
      this.drawBarSequence(ctx, pattern, v0, dv, bend);
      //ctx.lineTo( v1.x, v1.y );
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draws a sequence of bars for a wiggle.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {string} pattern - The pattern for the bars.
   * @param {Vector2D} v0 - The starting vector.
   * @param {Vector2D} dv - The direction vector.
   * @param {number} bend - The amount of bend.
   */
  drawBarSequence(ctx, pattern, v0, dv, bend) {
    var vv0 = v0; //.sub( dv.mul( this.twistySpacing) );
    var vv1 = vv0.add(dv.mul(2));
    for(var i = 0; i < pattern.length; i++) {
      var ch = pattern.charAt(i);

      if("[(".indexOf(ch) >= 0) {
        vv0 = vv1.add(dv.mul(this.twistySpacing - 4));
      } else if(ch == ")") {
        var wiggleCount = (vv1.x - vv0.x) * 0.2;
        ctx.moveTo(vv0.x, vv0.y);
        drawWigglyLine(ctx, vv0, vv1, wiggleCount, bend);
      } else if(ch == "]") {
        ctx.moveTo(vv0.x, vv0.y);
        drawWigglyLine(ctx, vv0, vv1, 0, bend);
      } else {
        vv1 = vv1.add(dv.mul(this.twistySpacing));
      }

    }
  }
  /**
   * Sets the spacing for the twisty diagram.
   */
  setTwistySpacing() {
    this.twistySpacing = this.P.twistySpacing || 8;
  }
  /**
   * Gets the permutations from a token.
   * @param {string} token - The token to parse.
   * @returns {string[]} An array of permutations.
   */
  getPermutations(token) {
    var perms = token.replace(/[\[\]()]/g, "");
    perms = this.getBars(perms);
    // If user misses out a perm, then we assume
    // conversion to default order.
    if(perms[0] == "")
      perms[0] = perms[1].split("").sort().join("");
    if(perms[1] == "")
      perms[1] = perms[0].split("").sort().join("");
    if(perms[2] == "")
      perms[2] = perms[3].split("").sort().join("");
    if(perms[3] == "")
      perms[3] = perms[2].split("").sort().join("");

    return perms;
  }
  /**
   * Splits a token into bars.
   * @param {string} token - The token to split.
   * @returns {string[]} An array of bars.
   */
  getBars(token) {
    var perms = token.split("-");
    perms[0] = perms[0] || "";
    perms[1] = perms[1] || "";
    perms[2] = perms[2] || "";
    perms[3] = perms[3] || "";
    return perms;
  }
  //------
  /**
   * Creates an AST node for a twisty diagram.
   * @param {object} ast - The parent abstract syntax tree node.
   * @param {object} node - The current node to process.
   * @param {string[]} tokens - The array of tokens.
   * @param {number} i - The current index in the tokens array.
   * @param {number} len - The total length of the tokens array.
   * @returns {number} The new index in the tokens array.
   */
  astOfTwisty(ast, node, tokens, i, len) {
    i = this.P.astOfTokens(node, tokens, i, i + 1);
    this.P.astLift(node);
    this.P.astAddEmpty(node, 1);
    return i;
  }
  /**
   * Measures the dimensions of a twisty diagram.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} parent - The parent AST node.
   * @param {object} ast - The current AST node.
   * @param {object} font - The font information.
   * @returns {Box} The bounding box of the twisty diagram.
   */
  measureTwisty(ctx, parent, ast, font) {
    this.setTwistySpacing();
    var perms = this.getPermutations(ast.subtree[0].token);
    var h = this.P.twistyHeight || 16;
    var l1 = Math.max(perms[0].length, perms[1].length);
    var l2 = Math.max(perms[2].length, perms[3].length);
    var mm = 24;
    l1 = Math.max(l1 * this.twistySpacing, mm);
    l2 = Math.max(l2 * this.twistySpacing, h);
    // possibly round up to next multiple of 24
    // 7 *8 up to 9 * 8
    // 5 *8 up to 6 * 8
    //if( l1 >= 40 )
    //  l1 = l1 + (23-(l1+23)%24);
    //if( l2 >= 40 )
    //  l2 = l2 + (23-(l2+23)%24);
    ast.box = new Box(l1, l2);
    ast.xShift = 0;
    this.P.twistyHeight = 0;
    return ast.box;
  }
  /**
   * Measures the dimensions of a centered twisty diagram.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} parent - The parent AST node.
   * @param {object} ast - The current AST node.
   * @param {object} font - The font information.
   * @returns {Box} The bounding box of the twisty diagram.
   */
  measureTwisty_twistyc(ctx, parent, ast, font) {
    var box = this.measureTwisty(ctx, parent, ast, font);
    ast.xShift = 12;
    return ast.box;
  }
  /**
   * Positions a twisty diagram.
   * @param {object} parent - The parent AST node.
   * @param {object} ast - The current AST node.
   * @param {Vector2D} v - The position vector.
   * @returns {Box} The moved bounding box.
   */
  positionTwisty(parent, ast, v) {
    return ast.box.move(v);
  }
  /**
   * Renders a twisty diagram.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The AST node to render.
   * @param {string} color - The color of the diagram.
   */
  outTwisty(ctx, ast, color) {
    this.setTwistySpacing();
    this.P.mayOutHotBox(ctx, ast);
    // hotspots don't draw the text
    if(this.P.isHotspot) {
      return;
    }
    color = color || this.P.parent.twisty_color || "#111";
    this.outTwistyAst(ctx, ast, ast.subtree[0], color);
    //Twisty.outAst( ctx, ast, ast.subtree[0], color );
    this.P.outBox(ctx, ast.box);
  }
  /**
   * Renders the bus lines of a twisty diagram.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The main AST node for the twisty diagram.
   * @param {object} params - The AST node containing the parameters.
   * @param {number} sideFrom - The starting side index.
   * @param {number} sideTo - The ending side index.
   * @param {string} color - The color of the bus lines.
   */
  outTwistyBus(ctx, ast, params, sideFrom, sideTo, color) {
    var perms = this.getPermutations(params.token);
    var len1 = perms[sideFrom].length;
    var len2 = perms[sideTo].length;
    var i = len1
    while(i--) {
      var ch = perms[sideFrom].substring(i, i + 1);
      if(("a" > ch) || (ch > "z"))
        continue;
      var j = perms[sideTo].indexOf(ch);
      if(j >= 0) {
        this.join(ctx, ast, sideFrom, sideTo, i - (len1 - 1) / 2, j - (
          len2 - 1) / 2, color || "#333");
      }
    }
  }
  /**
   * Renders a crossbar in a twisty diagram.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The main AST node for the twisty diagram.
   * @param {object} params - The AST node containing the parameters.
   * @param {number} side - The side index for the crossbar.
   * @param {string} color - The color of the crossbar.
   */
  outCrossbar(ctx, ast, params, side, color) {
    var perms = this.getPermutations(params.token);
    var len = perms[side].length;
    var sideFrom = (side < 2) ? 2 : 0;
    var sideTo = sideFrom + 1;
    var len1 = perms[sideFrom].length;
    var len2 = perms[sideTo].length;
    var i = len
    while(i--) {
      var ch = perms[side].substring(i, i + 1);
      if(("a" > ch) || (ch > "z"))
        continue;
      var j = perms[sideFrom].indexOf(ch);
      var k = perms[sideTo].indexOf(ch);

      if((j >= 0) && (k >= 0)) {
        var v = this.connectionOfIndex(ast, side, i - (len - 1) / 2);
        var offset = this.offsetOfIndex(ast, side, i - (len - 1) / 2);
        //v = v.add(offset);
        var p = (len - 1) ? (i / (len - 1)) : 0.5;
        this.join(ctx, ast, sideFrom, sideTo, j - (len1 - 1) / 2, k - (
          len2 - 1) / 2, color, p, v, offset);

      }
    }
  }
  /**
   * Renders all crossbars in a twisty diagram.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The main AST node for the twisty diagram.
   * @param {object} params - The AST node containing the parameters.
   * @param {string} color - The color of the crossbars.
   */
  outCrossbars(ctx, ast, params, color) {
    for(var i = 2; i < 4; i++)
      this.outCrossbar(ctx, ast, params, i, color);
  }
  /**
   * Renders all connections in a twisty diagram.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The main AST node for the twisty diagram.
   * @param {object} params - The AST node containing the parameters.
   * @param {string} color - The color of the connections.
   */
  outConnects(ctx, ast, params, color) {
    //    var bars = this.getBars( params.token );
    var perms = this.getPermutations(params.token);
    var len, len1, len2;
    for(var side = 0; side < 4; side++) {
      len = perms[side].length;
      var sideOther = side ^ 1;
      var sideFrom = (side > 1) ? 0 : 2;
      var sideTo = sideFrom + 1;
      len1 = perms[sideFrom].length;
      len2 = perms[sideTo].length;
      for(let i = 0; i < len; i++) {
        var ch = perms[side].substring(i, i + 1);
        if(("a" > ch) || (ch > "z"))
          continue;
        var t = perms[sideOther].indexOf(ch) + 1;
        var j = perms[sideFrom].indexOf(ch) + 1;
        var k = perms[sideTo].indexOf(ch) + 1;
        // If has a partner, join to it..
        if(t) {
          if(side < sideOther);
          //this.join( ctx, ast, side, sideOther, i-(len1-1)/2, j-(len2-1)/2, color || "#333");          
        }
        // if the other is a pair, crossbar to it.
        else if(j && k) {
          var v = this.connectionOfIndex(ast, side, i - (len - 1) / 2);
          var offset = this.offsetOfIndex(ast, side, i - (len - 1) / 2);
          //v = v.add(offset);
          var p = (len - 1) ? (i / (len - 1)) : 0.5;
          j--;
          k--;
          // crossbar join...
          this.join(ctx, ast, sideFrom, sideTo, j - (len1 - 1) / 2, k - (
            len2 - 1) / 2, color, p, v, offset);
          //          this.outCrossBar( ctx, ast, params, i, color );
        } else if(j) {
          j--;
          this.join(ctx, ast, side, sideFrom, i - (len - 1) / 2, j - (
            len1 - 1) / 2, color || "#333")
        } else if(k) {
          k--;
          this.join(ctx, ast, side, sideTo, i - (len - 1) / 2, k - (len2 -
            1) / 2, color || "#333")

        }
      }
    }
  }
  /**
   * Renders the wiggles in a twisty diagram.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The main AST node for the twisty diagram.
   * @param {object} params - The AST node containing the parameters.
   * @param {string} color - The color of the wiggles.
   */
  outWiggles(ctx, ast, params, color) {
    var bars = this.getBars(params.token);
    for(var i = 0; i < 4; i++) {
      var v = this.middleOfSide(ast, i);
      var dv = this.directionOfSide(i);
      v = v.sub(dv.mul((bars[i].length - 1) * this.twistySpacing * 0.5));
      this.drawWiggle(ctx, ast, bars[i], v, dv, color || "#333");
    }
  }
  /**
   * Renders a twisty diagram from its AST.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The main AST node for the twisty diagram.
   * @param {object} params - The AST node containing the parameters.
   * @param {string} color - The color of the diagram.
   */
  outTwistyAst(ctx, ast, params, color) {
    this.outTwistyBus(ctx, ast, params, 0, 1, color);
    this.outTwistyBus(ctx, ast, params, 2, 3, color);
    //this.outCrossbars( ctx, ast, params, color);
    this.outConnects(ctx, ast, params, color);
    this.outWiggles(ctx, ast, params, color);
  }

  static draw2d(ctxMix, node, params){ 
    const ctx = ctxMix.ctx;
    const color = params?.color ?? "#559";
    const t = new Twisty();
    const p2 = { token: '-j[ik]'}
    node.xShift = 0;
    t.outTwistyAst( ctx, node, p2, color );
  }

  //\twisty -j[ik]
}

export { Twisty }


// Auto-generated exports
if (typeof window !== 'undefined') window.applyBend = applyBend;
export { applyBend };
if (typeof window !== 'undefined') window.drawWigglyLine = drawWigglyLine;
export { drawWigglyLine };
