
/**
 * Capturer: A utility for high-resolution off-screen captures in Three.js.
 */
class Capturer {
  constructor(THREE, mainRenderer, scene, camera) {
    this.THREE = THREE
    this.mainRenderer = mainRenderer;
    this.scene = scene;
    this.camera = camera;
    this.isCapturing = false;
  }

  /**
   * Captures the current scene at a specified scale.
   * @param {number} scale - Multiplier for the current canvas dimensions (e.g., 2 for 2x).
   * @param {string} fileName - The name of the resulting PNG file.
   */
  async capture(scale = 2, fileName = 'capture.png') {
    if (this.isCapturing) return; // Prevent concurrent captures
    this.isCapturing = true;

    // 1. Calculate dimensions based on the main canvas
    const width = this.mainRenderer.domElement.width * scale;
    const height = this.mainRenderer.domElement.height * scale;

    // 2. Initialize a temporary "Headless" renderer
    const tempRenderer = new this.THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true
    });
    
    tempRenderer.setSize(width, height);
    tempRenderer.setPixelRatio(1);

    // 3. Store original camera state
    const originalAspect = this.camera.aspect;
    
    // 4. Match camera to new dimensions
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    try {
      // 5. Perform the high-res render
      tempRenderer.render(this.scene, this.camera);

      // 6. Convert to Blob (Async)
      const blob = await new Promise((resolve) => {
        tempRenderer.domElement.toBlob(resolve, 'image/png');
      });

      // 7. Trigger the download
      this._downloadBlob(blob, fileName);

    } catch (error) {
      console.error("Capture failed:", error);
    } finally {
      // 8. Cleanup: Restore camera and nuke the temp renderer
      this.camera.aspect = originalAspect;
      this.camera.updateProjectionMatrix();

      tempRenderer.dispose();
      tempRenderer.forceContextLoss();
      
      this.isCapturing = false;
      console.log(`Capture complete: ${width}x${height}`);
    }
  }

  /**
   * Internal helper to handle the browser download trigger.
   */
  _downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    
    // Deallocate the URL object from memory
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}

export { Capturer };

