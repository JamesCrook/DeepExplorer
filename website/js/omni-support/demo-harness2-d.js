import { sceneRegistry } from './sys.js';
import { Values } from './values.js';
import { autoFitCamera } from '../2d-support/make-camera.js';
import { hideTooltip, showTooltip } from '../2d-support/tooltip.js';
export { DemoHarness2D };

/* ═══════════════════════════════════════════════════════════════════════════
DemoHarness2D — owns a 2D canvas pane: drawing, hit-testing, pan/zoom,
and control-value routing.

Changes from original:
- Seeds this.params from paneConfig.controls on construction so that
 control values (regionSet, showGrid, screenMode …) reach draw2d params
 immediately, not just after user interaction.
- applyControl(id, val, getValues) merges into params and redraws,
 fixing the bug where HUD controls displayed but had no effect on 2D.
- Adds getWH() to ctxMix (pane dims + camera state) so ContentFrameNode's (frame-node)
 screenMode path works (it calls ctxMix.getWH(), distinct from getWH).
═══════════════════════════════════════════════════════════════════════════ */
class DemoHarness2D {
  constructor(canvas, paneConfig, app) {
    this.canvas = canvas;
    this.rawCtx = canvas.getContext('2d', { willReadFrequently: true });
    this.app = app;
    this.paneConfig = paneConfig;
    paneConfig.harness = this;

// Every 2D model provides a sceneRoot wrapped in a pane-camera node
    this.node = paneConfig.sceneRoot;

// ── Seed params from model controls so draw2d gets them on first frame ──
    this.params = {};
    if (paneConfig.controls) {
      for (const c of paneConfig.controls) {
        if (c.id && c.value !== undefined) this.params[c.id] = c.value;
      }
    }

    this.dragHit = null;
    this.selectedHit = null;   // an opaque handle: only ever called, never inspected
    this.hoveredHit = null;

// Pan state
    this.isPanning = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this._resize();
    autoFitCamera(this.node, this.W, this.H);
    this._listen();
    this.draw();
    new ResizeObserver(() => { this._resize(); this.draw(); }).observe(canvas);
  }

/* ── control routing (called by App.handleHudChange) ───────────── */

  applyControl(id, val, getValues) {
    this.params[id] = val;
    if (this.paneConfig.onControl) {
      this.paneConfig.onControl(id, val, getValues, this.app);
    }
    this.draw();
  }

/* ── camera accessors ──────────────────────────────────────────── */

  get cam() { return (this.paneConfig.cameraNode || this.node).value; }

  _screenToWorldXXX(sx, sy) {
    const v = this.cam, z = v.zoom || 1;
    const cx = v.centerOrigin ? this.W / 2 : 0;
    const cy = v.centerOrigin ? this.H / 2 : 0;
    return { x: (sx - cx) / z + (v.scrollX || 0), y: (sy - cy) / z + (v.scrollY || 0) };
  }

/* ── sizing ────────────────────────────────────────────────────── */

  _resize() {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.W = rect.width;
    this.H = rect.height;
    if (this.W === 0 || this.H === 0) return;
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
  }

/* ── ctxMix factory ────────────────────────────────────────────── */

  _ctxMix(hpScreen) {
    const cam = this.cam;
    return {
  // The value channel, taken whole.  A node that wants to rewrite what its
  // subtree reads overrides getValue here; nothing redefines it from scratch.
      ...Values,

      ctx: this.rawCtx,
      iterators: [],
      state: { index: 0, pass: 0, isHovered: false, isSelected: false },

  // Stable pane + camera info (never overwritten) — used by ContentFrameNode (frame-node) screenMode
      getWH: () => ({
        W: this.W, H: this.H,
        Z: cam.zoom || 1,
        ox: cam.scrollX || 0,
        oy: cam.scrollY || 0,
      }),

      viewport: {
        x: cam.scrollX || 0, y: cam.scrollY || 0,
        w: this.W / (cam.zoom || 1), h: this.H / (cam.zoom || 1),
      },
      W: this.W,
      H: this.H,
      hitPoint: hpScreen || null,
      hitResult: null,
    };
  }

/* ── drawing ───────────────────────────────────────────────────── */

  draw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this.drawInRaf(); });
  }

  drawInRaf() {
    if (!this.W || !this.H) return;

// 1. Clear physical canvas
    this.rawCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.rawCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

// 2. Apply DPR base — PaneCameraNode multiplies zoom/scroll on top
    this.rawCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    /* Selection and hover live with the items themselves, reached through
       setValue, so nothing about them travels in params. */
    const ctxMix = this._ctxMix();
    sceneRegistry.walkPhase(ctxMix, 'layout', this.node, this.params);
    sceneRegistry.walkPhase(ctxMix, 'draw2d', this.node, this.params);
  }

/* ── hit-testing ───────────────────────────────────────────────── */

  hitTest(screenX, screenY) {
    const c = this._ctxMix({ x: screenX, y: screenY });
    sceneRegistry.walkPhase(c, 'hit_test', this.node, this.params);
    return c.hitResult;
  }

/* ── input listeners ───────────────────────────────────────────── */

  _listen() {
    const toL = e => {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, ex: e.clientX, ey: e.clientY };
    };

// --- ZOOM ---
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const { x, y } = toL(e);
      const stripH = this.paneConfig.stockStripHeight || 0;
      if (stripH > 0 && y > this.H - stripH) return;
      const cam = this.cam;
      const oldZ = cam.zoom || 1;
      const newZ = Math.max(0.1, Math.min(10.0, oldZ * (e.deltaY > 0 ? 0.9 : 1.1)));
      const cx = cam.centerOrigin ? this.W / 2 : 0;
      const cy = cam.centerOrigin ? this.H / 2 : 0;
      cam.scrollX = (cam.scrollX || 0) + (x - cx) * (1 / oldZ - 1 / newZ);
      cam.scrollY = (cam.scrollY || 0) + (y - cy) * (1 / oldZ - 1 / newZ);
      cam.zoom = newZ;
      this.draw();
    }, { passive: false });

// --- MOUSE DOWN ---
    this.canvas.addEventListener('mousedown', e => {
      const { x, y, ex, ey } = toL(e);
      const stripH = this.paneConfig.stockStripHeight || 0;
      const overStrip = stripH > 0 && y > this.H - stripH;
      const hit = this.hitTest(x, y);

      // A node that can be dragged is selected singly; one that cannot —
      // a zone, a ring, a key — toggles, so a set can be built up.
      const access = hit ? Values.access(this._ctxMix(), hit, this.params) : null;

      /* Something draggable is selected singly; something only selectable —
         a ring, a key, a band — toggles, so a set can be built up. */
      const additive = e.shiftKey || e.metaKey || e.ctrlKey || (access && !access.draggable);

      if (!access) this.clearSelection();
      else if (!additive) { this.clearSelection(); access.setValue({ selected: true }); }
      else access.setValue({ selected: !access.getValue()?.selected });

      this.selectedHit = access?.getValue()?.selected ? hit : null;
      this.dragHit = hit;
      if (this.app?.selectNode) this.app.selectNode(this.selectedHit, this);

      if (!hit?.node && !overStrip) {
        this.isPanning = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
      }
      this.draw();
    });

// Selection lives with the items, so clearing it is a walk, not a set to empty.
    this.clearSelection = () => {
      const mix = this._ctxMix();
      sceneRegistry.walkPhase(mix, 'clear_selection', this.node, this.params);
      if (this.selectedHit) Values.access(mix, this.selectedHit, this.params).setValue({ selected: false });
      this.selectedHit = null;
    };

// --- MOUSE MOVE ---
    this.canvas.addEventListener('mousemove', e => {
      if (this.isPanning) {
        const cam = this.cam, z = cam.zoom || 1;
        cam.scrollX = (cam.scrollX || 0) - (e.clientX - this.lastMouseX) / z;
        cam.scrollY = (cam.scrollY || 0) - (e.clientY - this.lastMouseY) / z;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.draw();
        if (typeof hideTooltip !== 'undefined') hideTooltip();
        return;
      }

      const { x, y, ex, ey } = toL(e);

      if (this.dragHit) {
        if (this.dragHit.interactions?.applyDrag) {
      // Pass screen-local coords; PaneCameraNode's wrap converts
      // to the correct world space for whatever camera nesting exists.
          this.dragHit.interactions.applyDrag(x, y);
          this.draw();
        }
        return;
      }      

      const hit = this.hitTest(x, y);

      const mixNow = this._ctxMix();
      const prev = this.hoveredHit;
      if (prev && prev !== hit) Values.access(mixNow, prev, this.params).setValue({ hovered: false });

      const access = hit ? Values.access(mixNow, hit, this.params) : null;
      let changed = (prev == null) !== (hit == null);
      if (access) changed = access.setValue({ hovered: true }) || changed;
      this.hoveredHit = hit;
      if (changed) this.draw();

      const tip = access?.getTooltip();
      if (tip) showTooltip?.(ex, ey, { ...tip, selected: !!access.getValue()?.selected });
      else hideTooltip?.();

      this.canvas.style.cursor = access ? (access.draggable ? 'grab' : 'pointer') : 'default';
    });

// --- MOUSE UP ---

    this.canvas.addEventListener('mouseup', (e) => {
      if (this.dragHit) {
        if (this.dragHit.interactions?.endDrag) {
      // Detect if dropped over the stock-strip area
          const { y } = toL(e);
          const stripH = this.paneConfig.stockStripHeight || 0;
          const onStrip = stripH > 0 && y > this.H - stripH;
          this.dragHit.interactions.endDrag(onStrip);
        }
        this.dragHit = null;
        this.draw();
      }
      if (this.isPanning) {
        this.isPanning = false;
        this.canvas.style.cursor = this.hoveredHit ? 'pointer' : 'default';
      }
    });


// --- MOUSE LEAVE ---
    this.canvas.addEventListener('mouseleave', () => {
      if (this.hoveredHit) {
        Values.access(this._ctxMix(), this.hoveredHit, this.params).setValue({ hovered: false });
        this.hoveredHit = null;
        this.draw();
      }
      hideTooltip?.();
      if (this.dragHit) {
        if (this.dragHit.interactions?.endDrag) this.dragHit.interactions.endDrag(false);
        this.dragHit = null;
        this.draw();
      }
      this.isPanning = false;
      this.canvas.style.cursor = 'default';
    });
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
DemoHarness3D — owns a 3D pane: init / re-attach, per-frame render,
resize, and control routing.

Extracted from the 3D branches previously scattered across
App.buildLayout, App.resize, and App.animate.
═══════════════════════════════════════════════════════════════════════════ */
