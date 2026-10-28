/* global Vector2D */

class HelpOverlay {
  /**
   * @param {Array|Object} config - Configuration object or array of configuration objects for multi-step help.
   * Each config object should have an 'items' array.
   * Item structure: { text: string, targetId: string, type: string }
   * 'type' can be 'default', 'warning', or 'results'. If omitted, defaults to 'default'.
   */
  constructor(config) {
    this.config = Array.isArray(config) ? config : (config ? [config] : []);
    this.currentStepIndex = 0;

    // Named arrow types
    this.ARROW_STYLES = {
      default: {
        color: '#10b981',
        arrow: {
          extendHead: 5,
          extendTail: -7,
          tailSize: 5,
          headSize: 15,
          width: 4
        }
      },
      warning: {
        color: '#d92010',
        arrow: {
          extendHead: 5,
          extendTail: -7,
          tailSize: 5,
          headSize: 15,
          width: 4
        }
      },
      results: {
        color: '#9333ea', // Purple
        arrow: {
          extendHead: 5,
          extendTail: -7,
          tailSize: 5,
          headSize: 15,
          width: 4,
          dash: [4, 4]
        }
      }
    };

    // Canvas setup
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'fixed';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '9999';
    this.ctx = this.canvas.getContext('2d');

    this.connections = [];
    this.animating = false;

    this.resizeCanvas = this.resizeCanvas.bind(this);
    this.draw = this.draw.bind(this);

    this.initUI();
  }

  initUI() {
    // Inject styles if not present
    if(!document.getElementById('help-overlay-styles')) {
      const style = document.createElement('style');
      style.id = 'help-overlay-styles';
      style.textContent = `
                .help-overlay-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.5);
                    z-index: 9998;
                    display: none;
                }
                .help-organizer {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(255, 255, 255, 0.95);
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                    width: 320px;
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    pointer-events: auto;
                }
                .help-close-x {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    width: 24px;
                    height: 24px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    color: #64748b;
                    border-radius: 50%;
                    transition: background 0.2s;
                    font-family: sans-serif;
                }
                .help-close-x:hover {
                    background: #e2e8f0;
                    color: #ef4444;
                }
                .help-content {
                    max-height: 60vh;
                    overflow-y: auto;
                }
                .help-item {
                    padding: 10px;
                    border-bottom: 1px solid #e2e8f0;
                    font-size: 14px;
                    line-height: 1.4;
                    color: #334155;
                }
                .help-item:last-child {
                    border-bottom: none;
                }
                .help-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 10px;
                }
                .help-btn {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 13px;
                }
                .help-btn-close {
                    background: #e2e8f0;
                    color: #475569;
                }
                .help-btn-next {
                    background: #3b82f6;
                    color: white;
                }
                .help-btn-next:hover {
                    background: #2563eb;
                }
                .help-btn-close:hover {
                    background: #cbd5e1;
                }
            `;
      document.head.appendChild(style);
    }

    // Create Container
    this.container = document.createElement('div');
    this.container.className = 'help-overlay-container';

    // Create Organizer
    this.organizer = document.createElement('div');
    this.organizer.className = 'help-organizer';

    // X Close Button
    const xBtn = document.createElement('div');
    xBtn.className = 'help-close-x';
    xBtn.innerHTML = '×';
    xBtn.onclick = () => this.stop();
    this.organizer.appendChild(xBtn);

    // Content Area
    this.contentDiv = document.createElement('div');
    this.contentDiv.className = 'help-content';
    this.organizer.appendChild(this.contentDiv);

    // Footer
    this.footer = document.createElement('div');
    this.footer.className = 'help-footer';

    this.nextBtn = document.createElement('button');
    this.nextBtn.className = 'help-btn help-btn-next';
    this.nextBtn.textContent = 'Next';
    this.nextBtn.onclick = () => this.nextStep();
    this.footer.appendChild(this.nextBtn);

    this.closeBtn = document.createElement('button');
    this.closeBtn.className = 'help-btn help-btn-close';
    this.closeBtn.textContent = 'Close';
    this.closeBtn.onclick = () => this.stop();
    this.footer.appendChild(this.closeBtn);

    this.organizer.appendChild(this.footer);
    this.container.appendChild(this.organizer);

    document.body.appendChild(this.container);

    // Make organizer draggable
    this.makeDraggable(this.organizer);

    // Add canvas
    document.body.appendChild(this.canvas);
    window.addEventListener('resize', this.resizeCanvas);
    this.resizeCanvas();
    window.DoHelp = () => {
      this.start();
    };
  }

  isVisible(b) {
    return b && (
      b.bottom > 0 && b.top < window.innerHeight &&
      b.right > 0 && b.left < window.innerWidth
    );
  }

  // Helper method
  getVisibleArea(b) {
    const visibleTop = Math.max(0, b.top);
    const visibleBottom = Math.min(window.innerHeight, b.bottom);
    const visibleLeft = Math.max(0, b.left);
    const visibleRight = Math.min(window.innerWidth, b.right);

    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const visibleWidth = Math.max(0, visibleRight - visibleLeft);

    return visibleHeight * visibleWidth;
  }

  renderStep(index) {
    if(index < 0 || index >= this.config.length) return;

    const stepConfig = this.config[index];
    this.contentDiv.innerHTML = '';
    this.connections = [];

    if(stepConfig.items) {
      stepConfig.items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'help-item';
        el.innerHTML = item.text || '';
        this.contentDiv.appendChild(el);

        let sourceEl = el;
        // If text starts with <strong>, use that as the source
        const firstChild = el.firstElementChild;
        if(firstChild && firstChild.tagName === 'STRONG') {
          // Check if it's really at the start (ignoring whitespace)
          // But checking firstElementChild is usually sufficient if structure is strictly <strong>...</strong>...
          sourceEl = firstChild;
        }

        let targetEl = null;
        if(item.targetId) {
          targetEl = document.getElementById(item.targetId);
        } else if(item.targetSelector) {
          const els = document.querySelectorAll(item.targetSelector);
          // Find the element with maximum visible area
          let maxVisibleArea = 0;

          for(const el of els) {
            const box = this.getElementBox(el);
            if(!box) continue;

            const visibleArea = this.getVisibleArea(box);
            if(visibleArea > maxVisibleArea) {
              maxVisibleArea = visibleArea;
              targetEl = el;
            }
          }
        }

        if(targetEl) {
          // Resolve style
          const styleKey = item.type || 'default';
          const styleConfig = this.ARROW_STYLES[styleKey] || this
            .ARROW_STYLES.default;

          this.connections.push({
            from: sourceEl,
            to: targetEl,
            color: styleConfig.color,
            arrow: styleConfig.arrow
          });
        }
      });
    }

    // Handle Next Button visibility
    if(index < this.config.length - 1) {
      this.nextBtn.style.display = 'block';
    } else {
      this.nextBtn.style.display = 'none';
    }

    // Handle Panel Position
    if (stepConfig.panelPosition) {
      const { targetId, x, y } = stepConfig.panelPosition;
      const targetEl = document.getElementById(targetId);

      if (targetEl) {
        // We need dimensions of both target and panel
        // For panel, we need to ensure it's rendered to get dimensions
        // It is already appended to DOM, so getElementBox should work
        const targetBox = this.getElementBox(targetEl);
        const panelBox = this.getElementBox(this.organizer);

        if (targetBox && panelBox) {
          // Calculate max displacement (align bottom-right)
          // minPos is top-left alignment (0,0) -> targetBox.pos
          // maxPos is bottom-right alignment (1,1) -> targetBox.pos + targetBox.size - panelBox.size

          const minPos = targetBox.pos;
          const maxPos = minPos.add(targetBox.size.sub(panelBox.size.x, panelBox.size.y));

          // Use lerp() per dimension as requested.
          // Since Vector2D.lerp takes a scalar, we construct vectors to interpolate each axis.
          const xPos = new Vector2D(minPos.x, 0).lerp(new Vector2D(maxPos.x, 0), x).x;
          const yPos = new Vector2D(0, minPos.y).lerp(new Vector2D(0, maxPos.y), y).y;

          this.organizer.style.transform = 'none';
          this.organizer.style.left = `${xPos}px`;
          this.organizer.style.top = `${yPos}px`;
        }
      }
    } else {
      // Reset to center default
      this.organizer.style.top = '50%';
      this.organizer.style.left = '50%';
      this.organizer.style.transform = 'translate(-50%, -50%)';
    }
  }

  nextStep() {
    if(this.currentStepIndex < this.config.length - 1) {
      this.currentStepIndex++;
      this.renderStep(this.currentStepIndex);
    } else {
      this.stop();
    }
  }

  start() {
    this.container.style.display = 'block';
    this.currentStepIndex = 0;
    this.renderStep(0);

    // Ensure canvas size is correct
    this.resizeCanvas();

    if(!this.animating) {
      this.animating = true;
      this.draw();
    }
  }

  stop() {
    this.container.style.display = 'none';
    this.animating = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  getElementBox(el, absolute = true) {
    if (!el) return null;

    // Fixed elements often have offsetParent === null. 
    // This check ensures we don't discard them if they are actually visible.
    if (el.offsetParent === null && window.getComputedStyle(el).display === 'none') {
      return null; 
    }

    const rect = el.getBoundingClientRect();
    
    // Calculate scroll offsets if absolute bounds are requested
    const scrollX = absolute ? window.scrollX : 0;
    const scrollY = absolute ? window.scrollY : 0;

    const left = rect.left + scrollX;
    const top = rect.top + scrollY;

    return {
      left: left,
      top: top,
      right: rect.right + scrollX,
      bottom: rect.bottom + scrollY,
      width: rect.width,
      height: rect.height,
      center: new Vector2D(left + rect.width / 2, top + rect.height / 2),
      pos: new Vector2D(left, top),
      size: new Vector2D(rect.width, rect.height)
    };
  }

  getNearestPoints(box1, box2) {
    // First approximation: clamp box2 center to box1
    let p1 = this.clampToBox(box2.center, box1);

    // Second: clamp p1 to box2 to get p2
    let p2 = this.clampToBox(p1, box2);

    // Refine p1: clamp p2 back to box1
    p1 = this.clampToBox(p2, box1);

    return {
      p1,
      p2
    };
  }

  /**
   * Find target point that is inside box2 but outside excludeBox, trying four cardinal directions from sourceCenter.
   * Returns { p1, p2 } where p2 is inside box2 and outside excludeBox, and p1 is nearest point on box1 to p2.
   * Returns null if no valid direction found.
   */
  findExternalTargetPoint(box1, box2, excludeBox, margin = 10) {
    const sourceCenter = box1.center;

    // Expanded excludeBox with margin
    const expanded = {
      left: excludeBox.left - margin,
      right: excludeBox.right + margin,
      top: excludeBox.top - margin,
      bottom: excludeBox.bottom + margin
    };

    // If source center is not inside the expanded excludeBox, this method doesn't apply
    if(!this.isInsideBox(sourceCenter, expanded))
      return null;

    // Four cardinal directions
    const directions = [
      new Vector2D(0, -1), // up
      new Vector2D(0, 1), // down
      new Vector2D(-1, 0), // left
      new Vector2D(1, 0) // right
    ];

    // Collect all valid exit points
    const candidates = [];

    for(const dir of directions) {
      const exitPoint = this.rayBoxExit(sourceCenter, dir, expanded);
      if(!exitPoint) continue;

      // Check if this exit point is inside box2
      if(this.isInsideBox(exitPoint, box2)) {
        candidates.push(exitPoint);
      }
    }

    // Now find the best candidate (shortest arrow)
    let bestResult = null;
    let bestDist = 2000;

    for(const p2 of candidates) {
      const p1 = this.clampToBox(p2, box1);
      const dist = p1.sub(p2).length;

      if(dist < bestDist) {
        bestDist = dist;
        bestResult = {
          p1,
          p2
        };
      }
    }

    return bestResult;
  }

  /**
   * Test if a point is inside a box
   */
  isInsideBox(point, box) {
    return point.x >= box.left && point.x <= box.right &&
      point.y >= box.top && point.y <= box.bottom;
  }

  /**
   * Find where a ray from origin in direction dir exits the box.
   * Returns the exit point or null if origin is outside box.
   */
  rayBoxExit(origin, dir, box) {
    if(!this.isInsideBox(origin, box))
      return null;

    let t = Infinity;

    // Find smallest positive t where ray hits a boundary
    if(dir.x > 1e-9) {
      t = Math.min(t, (box.right - origin.x) / dir.x);
    } else if(dir.x < -1e-9) {
      t = Math.min(t, (box.left - origin.x) / dir.x);
    }

    if(dir.y > 1e-9) {
      t = Math.min(t, (box.bottom - origin.y) / dir.y);
    } else if(dir.y < -1e-9) {
      t = Math.min(t, (box.top - origin.y) / dir.y);
    }

    if(t === Infinity || t < 0) return null;

    let v = origin.add(dir.scale(t))

    return v;
  }

  /**
   * Clamp a point to the boundary of a box
   */
  clampToBox(v, box) {
    return new Vector2D(
      Math.max(box.left, Math.min(v.x, box.right)),
      Math.max(box.top, Math.min(v.y, box.bottom))
    );
  }

  drawArrow(ctx, start, end, color = '#64748b', opts = {}) {
    const {
      extendHead = 0, extendTail = 0, headSize = 12, tailSize = 0, width =
        2.5, dash = []
    } = opts;

    // start and end are Vector2D
    let diff = end.sub(start);
    const dist = diff.length;

    if(dist < 1) return;

    const dir = diff.normalize();

    // Calculate actual start and end points with extensions
    // extendTail: extend backwards from start
    // extendHead: extend forwards from end
    const actualStart = start.sub(dir.scale(extendTail));
    const actualEnd = end.add(dir.scale(extendHead));

    // Re-calculate diff based on new points
    const drawDiff = actualEnd.sub(actualStart);
    const drawDist = drawDiff.length;

    if(drawDist < 1) return;

    // Draw Tail Blob
    if(tailSize > 0) {
      ctx.beginPath();
      ctx.arc(actualStart.x, actualStart.y, tailSize, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Draw Line
    ctx.beginPath();
    if(dash && dash.length > 0) {
      ctx.setLineDash(dash);
    } else {
      ctx.setLineDash([]);
    }
    ctx.moveTo(actualStart.x, actualStart.y);
    ctx.lineTo(actualEnd.x, actualEnd.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // Draw Head
    if(headSize > 0) {
      const angle = drawDiff.angle;
      // Tips of the arrow head
      const p = actualEnd.add(dir.scale(width));
      const arrowAngle = Math.PI / 7;

      ctx.beginPath();
      ctx.moveTo(p.x, p.y);

      // Vector pointing back from tip
      const vBack = dir.scale(-1);
      // Rotate +angle
      const vLeft = vBack.rotate(arrowAngle).scale(headSize).add(p);
      // Rotate -angle
      const vRight = vBack.rotate(-arrowAngle).scale(headSize).add(p);

      ctx.lineTo(vLeft.x, vLeft.y);
      ctx.lineTo(vRight.x, vRight.y);

      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  makeDraggable(el) {
    let isDragging = false;
    let startPos = new Vector2D(0, 0);
    let initialPos = new Vector2D(0, 0);

    el.addEventListener('mousedown', (e) => {
      isDragging = true;
      startPos = new Vector2D(e.clientX, e.clientY);

      const style = window.getComputedStyle(el);
      initialPos = new Vector2D(parseInt(style.left) || 0, parseInt(style
        .top) || 0);

      el.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if(!isDragging) return;
      const currentPos = new Vector2D(e.clientX, e.clientY);
      const delta = currentPos.sub(startPos);
      const newPos = initialPos.add(delta);

      el.style.left = `${newPos.x}px`;
      el.style.top = `${newPos.y}px`;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      el.style.cursor = 'move';
    });
  }

  draw() {
    if(!this.animating) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for(const conn of this.connections) {
      let b1 = this.getElementBox(conn.from);
      const b2 = this.getElementBox(conn.to);

      if(this.isVisible(b1) && this.isVisible(b2)) {
        let {
          p1,
          p2
        } = this.getNearestPoints(b1, b2);

        // Target may be obscured by organizer - try to find external point
        const organizerBox = this.getElementBox(this.organizer);

        if(organizerBox) {
          const externalResult = this.findExternalTargetPoint(b1, b2,
            organizerBox);
          if(externalResult) {
            p1 = externalResult.p1;
            p2 = externalResult.p2;
          }
        }

        this.drawArrow(this.ctx, p1, p2, conn.color, conn.arrow);
      }
    }

    requestAnimationFrame(this.draw);
  }
  static showHelp( config ){
    if (window.DoHelp)
      window.DoHelp();
    else if (typeof window.HelpOverlay === 'function' && config) {
      new window.HelpOverlay(config);
      window.DoHelp();
    }
    else alert('Help not configured');
  }

}

window.HelpOverlay = HelpOverlay;

// Auto-generated exports
export { HelpOverlay };
