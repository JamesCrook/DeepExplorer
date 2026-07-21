/**
 * A utility class for color conversions and manipulations.
 */
class Colours {
  constructor() { return this}

  /**
   * Converts LCH color to LAB color.
   * @param {number} l - Lightness.
   * @param {number} c - Chroma.
   * @param {number} h - Hue.
   * @returns {{l: number, a: number, b: number}} The LAB color object.
   */
  static lchToLab(l, c, h) {
    const hRad = (h * Math.PI) / 180;
    return {
      l: l,
      a: c * Math.cos(hRad),
      b: c * Math.sin(hRad)
    };
  }

  /**
   * Converts LAB color to XYZ color.
   * @param {number} l - Lightness.
   * @param {number} a - A-component.
   * @param {number} b - B-component.
   * @returns {{x: number, y: number, z: number}} The XYZ color object.
   */
  static labToXyz(l, a, b) {
    const D65_Y = 100.000;
    const D65_X = 95.047;
    const D65_Z = 108.883;

    const fy = (l + 16) / 116;
    const fx = a / 500 + fy;
    const fz = fy - b / 200;

    const f_inv = (t) => {
      const delta = 6.0 / 29.0;
      return t > delta ? t * t * t : 3 * delta * delta * (t - 4.0 / 29.0);
    }

    const xr = f_inv(fx);
    const yr = f_inv(fy);
    const zr = f_inv(fz);

    const x = xr * D65_X;
    const y = yr * D65_Y;
    const z = zr * D65_Z;

    return {
      x,
      y,
      z
    };
  }
  /**
   * Converts XYZ color to RGB color.
   * @param {number} x - X-component.
   * @param {number} y - Y-component.
   * @param {number} z - Z-component.
   * @returns {{r: number, g: number, b: number}} The RGB color object.
   */
  static xyzToRgb(x, y, z) {
    x = x / 100;
    y = y / 100;
    z = z / 100;

    let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
    let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
    let b = x * 0.0557 + y * -0.2040 + z * 1.0570;

    r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
    g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
    b = b > 0.0031308 ? 1.055 * Math.pow(b, 1 / 2.4) - 0.055 : 12.92 * b;

    return {
      r: Math.max(0, Math.min(1, r)) * 255,
      g: Math.max(0, Math.min(1, g)) * 255,
      b: Math.max(0, Math.min(1, b)) * 255
    };
  }

  static rgbToXyz(r, g, b) {
    r = r / 255;
    g = g / 255;
    b = b / 255;

    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    r *= 100;
    g *= 100;
    b *= 100;

    const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = r * 0.0193 + g * 0.1192 + b * 0.9505;

    return {
      x,
      y,
      z
    };
  }

  static xyzToLab(x, y, z) {
    const D65_X = 95.047;
    const D65_Y = 100.000;
    const D65_Z = 108.883;

    x /= D65_X;
    y /= D65_Y;
    z /= D65_Z;

    const f = (t) => t > 0.008856 ? Math.pow(t, 1 / 3) : (7.787 * t) + (16 /
      116);

    const l = (116 * f(y)) - 16;
    const a = 500 * (f(x) - f(y));
    const b = 200 * (f(y) - f(z));

    return {
      l,
      a,
      b
    };
  }

  static labToLch(l, a, b) {
    const c = Math.sqrt(a * a + b * b);
    let h = Math.atan2(b, a) * (180 / Math.PI);
    if(h < 0) h += 360;
    return {
      l,
      c,
      h
    };
  }

  static rgbToLch(r, g, b) {
    const xyz = this.rgbToXyz(r, g, b);
    const lab = this.xyzToLab(xyz.x, xyz.y, xyz.z);
    return this.labToLch(lab.l, lab.a, lab.b);
  }

  /**
   * Converts LCH color to RGB color.
   * @param {number} l - Lightness.
   * @param {number} c - Chroma.
   * @param {number} h - Hue.
   * @returns {{r: number, g: number, b: number}} The RGB color object.
   */
  static lchToRgb(l, c, h) {
    const lab = Colours.lchToLab(l, c, h);
    const xyz = Colours.labToXyz(lab.l, lab.a, lab.b);
    return Colours.xyzToRgb(xyz.x, xyz.y, xyz.z);
  }

  /**
   * Converts RGB color to Hex color.
   * @param {number} r - Red component.
   * @param {number} g - Green component.
   * @param {number} b - Blue component.
   * @returns {string} The Hex color string.
   */
  static rgbToHex(r, g, b) {
    return "#" + Math.round(r).toString(16).padStart(2, '0') + Math.round(g)
      .toString(16).padStart(2, '0') + Math.round(b).toString(16).padStart(2,
        '0');
  }

  /**
   * Bezier curve calculation
   * @param {number} t - The position on the curve, from 0 to 1.
   * @param {number} p0 - The first control point.
   * @param {number} p1 - The second control point.
   * @param {number} p2 - The third control point.
   * @param {number} p3 - The fourth control point.
   * @returns {number} The value on the curve.
   */
  static cubicBezier(t, p0, p1, p2, p3) {
    const oneMinusT = 1 - t;
    return oneMinusT * oneMinusT * oneMinusT * p0 +
      3 * oneMinusT * oneMinusT * t * p1 +
      3 * oneMinusT * t * t * p2 +
      t * t * t * p3;
  }

  /**
   * Interpolates between two hues.
   * @param {number} h1 - The first hue.
   * @param {number} h2 - The second hue.
   * @param {number} t - The interpolation factor.
   * @returns {number} The interpolated hue.
   */
  static interpolateHue(h1, h2, t) {
    let diff = h2 - h1;
    if(diff > 180) diff -= 360;
    if(diff < -180) diff += 360;
    let result = h1 + t * diff;
    if(result < 0) result += 360;
    if(result >= 360) result -= 360;
    return result;
  }

  /**
   * Interpolate between two colors
   * @param {string} color1 - The first color in hex format.
   * @param {string} color2 - The second color in hex format.
   * @param {number} factor - The interpolation factor.
   * @returns {string} The interpolated color in rgb format.
   */
  static interpolateColor(color1, color2, factor) {
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);

    const r = Math.round(c1.r + (c2.r - c1.r) * factor);
    const g = Math.round(c1.g + (c2.g - c1.g) * factor);
    const b = Math.round(c1.b + (c2.b - c1.b) * factor);

    return `rgb(${r}, ${g}, ${b})`;
  }

  static interpolateGradient(gradient, numPoints) {
    if(numPoints <= 1) {
      return [gradient[0]];
    }
    const lchGradient = gradient.map(hex => {
      const rgb = Colours.hexToRgb(hex);
      return Colours.rgbToLch(rgb.r, rgb.g, rgb.b);
    });

    const interpolatedColors = [];
    for(let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);

      const gradientIndex = Math.floor(t * (lchGradient.length - 1));
      const localT = (t * (lchGradient.length - 1)) - gradientIndex;

      const c1 = lchGradient[gradientIndex];
      const c2 = lchGradient[Math.min(gradientIndex + 1, lchGradient.length -
        1)];

      const l = c1.l + (c2.l - c1.l) * localT;
      const c = c1.c + (c2.c - c1.c) * localT;
      const h = Colours.interpolateHue(c1.h, c2.h, localT);

      const rgb = Colours.lchToRgb(l, c, h);
      interpolatedColors.push(Colours.rgbToHex(rgb.r, rgb.g, rgb.b));
    }
    return interpolatedColors;
  }

  /**
   * @class ColorPoint
   * @description A helper class for storing a color at a location.
   */
  static ColorPoint = class {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.rgba = new Uint8Array(4);
      this.updateColor(color);
      this.rgba[3] = 255; // Set alpha to 255 once
    }

    updateColor(color) {
      this.color = color;
      this.rgba[0] = parseInt(color.substr(1, 2), 16);
      this.rgba[1] = parseInt(color.substr(3, 2), 16);
      this.rgba[2] = parseInt(color.substr(5, 2), 16);
    }
  }

  static precomputeAdaptiveSigmas(colorPoints) {
    const sigmas = [];

    for(let i = 0; i < colorPoints.length; i++) {
      let minDistance = Infinity;

      // Find distance to nearest neighbor
      for(let j = 0; j < colorPoints.length; j++) {
        if(i !== j) {
          const dx = colorPoints[i].x - colorPoints[j].x;
          const dy = colorPoints[i].y - colorPoints[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          minDistance = Math.min(minDistance, distance);
        }
      }

      // Adaptive sigma: wider Gaussians for isolated points
      // Use 60% of nearest neighbor distance, clamped to reasonable bounds
      const adaptiveSigma = Math.max(30, Math.min(200, minDistance * 0.6));
      sigmas.push(adaptiveSigma);
    }

    return sigmas;
  }

  static getDistanceWeight(distance, sigma = 100) {
    // Gaussian weighting - smoother falloff with adaptive sigma
    return Math.exp(-(distance * distance) / (2 * sigma * sigma));
  }

  static interpolateColorByProximity(x, y, colorPoints) {
    const resultRGBA = new Uint8Array(4);
    if(colorPoints.length === 0) {
      resultRGBA[0] = 128;
      resultRGBA[1] = 128;
      resultRGBA[2] = 128;
      resultRGBA[3] = 255;
      return resultRGBA;
    }
    if(colorPoints.length === 1) {
      return colorPoints[0].rgba;
    }

    // Check if we're very close to a control point (within 2 pixels)
    for(let i = 0; i < colorPoints.length; i++) {
      const point = colorPoints[i];
      const dx = x - point.x;
      const dy = y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if(distance < 2) {
        return point.rgba;
      }
    }

    let totalR = 0,
      totalG = 0,
      totalB = 0;
    let totalWeight = 0;
    const sigmas = this.precomputeAdaptiveSigmas(colorPoints);

    colorPoints.forEach((point, index) => {
      const dx = x - point.x;
      const dy = y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const sigma = sigmas[index];
      const weight = this.getDistanceWeight(distance, sigma);

      totalR += point.rgba[0] * weight;
      totalG += point.rgba[1] * weight;
      totalB += point.rgba[2] * weight;
      totalWeight += weight;
    });

    if(totalWeight === 0) {
      resultRGBA[0] = 128;
      resultRGBA[1] = 128;
      resultRGBA[2] = 128;
      resultRGBA[3] = 255;
      return resultRGBA;
    }

    resultRGBA[0] = (totalR / totalWeight) | 0;
    resultRGBA[1] = (totalG / totalWeight) | 0;
    resultRGBA[2] = (totalB / totalWeight) | 0;
    resultRGBA[3] = 255;
    return resultRGBA;
  }

  /**
   * Converts a hex color to an RGB color.
   * @param {string} hex - The hex color string.
   * @returns {{r: number, g: number, b: number}|null} The RGB color object, or null if the hex string is invalid.
   */
  static hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2}).*$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  /**
   * An array of node colors.
   * @type {string[]}
   */
  static nodeColors = [
    '#f9ca24',
    '#45B7D1',
    '#4ECDC4',
    '#FF6B6B',
    '#96CEB4', '#DDA0DD',
    '#FFEAA7',
    '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA'
  ];
}

/*
async function recolorEmoji(emoji, wide) {
  const canvas = new OffscreenCanvas(wide ? 60 : 30, 30);
  const canvas2 = new OffscreenCanvas(wide ? 60 : 30, 30);
  const ctx = canvas.getContext('2d');
  ctx.font = '28px Arial';
  ctx.fillText(emoji, wide ? 16 : 1, 25);
  const color = new ReColoring();
  color.hue = 80;
  color.saturation = 150;
  color.brightness = 90;
  color.applyToCanvas(canvas, canvas2, wide ? 60 : 30, 30);
  const blob = await canvas2.convertToBlob();
  return URL.createObjectURL(blob);
}
*/

// Auto-generated exports
if (typeof window !== 'undefined') window.Colours = Colours;
export { Colours };
