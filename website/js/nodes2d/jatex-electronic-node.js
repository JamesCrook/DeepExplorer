class JatexDrawnNode {
  static measure(ctxMix, node, params){ 
    node.box = new Box(80,60)
  }
  static layout(ctxMix, node, params){ 
    node.box.move( ctxMix.layout.x, ctxMix.layout.y)
    ctxMix.layout.x += node.box.width();
  } 
  static draw2d(ctxMix, node, params){ 
    const ctx = ctxMix.ctx;
    const color = params?.color ?? "#559";

    var v = node.box.vecs[0];
    var dv = node.box.diagonal();
    const raw = node.value?.[1]
    this[raw](ctx,v,dv, color)
  }

  static transistor( ctx, v, dv, color) {
    var r = dv.y * 0.45;
    v = v.add(12, 0);
    var base = v.x + dv.y * 0.35;

    ctx.save();
    ctx.beginPath();
    // Outer circle...
    ctx.fillStyle = "#ccc";
    ctx.lineWidth = 3.0;
    ctx.strokeStyle = color;
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
    //this.P.outBox( ctx, node.box );
  }
  static resistor(ctx, v, dv, color) {
    // hotspots don't draw the inner details...
    //if( this.P.mayOutHotBox( ctx, node ))
    //  return;

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
    //this.P.outBox(ctx, node.box);
  }

  /**
   * Renders a battery symbol.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The AST node to render.
   * @param {string} color - The color of the symbol.
   */
  static battery(ctx, v, dv, color) {
    return this.capacitor(ctx, v, dv, color, true);
  }
  /**
   * Renders a capacitor or battery symbol.
   * @param {CanvasRenderingContext2D} ctx - The rendering context.
   * @param {object} ast - The AST node to render.
   * @param {string} color - The color of the symbol.
   * @param {boolean} battery - True if rendering a battery, false for a capacitor.
   */
  static capacitor(ctx, v, dv, color, battery=false) {
    // hotspots don't draw the ruler markings...
    //if(this.P.mayOutHotBox(ctx, ast))
    //  return;
    var delta = battery ? 30 : 9;
    var nBars = 2;
    var barHeight = 14;
    var indent = (dv.x - (nBars - 1) * delta) * 0.5;

    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 3.0;
    ctx.strokeStyle = color || "#000";

    //ctx.beginPath();
    ctx.moveTo(v.x, v.y + dv.y / 2)
    ctx.lineTo(v.x + indent, v.y + dv.y / 2);
    ctx.moveTo(v.x + dv.x - indent, v.y + dv.y / 2);
    ctx.lineTo(v.x + dv.x, v.y + dv.y / 2);
    ctx.stroke();

    var adj = 0;
    if(battery) {

      adj = 7;
      delta -= adj / (nBars - 1);
      ctx.lineWidth = 3.0;
      ctx.beginPath();
      for(var i = 0; i < nBars; i++) {
        ctx.moveTo(v.x + indent + adj + i * delta, v.y + dv.y / 2 -
          barHeight - adj);
        ctx.lineTo(v.x + indent + adj + i * delta, v.y + dv.y / 2 +
          barHeight + adj);
      }
      ctx.stroke();

      ctx.save();
      //adj = 0;
      ctx.lineWidth = 3.0;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(v.x + indent + adj, v.y + dv.y / 2);
      ctx.lineTo(v.x + dv.x - indent - adj, v.y + dv.y / 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.lineWidth = 5.0;
    for(var i = 0; i < nBars; i++) {
      ctx.moveTo(v.x + indent + i * delta, v.y + dv.y / 2 - barHeight);
      ctx.lineTo(v.x + indent + i * delta, v.y + dv.y / 2 + barHeight);
    }
    ctx.stroke();

    ctx.restore();
    //this.P.outBox(ctx, ast.box);
  }
}

export { JatexDrawnNode }