// ============================================================
// COLOR ENGINE
// ============================================================

const ColorEngine = {
  schemes: {
    'red-green': { negative: [220, 50, 50], zero: [255, 255, 255], positive: [50, 180, 50] },
    'blue-red': { negative: [50, 100, 200], zero: [255, 255, 255], positive: [200, 50, 50] },
    'purple-orange': { negative: [150, 50, 200], zero: [255, 255, 255], positive: [230, 150, 50] },
    'cyan-magenta': { negative: [50, 200, 200], zero: [255, 255, 255], positive: [200, 50, 200] }
  },

  getColor(value, range, scheme, smooth) {
    const { min, max } = range;
    const colors = this.schemes[scheme] || this.schemes['red-green'];
    
    if (max === min) return colors.zero;
    
    const fullRange = Math.max(Math.abs(min), Math.abs(max));
    let t = value / (fullRange || 1);
    
    if (!smooth) {
      if (t < -0.5) return colors.negative;
      if (t > 0.5) return colors.positive;
      return colors.zero;
    }
    
    if (t < 0) {
      const factor = Math.abs(t);
      return this.lerp(colors.zero, colors.negative, factor);
    } else {
      return this.lerp(colors.zero, colors.positive, t);
    }
  },

  lerp(c1, c2, t) {
    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t)
    ];
  },

  toCSS(rgb, alpha = 1) {
    if (alpha < 1) {
      return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
    }
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  }
};

// ============================================================
// TEXT UTILS
// ============================================================

const TextUtils = {
  measureCache: new Map(),
  
  measure(ctx, text, font) {
    const key = font + '|' + text;
    if (!this.measureCache.has(key)) {
      ctx.font = font;
      this.measureCache.set(key, ctx.measureText(text).width);
    }
    return this.measureCache.get(key);
  },

  clearCache() {
    this.measureCache.clear();
  },

  truncate(ctx, text, maxWidth, font) {
    if (this.measure(ctx, text, font) <= maxWidth) {
      return text;
    }
    
    for (let len = text.length - 1; len > 0; len--) {
      const truncated = text.substring(0, len) + '…';
      if (this.measure(ctx, truncated, font) <= maxWidth) {
        return truncated;
      }
    }
    
    if (this.measure(ctx, text[0], font) <= maxWidth) {
      return text[0];
    }
    
    return '';
  }
};

export { ColorEngine, TextUtils }