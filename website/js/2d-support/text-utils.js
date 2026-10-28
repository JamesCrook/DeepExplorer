export { TextUtils };

// Cached text measuring and truncation for canvas labels (was in utilities/color-engine.js).

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
