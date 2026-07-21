
/**
 * Box class that handles two vectors, for top left and bottom right
 * of a box.
 * Functions are frequently polymorphic, taking either a box or a pair of values
 * as the argument.
 * @param {number|Box} [x] - The x-coordinate of the bottom-right corner, or a Box to merge with.
 * @param {number} [y] - The y-coordinate of the bottom-right corner.
 * @constructor
 */
function Box(x, y) {
  if((x !== undefined) && (y == undefined)) {
    this.vecs = [new Vector2D(0, 0), new Vector2D(0, 0)];
    this.merge(x);
    return this;
  }
  x = x || 0;
  y = y || 0
  this.vecs = [new Vector2D(0, 0), new Vector2D(x, y)];
  return this;
}

Box.prototype = {
  name: "Box",
  /**
   * Merges this box with another box or a vector.
   * @param {Box|number} box - The box to merge with, or the x-coordinate of a vector.
   * @param {number} [by] - The y-coordinate of a vector.
   * @returns {Box} This box.
   */
  merge(box, by) {
    if(by !== undefined) {
      var v = new Vector2D(box, by);
      box = new Box();
      box.vecs[1] = v;
    }
    this.vecs[0] = this.vecs[0].min(box.vecs[0]);
    this.vecs[1] = this.vecs[1].max(box.vecs[1]);
    return this;
  },
  /**
   * Merges this box with another box or a vector, only considering the bottom-right corner.
   * @param {Box|number} box - The box to merge with, or the x-coordinate of a vector.
   * @param {number} [by] - The y-coordinate of a vector.
   * @returns {Box} This box.
   */
  merge2(box, by) {
    if(by !== undefined) {
      var v = new Vector2D(box, by);
      box = new Box();
      box.vecs[1] = v;
    }
    this.vecs[1] = this.vecs[1].max(box.vecs[1]);
    return this;
  },
  /**
   * Adds a box to the right of this box.
   * @param {Box|number} box - The box to add, or the width of the box to add.
   * @param {number} [by] - The height of the box to add.
   * @returns {Box} This box.
   */
  addRight(box, by) {
    if(by !== undefined) {
      box = new Box(box, by);
    }
    this.vecs[1].x += box.width();
    this.vecs[1].y = Math.max(this.vecs[1].y, box.vecs[1].y);
    return this;
  },
  /**
   * Adds a box below this box.
   * @param {Box|number} box - The box to add, or the width of the box to add.
   * @param {number} [by] - The height of the box to add.
   * @returns {Box} This box.
   */
  addDown(box, by) {
    if(by !== undefined) {
      box = new Box(box, by);
    }
    this.vecs[1].y += box.height();
    this.vecs[1].x = Math.max(this.vecs[1].x, box.vecs[1].x);
    return this;
  },
  /**
   * Adds the dimensions of another box to this box.
   * @param {Box} b - The box to add.
   * @returns {Box} This box.
   */
  addBox(b) {
    let v = this.diagonal().add(b.diagonal());
    this.vecs[0] = new Vector2D(0, 0);
    this.vecs[1] = v;
    return this;
  },
  /**
   * Sets the top-left corner of the box.
   * @param {Vector2D|number} v - The vector for the top-left corner, or the x-coordinate.
   * @param {number} [y] - The y-coordinate.
   * @returns {Box} This box.
   */
  set0(v, y) {
    if(y !== undefined)
      v = new Vector2D(v, y);
    this.vecs[0] = v.clone();
    return this;
  },
  /**
   * Sets the bottom-right corner of the box.
   * @param {Vector2D|number} v - The vector for the bottom-right corner, or the x-coordinate.
   * @param {number} [y] - The y-coordinate.
   * @returns {Box} This box.
   */
  set1(v, y) {
    if(y !== undefined)
      v = new Vector2D(v, y);
    this.vecs[1] = v.clone();
    return this;
  },

  /**
   * Expands the box by a given amount.
   * @param {number} x - The amount to expand horizontally.
   * @param {number} y - The amount to expand vertically.
   * @returns {Box} A new, expanded box.
   */
  expand(x, y) {
    let box = new Box();
    box.set0(this.vecs[0].sub(x, y));
    box.set1(this.vecs[1].add(x, y));
    return box;
  },
  /**
   * Clones the box.
   * @returns {Box} A new box with the same dimensions.
   */
  clone() {
    return this.expand(0, 0);
  },
  /**
   * Moves (move By) the box by a given vector.
   * @param {number} x - The amount to move horizontally.
   * @param {number} y - The amount to move vertically.
   * @returns {Box} This box.
   */
  move(x, y) {
    this.vecs[0] = this.vecs[0].add(x, y);
    this.vecs[1] = this.vecs[1].add(x, y);
    return this;
  },

  moveTo(x, y) {
    let v = new Vector2D(x,y)
    this.vecs[1] = this.vecs[1].add( v.sub( this.vecs[0]));
    this.vecs[0] = v;
    return this;
  },

  /**
   * Scales the box by a given factor.
   * @param {number} m - The scaling factor.
   * @returns {Box} This box.
   */
  scale(m) {
    this.vecs[0] = this.vecs[0].scale(m);
    this.vecs[1] = this.vecs[1].scale(m);
    return this;
  },

  /**
   * Clips the coordinates of the box to be between 0 and 1.
   * @returns {Box} This box.
   */
  uniClip() {
    this.vecs[0].uniclip();
    this.vecs[1].uniclip();
    return this;
  },
  /**
   * Rounds the coordinates of the box.
   * @returns {Box} This box.
   */
  round() {
    this.vecs[0].round();
    this.vecs[1].round();
    return this;
  },

  /**
   * These return vectors, not boxes.
   * @returns {Vector2D} The diagonal vector of the box.
   */
  diagonal() {
    return this.vecs[1].sub(this.vecs[0]);
  },
  /**
   * @returns {Vector2D} The midpoint of the box.
   */
  midpoint() {
    return this.vecs[1].add(this.vecs[0]).scale(0.5);
  },
  /**
   * @returns {Vector2D} The top-left corner of the box.
   */
  tl() {
    return this.vecs[0];
  },
  /**
   * @returns {Vector2D} The bottom-right corner of the box.
   */
  br() {
    return this.vecs[1];
  },
  /**
   * @returns {number} The width of the box.
   */
  width() {
    return this.vecs[1].x - this.vecs[0].x;
  },
  /**
   * @returns {number} The height of the box.
   */
  height() {
    return this.vecs[1].y - this.vecs[0].y;
  },
}

window.Box = Box;

export { Box }

