/**
 * @file This file contains a utility class for warping images onto a canvas.
 * It uses an offscreen canvas to handle image loading, repetition, and caching.
 */

/**
 * @class ImageWarper
 * @description Manages an offscreen canvas for image manipulation, including loading,
 * repeating, and caching images.
 */
class ImageWarper {
  /**
   * @constructor
   * @param {object} config - The configuration object for the image warper.
   * @param {string} config.imageUrl - The URL of the image to load.
   * @param {boolean} [config.debug=false] - Whether to show the offscreen canvas for debugging.
   */
  constructor({
    imageUrl,
    debug = false
  }) {
    this.imageUrl = imageUrl;
    this.debug = debug;
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    this.image = null;
    this.warpedCache = new Map();

    if(this.debug) {
      document.body.appendChild(this.offscreenCanvas);
      this.offscreenCanvas.style.border = '1px solid red';
      this.offscreenCanvas.style.position = 'fixed';
      this.offscreenCanvas.style.top = '10px';
      this.offscreenCanvas.style.left = '10px';
    }
  }

  /**
   * Loads the image from the specified URL.
   * @returns {Promise<HTMLImageElement>} A promise that resolves with the loaded image.
   */
  loadImage() {
    return new Promise((resolve, reject) => {
      if(this.image) {
        resolve(this.image);
        return;
      }

      const img = new Image();
      img.crossOrigin = "Anonymous"; // Handle potential CORS issues
      img.onload = () => {
        this.image = img;
        this.offscreenCanvas.width = img.width;
        this.offscreenCanvas.height = img.height;
        this.offscreenCtx.drawImage(img, 0, 0);
        resolve(img);
      };
      img.onerror = (err) => {
        console.error('Failed to load image:', this.imageUrl);
        reject(err);
      };
      img.src = this.imageUrl;
    });
  }

  /**
   * Gets the image data, repeating it if necessary to fit a target width.
   * @param {number} targetWidth - The desired width of the image data.
   * @returns {Promise<HTMLCanvasElement>} A promise that resolves with a canvas containing the repeated image.
   */
  async getRepeatedImageCanvas(targetWidth) {
    console.log('getRepeatedImageCanvas called with targetWidth:',
      targetWidth);
    await this.loadImage();
    if(!this.image) {
      throw new Error('Image not loaded');
    }

    if(this.image.width >= targetWidth) {
      console.log('Image is wide enough, returning offscreen canvas');
      return this.offscreenCanvas;
    }

    // If the image is narrower than the target, repeat it.
    console.log('Image is narrower than target, creating repeated canvas');
    const repeatedCanvas = document.createElement('canvas');
    const repeatedCtx = repeatedCanvas.getContext('2d');
    repeatedCanvas.width = targetWidth;
    repeatedCanvas.height = this.image.height;

    for(let x = 0; x < targetWidth; x += this.image.width) {
      repeatedCtx.drawImage(this.image, x, 0);
    }

    return repeatedCanvas;
  }
}

// Auto-generated exports
if (typeof window !== 'undefined') window.ImageWarper = ImageWarper;
export { ImageWarper };
