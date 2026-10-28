/**
 * Pathings - A class for converting an index to a 2D position for various pathing algorithms.
 */
class Pathings {
  /**
   * Converts an index to a 2D position using a raster scan pattern.
   * @param {number} index - The index to convert.
   * @param {number} width - The width of the grid.
   * @returns {Vector2D} The 2D position.
   */
  static raster_scan(index, width) {
    return new Vector2D(index % width, Math.floor(index / width));
  }

  /**
   * Converts an index to a 2D position using a snake pattern.
   * @param {number} index - The index to convert.
   * @param {number} width - The width of the grid.
   * @returns {Vector2D} The 2D position.
   */
  static snake(index, width) {
    const y = Math.floor(index / width);
    let x = index % width;
    if(y % 2 === 1) {
      x = width - 1 - x;
    }
    return new Vector2D(x, y);
  }

  /**
   * Converts an index to a 2D position using the Cantor pairing function.
   * @param {number} z - The index to convert.
   * @returns {Vector2D} The 2D position.
   */
  static cantor_pairing(z) {
    const w = Math.floor((-1 + Math.sqrt(1 + 8 * z)) / 2);
    const t = (w * w + w) / 2;
    const y = z - t;
    const x = w - y;
    return new Vector2D(x, y);
  }

  /**
   * Converts a 2D position to an index using the inverse Cantor pairing function.
   * @param {Vector2D} v - The 2D position to convert.
   * @returns {number} The index.
   */
  static cantor_pairing_inv(v) {
    return ((v.x + v.y) * (v.x + v.y + 1)) / 2 + v.y;
  }

  /**
   * Converts an index to a 2D position using the Szudzik pairing function.
   * @param {number} z - The index to convert.
   * @returns {Vector2D} The 2D position.
   */
  static szudzik_pairing(z) {
    const sqrt = Math.floor(Math.sqrt(z));
    const sqrtSquared = sqrt * sqrt;
    if(z - sqrtSquared < sqrt) {
      return new Vector2D(z - sqrtSquared, sqrt);
    } else {
      return new Vector2D(sqrt, z - sqrtSquared - sqrt);
    }
  }

  /**
   * Converts a 2D position to an index using the inverse Szudzik pairing function.
   * @param {Vector2D} v - The 2D position to convert.
   * @returns {number} The index.
   */
  static szudzik_pairing_inv(v) {
    return v.x >= v.y ? v.x * v.x + v.x + v.y : v.y * v.y + v.x;
  }

  /**
   * Converts an index to a 2D position using a square spiral pattern.
   * @param {number} n - The index to convert.
   * @returns {Vector2D} The 2D position.
   */
  static square_spiral(n) {
    if(n === 0) return new Vector2D(0, 0);
    const k = Math.floor((Math.sqrt(n) - 1) / 2) + 1;
    const t = 2 * k;
    let p = (n - (t - 1) ** 2);
    let x, y;

    if(p <= t) {
      x = k - 1;
      y = p - k;
    } else if(p <= 2 * t) {
      x = k - 1 - (p - t);
      y = k - 1;
    } else if(p <= 3 * t) {
      x = -k;
      y = k - 1 - (p - 2 * t);
    } else {
      x = -k + (p - 3 * t);
      y = -k;
    }
    return new Vector2D(x, y);
  }

  /**
   * Converts an index to a 2D position using a round spiral pattern.
   * @param {number} n - The index to convert.
   * @returns {Vector2D} The 2D position.
   */
  static round_spiral(n) {
    if(n === 0) return new Vector2D(0, 0);
    const r = Math.sqrt(n + 1);
    const theta = r * Math.PI * 2;
    return new Vector2D(Math.cos(theta) * r, Math.sin(theta) * r);
  }
}

// Auto-generated exports
if (typeof window !== 'undefined') window.Pathings = Pathings;
export { Pathings };
