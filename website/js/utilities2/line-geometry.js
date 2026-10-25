import { PathAst } from './path-ast.js';
export { Vector2D } from '../2d-support/vector2d.js'
/**
 * @fileoverview Geometric line and curve utilities for creating smooth biarc paths.
 * 
 * This module creates and manipulates smooth curves using biarc interpolation - a technique
 * that connects points with pairs of circular arcs to create visually pleasing, smooth paths. 
 * 
 * Key Features:
 * - Biarc path generation: Creates smooth curves through a series of points using 
 *   pairs of circular arcs
 * - Geometric utilities: Vector operations, angle calculations, and curve intersections
 * - Path sampling: Sample points, tangents, and normals at any position along curves
 * - Bars: Generate evenly-spaced perpendicular bars along curves for 
 *   visual effects (e.g., railway tracks, dotted lines)
 * - Modular architecture: Separate classes for different curve types and operations
 * 
 * Core Classes:
 * - GeometryUtils: Static utility methods for vector math and geometric calculations
 * - BarCalculator: Generates perpendicular bars along circular arcs
 * - PathSegment: Abstract base class for curve segments
 * - ArcSegment: Represents a single circular arc with full geometric properties
 * - BiarcSegment: Represents a biarc (two connected circular arcs) between two points
 * - Edge: Container for one or more connected path segments
 * - RibbonPath: Main class for creating and manipulating complete smooth paths
 * - RibbonPathBuilder: Builder pattern implementation for path construction
 * 
 * Mathematical Foundation:
 * The biarc algorithm connects two points with known tangent directions using exactly
 * two circular arcs that meet smoothly at a calculated midpoint. This creates visually
 * pleasing curves that are mathematically well-defined and computationally efficient.
 * 
 * Usage Examples:
 * ```javascript
 * // Create a smooth path through points
 * const path = new RibbonPath()
 *   .withNodes([{x: 0, y: 0}, {x: 100, y: 50}, {x: 200, y: 0}])
 *   .withEndJoin(false)
 *   .build();
 * 
 * // Sample the path
 * const point = path.getPointAt(0.5); // Get midpoint
 * const tangent = path.getTangentAt(0.5); // Get tangent direction
 * 
 * // Generate animated bars for visual effects
 * const bars = path.getAllBars(5); // 5-pixel spacing
 * ```
 * 
 * @author James Crook
 * @version 1.0.0
 * @since 1.0.0
 */

// Amount by which splines should weight the gradients.
const DIVERSION_FACTOR = 0.4

// ============= GEOMETRY UTILITIES CLASS =============

/**
 * A utility class for geometric calculations.
 */
class GeometryUtils {
  /**
   * Calculates the bisector of two vectors.
   * @param {Vector2D} v1 - The first vector.
   * @param {Vector2D} v2 - The second vector.
   * @returns {Vector2D} The bisector vector.
   */
  static bisect(v1, v2) {
    return v1.normalize().add(v2.normalize()).normalize();
  }

  /**
   * Calculates the intersection of two lines.
   * @param {Vector2D} A - A point on the first line.
   * @param {Vector2D} v - The direction vector of the first line.
   * @param {Vector2D} B - A point on the second line.
   * @param {Vector2D} u - The direction vector of the second line.
   * @returns {Vector2D} The intersection point.
   */
  static intersect(A, v, B, u) {
    const d = u.sub(v);
    const lambda = ((A.y - B.y) * u.x - (A.x - B.x) * u.y) / (v.y * u.x - v
      .x * u.y);
    return B.add(v.scale(lambda));
  }

  static lineIntersection(p1, p2, p3, p4) {
    const v1 = p2.subtract(p1); // Direction vector of line 1
    const v2 = p4.subtract(p3); // Direction vector of line 2
    const v3 = p3.subtract(p1); // Vector from p1 to p3

    const cross = v1.cross(v2);
    if(Math.abs(cross) < 0.001) return null; // Parallel lines

    const t = v3.cross(v2) / cross;
    const u = v3.cross(v1) / cross;

    if(t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return p1.lerp(p2, t);
    }

    return null;
  }

  /**
   * Calculates the intersection angle between a vector and a line segment.
   * @param {Vector2D} u - The vector.
   * @param {Vector2D} X - The first point of the line segment.
   * @param {Vector2D} Y - The second point of the line segment.
   * @returns {number} The intersection angle in degrees.
   */
  static intersectionAngle(u, X, Y) {
    let theta = u.angle - X.sub(Y).angle;
    theta = (900 - theta * 180 / (Math.PI)) % 360 - 180;
    return theta;
  }

  /**
   * reduce an angle to be between -Pi and Pi.
   * @param {number} c - The angle in radians.
   * @returns {number} The reduced angle in radians.
   */
  static reducedAngle(c) {
    while(c > Math.PI) c -= 2 * Math.PI;
    while(c < -Math.PI) c += 2 * Math.PI;
    return c;
  }

  /**
   * Calculates the difference between two angles.
   * @param {Vector2D} a - The first vector.
   * @param {Vector2D} b - The second vector.
   * @returns {number} The angle difference in radians.
   */
  static angleDiff(a, b) {
    let alpha = a.angle;
    let beta = b.angle;
    return GeometryUtils.reducedAngle(alpha - beta);
  }

  /**
   * Given two points and an angle in degrees by which we diverge from a straight line
   * compute the arcs centre and radius and the start and end angles (in radians)
   * We treat a straight line as having an imperceptible bend so that the centre
   * does not shoot off to infinity.
   * (an alternative would be to use projective coordinates)
   * @param {number} angle - The divergence angle in degrees.
   * @param {Vector2D} p1 - The first point.
   * @param {Vector2D} p2 - The second point.
   * @returns {{angleRad: number, radius: number, center: Vector2D, startAngle: number, endAngle: number}} The arc parameters.
   */
  static calcAngles(angle, p1, p2) {
    // Convert angle to radians

    const angleRad = (angle * 1.0) ? angle * Math.PI / 180 : 0.001;

    // Vector between points
    const vec = p2.subtract(p1);
    const distance = vec.length;
    const baseAngle = vec.angle;

    // Calculate radius of the circular arc
    // it can be negative.
    const radius = distance / (2 * Math.sin(angleRad));

    // Calculate center of the circle
    const midPoint = p1.add(vec.scale(0.5));
    const perpVector = Vector2D.fromAngle(baseAngle + Math.PI / 2);
    const center = midPoint.add(perpVector.scale(radius * Math.cos(
      angleRad)));

    // Calculate start and end angles on the circle
    const toStart = p1.subtract(center);
    const toEnd = p2.subtract(center);
    const startAngle = toStart.angle;
    const endAngle = toEnd.angle;
    return {
      angleRad,
      radius,
      center,
      startAngle,
      endAngle
    };
  }

  /**
   * This got parked here, but probably belongs elsewhere.
   * @param {string} font - The font string.
   * @param {number} radius - The radius to use for resizing.
   * @returns {string} The resized font string.
   */
  static resizedFont(font, radius) {
    let match = font.match(/(\d+)%/);
    if(match) {
      let percent = parseInt(match[1]);
      return font.replace(/\d+%/, `${percent * radius * 2 / 100}px`);
    }
    return font;
  }
}

// ============= BAR CALCULATION CLASS =============

// ============= PATH SEGMENT CLASSES =============

/**
 * Represents a segment of a path.
 */
class PathSegment {
  /**
   * @param {Vector2D} startPoint - The starting point of the segment.
   * @param {Vector2D} endPoint - The ending point of the segment.
   * @param {Vector2D} startTangent - The tangent at the start of the segment.
   * @param {Vector2D} endTangent - The tangent at the end of the segment.
   */
  constructor(startPoint, endPoint, startTangent, endTangent) {
    this.startPoint = startPoint;
    this.endPoint = endPoint;
    this.startTangent = startTangent;
    this.endTangent = endTangent;
  }

  /**
   * Gets the point at a given parameter t.
   * @param {number} t - The parameter, between 0 and 1.
   * @returns {Vector2D} The point at the given parameter.
   */
  getPointAt(t) {
    throw new Error("getPointAt must be implemented by subclass");
  }

  /**
   * Gets the tangent at a given parameter t.
   * @param {number} t - The parameter, between 0 and 1.
   * @returns {Vector2D} The tangent at the given parameter.
   */
  getTangentAt(t) {
    throw new Error("getTangentAt must be implemented by subclass");
  }

  drawFill(ctx) {
    throw new Error("drawFill must be implemented by subclass");
  }

  getFillPath(style, isFirst, isLast) {
    throw new Error("getFillPath must be implemented by subclass");
  }

  getFillPathPieces(style, isFirst, isLast) {
    throw new Error("getFillPathPieces must be implemented by subclass");
  }

  drawSegment(ctx, style) {
    throw new Error("drawSegment must be implemented by subclass");
  }

  /**
   * Gets the normal at a given parameter t.
   * @param {number} t - The parameter, between 0 and 1.
   * @returns {Vector2D} The normal at the given parameter.
   */
  getNormalAt(t) {
    const tangent = this.getTangentAt(t);
    return tangent.perpendicular();
  }

  /**
   * Gets the length of the segment.
   * @returns {number} The length of the segment.
   */
  getLength() {
    return this.length;
  }

  getBars(phase, stepSize = 5) {
    const bars = [];
    let m = +1;
    let l = this.length;

    for(let i = 0;
      (i + phase) < l; i += stepSize) {
      let t = (i + phase + 0.0) / l
      let pt = this.getPointAt(t);
      let v = this.getNormalAt(t);
      let v0 = v.scale(+15 * m).add(pt);
      let v1 = v.scale(-15 * m).add(pt);
      // Whilst we are pushing perpendicular 'line segments' into bars we could
      // render these in other ways than as bars.
      bars.push({
        from: v0,
        to: v1
      });
    }

    const newPhase = (phase - l + 1000 * stepSize) / stepSize;
    return {
      bars,
      phase: (newPhase - Math.floor(newPhase)) * stepSize
    };
  }

}

/**
 * Represents a circular arc segment.
 * @extends PathSegment
 */
class ArcSegment extends PathSegment {
  /**
   * @param {Vector2D} startPoint - The starting point of the arc.
   * @param {Vector2D} endPoint - The ending point of the arc.
   * @param {Vector2D} startTangent - The tangent at the start of the arc.
   * @param {Vector2D} endTangent - The tangent at the end of the arc.
   * @param {Vector2D} center - The center of the arc.
   * @param {number} radius - The radius of the arc.
   * @param {number} startAngle - The start angle of the arc.
   * @param {number} endAngle - The end angle of the arc.
   * @param {boolean} [clockwise=false] - Whether the arc is drawn clockwise.
   */
  constructor(startPoint, endPoint, startTangent, endTangent, center, radius,
    startAngle, endAngle, clockwise = false) {
    super(startPoint, endPoint, startTangent, endTangent);
    this.center = center;
    this.radius = Math.abs(radius);
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.clockwise = clockwise;
    this.angleSpan = this.calculateAngleSpan();
    this.length = this.radius * Math.abs(this.angleSpan);
  }

  /**
   * Calculates the angle span of the arc.
   * @returns {number} The angle span in radians.
   */
  calculateAngleSpan() {
    let span = this.endAngle - this.startAngle;
    if(this.clockwise && span > 0) span -= 2 * Math.PI;
    if(!this.clockwise && span < 0) span += 2 * Math.PI;
    return span;
  }

  getPointAt(t) {
    const angle = this.startAngle + this.angleSpan * t;
    return this.center.add(Vector2D.fromPolar(this.radius, angle));
  }

  getTangentAt(t) {
    const angle = this.startAngle + this.angleSpan * t;
    const tangentAngle = angle + (this.clockwise ? -Math.PI / 2 : Math.PI /
      2);
    return Vector2D.fromAngle(tangentAngle);
  }

  /**
   * Expose arc data for rendering
   * @returns {{center: Vector2D, radius: number, startAngle: number, endAngle: number, clockwise: boolean}} The arc data.
   */
  getArcData() {
    return {
      center: this.center,
      radius: this.radius,
      startAngle: this.startAngle,
      endAngle: this.endAngle,
      clockwise: this.clockwise
    };
  }
}

/**
 * Represents a biarc segment, which consists of two circular arcs.
 * @extends PathSegment
 */
class BiarcSegment extends PathSegment {
  /**
   * @param {Vector2D} startPoint - The starting point of the biarc.
   * @param {Vector2D} endPoint - The ending point of the biarc.
   * @param {Vector2D} startTangent - The tangent at the start of the biarc.
   * @param {Vector2D} endTangent - The tangent at the end of the biarc.
   * @param {number} phi1 - The angle of the first arc.
   * @param {number} phi2 - The angle of the second arc.
   * @param {Vector2D} midPoint - The midpoint between the two arcs.
   */
  constructor(startPoint, endPoint, startTangent, endTangent, phi1, phi2,
    midPoint) {
    super(startPoint, endPoint, startTangent, endTangent);
    this.phi1 = phi1;
    this.phi2 = phi2;
    this.midPoint = midPoint;
    this.calculateBiarcs();
  }

  /**
   * Calculates the two arcs of the biarc.
   */
  calculateBiarcs() {
    // Create first arc from start to midpoint
    const {
      angleRad: angleRad1,
      radius: radius1,
      center: center1,
      startAngle: startAngle1,
      endAngle: endAngle1
    } =
    GeometryUtils.calcAngles(this.phi1, this.startPoint, this.midPoint);

    this.arc1 = new ArcSegment(
      this.startPoint,
      this.midPoint,
      this.startTangent,
      null,
      center1,
      radius1,
      startAngle1,
      endAngle1,
      angleRad1 < 0
    );

    // Create second arc from midpoint to end
    const {
      angleRad: angleRad2,
      radius: radius2,
      center: center2,
      startAngle: startAngle2,
      endAngle: endAngle2
    } =
    GeometryUtils.calcAngles(this.phi2, this.midPoint, this.endPoint);

    this.arc2 = new ArcSegment(
      this.midPoint,
      this.endPoint,
      null,
      this.endTangent,
      center2,
      radius2,
      startAngle2,
      endAngle2,
      angleRad2 < 0
    );

    this.length = this.arc1.getLength() + this.arc2.getLength();
  }

  getPointAt(t) {
    const arc1Length = this.arc1.getLength();
    const totalLength = this.getLength();

    if(totalLength === 0) return this.startPoint;

    const arc1Ratio = arc1Length / totalLength;

    if(t <= arc1Ratio) {
      return this.arc1.getPointAt(t / arc1Ratio);
    } else {
      return this.arc2.getPointAt((t - arc1Ratio) / (1 - arc1Ratio));
    }
  }

  getTangentAt(t) {
    const arc1Length = this.arc1.getLength();
    const totalLength = this.getLength();

    if(totalLength === 0) return this.startTangent;

    const arc1Ratio = arc1Length / totalLength;

    if(t <= arc1Ratio) {
      return this.arc1.getTangentAt(t / arc1Ratio);
    } else {
      return this.arc2.getTangentAt((t - arc1Ratio) / (1 - arc1Ratio));
    }
  }

  /**
   * Access to individual arcs for rendering
   * @returns {ArcSegment} The first arc segment.
   */
  getFirstArc() {
    return this.arc1;
  }

  /**
   * Access to individual arcs for rendering
   * @returns {ArcSegment} The second arc segment.
   */
  getSecondArc() {
    return this.arc2;
  }

  drawFill(ctx) {
    const arc1Data = this.arc1.getArcData();
    const arc2Data = this.arc2.getArcData();
    ctx.arc(arc1Data.center.x, arc1Data.center.y, arc1Data.radius, arc1Data
      .startAngle, arc1Data.endAngle, arc1Data.clockwise);
    ctx.arc(arc2Data.center.x, arc2Data.center.y, arc2Data.radius, arc2Data
      .startAngle, arc2Data.endAngle, arc2Data.clockwise);
  }

  getFillPath(styleIn, isFirst, isLast) {
    const style1 = {
      ...styleIn
    };
    const arc1 = this.getFirstArc();
    const arc2 = this.getSecondArc();

    style1.angle = this.phi1;
    style1.endEndType = '[';
    if(!isFirst) style1.startEndType = '[';

    const style2 = {
      ...styleIn
    };
    style2.angle = this.phi2;
    style2.startEndType = '[';
    if(!isLast) style2.endEndType = '[';

    const pathAst1 = PathAst.createArcRectanglePath(arc1.startPoint, arc1
      .endPoint, style1);
    const pathAst2 = PathAst.createArcRectanglePath(arc2.startPoint, arc2
      .endPoint, style2);

    return [pathAst1, pathAst2];
  }

  getFillPathPieces(styleIn, isFirst, isLast) {
    const style1 = {
      ...styleIn
    };
    const arc1 = this.getFirstArc();
    const arc2 = this.getSecondArc();

    style1.angle = this.phi1;
    style1.endEndType = '[';
    if(!isFirst) style1.startEndType = '[';

    const style2 = {
      ...styleIn
    };
    style2.angle = this.phi2;
    style2.startEndType = '[';
    if(!isLast) style2.endEndType = '[';

    const pieces1 = PathAst.getArcRectanglePieces(arc1.startPoint, arc1
      .endPoint, style1);
    const pieces2 = PathAst.getArcRectanglePieces(arc2.startPoint, arc2
      .endPoint, style2);

    return [pieces1, pieces2];
  }

  drawSegment(ctx, style) {
    const arc1 = this.getFirstArc();
    const arc2 = this.getSecondArc();

    style.angle = this.phi1;
    let path1 = PathAst.createArcRectanglePath(arc1.startPoint, arc1.endPoint,
      style);
    style.angle = this.phi2;
    let path2 = PathAst.createArcRectanglePath(arc2.startPoint, arc2.endPoint,
      style);
    PathToContext.drawStyledPaths([path1, path2], ctx, style, arc1.startPoint,
      arc2.endPoint);
  }
}

/**
 * Represents a spline segment
 * @extends PathSegment
 */
class SplineSegment extends PathSegment {
  /**
   * @param {Vector2D} startPoint - The starting point of the biarc.
   * @param {Vector2D} endPoint - The ending point of the biarc.
   * @param {Vector2D} startTangent - The tangent at the start of the biarc.
   * @param {Vector2D} endTangent - The tangent at the end of the biarc.
   * @param {number} phi1 - The angle of the first arc.
   * @param {number} phi2 - The angle of the second arc.
   * @param {Vector2D} midPoint - The midpoint between the two arcs.
   */
  constructor(startPoint, endPoint, startTangent, endTangent) {
    super(startPoint, endPoint, startTangent, endTangent);
    /*this.midPoint = midPoint;*/
    this.calculateSpline();
  }

  /**
   * Calculates the length of the spline and compute control points.
   * Improve This. Length can be computed analytically from the formula instead.
   */
  calculateSpline() {
    let length = this.endPoint.distanceTo(this.startPoint);
    this.p0 = this.startPoint;
    this.p1 = this.endPoint;
    this.cp0 = this.startPoint.add(this.startTangent.scale(length *
      DIVERSION_FACTOR));
    this.cp1 = this.endPoint.sub(this.endTangent.scale(length *
      DIVERSION_FACTOR));

    // we only need a rough and ready measure of the length.
    // we could use the linear length..
    // but here we divide the curve into 10 lines.
    const numSegments = 10;
    length = 0;
    let p1 = this.getPointAt(0);
    for(let i = 1; i <= numSegments; i++) {
      const p2 = this.getPointAt(i / numSegments);
      length += p2.subtract(p1).length;
      p1 = p2;
    }
    this.length = length;
    this.midPoint = this.getPointAt(0.5);
  }

  getPointAt(t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    return this.p0.scale(mt3)
      .add(this.cp0.scale(3 * mt2 * t))
      .add(this.cp1.scale(3 * mt * t2))
      .add(this.p1.scale(t3));
  }

  getTangentAt(t) {
    const t2 = t * t;
    const mt = 1 - t;
    const mt2 = mt * mt;

    const tangent = this.p0.scale(-3 * mt2)
      .add(this.cp0.scale(3 * mt2 - 6 * mt * t))
      .add(this.cp1.scale(6 * mt * t - 3 * t2))
      .add(this.p1.scale(3 * t2));

    return tangent.normalize();
  }

  // Version that uses numerical approach.
  //  getTangentAt(t) {
  //    const p1 = this.getPointAt(Math.max(0, t - 0.01));
  //    const p2 = this.getPointAt(Math.min(1, t + 0.01));
  //    return p2.subtract(p1).normalize();
  //  }

  drawFill(ctx) {
    ctx.bezierCurveTo(this.cp0.x, this.cp0.y, this.cp1.x, this.cp1.y, this.p1
      .x, this.p1.y);
  }

  getFillPath(styleIn, isFirst, isLast) {
    const style = {
      ...styleIn
    };
    style.startTangent = this.startTangent;
    style.endTangent = this.endTangent;
    if(!isFirst) style.startEndType = '[';
    if(!isLast) style.endEndType = '[';
    return [PathAst.createSplineRectanglePath(this.startPoint, this.endPoint,
      style)];
  }

  getFillPathPieces(styleIn, isFirst, isLast) {
    const style = {
      ...styleIn
    };
    style.startTangent = this.startTangent;
    style.endTangent = this.endTangent;
    if(!isFirst) style.startEndType = '[';
    if(!isLast) style.endEndType = '[';
    return [PathAst.getSplineRectanglePieces(this.startPoint, this.endPoint,
      style)];
  }

  drawSegment(ctx, style) {
    style.startTangent = this.startTangent;
    style.endTangent = this.endTangent;
    const pathAst = PathAst.createSplineRectanglePath(this.startPoint, this
      .endPoint, style);
    PathToContext.drawStyledPaths(pathAst, ctx, style, this.startPoint, this
      .endPoint);
  }
}

// ============= EDGE CLASS =============

/**
 * Represents an edge, which is a collection of path segments.
 */
class Edge {
  /**
   * @param {PathSegment[]} [segments] - The segments that make up the edge.
   */
  constructor(segments) {
    this.segments = segments || [];
    this.length = this.segments.reduce((sum, seg) => sum + seg.getLength(),
      0);
  }

  /**
   * Gets the point at a given parameter t.
   * @param {number} t - The parameter, between 0 and 1.
   * @returns {Vector2D|null} The point at the given parameter, or null if there are no segments.
   */
  getPointAt(t) {
    if(this.segments.length === 0) return null;
    if(this.segments.length === 1) return this.segments[0].getPointAt(t);

    const targetDistance = t * this.length;
    let currentDistance = 0;

    for(const segment of this.segments) {
      const segmentLength = segment.getLength();
      if(currentDistance + segmentLength >= targetDistance) {
        const segmentT = (targetDistance - currentDistance) / segmentLength;
        return segment.getPointAt(segmentT);
      }
      currentDistance += segmentLength;
    }

    return this.segments[this.segments.length - 1].endPoint;
  }

  /**
   * Gets the tangent at a given parameter t.
   * @param {number} t - The parameter, between 0 and 1.
   * @returns {Vector2D|null} The tangent at the given parameter, or null if there are no segments.
   */
  getTangentAt(t) {
    if(this.segments.length === 0) return null;
    if(this.segments.length === 1) return this.segments[0].getTangentAt(t);

    const targetDistance = t * this.length;
    let currentDistance = 0;

    for(const segment of this.segments) {
      const segmentLength = segment.getLength();
      if(currentDistance + segmentLength >= targetDistance) {
        const segmentT = (targetDistance - currentDistance) / segmentLength;
        return segment.getTangentAt(segmentT);
      }
      currentDistance += segmentLength;
    }

    return this.segments[this.segments.length - 1].getTangentAt(1);
  }

  /**
   * Gets the normal at a given parameter t.
   * @param {number} t - The parameter, between 0 and 1.
   * @returns {Vector2D|null} The normal at the given parameter, or null if there are no segments.
   */
  getNormalAt(t) {
    const tangent = this.getTangentAt(t);
    return tangent ? tangent.perpendicular() : null;
  }

  /**
   * Gets the length of the edge.
   * @returns {number} The length of the edge.
   */
  getLength() {
    return this.length;
  }

  /**
   * Samples a point, tangent, and normal at a given distance along the edge.
   * @param {number} distance - The distance along the edge.
   * @returns {{point: Vector2D, tangent: Vector2D, normal: Vector2D}} The sampled data.
   */
  sampleAtDistance(distance) {
    const t = this.length > 0 ? distance / this.length : 0;
    return {
      point: this.getPointAt(t),
      tangent: this.getTangentAt(t),
      normal: this.getNormalAt(t)
    };
  }

  /**
   * Gets all bars for the edge.
   * @param {number} [stepSize=5] - The distance between bars.
   * @returns {{from: Vector2D, to: Vector2D}[]} The calculated bars.
   */
  getAllBars(stepSize = 5) {
    let phase = 0;
    const allBars = [];

    for(const segment of this.segments) {
      const result = segment.getBars(phase, stepSize);
      allBars.push(...result.bars);
      phase = result.phase;
    }

    return allBars;
  }
}

// ============= BIARC PATH CLASS =============

/**
 * Represents a path composed of biarc segments.
 */
class RibbonPath {
  /**
   * Creates an instance of RibbonPath.
   */
  constructor() {
    this.nodes = [];
    this.segments = [];
    this.edges = [];
    this.totalLength = 0;
    this.endJoin = false;
    this.endControls = false;
    this.type = 'biarc';
  }

  /**
   * Sets the nodes for the path.
   * @param {{x: number, y: number}[]} nodes - The nodes to set.
   * @returns {RibbonPath} The RibbonPath instance.
   */
  withNodes(nodes) {
    this.originalNodes = nodes;
    this.nodes = nodes.map(node => new Vector2D(node.x, node.y));
    return this;
  }

  /**
   * Sets whether the path should join the ends.
   * @param {boolean} endJoin - Whether to join the ends.
   * @returns {RibbonPath} The RibbonPath instance.
   */
  withEndJoin(endJoin) {
    this.endJoin = endJoin;
    return this;
  }

  withEndControls(endControls) {
    this.endControls = endControls;
    return this;
  }

  withType(type) {
    this.type = type;
    return this;
  }

  /**
   * Builds the path.
   * @returns {RibbonPath} The RibbonPath instance.
   */
  build() {
    this.calculateTangents();
    if(this.endControls & !this.endJoin)
      this.nodes = this.nodes.slice(1, -1);
    this.endJoin = this.endJoin & !this.endControls;
    this.createSegments();
    this.createEdges();
    this.calculateTotalLength();
    return this;
  }

  /**
   * Calculates the tangents for each node.
   */
  calculateTangents() {
    const n = this.nodes.length;
    for(let i = 0 + this.endJoin; i < (n + this.endJoin); i++) {
      const A = this.nodes[i % n];
      const p1 = this.nodes[Math.max(0, i - 1) % n];
      const p2 = this.nodes[Math.min(n - 1 + this.endJoin * 2, i + 1) % n];
      const tang = p2.subtract(A).normalize().add(A.subtract(p1).normalize())
        .normalize();
      this.nodes[i % n].tang = tang;
    }
  }

  /**
   * Creates the segments of the path.
   */
  createSegments() {
    const n = this.nodes.length;
    this.segments = [];

    for(let i = 0; i < n - 1 + this.endJoin; i++) {
      const originalNodeA = this.originalNodes[i % n];
      const originalNodeB = this.originalNodes[(i + 1) % n];
      const nodeA = this.nodes[i % n];
      const nodeB = this.nodes[(i + 1) % n];
      const A = nodeA;
      const B = nodeB;
      if(originalNodeA.color) {
        A.color = originalNodeA.color;
      }
      if(originalNodeB.color) {
        B.color = originalNodeB.color;
      }
      const u = nodeA.tang;
      const v = nodeB.tang;

      // Calculate biarc geometry
      const thetaError = GeometryUtils.reducedAngle(u.angle - v.angle) * 0.25;
      const c = Math.tan(thetaError) * 0.5;
      const Perp = B.subtract(A).perpendicular().scale(c);
      const P = A.add(B).scale(0.5).add(Perp);

      const phi1 = GeometryUtils.intersectionAngle(u, P, A);
      const phi2 = -GeometryUtils.intersectionAngle(v, B, P);

      // Create biarc segment
      const segment = (this.type != 'spline') ?
        new BiarcSegment(A, B, u, v, phi1, phi2, P) :
        new SplineSegment(A, B, u, v, phi1, phi2, P);
      this.segments.push(segment);
    }
  }

  /**
   * Creates the edges of the path.
   */
  createEdges() {
    // For now, each segment becomes its own edge
    this.edges = this.segments.map(segment => new Edge([segment]));
  }

  /**
   * Calculates the total length of the path.
   */
  calculateTotalLength() {
    this.totalLength = this.segments.reduce((sum, seg) => sum + seg
      .getLength(), 0);
  }

  /**
   * Gets the edge at a given index.
   * @param {number} n - The index of the edge.
   * @returns {Edge|null} The edge at the given index, or null if it does not exist.
   */
  getEdge(n) {
    return this.edges[n] || null;
  }

  /**
   * Gets the number of edges in the path.
   * @returns {number} The number of edges.
   */
  getEdgeCount() {
    return this.edges.length;
  }

  /**
   * Gets the segments of the path.
   * @returns {BiarcSegment[]} The segments of the path.
   */
  getSegments() {
    return this.segments;
  }

  /**
   * Gets the nodes of the path.
   * @returns {{x: number, y: number}[]} The nodes of the path.
   */
  getNodes() {
    return this.nodes;
  }

  /**
   * Gets the point at a given parameter t.
   * @param {number} t - The parameter, between 0 and 1.
   * @returns {Vector2D|null} The point at the given parameter, or null if there are no segments.
   */
  getPointAt(t) {
    if(this.segments.length === 0) return null;

    const targetDistance = t * this.totalLength;
    let currentDistance = 0;

    for(const segment of this.segments) {
      const segmentLength = segment.getLength();
      if(currentDistance + segmentLength >= targetDistance) {
        const segmentT = (targetDistance - currentDistance) / segmentLength;
        return segment.getPointAt(segmentT);
      }
      currentDistance += segmentLength;
    }

    return this.segments[this.segments.length - 1].endPoint;
  }

  /**
   * Gets the tangent at a given parameter t.
   * @param {number} t - The parameter, between 0 and 1.
   * @returns {Vector2D|null} The tangent at the given parameter, or null if there are no segments.
   */
  getTangentAt(t) {
    if(this.segments.length === 0) return null;

    const targetDistance = t * this.totalLength;
    let currentDistance = 0;

    for(const segment of this.segments) {
      const segmentLength = segment.getLength();
      if(currentDistance + segmentLength >= targetDistance) {
        const segmentT = (targetDistance - currentDistance) / segmentLength;
        return segment.getTangentAt(segmentT);
      }
      currentDistance += segmentLength;
    }

    return this.segments[this.segments.length - 1].getTangentAt(1);
  }

  /**
   * Samples a point, tangent, and normal at a given distance along the path.
   * @param {number} distance - The distance along the path.
   * @returns {{point: Vector2D, tangent: Vector2D, normal: Vector2D}} The sampled data.
   */
  sampleAtDistance(distance) {
    const t = this.totalLength > 0 ? distance / this.totalLength : 0;
    return {
      point: this.getPointAt(t),
      tangent: this.getTangentAt(t),
      normal: this.getTangentAt(t)?.perpendicular()
    };
  }

  /**
   * Gets the total length of the path.
   * @returns {number} The total length of the path.
   */
  getLength() {
    return this.totalLength;
  }

  /**
   * Generator for sampling at equal intervals
   * @param {number} pixelInterval - The interval between samples.
   * @yields {{point: Vector2D, tangent: Vector2D, normal: Vector2D}} The sampled data.
   */
  * sampleAtIntervals(pixelInterval) {
    const totalLength = this.getLength();
    const numSamples = Math.floor(totalLength / pixelInterval);

    for(let i = 0; i <= numSamples; i++) {
      const distance = i * pixelInterval;
      yield this.sampleAtDistance(distance);
    }
  }

  /**
   * Iterates over each segment that satisfies a predicate.
   * @param {function(BiarcSegment, number): boolean} predicate - The predicate function.
   * @param {function(BiarcSegment, number): void} callback - The callback function.
   */
  forEachSegment(predicate, callback) {
    this.segments.forEach((segment, index) => {
      if(predicate(segment, index)) {
        callback(segment, index);
      }
    });
  }

  /**
   * Get all bars for the entire path
   * @param {number} [stepSize=5] - The distance between bars.
   * @returns {{from: Vector2D, to: Vector2D}[]} The calculated bars.
   */
  getAllBars(stepSize = 5) {
    let phase = 0;
    const allBars = [];

    for(const segment of this.segments) {
      const result = segment.getBars(phase, stepSize);
      allBars.push(...result.bars);
      phase = result.phase;
    }

    return allBars;
  }

}

window.RibbonPath = RibbonPath;
window.GeometryUtils = GeometryUtils
// Auto-generated exports
if (typeof window !== 'undefined') window.ArcSegment = ArcSegment;
export { ArcSegment };
if (typeof window !== 'undefined') window.BiarcSegment = BiarcSegment;
export { BiarcSegment };
if (typeof window !== 'undefined') window.DIVERSION_FACTOR = DIVERSION_FACTOR;
export { DIVERSION_FACTOR };
if (typeof window !== 'undefined') window.Edge = Edge;
export { Edge };
export { GeometryUtils };
if (typeof window !== 'undefined') window.PathSegment = PathSegment;
export { PathSegment };
export { RibbonPath };
if (typeof window !== 'undefined') window.SplineSegment = SplineSegment;
export { SplineSegment };
