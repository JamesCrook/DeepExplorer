/**
 * jatex-node.js
 *
 */

/*
# ESSENTIALS

JaTeX is a LaTeX like language that renders maths in the canvas.
It has extensions for Penrose tensor notation and for shapes and tiles that
can be clicked together, like the tiles of Scratch.
*/

import '../2d-support/vector2d.js'
import '../2d-support/box.js'

import '../utilities2/ast-manager.js'
import '../parsers/parser.js'
import '../parsers/jatex.js'

import { WarpedPolygon } from './warped-polygon.js';
import { Vector2D, lerp } from '../2d-support/vector2d.js';
import { LinearPath, ArcPath, SectorPath, GridPath, BlendedPath } from '../2d-support/path.js';
import { SizeCache } from './multiscroller-nodes.js';
import { sceneRegistry } from '../omni-support/scene.js';
import { Twisty } from './jatex-twisty-node.js'
import { JatexTileNode } from './jatex-tile-node.js'
import { JatexDrawnNode } from './jatex-electronic-node.js'

const JatexProcessor = window.JatexProcessor;

// This is a copy of the earlier defs, and overrides them
Parser
  // minimal test of JaTeX
  .addRep('Jatex', ['jterm'])
  .addOr('jterm', ['jexp', 'frac', 'jsymbol', 'blanks'])
  .addSeq('blanks', [/^( +)/])
  .addSeq('jsymbol', [/^\\([a-zA-Z0-9_]+)/])
  .addSeq('frac', [/^\\frac/, 'numerator', 'denominator'])
  .addSeq('numerator', ['jexp'])
  .addSeq('denominator', ['jexp'])
  .addSeq('jexp', [/^{/, 'Jatex', /^}/])


// ============================================================
// GridNode
// ============================================================


var SymStr = "^ \\hat § \\S ¯ \\bar ± \\pm µ \\mu × \\mply × \\times ÷ \\div ı \\imath ȷ \\jmat ˙ \\dot Γ \\Gamma Δ \\Delta Θ \\Theta Λ \\Lambda Ξ \\Xi Π \\Pi Σ \\Sigma Υ \\Upsilon Φ \\Phi Ψ \\Psi Ω \\Omega α \\alpha β \\beta γ \\gamma δ \\delta ε \\varepsilon ζ \\zeta η \\eta θ \\theta ι \\iota κ \\kappa λ \\lambda μ \\mu ν \\nu ξ \\xi π \\pi ρ \\rho ς \\varsigma σ \\sigma τ \\tau υ \\upsilon φ \\phi φ \\varphi χ \\chi ψ \\psi ω \\omega ϑ \\vartheta ϕ \\phi ϖ \\varpi ϱ \\varrho ϵ \\epsilon Ω \\Omega → \\rightarrow ⇒ \\Rightarrow ∀ \\forall ∂ \\partial ∃ \\exists ∅ \\varnothing ∇ \\nabla ∈ \\in ∓ \\mp ∗ \\ast ∝ \\propto ∞ \\infty ∠ \\angle ∣ \\mid ∥ \\parallel ∧ \\wedge ∨ \\vee ∩ \\cap ∪ \\cup ∴ \\therefore ∵ \\because ∼ \\sim ≅ \\cong ≈ \\approx ≠ \\neq ≡ \\equiv ≤ \\leq ≥ \\geq ≺ \\prec ≻ \\succ ⊂ \\subset ⊆ \\subseteq ⊕ \\oplus ⊗ \\otimes ⊥ \\bot ⊥ \\perp ⋅ \\cdot ⋅⋅⋅ \\cdots ... \\ellipsis ◦ \\circ ⪯ \\preceq ⪰ \\succeq ( \\left( ) \\right) [ \\left[ ] \\right] { \\left{ } \\right} ⇌ \\chemequal ⇋ \\chemequal2 - - + + = = \\ \\slash { \\left-brace } \\right-brace";

SymStr += " ∫ \\int ∬ \\iint ∭ \\iiint ∫⋅⋅⋅∫ \\idotsint ∮ \\oint ∯ \\ooint ∰ \\oooint √ \\sqrt";

SymStr += " ⊙ \\odot ⊚ \\ocirc ⊛ \\ostar ⏺ \\ofull ☀ \\oglow ⚙ \\ocog ◯ \\oempty ⎈ \\ships-wheel ▲ \\tupfull △ \\tupempty ▼ \\tdownfull ▽ \\tdownempty ◼ \\sqfull ◻ \\sqempty";


function makeLut(){
  const tokens = SymStr.trim().split(/\s+/);
  const values = tokens.filter((_, i) => i % 2 === 0);
  const keys = tokens.filter((_, i) => i % 2 !== 0).map(k => k.replace('\\', ''));
  return Object.fromEntries( keys.map((key, i) => [key, values[i]]));
}
const lookup = makeLut();

class JatexSymbolNode {

  static outBoxedToken( ctx, ast, color ){
/*
    if( this.mayOutHotBox( ctx, ast ))
      return;
    var v = ast.box.vecs[0];
    var text = this.textOfToken( ast.token );
    FontHandler.setFontForToken( ctx, ast.token );
    color = color || this.parent.sym_color || "#950";
    ctx.fillStyle = color;
    var len = ctx.measureText(text).width;
    var width = ast.box.width();
    var adjust = this.alignFrac * (width - len);
    //ctx.beginPath();
    ctx.fillText( text, v.x+adjust, v.y+FontHandler.getFontOffset() );
    this.outBox( ctx, ast.box );
    ctx.textBaseline = "alphabetic";
*/    
  }

  static measure(ctxMix, node, params){ 
    let ctx = ctxMix.ctx;
    ctx.font = '40px monospace';
    let sym = lookup[ node.value?.[1] ]
    var width = sym ? ctx.measureText(sym).width : 30;
    node.box = new Box(width,40)
  }  
  static layout(ctxMix, node, params){ 
    node.box.move( ctxMix.layout.x, ctxMix.layout.y)
    ctxMix.layout.x += node.box.width();
  } 

  static draw2d(ctxMix, node, params){
    const ctx = ctxMix.ctx;
    const sym = node.inst.sym
    ctx.fillStyle = "#bbb"
    ctx.font = '40px monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";    
    ctx.fillText( sym, node.box.tl().x, node.box.br().y );
  }
}

class JatexExpNode {
  static after_measure(ctxMix, node, params){ 
    let width = 0;
    let height = 0;
    node.box = new Box(0,0)
    let subtree = node.subtree[0].subtree;
    for(let i=0;i<subtree.length;i++){
      let elt = subtree[i]?.subtree?.[0];
      if( elt?.box ){
        height = Math.max( height, elt.box.height())
        width += elt.box.width();
      }
    }
    node.box.set1( width, height )
    // default starting position...
    node.box.move( 0, (params.baseline ?? 0) * 100 - 50)
  }

  // layout in a horizontal straight line.
  static after_layout(ctxMix, node, params){ 
    let x = node.box.tl().x;
    let y = node.box.tl().y;
    let height = node.box.height();
    let subtree = node.subtree[0].subtree;
    for(let i=0;i<subtree.length;i++){
      let elt = subtree[i]?.subtree?.[0];
      if( elt?.box ){
        let dh = height-elt.box.height();
        elt.box.moveTo(x,y+dh*(params.valign??0.5));
        x += elt.box.width()
      }
    }
  } 
}

class JatexFrac {
  static after_measure(ctxMix, node, params){ 
    let width = 0;
    let height = 0;
    node.box = new Box(0,0)
    let subtree = node.subtree;
    for(let i=0;i<subtree.length;i++){
      let elt = subtree[i]?.subtree?.[0];
      if( elt?.box ){
        elt.box.move( 0, height )
        width = Math.max( width, elt.box.width())
        height += elt.box.height() + 25;
      }
    }
    for(let i=0;i<subtree.length;i++){
      let elt = subtree[i]?.subtree?.[0];
      if( elt?.box ){
        elt.box.move( (width-elt.box.width())*(params.halign??0), 0 )
      }
    }    
    node.box.set1( width,height )
  }
  static after_draw2d(ctxMix, node, params){ 
    const bar = 25;
    const box = node.subtree[0].subtree[0].box
    const v1 = box.tl();
    const v2 = box.br();
    const width = node.box.width()||30;
    const lw = 3.0;
    const ctx = ctxMix.ctx;

    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = lw;
    ctx.strokeStyle = "#fff";
    ctx.moveTo(v1.x, v2.y +bar/2)
    ctx.lineTo(v1.x + width, v2.y + bar / 2);
    ctx.stroke();
    ctx.restore();


  }
}

sceneRegistry.registerNodeClass('frac', JatexFrac);
sceneRegistry.registerNodeClass('jexp', JatexExpNode);
sceneRegistry.registerNodeClass('jatex.tile', JatexTileNode);
sceneRegistry.registerNodeClass('jatex.twisty', Twisty);
sceneRegistry.registerNodeClass('jatex.sym', JatexSymbolNode);
sceneRegistry.registerNodeClass('jatex.drawn', JatexDrawnNode);

/**
 * This class does a one time switch of type for the more precisely defined type.
 */
class JatexSymbolResolver {
  static measure(ctxMix, node, params){ 
    const raw = node.value?.[1]
    const sym = lookup[ raw ]
    if( sym ){
      node.type = 'jatex.sym'
      node.inst = { sym: sym }
      return JatexSymbolNode.measure( ctxMix, node, params )
    }
    if( ['transistor','resistor','capacitor','battery'].includes(raw)){
      node.type = 'jatex.drawn'
      return JatexDrawnNode.measure( ctxMix, node, params )
    }
    if( ['twisty'].includes(raw)){
      node.type = 'jatex.twisty'
      return Twisty.measure( ctxMix, node, params )
    }
    if( ['tile'].includes(raw)){
      node.type = 'jatex.tile'
      return JatexTileNode.measure( ctxMix, node, params )
    }    
  }
}

sceneRegistry.registerNodeClass('jsymbol', JatexSymbolResolver);


class JatexNode {

  // ── Default JaTeX text ──────────────────────────────────

  static DEFAULT_TEXT = "\\frac{\\nabla\\times\\twisty\\nabla\\resistor\\transistor\\battery\\nabla}{\\times\\capacitor\\tile\\transistor}";

  // ── One-time wiring ────────────────────────────────────

  static _wire(node) {
    if (node._wired) return;
    node._wired = true;
    const text = node.value?.text ?? JatexNode.DEFAULT_TEXT;
    // Persist text on value so the textarea can read it back
    if (node.value) node.value.text = text;
    else node.value = { text };
    let ast = jatexProcessor.astOf(text);
    node.subtree = [ ast ];
  }

  /**
   * Re-parse new JaTeX text and replace the subtree.
   * Called live from the text-entry UI.
   */
  static _rewire(node, text) {
    if (!node) return;
    if (!node.value) node.value = {};
    node.value.text = text;
    node._wired = true;
    try {
      const ast = jatexProcessor.astOf(text);
      node.subtree = [ ast ];
    } catch (_) {
      // Parse error — keep the old subtree until input is valid
    }
  }

  // ── Propagate measured box from child jexp ─────────────

//  static after_measure(ctxMix, node, params) {
//    const child = node.subtree?.[0];
//    if (child?.box) {
//      node.box = child.box.clone();
//    }
//  }

  static after_measure(ctxMix, node, params) {
    // Parser AST: jatex → [Jatex_rep → jterm → frac/jsymbol/jexp]
    // Walk first-child chain until we hit a node with a computed box.
    let current = node.subtree?.[0];
    while (current && !current.box) {
      current = current.subtree?.[0];
    }
    if (current?.box) {
      node.box = current.box.clone();
    }
  }


  // ── before_draw2d ──────────────────────────────────────

//  static before_draw2d(ctxMix, node, params) {
//    JatexNode._wire(node);
//  }

  // ── before_child_draw2d ────────────────────────────────

  //static before_child_draw2d(ctxMix, node, params, child) {
  //}


//  static draw2d( ctxMix, node, params ){
    //let ast = jatexProcessor.astOf("\\frac{\\resistor}{\\transistor}");
    //console.log(ast);
    //jatexProcessor.draw(ast, ctxMix.ctx);
//  }

  // ── helpers ────────────────────────────────────────────

  static _bboxFromCorners(corners) {
    let x0 = corners[0].x, y0 = corners[0].y, x1 = x0, y1 = y0;
    for (let i = 1; i < 4; i++) {
      const c = corners[i];
      if (c.x < x0) x0 = c.x;
      if (c.y < y0) y0 = c.y;
      if (c.x > x1) x1 = c.x;
      if (c.y > y1) y1 = c.y;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
}

sceneRegistry.registerNodeClass('jatex', JatexNode);



export { JatexNode };
// Auto-generated exports
if (typeof window !== 'undefined') window.JatexExpNode = JatexExpNode;
export { JatexExpNode };
if (typeof window !== 'undefined') window.JatexFrac = JatexFrac;
export { JatexFrac };
if (typeof window !== 'undefined') window.JatexProcessor = JatexProcessor;
export { JatexProcessor };
if (typeof window !== 'undefined') window.JatexSymbolNode = JatexSymbolNode;
export { JatexSymbolNode };
if (typeof window !== 'undefined') window.JatexSymbolResolver = JatexSymbolResolver;
export { JatexSymbolResolver };
if (typeof window !== 'undefined') window.SymStr = SymStr;
export { SymStr };
if (typeof window !== 'undefined') window.lookup = lookup;
export { lookup };
if (typeof window !== 'undefined') window.makeLut = makeLut;
export { makeLut };
