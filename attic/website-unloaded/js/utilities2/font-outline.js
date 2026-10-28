/**
 * FontOutline - A class for extracting vector paths from font glyphs.
 * This class works by rendering a character to an offscreen canvas
 * and then tracing the outline of the resulting pixels.
 */
class FontOutline {
  /**
   * @param {object} [options={}] - Configuration options for the FontOutline instance.
   * @param {number} [options.debug=false] - If true, the offscreen canvas will be added to the DOM for debugging.
   */
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Extracts the vector path for a given character.
   * @param {string} character - The character to extract the path from.
   * @param {string} font - The font to use (e.g., "20px Arial").
   * @param {number} size - The font size in pixels.
   * @returns {Vector2D[]} An array of Vector2D points representing the character's outline.
   */
  getPath(character, font, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    const ctx = canvas.getContext('2d');

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set font properties
    ctx.font = `${size}px ${font}`;
    ctx.fillStyle = 'black';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // Draw the character
    ctx.fillText(character, canvas.width / 2, canvas.height / 2);

    // Get pixel data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Trace outline from pixelData
    const path = this._tracePath(imageData, this.options.debug ? ctx : null);

    // For debugging, add the canvas to the DOM
    if(this.options.debug) {
      if(this.appendDebugCanvas) {
        this.appendDebugCanvas(canvas);
      } else {
        document.body.appendChild(canvas);
      }
    }

    return path;
  }

  _getPixel(imageData, x, y) {
    if(x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
      return 0;
    }
    const alpha = imageData.data[(y * imageData.width + x) * 4 + 3];
    return alpha > 128 ? 1 : 0;
  }

  _tracePath(imageData, debugCtx) {
    const {
      width,
      height
    } = imageData;
    const segments = new Map(); // Store segments for each cell

    const lookup = [
      [], // 0
      [
        [
          [0.5, 1],
          [0, 0.5]
        ]
      ], // 1
      [
        [
          [1, 0.5],
          [0.5, 1]
        ]
      ], // 2
      [
        [
          [1, 0.5],
          [0, 0.5]
        ]
      ], // 3
      [
        [
          [0.5, 0],
          [1, 0.5]
        ]
      ], // 4
      "ambiguous", // 5
      [
        [
          [0.5, 0],
          [0.5, 1]
        ]
      ], // 6
      [
        [
          [0.5, 0],
          [0, 0.5]
        ]
      ], // 7
      [
        [
          [0, 0.5],
          [0.5, 0]
        ]
      ], // 8
      [
        [
          [0.5, 1],
          [0.5, 0]
        ]
      ], // 9
      "ambiguous", // 10
      [
        [
          [1, 0.5],
          [0.5, 0]
        ]
      ], // 11
      [
        [
          [0, 0.5],
          [1, 0.5]
        ]
      ], // 12
      [
        [
          [0.5, 1],
          [1, 0.5]
        ]
      ], // 13
      [
        [
          [0, 0.5],
          [0.5, 1]
        ]
      ], // 14
      [], // 15
    ];

    for(let y = 0; y < height - 1; y++) {
      for(let x = 0; x < width - 1; x++) {
        const corners = [
          this._getPixel(imageData, x, y + 1), // top-left
          this._getPixel(imageData, x + 1, y + 1), // top-right
          this._getPixel(imageData, x + 1, y), // bottom-right
          this._getPixel(imageData, x, y) // bottom-left
        ];
        const index = corners[0] * 1 + corners[1] * 2 + corners[2] * 4 +
          corners[3] * 8;

        if(index === 0 || index === 15) continue;

        let cellSegments = lookup[index];
        if(cellSegments === "ambiguous") {
          // Disambiguate by checking the center
          const centerX = x + 0.5;
          const centerY = y + 0.5;
          // Simple average of the 4 corner pixels alpha values
          const centerAlpha = (
            imageData.data[((y * width + x) * 4) + 3] +
            imageData.data[((y * width + x + 1) * 4) + 3] +
            imageData.data[(((y + 1) * width + x) * 4) + 3] +
            imageData.data[(((y + 1) * width + x + 1) * 4) + 3]
          ) / 4;

          if(index === 5) {
            cellSegments = (centerAlpha > 128) ? [
                [
                  [
                    [0.5, 0],
                    [0, 0.5]
                  ]
                ],
                [
                  [
                    [0.5, 1],
                    [1, 0.5]
                  ]
                ]
              ] // Two separate lines
              :
              [
                [
                  [
                    [0.5, 0],
                    [0.5, 1]
                  ]
                ]
              ]; // One line
          } else { // index === 10
            cellSegments = (centerAlpha > 128) ? [
                [
                  [
                    [0, 0.5],
                    [0.5, 1]
                  ]
                ],
                [
                  [
                    [1, 0.5],
                    [0.5, 0]
                  ]
                ]
              ] // Two separate lines
              :
              [
                [
                  [
                    [0, 0.5],
                    [1, 0.5]
                  ]
                ]
              ]; // One line
          }
        }

        const key = `${x},${y}`;
        const absoluteSegments = cellSegments.map(seg =>
          seg.map(point => new Vector2D(x + point[0], y + point[1]))
        );
        segments.set(key, absoluteSegments);
      }
    }

    if(debugCtx) {
      debugCtx.lineWidth = 0.5;
      debugCtx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      debugCtx.beginPath();
      for(const [key, cellSegments] of segments.entries()) {
        for(const seg of cellSegments) {
          debugCtx.moveTo(seg[0].x, seg[0].y);
          debugCtx.lineTo(seg[1].x, seg[1].y);
        }
      }
      debugCtx.stroke();
    }

    const paths = [];
    const visitedSegments = new Set();

    const findNextSegment = (point, currentKey) => {
      for(const [key, cellSegments] of segments.entries()) {
        if(key === currentKey) continue;
        for(const seg of cellSegments) {
          const segKey = `${key}-${seg[0].toString()}-${seg[1].toString()}`;
          if(visitedSegments.has(segKey)) continue;

          if(seg[0].equals(point)) return {
            key,
            seg,
            startNode: seg[1]
          };
          if(seg[1].equals(point)) return {
            key,
            seg,
            startNode: seg[0]
          };
        }
      }
      return null;
    };

    for(const [key, cellSegments] of segments.entries()) {
      for(const seg of cellSegments) {
        const segKey = `${key}-${seg[0].toString()}-${seg[1].toString()}`;
        if(visitedSegments.has(segKey)) continue;

        const path = [seg[0], seg[1]];
        visitedSegments.add(segKey);
        let currentKey = key;
        let next = findNextSegment(seg[1], currentKey);

        while(next) {
          const nextSegKey =
            `${next.key}-${next.seg[0].toString()}-${next.seg[1].toString()}`;
          if(visitedSegments.has(nextSegKey)) break;

          path.push(next.startNode);
          visitedSegments.add(nextSegKey);
          currentKey = next.key;
          next = findNextSegment(next.startNode, currentKey);
        }

        // Also trace backwards from the start of the first segment
        currentKey = key;
        next = findNextSegment(seg[0], currentKey);
        while(next) {
          const nextSegKey =
            `${next.key}-${next.seg[0].toString()}-${next.seg[1].toString()}`;
          if(visitedSegments.has(nextSegKey)) break;

          path.unshift(next.startNode);
          visitedSegments.add(nextSegKey);
          currentKey = next.key;
          next = findNextSegment(next.startNode, currentKey);
        }

        paths.push(path);
      }
    }

    // For now, we just return the longest path found.
    if(paths.length === 0) return [];
    paths.sort((a, b) => b.length - a.length);
    return paths[0];
  }
}

// Auto-generated exports
if (typeof window !== 'undefined') window.FontOutline = FontOutline;
export { FontOutline };
