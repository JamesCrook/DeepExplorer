import { Shape } from '../2d-support/shape.js'
import { drawScorpioLabel } from '../2d-support/workhorse.js'

/**
 * A class for creating and managing tiled elements.
 * @class
 */
class JatexTileX {
  constructor(){
    this.fns = "\\round \\chevron \\straight \\forward \\backward \\arrow-head \\arrow-tail \\snake-head \\snake-tail \\cold-front \\warm-front \\zigzag \\zagzig \\sway \\antisway",
    // add in a flip for each unflipped.
    this.fns = this.fns + " " + this.fns.split(" ").join("-flip ");
    this.fns += " \\box \\low-box \\tile"
  }

  /**
   * Generates a label for the end of a token.
   * @param {string} tok - The token.
   * @returns {string} The generated label.
   */
  labelEndOfToken(tok) {
    var end = tok.substring(1).replace("-", "_");
    end = end.replace("backward", "forward_flip");
    end = end.replace("_flip_flip", "");
    end = end.replace("_flip", "Flip");
    return end;
  }
  /**
   * Optionally consumes a closing end token.
   * @param {object} node - The current AST node.
   * @param {string[]} tokens - The array of tokens.
   * @param {number} i - The current index in the tokens array.
   * @returns {number} The new index in the tokens array.
   */
  astMayGobbleClosingEnd(node, tokens, i) {
    i = this.P.skipBlanks(tokens, i);
    var tok = tokens[i] || "";
    if(this.P.fns[tok] == this) {
      node.endShape2 = this.labelEndOfToken(tok);
      i += 4;
    }
    return i;
  }
  /**
   * Creates an AST node for a tile.
   * @param {object} ast - The parent abstract syntax tree node.
   * @param {object} node - The current node to process.
   * @param {string[]} tokens - The array of tokens.
   * @param {number} i - The current index in the tokens array.
   * @param {number} len - The total length of the tokens array.
   * @returns {number} The new index in the tokens array.
   */
  astOfTile(ast, node, tokens, i, len) {
    var tok = node.token;

    node.endShape1 = this.labelEndOfToken(tok);
    node.endShape2 = "chevron";
    // optionally match a colour
    i = this.P.astMayEatColour(node, tokens, i);
    i = this.P.astOfTokens(node, tokens, i, i + 1);
    // Gobble an ending token.
    i = this.astMayGobbleClosingEnd(node, tokens, i);
    this.P.astAddUndefined(node, 1);
    return i;
  }
  /**
   * Creates an AST node for a specific tile type.
   * @param {object} ast - The parent abstract syntax tree node.
   * @param {object} node - The current node to process.
   * @param {string[]} tokens - The array of tokens.
   * @param {number} i - The current index in the tokens array.
   * @param {number} len - The total length of the tokens array.
   * @returns {number} The new index in the tokens array.
   */
  astOfTile_tile(ast, node, tokens, i, len) {
    var tok = node.token;
    // if not enough args, go use the standard ones..
    i = this.P.astMayEatColour(node, tokens, i);
    i = this.P.getSimpleArg(node, tokens, 'endShape1', 'chevron', i);
    i = this.P.getSimpleArg(node, tokens, 'endShape2', 'chevron', i);
    i = this.P.eatArgs(node, tokens, "contents", i);
    return i;
  }
  /**
   * Creates an AST node for a box tile.
   * @param {object} ast - The parent abstract syntax tree node.
   * @param {object} node - The current node to process.
   * @param {string[]} tokens - The array of tokens.
   * @param {number} i - The current index in the tokens array.
   * @param {number} len - The total length of the tokens array.
   * @returns {number} The new index in the tokens array.
   */
  astOfTile_box(ast, node, tokens, i, len) {
    i = this.P.astMayEatSize(node, tokens, i);
    i = this.P.astMayEatColour(node, tokens, i);
    // optionally match a colour
    //i = this.P.astMayEatNumber1( node, tokens, i );
    //i = this.P.astMayEatNumber2( node, tokens, i );
    node.endShape1 = "straight";
    node.endShape2 = "straight";
    return i;
  }
  /**
   * Creates an AST node for a low box tile.
   * @param {object} ast - The parent abstract syntax tree node.
   * @param {object} node - The current node to process.
   * @param {string[]} tokens - The array of tokens.
   * @param {number} i - The current index in the tokens array.
   * @param {number} len - The total length of the tokens array.
   * @returns {number} The new index in the tokens array.
   */
  astOfTile_low_box(ast, node, tokens, i, len) {
    return this.astOfTile_box(ast, node, tokens, i, len);
  }
  /**
   * Measures the dimensions of a tile.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} parent - The parent AST node.
   * @param {object} ast - The current AST node.
   * @param {object} font - The font information.
   * @returns {Box} The bounding box of the tile.
   */
  measureTile(ctx, parent, ast, font) {
    var box1 = this.P.measureSubtree(ctx, ast, ast.subtree[0]);
    ast.box.addRight(new Box(10, 0));
    ast.box = ast.box.addRight(box1);
    return ast.box;
  }
  /**
   * Measures the dimensions of a box tile.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} parent - The parent AST node.
   * @param {object} ast - The current AST node.
   * @param {object} font - The font information.
   * @returns {Box} The bounding box of the tile.
   */
  measureTile_box(ctx, parent, ast, font) {
    ast.box = new Box(35, 35);
    if(ast.hasSizing) {
      ast.box = new Box(ast.hasSizing);
    }
    return ast.box;
  }
  /**
   * Measures the dimensions of a low box tile.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} parent - The parent AST node.
   * @param {object} ast - The current AST node.
   * @param {object} font - The font information.
   * @returns {Box} The bounding box of the tile.
   */
  measureTile_low_box(ctx, parent, ast, font) {
    ast.box = new Box(35, 10);
    return ast.box;
  }
  /**
   * Positions a tile.
   * @param {object} parent - The parent AST node.
   * @param {object} ast - The current AST node.
   * @param {Vector2d} v - The position vector.
   */
  positionTile(parent, ast, v) {
    ast.box.move(v);
    var vv = ast.box.vecs[0];
    // these are stacked above each other...
    for(var node of (ast.subtree || [])) {
      var spare = ast.box.width() - node.box.width();
      this.P.positionSubtree(parent, node, vv.add(spare / 2, 0));
    }
    if(ast.jref)
      this.P.mayPositionJref(ast.jref, ast.box);
  }
  /**
   * Renders a tile.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The AST node to render.
   * @param {string} color - The color of the tile.
   */
  outTile(ctx, ast, color) {
    color = "#000";

    var adjust1 = 0;
    var adjust2 = 0;
    if(["round", "chevron"].indexOf(ast.endShape1) >= 0)
      adjust1 = 8;
    if(["roundFlip", "chevronFlip"].indexOf(ast.endShape2) >= 0)
      adjust2 = 8;
    var va = ast.box.vecs[0].add(adjust1, 0);
    var vc = ast.box.vecs[1].add(adjust2, 0);
    var vb = new Vector2d(va.x, vc.y);
    var vd = new Vector2d(vc.x, va.y);

    var style = {
      outline: "#AAAA33",
      fill: "#eee",
      width: 4
    };
    if(ast.colour) {
      style.fill = ast.colour;
      // prefer black as a colour.
      // ignore blue for working out complementary colour...
      if((Number(ast.colour.substring(1, 2)) <= 7) ||
        (Number(ast.colour.substring(2, 3)) <= 9)
      )
        color = "#fff";
    }

    var isJref = this.P.parent.shade_jrefs != 'n';
    isJref = this.P.mayPositionJref(ast.jref, ast.box) && isJref;
    var isHot = this.P.isHotspot;
    if(isHot) {
      color = this.P.hotColourOfAtom(ast.jref || 0);
      style = {
        fill: color
      };
    } else if(isJref) {
      style = {
        fill: "#0002"
      };
    }

    drawScorpioLabel(ctx, ast, style, va, vd, vc, vb);
    if(!isHot && ast.subtree && ast.subtree[0])
      this.P.outSubtree(ctx, ast.subtree[0], color);
    this.P.outBox(ctx, ast.box);
  }
}

class JatexTileNode {
  static measure(ctxMix, node, params){ 
    node.box = new Box(40,20)
  }
  static layout(ctxMix, node, params){ 
    node.box.move( ctxMix.layout.x, ctxMix.layout.y)
    ctxMix.layout.x += node.box.width();
  }   
  out( ctx, node, p2, color ){
    var v = node.box.vecs[0];
    var dv = node.box.diagonal();    
    ctx.save();
    ctx.beginPath();
    ctx.rect( v.x, v.y, dv.x, dv.y )
    ctx.fillStyle = "#DDD";
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 3.0;    
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
  out2( ctx, node, p2, color ){
    var va = node.box.vecs[0];
    var vc = va.add( node.box.diagonal());
    var vb = new Vector2D( va.x, vc.y )   
    var vd = new Vector2D( vc.x, va.y ) 
    var nodeShape = {};
    nodeShape.endShape1 = 'zigzag'  
    nodeShape.endShape2 = 'chevronFlip' 
    //nodeShape.topEdge = 'bend'
    //nodeShape.botEdge = 'inStem'
    var style = {
      outline: "#118811",
      fill: "#77e",
      width: 4
    };
    drawScorpioLabel(ctx, nodeShape, style, va, vd, vc, vb);
  }
  static draw2d(ctxMix, node, params){ 
    const ctx = ctxMix.ctx;
    const color = params?.color ?? "#559";
    const t = new JatexTileNode();
    const p2 = { token: 'chevron Hi there round'}
    node.xShift = 0;
    t.out2( ctx, node, p2, color );
  }
}

export {JatexTileNode}

// Auto-generated exports
if (typeof window !== 'undefined') window.JatexTileX = JatexTileX;
export { JatexTileX };
