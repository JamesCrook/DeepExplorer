/**
 * omni-2d.js — 2D canvas display backend for OmniScene
 *
 * Manages the <canvas> element: rendering via sceneRegistry draw2d phase,
 * pointer events (hit-test, drag, pan, zoom), and DPR-aware resize.
 *
 * Place in: omni-support/omni-2d.js
 */

import { sceneRegistry } from './scene.js';


class Omni2d {

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement}       container — chart-container (for sizing)
   * @param {Object}            app      — OmniSceneApp instance
   */
  constructor(canvas, container, app) {
    this.el        = canvas;
    this.container = container;
    this.app       = app;
    this.ctx       = canvas.getContext('2d');

    this._dragging     = null;
    this._activeCursor = null;
    this._renderPending = false;

    this._setupPointerEvents();
  }

  // ── Lifecycle ─────────────────────────────────────────────

  activate() {
    this.el.style.display = '';
    this.resize();
  }

  deactivate() {
    this.el.style.display = 'none';
    this._dragging = null;
  }

  // ── Render ────────────────────────────────────────────────

  render() {
    if (!this.app.root) return;
    const phases = this.app.currentScene?.phases || ['draw2d'];

    // Build highlighted set from app's selection buffer
    const highlighted = new Set();
    for (const entry of (this.app._selectionBuffer || [])) {
      if (entry.node) highlighted.add(entry.node);
      if (entry.item && entry.item !== entry.node) {
        this._collectHighlighted(entry.item, highlighted);
      }
    }

    const ctxMix = {
      ctx:          this.ctx,
      iterators:    [],
      flyweight:    {},
      activeCursor: this._activeCursor,
      layout:       { x: 0, y: 0 },
      highlighted,
    };
    sceneRegistry.runPhases(ctxMix, this.app.root, {}, phases);

    // Draw-mode preview overlay (dotted rect, etc.)
    if (this.app._drawOverlay) this.app._drawOverlay(this.ctx);
  }

  // ── Resize ────────────────────────────────────────────────

  resize() {
    const c = this.el.parentElement;
    if (!c) return;
    const r   = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W   = Math.floor(r.width);
    const H   = Math.floor(r.height);
    if (W < 1 || H < 1) return;

    this.el.width  = W * dpr;
    this.el.height = H * dpr;
    this.el.style.width  = W + 'px';
    this.el.style.height = H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Pointer events ────────────────────────────────────────

  _setupPointerEvents() {
    const el  = this.el;
    const app = this.app;

    // ── Wheel zoom (cursor-anchored for nm-space layers) ──
    el.addEventListener('wheel', (e) => {
      e.preventDefault();

      // If the selected layer uses nm coordinates, zoom it;
      // otherwise zoom the scene layer.
      const selP = app.selectedLayer?.value?.params;
      const isNm = selP && 'vx' in selP;
      const sp   = isNm ? selP : app.sceneLayer?.value?.params;
      if (!sp) return;

      const oldZoom = sp.zoom || 1;
      const factor  = e.deltaY > 0 ? 0.95 : 1.05;
      const newZoom = Math.max(0.05, Math.min(100, oldZoom * factor));

      if (isNm) {
        // Cursor-anchored: keep the world point under the
        // cursor fixed while zoom changes.
        const br   = el.getBoundingClientRect();
        const sx   = e.clientX - br.left;
        const sy   = e.clientY - br.top;
        const nmPx = sp.nmPx || 10;
        const dpr  = window.devicePixelRatio || 1;
        const W    = el.width / dpr;
        const H    = el.height / dpr;

        const sc  = oldZoom / nmPx;
        const wx  = sp.vx + (sx - W / 2) / sc;
        const wy  = sp.vy - (sy - H / 2) / sc;

        const nsc = newZoom / nmPx;
        sp.vx = wx - (sx - W / 2) / nsc;
        sp.vy = wy + (sy - H / 2) / nsc;
      }

      sp.zoom = newZoom;
      app.controls.updateSliderDOM('zoom', sp.zoom);
      app.render();
    }, { passive: false });

    // ── Pointer down — hit-test or start pan ──
    el.addEventListener('pointerdown', (e) => {
      const br = el.getBoundingClientRect();
      const x  = e.clientX - br.left;
      const y  = e.clientY - br.top;

      const ctxMix = {
        ctx: this.ctx, hitPoint: { x, y },
        hitResult: null, iterators: [], flyweight: {},
      };
      sceneRegistry.runPhases(ctxMix, app.root, {}, ['hit_test']);

      // ── Draw-mode intercept ──
      // app._drawMode can inspect the hit result and the event,
      // and return drag interactions if it wants to handle this.
      if (app._drawMode) {
        const dmResult = app._drawMode.onDown(x, y, e, ctxMix.hitResult);
        if (dmResult) {
          this._dragging = { type: 'point', interactions: dmResult };
          el.setPointerCapture(e.pointerId);
          app.render();
          return;
        }
      }

      // ── Notify app for selection buffer ──
      if (ctxMix.hitResult) {
        app._onSelect?.(ctxMix.hitResult.node);
      } else {
        app._onSelect?.(null);
      }

      if (ctxMix.hitResult?.cursor) {
        this._activeCursor = ctxMix.hitResult.cursor;
        ctxMix.hitResult.interactions?.applySelect?.(ctxMix.hitResult.cursor);
      }

      if (ctxMix.hitResult?.interactions?.applyDrag) {
        this._dragging = { type: 'point', interactions: ctxMix.hitResult.interactions,}
//          startX: e.clientX, startY: e.clientY, };
        ctxMix.hitResult.interactions.applyDrag(x, y);
      } else {
        const sp = app.sceneLayer?.value?.params;
        if (sp) {
          this._dragging = {
            type: 'pan',
            startX: e.clientX, startY: e.clientY,
            startPanX: sp.panX || 0, startPanY: sp.panY || 0,
          };
        }
      }
      el.setPointerCapture(e.pointerId);
    });

    // ── Pointer move ──
    // State is updated on every event (so delta accumulation
    // stays precise), but rendering is coalesced to one per
    // display frame.  This prevents high-polling-rate mice
    // (250–1000 Hz) from queuing synchronous renders faster
    // than the display can refresh.
    el.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      if (e.buttons === 0) { this._dragging = null; return; }

      if (this._dragging.type === 'point') {
        const br = el.getBoundingClientRect();
        this._dragging.interactions.applyDrag(e.clientX - br.left, e.clientY - br.top);
      } else {
        // ── Pan ──
        const selP = app.selectedLayer?.value?.params;
        const isNm = selP && 'vx' in selP;
        const sp   = isNm ? selP : app.sceneLayer?.value?.params;

        if (sp && isNm) {
          // nm-space: incremental vx/vy adjustment
          const sc = (sp.zoom || 1) / (sp.nmPx || 10);
          sp.vx -= (e.clientX - this._dragging.startX) / sc;
          sp.vy += (e.clientY - this._dragging.startY) / sc;
          this._dragging.startX = e.clientX;
          this._dragging.startY = e.clientY;
        } else if (sp) {
          // screen-space: absolute panX/panY
          sp.panX = this._dragging.startPanX + (e.clientX - this._dragging.startX);
          sp.panY = this._dragging.startPanY + (e.clientY - this._dragging.startY);
        }
      }

      // Coalesce: schedule one render per display frame
      if (!this._renderPending) {
        this._renderPending = true;
        requestAnimationFrame(() => {
          this._renderPending = false;
          app.render();
        });
      }
    });

    // ── Pointer up / leave ──
    const end = () => {
      if (this._dragging?.interactions?.applyRelease) {
        this._dragging.interactions.applyRelease();
      }
      this._dragging = null;
    };
    el.addEventListener('pointerup',    end);
    el.addEventListener('pointerleave', end);

    // ── Escape cancels draw mode ──
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && app._drawMode) {
        app._drawMode.cancel();
        this._dragging = null;
        app.render();
      }
    });
  }

  /** Recursively add all descendant nodes to the highlighted set. */
  _collectHighlighted(node, set) {
    set.add(node);
    for (const child of (node.subtree || [])) {
      this._collectHighlighted(child, set);
    }
  }
}


export { Omni2d };