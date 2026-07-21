// Cache for storing generated pattern blobs
const patternCache = new Map();

/**
 * Generate a 4-fold symmetric pattern based on a seed
 * @param {number} seed - Seed for random generation
 * @returns {Promise<string>} Blob URL for the generated image
 */
async function getSymmetricPattern(seed) {
  // Check cache first
  if(patternCache.has(seed)) {
    return patternCache.get(seed);
  }

  const size = 32;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const rng = new SeededRandom(seed);

  // Fill background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Generate pattern in one quadrant (top-left)
  const pixelSize = 4; // Make pixels visible
  const halfSize = size / (2 * pixelSize);
  const pixels = [];

  // Generate random pixels for one quadrant
  for(let y = 0; y < halfSize; y++) {
    for(let x = 0; x < halfSize; x++) {
      if(rng.next() > 0.05) { // 95% fill rate
        const hue = rng.nextInt(0, 360);
        const sat = rng.nextInt(50, 100);
        const light = rng.nextInt(40, 70);
        pixels.push({
          x: x * pixelSize,
          y: y * pixelSize,
          color: `hsl(${hue}, ${sat}%, ${light}%)`
        });
      }
    }
  }

  // Draw with 4-fold symmetry
  pixels.forEach(({
    x,
    y,
    color
  }) => {
    ctx.fillStyle = color;

    // Top-left quadrant
    ctx.fillRect(x, y, pixelSize, pixelSize);

    // Top-right quadrant (mirror horizontally)
    ctx.fillRect(size - x - pixelSize, y, pixelSize, pixelSize);

    // Bottom-left quadrant (mirror vertically)
    ctx.fillRect(x, size - y - pixelSize, pixelSize, pixelSize);

    // Bottom-right quadrant (mirror both)
    ctx.fillRect(size - x - pixelSize, size - y - pixelSize, pixelSize,
      pixelSize);
  });

  // Convert to blob and create URL
  const blob = await canvas.convertToBlob({
    type: 'image/png'
  });
  const url = URL.createObjectURL(blob);

  // Cache the result
  patternCache.set(seed, url);

  return url;
}

/**
 * Clear pattern cache and revoke all blob URLs
 */
function clearPatternCache() {
  patternCache.forEach(url => URL.revokeObjectURL(url));
  patternCache.clear();
}

// Object based version...
async function displayPattern(seed, container) {
  const url = await getSymmetricPattern(seed);
  const size = 32;

  const img = document.createElement('img');
  img.src = url;
  img.width = size;
  img.height = size;
  img.style.imageRendering = 'pixelated'; // Keep it crisp

  container.appendChild(img);
}

// Texty version...
async function getPatternHTML(seed) {
  const url = await getSymmetricPattern(seed);
  const size = 32;

  return `<img src="${url}" width="${size}" height="${size}" draggable="false" style="image-rendering: pixelated;">`;
}

// Example: Generate multiple patterns
async function demo() {
  const container = document.getElementById('pattern-container');
  for(let i = 0; i < 50; i++) {
    await displayPattern(i * 100, container);
  }

  // Same seeds will use cached versions
  await displayPattern(0, container); // Uses cache
  await displayPattern(100, container); // Uses cache
}

// Auto-generated exports
if (typeof window !== 'undefined') window.clearPatternCache = clearPatternCache;
export { clearPatternCache };
if (typeof window !== 'undefined') window.patternCache = patternCache;
export { patternCache };
