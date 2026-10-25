/**
 * @fileoverview A parser and renderer for a custom LaTeX-like syntax called JaTeX.
 * This file provides the logic for parsing JaTeX strings into an Abstract Syntax Tree (AST)
 * and then rendering that AST, either as HTML or by drawing it onto a 2D canvas context.
 * It includes specific handlers for complex elements like fractions and electronic symbols.
 */


/**
 * Creates a processor for JaTeX syntax.
 * This processor can parse a JaTeX string into an AST and then render it
 * either as syntax-highlighted HTML or by drawing it to a canvas.
 * @returns {{astOf: function(string): AstNode, htmlOf: function(string): string, pretty: function(AstNode): string, draw: function(AstNode, CanvasRenderingContext2D)}}
 *          An object with methods for parsing and rendering.
 */
function JatexProcessor() {
  const parser = Parser.createParserFromRule('Jatex');
  const registry = createHandlerRegistry();

  function makeHandlers(h_in) {
    let result = {}
    result.print = {
      sym(ast, c) {
        return wrap('#3b3', c.val);
      },
      default (ast, c) {
        let result = '';
        let pre, post;
        [pre, post] = prePost(ast.token);
        result += wrap('#f93', pre);
        for(let node of ast.subtree) {
          result += registry.pretty(node);
        }
        result += wrap('#f93', post);
        if(result)
          return result;
        return c.val
      },
    }
    result.draw = drawFns;
    result.measure = {
      sym(ast, c) {
        measureSvgSymbols(ast, c.ctx);
      },
      'jsymbol': function(ast, c) {
        measureSvgSymbols(ast, c.ctx);
      },
      default (ast, ctx) {
        for(let node of ast.subtree) {
          registry.measure(node, ctx);
        }
      }
    }
    result.position = {
      default (ast, c) {
        for(let node of ast.subtree) {
          registry.position(node, c);
        }
      }
    }
    return result;
  }

  function measureSvgSymbols(ast, ctx, prev) {
    var box = new Box(72, 48); // 9x6 in 8x8 units.
    ast.box = box;
    return box;
  }

  function positionSvgSymbols(ast, parent, v) {
    ast.box.move(v);
  }

  const drawFns = {
    'jsymbol': function(ast, ctx, color) {
      let sym = ast.value?.[1] ?? 'transistor';
      let fn = drawFns?.[sym] ?? drawFns.transistor;
      fn(ast, ctx, color)
    },
    'transistor': function(ast, ctx, color) {
      // hotspots don't draw the ruler markings...
      //if( this.P.mayOutHotBox( ctx, ast ))
      //  return;

      var v = ast.box.vecs[0];
      var dv = ast.box.diagonal();
      var r = dv.y * 0.45;
      v = v.add(12, 0);
      var base = v.x + dv.y * 0.35;

      ctx.save();
      ctx.beginPath();
      // Outer circle...
      ctx.fillStyle = "#ccc";
      ctx.lineWidth = 3.0;
      ctx.strokeStyle = color || "#000";
      ctx.arc(v.x + dv.y / 2, v.y + dv.y / 2, r, 0, 2 * Math.PI);
      ctx.fill();

      //ctx.beginPath();
      // top to base
      ctx.moveTo(v.x + dv.x / 2, v.y)
      ctx.lineTo(v.x + dv.x / 2, v.y + dv.y * 0.1);
      ctx.lineTo(base, v.y + dv.y * 0.4);
      // base to bottom
      ctx.moveTo(base, v.y + dv.y * 0.6);
      ctx.lineTo(v.x + dv.x / 2, v.y + dv.y * 0.9);
      ctx.lineTo(v.x + dv.x / 2, v.y + dv.y)
      // base to left edge
      v = v.sub(12, 0);
      ctx.moveTo(base, v.y + dv.y / 2);
      ctx.lineTo(v.x, v.y + dv.y / 2);
      ctx.stroke();

      // and now the base itself (thicker).
      ctx.beginPath();
      ctx.lineWidth = 5.0;
      ctx.moveTo(base, v.y + dv.y * 0.25);
      ctx.lineTo(base, v.y + dv.y * 0.75);
      ctx.stroke();
      ctx.restore();
      //this.P.outBox( ctx, ast.box );
    },
    'resistor': function(ast, ctx, color) {
      // hotspots don't draw the inner details...
      //if( this.P.mayOutHotBox( ctx, ast ))
      //  return;

      var v = ast.box.vecs[0];
      var dv = ast.box.diagonal();
      var indent = 14;
      var nPoints = 6;
      var len = dv.x - 2 * indent;
      var delta = len / nPoints;

      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = 3.0;
      ctx.strokeStyle = color || "#000";

      //ctx.beginPath();
      ctx.moveTo(v.x, v.y + dv.y / 2)
      ctx.lineTo(v.x + indent, v.y + dv.y / 2);
      for(var i = 0; i < nPoints; i++)
        ctx.lineTo(v.x + indent + (i + 0.5) * delta, v.y + dv.y / 2 +
          (i % 2 - 0.5) * delta * 2.6);
      ctx.lineTo(v.x + dv.x - indent, v.y + dv.y / 2);
      ctx.lineTo(v.x + dv.x, v.y + dv.y / 2);
      ctx.stroke();
      ctx.restore();
      //P.outBox( ctx, ast.box );
    },
    default (ast, ctx) {
      for(let node of ast.subtree) {
        registry.draw(node, ctx);
      }
    }
  }

  function safeString(str) {
    return str.replace(/</g, '&lt;');
  }

  function prePost(tok) {
    if(tok == '(')
      return ['(', ')'];
    if(tok == '[')
      return ['[', ']'];
    if(tok == '{')
      return ['{', '}'];
    return ['', ''];
  }

  function wrap(color, value) {
    return value ? '<span style="color:' + color + '">' + value + '</span>' :
      '';
  }

  function bwrap(color, value) {
    return value ? '<span style="background-color:' + color + '">' + value +
      '</span>' : '';
  }

  function pretty(ast) {
    let val = safeString(ast.value || '');
    let c = {
      val: val
    };
    return registry.prettyPrint(ast, c);
  }

  /**
   * Renders the complete AST to a canvas context.
   * This involves measuring, positioning, and drawing all nodes.
   * @param {AstNode} ast - The root of the AST to draw.
   * @param {CanvasRenderingContext2D} ctx - The canvas context to draw on.
   * @returns {*} The result of the final draw call.
   */
  function draw(ast, ctx) {
    let c = {
      ctx: ctx
    };
    registry.measure(ast, c);
    registry.position(ast, c);
    return registry.draw(ast, ctx);
  }

  let frac = JatexFrac();
  registry.registerGroup(makeHandlers);
  registry.registerGroup(frac.makeHandlers);

  return {
    astOf: (text) => parser.parse(text),
    htmlOf: (text) => {
      let ast = parser.parse(text);
      return pretty(ast);
    },
    pretty: pretty,
    draw: draw
  };
}

const jatexProcessor = JatexProcessor();

window.jatexProcessor = jatexProcessor;

// Auto-generated exports
if (typeof window !== 'undefined') window.JatexProcessor = JatexProcessor;
export { JatexProcessor };
export { jatexProcessor };
