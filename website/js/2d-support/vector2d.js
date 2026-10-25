/**
 * Vector2D - A 2D vector utility class for simplifying vector operations
 */
class Vector2D {
  /**
   * @param {number} [x=0] - The x-component of the vector.
   * @param {number} [y=0] - The y-component of the vector.
   */
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * Creates a vector from polar coordinates.
   * @param {number} r - The radius.
   * @param {number} theta - The angle in radians.
   * @returns {Vector2D} A new Vector2D instance.
   */
  static fromPolar(r, theta) {
    return new Vector2D(r * Math.cos(theta), r * Math.sin(theta));
  }

  /**
   * Creates a unit vector from an angle.
   * @param {number} theta - The angle in radians.
   * @returns {Vector2D} A new Vector2D instance.
   */
  static fromAngle(theta) {
    return Vector2D.fromPolar(1, theta);
  }

  // Basic vector operations
  _add(v) {
    return new Vector2D(this.x + v.x, this.y + v.y);
  }
  _sub(v) {
    return new Vector2D(this.x - v.x, this.y - v.y);
  }
  _min(v) {
    return new Vector2D(Math.min(this.x, v.x), Math.min(this.y, v.y));
  }
  _max(v) {
    return new Vector2D(Math.max(this.x, v.x), Math.max(this.y, v.y));
  }
  _dot(v) {
    return this.x * v.x + this.y * v.y;
  }
  _cross(v) {
    return this.x * v.y - this.y * v.x;
  }

  /**
   * getVec is a helper function. If y is undefined, then return x
   * (i.e assume x is a vector), otherwise make a new vector of x,y
   * @param {Vector2D|number} x - The vector or the x-component.
   * @param {number} [y] - The y-component.
   * @returns {Vector2D} The vector.
   */
  getVec(x, y) {
    return (y == undefined) ? x : new Vector2D(x, y);
  }

  /**
   * it's convenient sometimes to give the components as arguments
   * this way we can pass a vector or two components to each of these functions.
   * @param {Vector2D|number} x - The vector to add, or the x-component.
   * @param {number} [y] - The y-component.
   * @returns {Vector2D} A new Vector2D instance.
   */
  add(x, y) {
    return this._add(this.getVec(x, y));
  };
  /**
   * @param {Vector2D|number} x - The vector to subtract, or the x-component.
   * @param {number} [y] - The y-component.
   * @returns {Vector2D} A new Vector2D instance.
   */
  sub(x, y) {
    return this._sub(this.getVec(x, y));
  };

  /**
   * @param {Vector2D|number} x - The vector to compare, or the x-component.
   * @param {number} [y] - The y-component.
   * @returns {Vector2D} A new Vector2D instance with the minimum components.
   */
  min(x, y) {
    return this._min(this.getVec(x, y));
  };
  /**
   * @param {Vector2D|number} x - The vector to compare, or the x-component.
   * @param {number} [y] - The y-component.
   * @returns {Vector2D} A new Vector2D instance with the maximum components.
   */
  max(x, y) {
    return this._max(this.getVec(x, y));
  };
  /**
   * @param {Vector2D|number} x - The vector to dot product with, or the x-component.
   * @param {number} [y] - The y-component.
   * @returns {number} The dot product.
   */
  dot(x, y) {
    return this._dot(this.getVec(x, y));
  };
  cross(x, y) {
    return this._cross(this.getVec(x, y));
  };
  /**
   * occasionally useful synonym...
   * @param {Vector2D|number} x - The vector to subtract, or the x-component.
   * @param {number} [y] - The y-component.
   * @returns {Vector2D} A new Vector2D instance.
   */
  subtract(x, y) {
    return this.sub(x, y)
  };
  /**
   * occasionally useful shorthand...
   * @param {Vector2D|number} x - The vector to find the distance to, or the x-component.
   * @param {number} [y] - The y-component.
   * @returns {number} The distance.
   */
  distanceTo(x, y) {
    return this.sub(x, y).length;
  }

  /**
   * Scales the vector by a scalar.
   * @param {number} scalar - The scalar to scale by.
   * @returns {Vector2D} A new Vector2D instance.
   */
  scale(scalar) {
    return new Vector2D(this.x * scalar, this.y * scalar);
  }
  mul( scalar ){ return this.scale(scalar)}
  /**
   * Rotates the vector by an angle.
   * @param {number} angle - The angle in radians.
   * @returns {Vector2D} A new Vector2D instance.
   */
  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector2D(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }
  rot(angle){ return this.rotate(angle)}
  /**
   * Linearly interpolates between this vector and another vector.
   * @param {Vector2D} other - The other vector.
   * @param {number} t - The interpolation factor.
   * @returns {Vector2D} A new Vector2D instance.
   */
  lerp(other, t) {
    return new Vector2D(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t
    );
  }
  equals(other, epsilon = 0.001) {
    return Math.abs(this.x - other.x) < epsilon && Math.abs(this.y - other
      .y) < epsilon;
  }

  /**
   * @type {number}
   */
  get length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  /**
   * @type {number}
   */
  get angle() {
    return Math.atan2(this.y, this.x);
  }

  /**
   * Perpendicular vector (90 degrees counterclockwise)
   * @returns {Vector2D} A new Vector2D instance.
   */
  perpendicular() {
    return new Vector2D(-this.y, this.x);
  }
  perp(bend) {
    return new Vector2D(this.y, -this.x).scale( bend ?? 1);
  }  
  /**
   * Clone
   * @returns {Vector2D} A new Vector2D instance.
   */
  clone() {
    return new Vector2D(this.x, this.y);
  }
  /**
   * Normalize vector (unit length)
   * @returns {Vector2D} A new Vector2D instance.
   */
  normalize( l ) {
    const len = this.length;
    if(len === 0) return new Vector2D();
    return this.scale((l ?? 1) / len);
  }

  mid(other) {
    return new Vector2D(
      (this.x + other.x) * 0.5,
      (this.y + other.y) * 0.5
    );
  }
  addPolar(r, theta) {
    return new Vector2D(
      this.x + r * Math.cos(theta),
      this.y + r * Math.sin(theta)
    );
  }
  /** 
   * Adjusts for the coordinate system used in warped-polygon.js
   */
  get visualAngle() {
    const theta = Math.atan2(this.x, -this.y);
    return (((theta + Math.PI * 16) / (Math.PI * 2)) % 1) * Math.PI * 2;
  }
  
}

// synonyms...
Vector2D.prototype.mul = Vector2D.prototype.scale;
//Vector2D.prototype.perp = Vector2D.prototype.perpendicular;

const lerp = (a, b, t) => isNaN(b) ? a : isNaN(a) ? b : a + (b - a) * t;

window.Vector2D = Vector2D;
window.lerp = lerp;

export { Vector2D, lerp }

