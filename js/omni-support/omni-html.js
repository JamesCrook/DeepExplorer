/**
 * omni-html.js — HTML DOM display backend for OmniScene
 *
 * Manages a retained-mode DOM tree: builds HTML elements from the
 * scene AST, updates them when params change, and tears down on
 * scene switch.
 *
 * Phases (registered on node classes via sceneRegistry):
 *
 *   build     — Create DOM elements, append to ctxMix.parentEl,
 *               attach event listeners.  Run once on activate().
 *
 *   update    — Apply current params to existing DOM elements
 *               (CSS properties, classes, text, visibility).
 *               Run on every render() call.
 *
 *   resize    — React to container size changes that CSS alone
 *               can't handle (breakpoints, computed card counts).
 *               Run on resize events.
 *
 *   teardown  — Remove DOM elements, detach event listeners,
 *               release references.  Run on deactivate().
 *
 * The browser handles layout (flex/grid/flow) and hit-testing
 * (native pointer events) — no measure, layout, draw2d, or
 * hit_test phases are needed.
 *
 * ctxMix shape:
 *   {
 *     parentEl,    // current DOM parent — container nodes set this
 *                  //   in before_build so children append correctly
 *     rootEl,      // the viewport div (stable reference)
 *     container,   // outer chart-container (for resize measurements)
 *     app,         // OmniSceneApp instance
 *     iterators,   // standard walk machinery (managed by runPhases)
 *     flyweight,   // standard walk scratch space
 *   }
 *
 * Node handlers follow the same conventions as 2D/3D:
 *
 *   // Static method on a node class:
 *   static build(ctxMix, node, params) {
 *     const el = document.createElement('div');
 *     // … configure el …
 *     node.inst = { el };
 *     ctxMix.parentEl.appendChild(el);
 *   }
 *
 *   // Container node — set parentEl for children:
 *   static before_build(ctxMix, node, params) {
 *     const el = document.createElement('div');
 *     el.style.display = 'flex';
 *     node.inst = { el };
 *     ctxMix.parentEl.appendChild(el);
 *     ctxMix._parentStack.push(ctxMix.parentEl);
 *     ctxMix.parentEl = el;
 *   }
 *   static after_build(ctxMix, node, params) {
 *     ctxMix.parentEl = ctxMix._parentStack.pop();
 *   }
 *
 * Place in: omni-support/omni-html.js
 */

import { sceneRegistry } from './scene.js';


class OmniHtml {

  /**
   * @param {HTMLElement} viewport  — div where HTML content is mounted
   * @param {HTMLElement} container — outer chart-container (resize target)
   * @param {Object}      app      — OmniSceneApp instance
   */
  constructor(viewport, container, app) {
    this.viewport  = viewport;
    this.container = container;
    this.app       = app;

    this._ctxMix         = null;
    this._built          = false;
    this._resizeObserver = null;
  }

  // ══════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ══════════════════════════════════════════════════════════

  /**
   * Build the DOM tree from the current sceneLayer.
   * Idempotent — tears down any previous content first.
   */
  activate() {
    this._cleanup();

    this.viewport.style.display = '';

    // ── Build ────────────────────────────────────────────
    this._ctxMix = this._makeCtxMix();

    const sceneLayer = this.app.sceneLayer;
    sceneRegistry.runPhases(this._ctxMix, sceneLayer, {}, ['buildDom']);
    this._built = true;

    // ── Observe resize ───────────────────────────────────
    this._setupResize();

    // ── Initial update with current params ───────────────
    this.render(sceneLayer.value.params);
  }

  /** Tear down DOM content and hide the viewport. */
  deactivate() {
    this._cleanup();
    this.viewport.style.display = 'none';
  }

  // ══════════════════════════════════════════════════════════
  //  RENDER / UPDATE
  // ══════════════════════════════════════════════════════════

  /**
   * Run the update phase so HTML nodes pick up new param values.
   * Called on every slider change / preset morph frame.
   */
  render(params) {
    if (!this._built) return;
    const sceneLayer = this.app.sceneLayer;
    if (!sceneLayer) return;

    // Reset parentEl to root for the walk (update may need it
    // if nodes access ctxMix.parentEl for measurements)
    this._ctxMix.parentEl    = this.viewport;
    this._ctxMix._parentStack = [];

    sceneRegistry.runPhases(
      this._ctxMix, sceneLayer, params || {}, ['update'],
    );
  }

  /** Handle container resize. */
  resize() {
    if (!this._built) return;
    const sceneLayer = this.app.sceneLayer;
    if (!sceneLayer) return;

    this._ctxMix.parentEl    = this.viewport;
    this._ctxMix._parentStack = [];

    sceneRegistry.runPhases(
      this._ctxMix, sceneLayer,
      sceneLayer.value?.params || {},
      ['resize'],
    );
  }

  // ══════════════════════════════════════════════════════════
  //  ACCESSORS
  // ══════════════════════════════════════════════════════════

  /** The root DOM element that holds all scene content. */
  get rootEl() {
    return this.viewport;
  }

  // ══════════════════════════════════════════════════════════
  //  INTERNALS
  // ══════════════════════════════════════════════════════════

  /** Create a fresh ctxMix for phase walks. */
  _makeCtxMix() {
    return {
      parentEl:     this.viewport,
      rootEl:       this.viewport,
      container:    this.container,
      app:          this.app,
      iterators:    [],
      flyweight:    {},
      _parentStack: [],   // for container nodes to push/pop parentEl
    };
  }

  // ── Resize observer ───────────────────────────────────────

  _setupResize() {
    this._resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this._resizeObserver.observe(this.container);
  }

  // ── Cleanup ───────────────────────────────────────────────

  _cleanup() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (this._built && this.app.sceneLayer) {
      // Run teardown phase so nodes can detach listeners / release refs
      const ctx = this._ctxMix || this._makeCtxMix();
      ctx.parentEl     = this.viewport;
      ctx._parentStack = [];
      sceneRegistry.runPhases(ctx, this.app.sceneLayer, {}, ['teardown']);
    }

    // Clear any remaining DOM children (belt-and-suspenders)
    while (this.viewport.firstChild) {
      this.viewport.removeChild(this.viewport.firstChild);
    }

    this._ctxMix = null;
    this._built  = false;
  }
}


export { OmniHtml };