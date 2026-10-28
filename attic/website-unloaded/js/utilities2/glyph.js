/**
 * @fileoverview A utility for rendering glyphs from various sources.
 *
 * This module provides a `Glyph` class that can render glyphs from Unicode characters,
 * SVG paths, or other sources. It supports various transformations, such as scaling,
 * rotation, and color manipulation.
 *
 * Key Features:
 * - Render Unicode glyphs with font specification
 * - Render SVG path specifications
 * - Operations: reflection, desaturation, scaling, opacity
 * - Render to canvas method that takes position and orientation
 */

class Glyph {
  /**
   * Creates a new Glyph instance.
   * @param {object} spec - The glyph specification.
   * @param {string} spec.type - The type of glyph ('unicode' or 'svg').
   * @param {string} spec.value - The glyph value (a character or an SVG path).
   * @param {string} [spec.font] - The font to use for Unicode glyphs.
   * @param {string} [spec.color] - The color of the glyph.
   * @param {number} [spec.opacity] - The opacity of the glyph.
   * @param {number} [spec.scale] - The scale of the glyph.
   * @param {boolean} [spec.refl] - Whether the glyph is reflected.
   */
  constructor(spec) {
    this.spec = {
      ...spec
    };
  }

  /**
   * Returns a new Glyph with the specified reflection.
   * @param {boolean} reflection - Whether the glyph should be reflected.
   * @returns {Glyph} A new Glyph instance.
   */
  refl(reflection) {
    const newSpec = {
      ...this.spec,
      refl: reflection
    };
    return new Glyph(newSpec);
  }

  /**
   * Returns a new Glyph with the specified desaturation.
   * @param {number} amount - The amount of desaturation (0-1).
   * @returns {Glyph} A new Glyph instance.
   */
  desaturate(amount) {
    const newSpec = {
      ...this.spec
    };
    if(newSpec.color) {
      const gray = Math.round(255 * (1 - amount));
      newSpec.color = `rgb(${gray}, ${gray}, ${gray})`;
    }
    return new Glyph(newSpec);
  }

  /**
   * Returns a new Glyph with the specified scale.
   * @param {number} factor - The scaling factor.
   * @returns {Glyph} A new Glyph instance.
   */
  scale(factor) {
    const newSpec = {
      ...this.spec,
      scale: (this.spec.scale || 1) * factor
    };
    return new Glyph(newSpec);
  }

  /**
   * Returns a new Glyph with the specified opacity.
   * @param {number} value - The opacity value (0-1).
   * @returns {Glyph} A new Glyph instance.
   */
  opacity(value) {
    const newSpec = {
      ...this.spec,
      opacity: value
    };
    return new Glyph(newSpec);
  }

  /**
   * Renders the glyph to a canvas context.
   * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
   * @param {Vector2D} position - The position to render the glyph at.
   * @param {number} angle - The angle to render the glyph at (in radians).
   */
  render(ctx, position, angle) {
    //console.log("Rendering glyph", this.spec, "at", position, 
    //"with angle", angle);
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(angle);

    const scale = this.spec.scale || 1;
    ctx.scale(scale, scale);

    if(this.spec.refl) {
      ctx.scale(-1, 1);
    }

    ctx.globalAlpha = this.spec.opacity || 1;

    if(this.spec.type === 'unicode') {
      this._renderUnicode(ctx);
    } else if(this.spec.type === 'svg') {
      this._renderSvg(ctx);
    }

    ctx.restore();
  }

  /**
   * Renders a Unicode glyph.
   * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
   * @private
   */
  _renderUnicode(ctx) {
    ctx.font = this.spec.font || '20px Arial';
    ctx.fillStyle = this.spec.color || 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.spec.value, 0, 0);
  }

  /**
   * Renders an SVG glyph.
   * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
   * @private
   */
  _renderSvg(ctx) {
    const path = new Path2D(this.spec.value);
    ctx.fillStyle = this.spec.color || 'black';
    ctx.fill(path);
  }
}

// Auto-generated exports
if (typeof window !== 'undefined') window.Glyph = Glyph;
export { Glyph };
