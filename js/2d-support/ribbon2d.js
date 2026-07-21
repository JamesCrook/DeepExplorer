import { PathAst } from '../utilities2/path-ast.js';
/**
 * @class RibbonStyle
 * @description Manages the visual style of a ribbon.
 */
class RibbonStyle {
  constructor(style = {}) {
    this.fill = style.fill || 'gray';
    this.stroke = style.stroke || 'black';
    this.lineWidth = style.lineWidth || 1;
    this.startEndType = style.startEndType || '[';
    this.endEndType = style.endEndType || ']';
    this.globalAlpha = style.globalAlpha || 1.0;
    this.image = style.image || null;
    // ... other style properties
  }
}

/**
 * @class PathData
 * @description A container for path information, adaptable for different path types.
 */
class PathData {
  constructor() {
    if(this.constructor === PathData) {
      throw new Error("Abstract classes can't be instantiated.");
    }
  }

  static from(type, data) {
    if(type === 'nodes') {
      return new RibbonPathData(data);
    }
    if(type === 'spline') {
      return new SplinePathData(data);
    }
    throw new Error(`Unknown path data type: ${type}`);
  }
}

/**
 * @class SplinePathData
 * @extends PathData
 * @description Path data for a spline ribbon.
 */
class SplinePathData extends PathData {
  constructor(data) {
    super();
    this.startPoint = data.startPoint;
    this.endPoint = data.endPoint;
    this.startHeight = data.startHeight;
    this.endHeight = data.endHeight;
    this.startTangent = data.startTangent || new Vector2D(1, 0);
    this.endTangent = data.endTangent || new Vector2D(1, 0);
    this.blobPos = data.blobPos;
    this.diversionFactor = data.diversionFactor;
  }

  getStartTangent() {
    return this.startTangent;
  }

  getEndTangent() {
    return this.endTangent;
  }
}

/**
 * @class RibbonPathData
 * @extends PathData
 * @description Path data for a biarc ribbon.
 */
class RibbonPathData extends PathData {
  constructor(data) {
    super();
    this.nodes = data.nodes;
  }
}

/**
 * @class Ribbon (Base)
 * @description Manages the common styling and rendering logic for all ribbon 
 * types.
 * Ribbons are made from segments, and those segments are determined by nodes, 
 * which are arrays of Vector2D
 * Overwhelmingly it contains draw methods, and most of these methods only look
 * at ctx and params passed in.
 */
class Ribbon {
  /**
   * @constructor
   * @param {object} config - The configuration object for the ribbon.
   * @param {PathData} config.path - The geometric path of the ribbon.
   * @param {RibbonStyle} config.style - The visual style of the ribbon.
   */
  constructor({
    path,
    style
  }) {
    this.path = path;
    this.style = style;
    this.ctx = null;
  }

  setCtx(ctx) {
    this.ctx = ctx;
  }

  // First simple draw functions with easy geometry.

  drawBlob(point, node, style) {
    let ctx = this.ctx;

    let radius = style?.radius ?? 5;
    if(radius < 1) return;
    ctx.fillStyle = '#04f7';
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();

    if(!node?.name) return;
    ctx.fillStyle = 'black';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(node.name, point.x, point.y - 15);
  }

  drawStraightSegment(from, to, style) {
    let ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = style?.colour || 'red';
    ctx.lineWidth = style?.width || 2;
    ctx.stroke();
  }

  // Now draw functions that use helpers to get geometry

  drawBarsFromPath(ribbonPath) {
    let ctx = this.ctx;
    const bars = ribbonPath?.getAllBars();
    if(!bars) {
      console.log("path does not provide bars")
      return;
    }
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;

    for(const bar of bars) {
      ctx.beginPath();
      ctx.moveTo(bar.from.x, bar.from.y);
      ctx.lineTo(bar.to.x, bar.to.y);
      ctx.stroke();
    }
  }

  drawMarkingsFromPath(ribbonPath, markingConfig) {
    // Needs to include glyph.js
    if(typeof Glyph === 'undefined')
      return;
    let ctx = this.ctx;
    const bars = ribbonPath?.getAllBars(markingConfig.minor.spacing);
    if(!bars) {
      console.log("path does not provide markingss")
      return;
    }

    bars.forEach((bar, i) => {
      // For now, simple logic to determine which glyphs are major, for example maybe every fifth 
      // one is.
      // The future plan is to use the line markings code to determine which marks to emphasise
      // We'll also get 'upcoming' markers that can fade in, for example for a ruler.
      //const strengths = LineMarkings.lineStrengths(
      //  LineMarkings.decimalFactors, span / am.spanDivider);
      const isMajor = ((i * markingConfig.minor.spacing) % markingConfig
        .major.spacing) == 0;
      const glyphSpec = (isMajor) ? markingConfig.major.glyph :
        markingConfig.minor.glyph;
      if(glyphSpec) {
        const glyph = new Glyph(glyphSpec)
          .opacity(bar.strength * (glyphSpec.opacity || 1));
        let tangent = bar.to.sub(bar.from).normalize();
        let center = bar.from.add(bar.to).scale(0.5);
        glyph.render(ctx, center, tangent.angle);
      }
    })
  }

  drawPolygonFromPath(ribbonPath, straightStyle) {
    let ctx = this.ctx;
    for(let i = 0; i < ribbonPath.getEdgeCount(); i++) {
      const edge = ribbonPath.getEdge(i);
      const start = edge.getPointAt(0);
      const end = edge.getPointAt(1);
      this.drawStraightSegment(start, end, straightStyle);
    }
  }

  drawTangentsFromPath(ribbonPath) {
    const handleStyle = {
      colour: '#1a1',
      width: 4
    };
    const nodes = ribbonPath.getNodes();

    for(const node of nodes) {
      if(node.tang) {
        const A = new Vector2D(node.x, node.y);
        const u = node?.tang;
        if(!u) {
          console.log("path does not provide tangents")
          return;
        }
        this.drawStraightSegment(A.subtract(u.scale(30)), A.add(u.scale(30)),
          handleStyle);
      }
    }
  }

  drawArcRectangle(p1, p2, style, instance) {
    let ctx = this.ctx;
    const pathAst = PathAst.createArcRectanglePath(p1, p2, style);

    PathToContext.drawStyledPaths(pathAst, ctx, style, p1, p2);

    // helpful for debugging, the dot shows the centre of the arc
    if(true || style.dot) {
      const g = PathAst.calculateArcStrokeGeometry(p1, p2, style);
      ctx.fillStyle = '#ff00ff'; //style.dot;
      ctx.beginPath();
      ctx.arc(g.center.x, g.center.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawSplineRectangle(p1, p2, style) {
    let ctx = this.ctx;
    const pathAst = PathAst.createSplineRectanglePath(p1, p2, style);
    PathToContext.drawStyledPaths(pathAst, ctx, style, p1, p2);

    // helpful for debugging, the dot shows the spline control points
    if(style.dot) {
      // const g = PathAst.calculateSplineStrokeGeometry(p1, p2, style);
      // ctx.fillStyle = style.dot;
      // ctx.beginPath();
      // ctx.arc(g.center.x, g.center.y, 3, 0, Math.PI * 2);
      // ctx.fill();
    }
  }

  drawFillFromPath(ribbonPath) {
    let ctx = this.ctx;
    ctx.beginPath();

    const segments = ribbonPath.getSegments();
    let first = true;

    for(const segment of segments) {
      if(first) {
        ctx.moveTo(segment.startPoint.x, segment.startPoint.y);
        first = false;
      }
      segment.drawFill(ctx);
    }

    ctx.fillStyle = '#0008';
    ctx.fill();
  }

  drawFilledRibbonFromPath(ribbonPath, styleIn) {
    const segments = ribbonPath.getSegments();
    const numSegments = segments.length;
    if(numSegments === 0) {
      return;
    }

    const allPieces = [];
    for(let i = 0; i < numSegments; i++) {
      const segment = segments[i];
      const isFirst = i === 0;
      const isLast = i === numSegments - 1;
      const pieces = segment.getFillPathPieces(styleIn, isFirst, isLast);
      allPieces.push(...pieces);
    }

    const mergedPath = PathAst.createEmptyPath();
    if(allPieces.length > 0) {
      const firstPieces = allPieces[0];
      const lastPieces = allPieces[allPieces.length - 1];

      // 1. Start shape of the first segment
      const startShape = firstPieces[0];
      PathAst.addPath(mergedPath, startShape);

      // 2. Outer curves of all segments
      for(const pieces of allPieces) {
        const outerCurve = pieces[1];
        PathAst.addPath(mergedPath, PathAst.removeMoveTo(outerCurve));
      }

      // 3. End shape of the last segment
      const endShape = lastPieces[2];
      PathAst.addPath(mergedPath, PathAst.removeMoveTo(endShape));

      // 4. Inner curves of all segments in reverse order
      for(let i = allPieces.length - 1; i >= 0; i--) {
        const pieces = allPieces[i];
        const innerCurve = pieces[3];
        PathAst.addPath(mergedPath, PathAst.removeMoveTo(innerCurve));
      }

      PathAst.addPath(mergedPath, PathAst.createPathCommand('Z'));
    }

    const p1 = ribbonPath.nodes[0];
    const p2 = ribbonPath.nodes[ribbonPath.nodes.length - 1];
    PathToContext.drawStyledPaths(mergedPath, this.ctx, styleIn, p1, p2);
  }

  drawSegmentsFromPath(ribbonPath, style) {
    const segments = ribbonPath.getSegments();

    for(const segment of segments) {
      const segmentStyle = {
        ...style
      };
      if(segment.startPoint.color && segment.endPoint.color) {
        segmentStyle.fill = [segment.startPoint.color, segment.endPoint
          .color
        ];
      }
      segment.drawSegment(this.ctx, segmentStyle);
      this.drawBlob(segment.midPoint, null, segmentStyle);
    }
  }

  /**
   */
  async drawWarpedImageFromPath(ribbonPath, imageConfig) {
    if(!imageConfig || !imageConfig.url) {
      return;
    }

    const imageWarper = new ImageWarper({
      imageUrl: imageConfig.url
    });
    await imageWarper.loadImage();

    const pathLength = ribbonPath.getLength();
    const imageCanvas = await imageWarper.getRepeatedImageCanvas(pathLength);

    const segments = ribbonPath.getSegments();
    let currentX = 0;

    for(const segment of segments) {
      const segmentLength = segment.getLength();
      this.drawWarpedSegment(segment, imageCanvas, currentX, segmentLength,
        imageConfig);
      currentX += segmentLength;
    }
  }

  drawWarpedSegment(segment, imageCanvas, startX, segmentLength, imageConfig) {
    const sliceWidth = imageConfig.sliceWidth || 1;
    const numSlices = Math.ceil(segmentLength / sliceWidth);
    const ribbonWidth = this.style.width || 20;

    for(let i = 0; i < numSlices; i++) {
      const dist = i * sliceWidth;
      const t = dist / segmentLength;

      if(t > 1) continue;

      const point = segment.getPointAt(t);
      const tangent = segment.getTangentAt(t);

      const sourceX = startX + dist;

      this.ctx.save();
      this.ctx.translate(point.x, point.y);
      this.ctx.rotate(tangent.angle);

      this.ctx.drawImage(
        imageCanvas,
        sourceX, 0,
        sliceWidth, imageCanvas.height,
        -sliceWidth / 2, -ribbonWidth / 2,
        sliceWidth, ribbonWidth
      );

      this.ctx.restore();
    }
  }

  toSVGPathString() {
    let ctx = new SvgPseudoCtx();
    let oldCtx = this.ctx;
    this.setCtx(ctx);
    this.renderToCanvas(ctx);
    this.setCtx(oldCtx);
    return ctx.getSvg();
  }

  /**
   * Renders the ribbon to a canvas context. This method orchestrates the drawing.
   * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
   */
  renderToCanvas(ctx) {
    // 1. Get the raw path from the subclass
    const canvasPath = this.getCanvasPath();
    // 2. Apply fill, stroke, and effects based on this.style
    // 3. Render adornments like markings and images
    PathToContext.drawStyledPaths(canvasPath, ctx, this.style);
  }

  /**
   * Abstract method to be implemented by subclasses.
   * @returns {object} A Path AST object for canvas rendering.
   */
  getCanvasPath() {
    throw new Error("Method 'getCanvasPath()' must be implemented.");
  }
}

window.Ribbon = Ribbon;

// Auto-generated exports
if (typeof window !== 'undefined') window.PathData = PathData;
export { PathData };
export { Ribbon };
if (typeof window !== 'undefined') window.RibbonPathData = RibbonPathData;
export { RibbonPathData };
if (typeof window !== 'undefined') window.RibbonStyle = RibbonStyle;
export { RibbonStyle };
if (typeof window !== 'undefined') window.SplinePathData = SplinePathData;
export { SplinePathData };
