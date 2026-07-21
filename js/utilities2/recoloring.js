class ReColoring {
  constructor() {
    this.hue = 0;
    this.saturation = 100;
    this.brightness = 100;
    this.contrast = 100;
  }

  // Generate sophisticated filter chain for rich recoloring
  generateFilter() {
    // Create a multi-stage filter for rich, non-flat coloring
    const filters = [];

    // Always include at least a basic filter to ensure it works
    filters.push('none'); // Start with base

    // Stage 1: Adjust base contrast and brightness
    if(this.contrast !== 100) {
      filters[0] = `contrast(${this.contrast}%)`;
    } else if(filters[0] === 'none') {
      filters[0] = 'contrast(100%)';
    }

    if(this.brightness !== 100) {
      filters.push(`brightness(${this.brightness}%)`);
    }

    // Stage 2: Hue rotation for primary color shift
    if(this.hue !== 0) {
      filters.push(`hue-rotate(${this.hue}deg)`);
    }

    // Stage 3: Saturation adjustment (preserve some original saturation)
    if(this.saturation !== 100) {
      filters.push(`saturate(${this.saturation}%)`);
    }

    // Remove 'none' if we have other filters
    if(filters.length > 1 && filters[0] === 'none') {
      filters[0] = filters[1];
      filters.splice(1, 1);
    }

    const result = filters.join(' ');
    console.log('Generated filter string:', result);
    return result;
  }

  // Apply color transformation with translucency preservation
  applyToCanvas(sourceCanvas, targetCanvas, sizex, sizey) {
    // Routine is bit fragile... 
    if(sourceCanvas === targetCanvas)
      throw new Error('Cannot use same canvas for source and destination.');
    sizey = sizey || sizex;
    const targetCtx = targetCanvas.getContext('2d');

    // Clear target canvas to transparent
    targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

    // Calculate positioning for centering
    const x = (targetCanvas.width - sizex) / 2;
    const y = (targetCanvas.height - sizey) / 2;

    // First try canvas filters
    /*
    targetCtx.save();
    const filterString = this.generateFilter();
    console.log('Applying filter:', filterString);
    targetCtx.filter = filterString;
    targetCtx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, x, y, sizex, sizey);
    targetCtx.restore();
    */
    // Check if filters worked by testing if we need manual processing
    if(this.needsManualProcessing()) {
      console.log('Canvas filters not working, applying manual processing');
      this.applyManualProcessing(sourceCanvas, targetCanvas, sizex, sizey, x,
        y);
    }
  }

  needsManualProcessing() {
    return true;
    // If any values are significantly different from default, we need processing
    return Math.abs(this.hue) > 5 ||
      Math.abs(this.saturation - 100) > 5 ||
      Math.abs(this.brightness - 100) > 5 ||
      Math.abs(this.contrast - 100) > 5;
  }

  applyManualProcessing(sourceCanvas, targetCanvas, sizex, sizey, x, y) {
    const sourceCtx = sourceCanvas.getContext('2d');
    const targetCtx = targetCanvas.getContext('2d');

    // Clear target canvas
    targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

    // Get source image data
    const sourceData = sourceCtx.getImageData(0, 0, sourceCanvas.width,
      sourceCanvas.height);

    // Create target image data
    const targetData = targetCtx.createImageData(sizex, sizey);

    // Process pixels
    this.processImageData(sourceData, targetData, sourceCanvas.width,
      sourceCanvas.height, sizex, sizey);

    // Put processed image data to target canvas
    targetCtx.putImageData(targetData, x, y);
  }

  processImageData(sourceData, targetData, sourceWidth, sourceHeight,
    targetSizex, targetSizey) {
    const source = sourceData.data;
    const target = targetData.data;

    const scaleX = sourceWidth / targetSizex;
    const scaleY = sourceHeight / targetSizey;

    for(let y = 0; y < targetSizey; y++) {
      for(let x = 0; x < targetSizex; x++) {
        // Calculate source pixel position
        const sourceX = Math.floor(x * scaleX);
        const sourceY = Math.floor(y * scaleY);
        const sourceIndex = (sourceY * sourceWidth + sourceX) * 4;

        // Get source pixel
        const r = source[sourceIndex];
        const g = source[sourceIndex + 1];
        const b = source[sourceIndex + 2];
        const a = source[sourceIndex + 3];

        // Skip transparent pixels
        if(a === 0) {
          const targetIndex = (y * targetSizex + x) * 4;
          target[targetIndex] = 0;
          target[targetIndex + 1] = 0;
          target[targetIndex + 2] = 0;
          target[targetIndex + 3] = 0;
          continue;
        }

        // Apply transformations
        let [newR, newG, newB] = this.transformColor(r, g, b);

        // Set target pixel
        const targetIndex = (y * targetSizex + x) * 4;
        target[targetIndex] = Math.round(Math.max(0, Math.min(255, newR)));
        target[targetIndex + 1] = Math.round(Math.max(0, Math.min(255,
          newG)));
        target[targetIndex + 2] = Math.round(Math.max(0, Math.min(255,
          newB)));
        target[targetIndex + 3] = a; // Preserve alpha
      }
    }
  }

  transformColor(r, g, b) {
    // Convert to HSL for easier manipulation
    let [h, s, l] = this.rgbToHsl(r, g, b);

    // Apply hue rotation
    h = (h + this.hue / 360) % 1;
    if(h < 0) h += 1;

    // Apply saturation
    s = s * (this.saturation / 100);
    s = Math.max(0, Math.min(1, s));

    // Apply brightness (lightness)
    l = l * (this.brightness / 100);
    l = Math.max(0, Math.min(1, l));

    // Convert back to RGB
    let [newR, newG, newB] = this.hslToRgb(h, s, l);

    // Apply contrast
    if(this.contrast !== 100) {
      const factor = this.contrast / 100;
      newR = ((newR / 255 - 0.5) * factor + 0.5) * 255;
      newG = ((newG / 255 - 0.5) * factor + 0.5) * 255;
      newB = ((newB / 255 - 0.5) * factor + 0.5) * 255;
    }

    return [newR, newG, newB];
  }

  rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if(max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch(max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }

    return [h, s, l];
  }

  hslToRgb(h, s, l) {
    let r, g, b;

    if(s === 0) {
      r = g = b = l; // achromatic
    } else {
      const hue2rgb = (p, q, t) => {
        if(t < 0) t += 1;
        if(t > 1) t -= 1;
        if(t < 1 / 6) return p + (q - p) * 6 * t;
        if(t < 1 / 2) return q;
        if(t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return [r * 255, g * 255, b * 255];
  }

  // Check if we should apply manual effects (fallback detection)
  shouldApplyManualEffects() {
    // Simple heuristic: if we have significant color changes, apply manual effects
    return this.hue !== 0 || this.tint > 20;
  }

  // Manual color effects that preserve alpha channel
  applyManualColorEffectsPreservingAlpha(ctx, sourceCanvas, x, y, size) {
    // Only apply hue shift and tinting manually while preserving alpha
    if(this.hue !== 0 || this.tint > 0) {
      this.applyColorTintPreservingAlpha(ctx, sourceCanvas, x, y, size);
    }
  }

  // Apply color tint while preserving alpha channel
  applyColorTintPreservingAlpha(ctx, sourceCanvas, x, y, size) {
    ctx.save();

    // Create a clipping mask from the source image's alpha channel
    ctx.globalCompositeOperation = 'source-atop';

    // Get the hue color
    const hueColor = this.hueToRgb(this.hue);
    const tintStrength = Math.max(this.tint / 100, this.hue !== 0 ? 0.3 : 0);

    // Create gradient for natural color variation
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX,
      centerY, size / 2);

    const alpha = Math.min(tintStrength * 0.6, 0.4);
    gradient.addColorStop(0,
      `rgba(${hueColor.r}, ${hueColor.g}, ${hueColor.b}, ${alpha * 0.7})`);
    gradient.addColorStop(1,
      `rgba(${hueColor.r}, ${hueColor.g}, ${hueColor.b}, ${alpha})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, size, size);

    ctx.restore();
  }

  // Apply subtle color overlay for enhanced depth
  applyColorOverlay(ctx, x, y, size) {
    ctx.save();

    // Create radial gradient for depth
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX,
      centerY, size / 2);

    // Convert hue to RGB for overlay
    const overlayColor = this.hueToRgb(this.hue);
    const alpha = Math.min(this.tint / 300, 0.2); // Subtle overlay

    gradient.addColorStop(0,
      `rgba(${overlayColor.r}, ${overlayColor.g}, ${overlayColor.b}, 0)`);
    gradient.addColorStop(1,
      `rgba(${overlayColor.r}, ${overlayColor.g}, ${overlayColor.b}, ${alpha})`
    );

    ctx.fillStyle = gradient;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillRect(x, y, size, size);

    ctx.restore();
  }

  // Convert hue to RGB values
  hueToRgb(hue) {
    const h = hue / 360;
    const s = 1;
    const l = 0.5;

    const hue2rgb = (p, q, t) => {
      if(t < 0) t += 1;
      if(t > 1) t -= 1;
      if(t < 1 / 6) return p + (q - p) * 6 * t;
      if(t < 1 / 2) return q;
      if(t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

    return {
      r,
      g,
      b
    };
  }
}

// Auto-generated exports
if (typeof window !== 'undefined') window.ReColoring = ReColoring;
export { ReColoring };
