/* ============================================
   OmniControlPanel - Generic Control Panel Framework
   ============================================
   
   Handles:
   - Layout management (portrait/landscape switching)
   - Building controls from config (sliders, presets, selects, buttons, dynamic containers)
   - Animating between presets (via OmniParamEngine)
   - Tabbed scroll navigation (multiscroller)
   - Optional pan/zoom on container (for 2D SVG)
   - Legend toggle
   - Context switching (setContext) for multi-layer / multi-scene apps
   - Layers panel and add bar
   
   Usage (constructor — standalone, e.g. Molam):

     const base = new OmniControlPanel({
       elements: { container, controls, multiscroller },
       sliderConfig: [...],
       presets: { 'Name': { param: value, ... }, ... },
       defaultPreset: 'Name',
       onRender: (params, panZoom, instance) => { ... },
     });

   Usage (setContext — dynamic rebuild, e.g. OmniScene):

     const base = new OmniControlPanel({
       elements: { container, controls, multiscroller },
       sliderConfig: [],
       presets: {},
       enablePanZoom: false,
       onRender: () => myRender(),
       onResize: () => myResize(),
     });

     // Later, when scene/layer changes:
     base.setContext({
       sliderConfig: [
         { group: 'View', sliders: [...], _params: layerParams },
         { type: 'presets', presets: layerPresets, _params: layerParams },
         { type: 'layers', layers: [...], selectedLayer, onSelect, onToggleVisibility },
         { type: 'addbar', items: [...], onAdd },
       ],
     });
*/

import { OmniParamEngine } from './omni-param-engine.js';
import { mixinPatchbay } from './omni-controls-patchbay.js';
import { Vector2D } from '../2d-support/vector2d.js';
import {
  mountWidgets, stripConfigs, createWidget, WidgetContext,
  formatValue, isHexColor, parseHexColor, formatHexColor, lerpColor,
} from './omni-widget.js';
import './layers-widget.js'
import './topics-widget.js'

// ============================================================
// Spec support — constants for the JSON control-spec compiler
// ============================================================

/**
 * Named formatters a JSON spec may reference by string.
 *
 * `format` already accepts either a string or a function. JSON cannot carry
 * a function, so a spec names one instead: `"format": "percent"`.
 *
 * Names listed here resolve to a function. Anything else passes straight
 * through to omni-widget's formatValue, which means a spec can already use
 * every name formatValue knows — 'degRad', 'deg', 'int', 'degInt' — with no
 * entry here. This table therefore only carries what formatValue lacks.
 * Do not add aliases for its names: 'degrees' next to 'degInt' is drift.
 */
const SPEC_FORMATS = {
  percent: v => Math.round(v) + '%',
  pixels:  v => Math.round(v) + 'px',
  scale:   v => (+v).toFixed(2) + '×',
};

class OmniControlPanel {
  constructor(config) {
    this.elements = config.elements;
    this.sliderConfig = config.sliderConfig;
    this.presets = config.presets || {};
    this.defaultPreset = config.defaultPreset;
    this.onRender = config.onRender;
    this.onParamChange = config.onParamChange || (() => {});
    this.onLegendToggle = config.onLegendToggle || (() => {});
    this.onResize = config.onResize || (() => {});
    this.hintHtml = config.hintHtml || '';
    this.enablePanZoom = config.enablePanZoom !== false;
    this.onTopicSelect = config.onTopicSelect || (() => {});
    // When false, the panel stops driving <body> layout classes and container
    // aspect ratio off the window. Embedded hosts (a chat column, a card) own
    // their own layout; onResize still fires so the backend can resize.
    this.manageLayout = config.manageLayout !== false;
    
    // Layout constants
    this.ASPECT_RATIO = config.aspectRatio || (800 / 650);
    this.MAX_ASPECT_RATIO = config.maxAspectRatio || null;
    this.CONTROLS_WIDTH = 320;
    this.HEADER_HEIGHT = 30;
    this.MIN_CONTROLS_HEIGHT = 210;
    this.PADDING = 20;
    
    // Pan/zoom state (not a "param" — kept separate)
    this.panZoom = { panX: 0, panY: 0 };
    this.showLegend = true;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.panStart = { panX: 0, panY: 0 };
    this.clickedSectionId = null;
    
    // Store references to dynamic elements
    this.dynamicContainers = {};
    this.statusEl = null;
    this.infoEl = null;

    // Morph animation state
    this._morphAnim = null;
    
    // ── OmniParamEngine replaces manual param/preset/morph logic ──
    this.engine = new OmniParamEngine({
      params:   this._buildInitialParams(),
      presets:  this.presets,
      onUpdate: (params) => {
        this._syncSlidersToParams(params);
        this.render();
      },
      morphDuration: config.morphDuration ?? 600,
    });

    // Convenience alias — existing code reads `base.params` directly
    // in onRender callbacks, so expose the engine's live object.
    this.params = this.engine.params;
    
    // Build UI
    this._buildMultiscroller();
    this._rebuildSubmenus();
    this._buildControls();
    this._setupScrollTracking();
    if (this.enablePanZoom) {
      this._setupPanZoom();
    }
    this._setupLegendToggle();
    this._setupLayout();
    
    // Apply default preset (instant — no animation)
    if (this.defaultPreset && this.presets[this.defaultPreset]) {
      this.engine.setPreset(this.defaultPreset, false);
      this._setActivePreset(this.defaultPreset);
    }
    
    this._updateActiveStripButton(stripConfigs(this.sliderConfig)[0]?.id);
    
    // Initial render
    this.render();
    
    // Expose globally for tools like patchbay-boot.js
    if (typeof window !== 'undefined') {
      window.OmniControlPanel = this;
    }

    requestAnimationFrame(() => this._updateMultiscrollerNames());
  }
  
  // ============================================================
  // Public API
  // ============================================================
  
  render() {
    if (this.onRender) {
      this.onRender(this.params, this.panZoom, this);
    }
  }
  
  setPreset(name, animate = true) {
    if (!this.presets[name]) return;
    
    if (animate) {
      // Engine handles animation; onUpdate syncs DOM each frame.
      // Mark the active preset when the morph completes.
      const origOnUpdate = this.engine.onUpdate;
      this.engine.onUpdate = (params) => {
        origOnUpdate(params);
        // Check if morph finished (engine sets activePreset on completion)
        if (this.engine.activePreset === name) {
          this._setActivePreset(name);
          this.engine.onUpdate = origOnUpdate;  // restore
        }
      };
      this.engine.setPreset(name, true);
    } else {
      this.engine.setPreset(name, false);
      this._setActivePreset(name);
    }
  }
  
  updateSlider(id, value, render = true) {
    this.engine.setParam(id, value, false);  // no auto-render
    
    const input = document.getElementById(id);
    const valEl = document.getElementById(`${id}-val`);
    const slider = this._findSlider(id);
    
    if (input) input.value = value;
    if (valEl && slider) valEl.textContent = formatValue(value, slider.format);
    
    if (render) this.render();
  }

  /** Update slider DOM only — no engine write. Use when params are
   *  externally owned (e.g. pointer-driven zoom on a layer). */
  updateSliderDOM(id, value) {
    const input = document.getElementById(id);
    const valEl = document.getElementById(`${id}-val`);
    const slider = this._findSlider(id);
    if (input) input.value = value;
    if (valEl) valEl.textContent = formatValue(value, slider?.format);
  }
  
  updateSliders(updates, render = true) {
    for (const [id, value] of Object.entries(updates)) {
      if (id in this.params) {
        this.engine.setParam(id, value, false);
      }
      
      const input = document.getElementById(id);
      const valEl = document.getElementById(`${id}-val`);
      const slider = this._findSlider(id);
      
      if (input) input.value = value;
      if (valEl && slider) valEl.textContent = formatValue(value, slider.format);
    }
    
    if (render) this.render();
  }
  
  getParams() {
    return this.engine.getParams();
  }
  
  setParam(id, value) {
    this.engine.setParam(id, value, false);
  }
  
  getPanZoom() {
    return { ...this.panZoom };
  }
  
  resetPanZoom() {
    this.panZoom = { panX: 0, panY: 0 };
    this.render();
  }
  
  setStatus(message, isError = false) {
    if (this.statusEl) {
      this.statusEl.textContent = message;
      this.statusEl.classList.toggle('error', isError);
    }
  }
  
  clearStatus() {
    if (this.statusEl) {
      this.statusEl.textContent = '';
      this.statusEl.classList.remove('error');
    }
  }
  
  setInfo(html) {
    if (this.infoEl) {
      this.infoEl.innerHTML = html;
      this.infoEl.classList.add('visible');
    }
  }
  
  clearInfo() {
    if (this.infoEl) {
      this.infoEl.innerHTML = '';
      this.infoEl.classList.remove('visible');
    }
  }
  
  getDynamicContainer(id) {
    return this.dynamicContainers[id];
  }
  
  setControlEnabled(id, enabled) {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  }
  
  setSelectValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }
  
  downloadState(filename = 'state.json', extraState = {}) {
    const state = {
      params: this.getParams(),
      ...extraState
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  uploadState(onStateLoaded) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const state = JSON.parse(event.target.result);
          if (state.params) {
            this.updateSliders(state.params, false);
          }
          if (onStateLoaded) {
            onStateLoaded(state);
          }
          this.render();
        } catch (err) {
          console.error("Failed to parse state JSON:", err);
          this.setStatus("Error loading state file", true);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ============================================================
  // Spec API — build a context from a plain JSON control spec
  // ============================================================

  /*
     A spec is pure JSON: no functions, no closures, so it can travel inside
     a markdown code island. It compiles to the same sliderConfig array that
     setContext already accepts — this is a new entry point, not a new
     rendering path, so every widget the panel can already build is reachable.

     {
       "scene": "heatmap",
       "sections": [
         { "group": "Heatmap", "id": "heat", "abbrev": "Heat", "sliders": [
             { "id": "blur", "label": "Blur radius",
               "min": 0, "max": 60, "step": 1, "default": 18 },
             { "id": "opacity", "label": "Opacity", "min": 0, "max": 100,
               "step": 1, "default": 70, "format": "percent" },
             { "id": "sparkleStyle", "label": "Style", "type": "button-row",
               "default": "dot", "options": [ { "value": "dot", "label": "•" } ] }
         ]},
         { "group": "Colormap", "abbrev": "Cmap", "type": "select",
           "bind": "cmap",
           "options": [ { "value": "inferno", "label": "Inferno" } ] },
         { "group": "Explore", "abbrev": "Exp", "type": "topics",
           "topics": [ { "id": "bmesh", "label": "BMesh", "icon": "B" } ] }
       ],
       "presets": { "Default": { "blur": 18, "opacity": 70 } }
     }

     Two things in a live scene resist JSON, and each has a declarative form:

       format: v => Math.round(v) + '%'   ->  "format": "percent"  (or "suffix": "%")
       onChange: closure writing params   ->  "bind": "<paramId>"  on a select
  */

  /** Validate a spec. Returns an array of human-readable problems ([] if fine). */
  static validateSpec(spec) {
    const errs = [];
    if (!spec || typeof spec !== 'object') {
      errs.push('spec is not an object');
      return errs;
    }
    if (!Array.isArray(spec.sections)) {
      errs.push('spec.sections must be an array');
      return errs;
    }
    const seen = new Set();
    spec.sections.forEach((sec, i) => {
      const where = `sections[${i}]`;
      if (!sec || typeof sec !== 'object') { errs.push(`${where} is not an object`); return; }
      if (!sec.group) errs.push(`${where} has no group`);

      if (sec.type === 'select') {
        if (!sec.bind) errs.push(`${where} (select) needs "bind"`);
        if (!Array.isArray(sec.options) || !sec.options.length) {
          errs.push(`${where} (select) needs a non-empty options array`);
        }
        return;
      }
      if (sec.type === 'topics') {
        if (!Array.isArray(sec.topics) || !sec.topics.length) {
          errs.push(`${where} (topics) needs a non-empty topics array`);
        }
        return;
      }
      if (sec.sliders === undefined) return;
      if (!Array.isArray(sec.sliders)) { errs.push(`${where}.sliders must be an array`); return; }

      sec.sliders.forEach((s, j) => {
        const w = `${where}.sliders[${j}]`;
        if (!s || !s.id) { errs.push(`${w} has no id`); return; }
        if (seen.has(s.id)) errs.push(`${w} duplicate slider id "${s.id}"`);
        seen.add(s.id);
        if (s.type === 'button-row') {
          if (!Array.isArray(s.options) || !s.options.length) {
            errs.push(`${w} (button-row) needs a non-empty options array`);
          }
        } else if (s.type !== 'color' && !s.isData) {
          if (typeof s.min !== 'number' || typeof s.max !== 'number') {
            errs.push(`${w} needs numeric min and max`);
          } else if (s.min >= s.max) {
            errs.push(`${w} min must be less than max`);
          }
        }
        if (s.default === undefined && !s.isData) errs.push(`${w} has no default`);
      });
    });
    if (spec.presets !== undefined &&
        (typeof spec.presets !== 'object' || spec.presets === null || Array.isArray(spec.presets))) {
      errs.push('spec.presets must be an object');
    }
    return errs;
  }

  /** Pull the first ```json fenced block out of a markdown string. Throws on bad JSON. */
  static extractSpec(md) {
    const m = String(md).match(/```[ \t]*json[ \t]*\r?\n([\s\S]*?)```/i);
    return m ? JSON.parse(m[1]) : null;
  }

  /** Build a { id: default } params object from a spec. */
  static paramsFromSpec(spec) {
    const params = {};
    for (const sec of (spec.sections || [])) {
      if (sec.type === 'select' && sec.bind) {
        params[sec.bind] = sec.default !== undefined
          ? sec.default
          : sec.options?.[0]?.value;
        continue;
      }
      for (const s of (sec.sliders || [])) {
        if (s.isData) continue;
        params[s.id] = s.default;
      }
    }
    return params;
  }

  /** Resolve a spec slider's `format` / `suffix` into what formatValue wants. */
  static _formatterFor(s) {
    if (typeof s.format === 'function') return s.format;          // already live
    if (typeof s.format === 'string') return SPEC_FORMATS[s.format] || s.format;
    if (s.suffix) {
      const suffix = s.suffix;
      const dp = typeof s.decimals === 'number' ? s.decimals : null;
      return (v) => (dp === null ? String(+(+v).toFixed(4)) : (+v).toFixed(dp)) + suffix;
    }
    return undefined;
  }

  /**
   * Compile a JSON spec into a sliderConfig array that setContext accepts.
   *
   * @param {Object} spec    — the JSON control spec
   * @param {Object} params  — the object sliders read and write. Every section
   *                           is bound to it via _params, so the caller (a
   *                           layer, a scene) keeps ownership of its own state.
   * @returns {Array} sliderConfig
   */
  compileSpec(spec, params) {
    const out = [];

    (spec.sections || []).forEach((sec, i) => {
      const id = sec.id
        || (sec.group || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        || `section-${i}`;
      const base = { group: sec.group, id, abbrev: sec.abbrev, _params: params };

      // Declarative param-select: replaces the captured onChange closure.
      if (sec.type === 'select') {
        out.push({
          ...base,
          type: 'select',
          selectId: sec.selectId || `${id}-sel`,
          options: (sec.options || []).map(o => ({
            ...o, selected: o.value === params[sec.bind],
          })),
          onChange: (val, controls) => {
            params[sec.bind] = val;
            this.onParamChange(sec.bind, val, controls);
            (controls || this).render();
          },
        });
        return;
      }

      // Topic links are a registered widget type (topics-widget.js), so the
      // spec passes straight through. Routing stays here: the widget reports
      // the click, the panel decides it means "announce a topic selection".
      if (sec.type === 'topics') {
        out.push({
          ...base,
          type: 'topics',
          topics: sec.topics || [],
          onSelect: (topic) => this._emitTopicSelect(topic),
        });
        return;
      }

      if (sec.sliders) {
        out.push({
          ...base,
          sliders: sec.sliders.map(s => {
            const copy = { ...s };
            const fmt = OmniControlPanel._formatterFor(s);
            delete copy.suffix;
            delete copy.decimals;
            if (fmt === undefined) delete copy.format;
            else copy.format = fmt;
            return copy;
          }),
        });
        return;
      }

      out.push({ ...base, ...sec });     // pass-through: 'layers', 'addbar', ...
    });

    if (spec.presets && Object.keys(spec.presets).length) {
      const presetSection = {
        group:   spec.presetsLabel || 'Presets',
        id:      'presets',
        abbrev:  spec.presetsAbbrev || 'Pre',
        type:    'presets',
        presets: spec.presets,
        _params: params,
      };
      if (spec.presetsPosition === 'last') out.push(presetSection);
      else out.unshift(presetSection);
    }

    return out;
  }

  /**
   * Replace the panel contents from a plain JSON spec.
   *
   * @param {Object} spec
   * @param {Object} [opts]
   * @param {Object}   [opts.params]  — reuse an existing params object rather
   *                                    than seeding fresh defaults
   * @param {boolean}  [opts.strict]  — if true, refuse to build an invalid spec
   * @param {Function} [opts.onRender]
   * @param {Function} [opts.onParamChange]
   * @returns {{params: Object, sliderConfig: Array, errors: string[]}}
   */
  setContextFromSpec(spec, opts = {}) {
    const errors = OmniControlPanel.validateSpec(spec);
    if (errors.length) {
      this.setStatus(`Control spec: ${errors[0]}`, true);
      if (opts.strict) return { params: null, sliderConfig: null, errors };
    } else {
      this.clearStatus();
    }

    const params = opts.params || OmniControlPanel.paramsFromSpec(spec);
    const sliderConfig = this.compileSpec(spec, params);

    this.setContext({
      sliderConfig,
      presets: spec.presets || {},
      params,
      onRender: opts.onRender,
      onParamChange: opts.onParamChange,
    });

    if (spec.defaultPreset && spec.presets?.[spec.defaultPreset]) {
      this.setPreset(spec.defaultPreset, false);
    }

    return { params, sliderConfig, errors };
  }

  /**
   * Feed markdown to the panel as an alternative to a JSON structure.
   * The first ```json island in the document is the control spec.
   */
  setContextFromMarkdown(md, opts = {}) {
    let spec;
    try {
      spec = OmniControlPanel.extractSpec(md);
    } catch (err) {
      const msg = `control spec is not valid JSON — ${err.message}`;
      this.setStatus(msg, true);
      return { params: null, sliderConfig: null, errors: [msg] };
    }
    if (!spec) {
      const msg = 'no ```json control spec found in markdown';
      this.setStatus(msg, true);
      return { params: null, sliderConfig: null, errors: [msg] };
    }
    return this.setContextFromSpec(spec, opts);
  }

  // ============================================================
  // Private: Topic links
  // ============================================================

  /**
   * The panel does not decide what a topic link means — TopicsWidget reports
   * the click, and this announces the selection so the host can route it
   * (swap the slider set, scroll a card, send a prompt). Fires the
   * onTopicSelect config hook and a bubbling 'topic-select' DOM event on the
   * controls element.
   */
  _emitTopicSelect(topic) {
    const detail = { id: topic.id, href: topic.href || null, topic, panel: this };
    this.onTopicSelect(detail);
    this.elements.controls?.dispatchEvent(
      new CustomEvent('topic-select', { detail, bubbles: true })
    );
  }

  // ============================================================
  // setContext — swap slider config, presets, and params target
  // ============================================================

  /**
   * Replace the sidebar contents for a new scene/layer context.
   *
   * Each section in sliderConfig may carry:
   *   _params: Object  — the params object sliders read/write.
   *                       Falls back to engine.params if absent.
   *
   * Presets sections (type:'presets') may carry:
   *   presets: Object   — preset dictionary for that section.
   *                       Falls back to this.presets if absent.
   *
   * @param {Object} config
   * @param {Array}  config.sliderConfig
   * @param {Object} [config.presets]       – global presets override
   * @param {Object} [config.params]        – re-seat engine params
   * @param {Function} [config.onRender]
   * @param {Function} [config.onParamChange]
   */
  setContext(config) {
    this.sliderConfig = config.sliderConfig || [];

    if (config.presets !== undefined) {
      this.presets = config.presets;
      this.engine.presets = this.presets;
    }

    if (config.params) {
      this.engine.params = config.params;
      this.params = config.params;
    }

    if (config.onRender !== undefined)      this.onRender = config.onRender;
    if (config.onParamChange !== undefined)  this.onParamChange = config.onParamChange;

    this._rebuild();
  }

  // ============================================================
  // _rebuild — tear down and recreate controls + multiscroller
  // ============================================================

  _rebuild() {
    const controlsEl = this.elements.controls;
    const multiEl    = this.elements.multiscroller;

    if (controlsEl) controlsEl.innerHTML = '';
    if (multiEl)    multiEl.innerHTML = '';

    // Reset dynamic containers
    this.dynamicContainers = {};
    this.statusEl = null;
    this.infoEl   = null;

    // Rebuild
    this._buildMultiscroller();
    this._buildControls();
    this._setupScrollTracking();
    this._rebuildSubmenus();

    // Sync slider DOM to current param values
    for (const group of this.sliderConfig) {
      if (!group.sliders) continue;
      const params = group._params || this.params;
      for (const s of group.sliders) {
        if (s.isData) continue;
        const val = params[s.id];
        if (val === undefined) continue;
        if (s.type === 'color') {
          this._updateColorDOM(s.id, val);
          continue;
        }
        if (s.type === 'button-row') continue;  // built fresh with correct state
        const input = document.getElementById(s.id);
        const valEl = document.getElementById(`${s.id}-val`);
        if (input) input.value = val;
        if (valEl) valEl.textContent = formatValue(val, s.format);
      }
    }

    const firstStrip = stripConfigs(this.sliderConfig)[0];
    this._updateActiveStripButton(firstStrip?.id);
    requestAnimationFrame(() => this._updateMultiscrollerNames());

    this.render();
  }

  // ============================================================
  // _morphToTarget — animate any params object toward a preset
  // ============================================================

  /**
   * Ease-out cubic morph that writes directly to `params`.
   * Used by per-layer preset buttons (setContext path).
   * Does NOT go through OmniParamEngine.
   */
  _morphToTarget(params, target, duration = 500) {
    if (this._morphAnim) cancelAnimationFrame(this._morphAnim);

    const start = {};
    const numKeys = [];
    const colorKeys = [];
    const colorStart = {};
    const colorEnd = {};

    for (const k of Object.keys(target)) {
      if (!(k in params)) continue;
      const sv = params[k], tv = target[k];
      start[k] = sv;
      if (typeof sv === 'number' && typeof tv === 'number') {
        numKeys.push(k);
      } else if (isHexColor(sv) && isHexColor(tv)) {
        colorKeys.push(k);
        colorStart[k] = parseHexColor(sv);
        colorEnd[k]   = parseHexColor(tv);
      } else {
        params[k] = tv;          // snap non-interpolatable immediately
      }
    }

    if (!numKeys.length && !colorKeys.length) { this.render(); return; }

    const t0 = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - t, 3);      // ease-out cubic

      for (const k of numKeys) {
        const v = start[k] + (target[k] - start[k]) * e;
        params[k] = v;
        this.updateSliderDOM(k, v);
      }

      for (const k of colorKeys) {
        const c = lerpColor(colorStart[k], colorEnd[k], e);
        params[k] = formatHexColor(c);
        this._updateColorDOM(k, params[k]);
      }

      this.render();

      if (t < 1) {
        this._morphAnim = requestAnimationFrame(step);
      } else {
        this._morphAnim = null;
      }
    };

    this._morphAnim = requestAnimationFrame(step);
  }

  // ============================================================
  // Private: Initialization
  // ============================================================
  
  /** Build the { id: default } map from sliderConfig for OmniParamEngine. */
  _buildInitialParams() {
    const params = {};
    for (const group of this.sliderConfig) {
      if (group.sliders) {
        for (const s of group.sliders) {
          if (!s.isData) {
            params[s.id] = s.default;
          }
        }
      }
    }
    return params;
  }

  /** Push engine params into DOM slider inputs + value labels. */
  _syncSlidersToParams(params) {
    for (const group of this.sliderConfig) {
      if (!group.sliders) continue;
      for (const s of group.sliders) {
        if (s.isData) continue;
        const val = params[s.id];
        if (val === undefined) continue;

        if (s.type === 'color') {
          this._updateColorDOM(s.id, val);
          continue;
        }
        if (s.type === 'button-row') {
          const row = document.getElementById(s.id);
          if (row) {
            row.querySelectorAll('button').forEach(btn => {
              btn.classList.toggle('on', btn.dataset.v === String(val));
            });
          }
          continue;
        }
        const input = document.getElementById(s.id);
        const valEl = document.getElementById(`${s.id}-val`);
        if (input) input.value = val;
        if (valEl) valEl.textContent = formatValue(val, s.format);
      }
    }
  }
  
  _findSlider(id) {
    for (const group of this.sliderConfig) {
      if (group.sliders) {
        const slider = group.sliders.find(s => s.id === id);
        if (slider) return slider;
      }
    }
    return null;
  }
  
  // ============================================================
  // Private: Layout Management
  // ============================================================
  
  _setupLayout() {
    const updateLayout = () => {
      if (this.manageLayout) {
        const W = window.innerWidth;
        const H = window.innerHeight;

        const H1 = this.HEADER_HEIGHT + this.MIN_CONTROLS_HEIGHT + this.PADDING;
        const W1 = this.CONTROLS_WIDTH + this.PADDING;

        const landscapeChartWidth = W - W1;
        const portraitChartWidth = this.ASPECT_RATIO * (H - H1);

        const useLandscape = landscapeChartWidth > portraitChartWidth;

        document.body.classList.toggle('layout-landscape', useLandscape);
        document.body.classList.toggle('layout-portrait', !useLandscape);

        const ctr = this.elements.container;
        if (this.MAX_ASPECT_RATIO && ctr) {
          const availW = useLandscape ? (W - W1) : W;
          const availH = useLandscape ? H : (H - H1);
          const natural = availW / Math.max(1, availH);
          ctr.style.aspectRatio = String(Math.min(natural, this.MAX_ASPECT_RATIO));
        }
      }

      this.onResize(this);
    };
    
    updateLayout();
    window.addEventListener('resize', () => {
      updateLayout();
      this._updateMultiscrollerNames();
    });
  }
  
  // ============================================================
  // Private: Multiscroller (Tab Strip)
  // ============================================================
  
  _buildMultiscroller() {
    const el = this.elements.multiscroller;
    if (!el) return;
    
    const stripGroups = stripConfigs(this.sliderConfig);

    for (const group of stripGroups) {
      const btn = document.createElement('button');
      btn.className = 'strip-btn';
      btn.dataset.section = group.id;

      btn.textContent = group?.abbrev || group?.group?.substring(0, 3) || 'NONAME';
      
      btn.addEventListener('click', () => {
        if (btn.classList.contains('inactive')) return;
        const section = document.getElementById(`section-${group.id}`);
        if (section) {
          this.clickedSectionId = group.id;
          this._updateActiveStripButton(group.id);
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      
      el.appendChild(btn);
    }
  }
  
  _rebuildSubmenus() {
    if (typeof NavMenu === 'undefined') return;
    const inst = NavMenu.getInstance();

    const ctx = WidgetContext.fromPanel(this);
    ctx.compact = true;

    const elements = [];
    for (const config of this.sliderConfig) {
      const sCtx = config._params ? ctx.forSection(config) : ctx;
      const p = config._params || ctx.params;
      const widget = createWidget(config);
      const el = widget.mount(sCtx, config, p);
      if (el) elements.push(el);
    }

    inst.setWidgetElements(elements);
  }

  _updateActiveStripButton(activeId) {
    const el = this.elements.multiscroller;
    if (!el) return;
    
    el.querySelectorAll('.strip-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === activeId);
    });
    
    this.elements.controls?.querySelectorAll('.control-group').forEach(group => {
      const sectionId = group.id.replace('section-', '');
      group.classList.toggle('active', sectionId === activeId);
    });
  }
  
  _updateMultiscrollerNames(retryCount = 0) {
    const el = this.elements.multiscroller;
    if (!el) return;
    
    const buttons = el.querySelectorAll('.strip-btn');
    const stripHeight = el.clientHeight;
    
    if (stripHeight < 100 && retryCount < 3) {
      requestAnimationFrame(() => this._updateMultiscrollerNames(retryCount + 1));
      return;
    }
    
    const useFullNames = stripHeight >= 400;

    // Build a lookup from section id → config for strip-eligible groups
    const stripGroups = stripConfigs(this.sliderConfig);
    
    buttons.forEach((btn, i) => {
      if (stripGroups[i]) {
        btn.textContent = useFullNames
          ? stripGroups[i].group
          : (stripGroups[i].abbrev || stripGroups[i].group.substring(0, 3));
      }
    });
    
    el.classList.toggle('full-names', useFullNames);
  }
  
  _setupScrollTracking() {
    const controlsEl = this.elements.controls;
    if (!controlsEl) return;

    // Listeners are installed ONCE. This method is called from the
    // constructor and again from every _rebuild(); it used to attach a fresh
    // wheel/touchstart/scroll/resize set each time and never remove them, so
    // a long session accumulated hundreds of live listeners — each one doing
    // getElementById + offsetTop reads (forcing layout) on every scroll.
    //
    // The only reason it needed re-running was that stripGroups was captured
    // here, and setContext replaces sliderConfig. Reading it inside the
    // callback instead keeps one set of listeners correct forever.
    if (!this._updateStripButtons) {
      this._updateStripButtons = () => {
        const el = this.elements.controls;
        if (!el) return;

        const buttons = this.elements.multiscroller?.querySelectorAll('.strip-btn');
        if (!buttons) return;

        const stripGroups = stripConfigs(this.sliderConfig);

        const scrollTop = el.scrollTop;
        const panelHeight = el.clientHeight;
        const scrollBottom = scrollTop + panelHeight;
        const maxScroll = el.scrollHeight - panelHeight;
        const hasScroll = maxScroll > 5;
        const isAtBottom = hasScroll && scrollTop >= maxScroll - 1;

        let computedActiveSection = stripGroups[0]?.id;

        buttons.forEach((btn, i) => {
          const sectionId = stripGroups[i]?.id;
          if (!sectionId) return;

          const section = document.getElementById(`section-${sectionId}`);
          if (!section) return;

          const sectionTop = section.offsetTop;
          const sectionBottom = sectionTop + section.offsetHeight;

          if (sectionTop <= scrollTop + 20) {
            computedActiveSection = stripGroups[i].id;
          }

          const fullyVisible = sectionTop >= scrollTop - 1 && sectionBottom <= scrollBottom + 1;
          const isInactive = isAtBottom && fullyVisible;

          btn.classList.toggle('inactive', isInactive);
        });

        if (!this.clickedSectionId) {
          this._updateActiveStripButton(computedActiveSection);
        }
      };

      controlsEl.addEventListener('wheel', () => { this.clickedSectionId = null; }, { passive: true });
      controlsEl.addEventListener('touchstart', () => { this.clickedSectionId = null; }, { passive: true });
      controlsEl.addEventListener('scroll', this._updateStripButtons);
      window.addEventListener('resize', this._updateStripButtons);
    }

    // Still refreshes on every call, including after a rebuild.
    this._updateStripButtons();
  }
  
  // ============================================================
  // Private: Control Building
  // ============================================================
  
  _buildControls() {
    const controlsEl = this.elements.controls;
    if (!controlsEl) return;

    const ctx = WidgetContext.fromPanel(this);
    mountWidgets(this.sliderConfig, ctx, controlsEl);
    
    if (this.hintHtml) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.innerHTML = this.hintHtml;
      controlsEl.appendChild(hint);
    }
  }
  
  // ============================================================
  // Private: Preset UI state
  // ============================================================

  _setActivePreset(name) {
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent === name);
    });
  }
  
  _clearActivePreset() {
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
  }
  
  // ============================================================
  // Private: Pan/Zoom (for 2D SVG apps)
  // ============================================================
  
  _setupPanZoom() {
    const container = this.elements.container;
    const displayEl = container.querySelector('svg') || container.querySelector('canvas');
    if (!container || !displayEl) return;

    const getScale = () => {
      if (displayEl.tagName === 'svg') {
        const rect = displayEl.getBoundingClientRect();
        const vb = displayEl.getAttribute('viewBox')?.split(' ').map(Number) || [0, 0, 800, 650];
        return new Vector2D(vb[2] / rect.width, vb[3] / rect.height);
      }
      return new Vector2D(1, 1);
    };

    const startDrag = (clientX, clientY) => {
      this.isDragging = true;
      this.dragStart = new Vector2D(clientX, clientY);
      this.panStart = { ...this.panZoom };
      this.dragScale = getScale();
    };

    const moveDrag = (clientX, clientY) => {
      if (!this.isDragging) return;
      const scale = this.dragScale;
      const zoom = this.params.zoom;
      this.panZoom.panX = this.panStart.panX + (clientX - this.dragStart.x) * scale.x / zoom;
      this.panZoom.panY = this.panStart.panY + (clientY - this.dragStart.y) * scale.y / zoom;
      this.render();
    };

    container.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => this.isDragging = false);

    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    container.addEventListener('touchend', () => this.isDragging = false);

    const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    container.addEventListener('wheel', (e) => {
      if (isTouchDevice()) return;
      e.preventDefault();

      const newZoom = Math.max(0.25, Math.min(2, (this.params.zoom || 1) - e.deltaY * 0.001));
      this.engine.setParam('zoom', newZoom, false);

      const input = document.getElementById('zoom');
      const valEl = document.getElementById('zoom-val');
      if (input) input.value = this.params.zoom;
      if (valEl) valEl.textContent = formatValue(this.params.zoom);

      this.render();
    }, { passive: false });
  }

  // ============================================================
  // Private: Legend Toggle
  // ============================================================
  
  _setupLegendToggle() {
    const toggle = this.elements.legendToggle;
    if (!toggle) return;
    
    toggle.addEventListener('click', () => {
      this.showLegend = !this.showLegend;
      toggle.classList.toggle('active', this.showLegend);
      this.elements.multiscroller?.classList.toggle('multiscroller-unlocked', !this.showLegend);
      this.onLegendToggle(this.showLegend, this);
    });
  }
  
  // ============================================================
  // Private: Color helpers (utilities imported from omni-widget.js)
  // ============================================================

  /** Update color swatch + native input + alpha slider DOM for a given id */
  _updateColorDOM(id, hex) {
    const swatch = document.getElementById(`${id}-swatch`);
    const input  = document.getElementById(id);
    const alpha  = document.getElementById(`${id}-alpha`);
    const valEl  = document.getElementById(`${id}-val`);
    if (swatch) swatch.style.backgroundColor = hex;
    if (input)  input.value = hex.slice(0, 7);   // type=color needs #rrggbb
    if (alpha) {
      const parsed = parseHexColor(hex);
      alpha.value = parsed.a;
    }
    if (valEl) valEl.textContent = hex;
  }

  addMenuItems(items) {
    if (typeof NavMenu === 'undefined') return;
    NavMenu.addItems(items);
  }

  addHelp() {
    this.addMenuItems([
      { type: 'nav-item', label: 'Help', action: () => {
        if (window.DoHelp)
          window.DoHelp();
        else if (typeof window.HelpOverlay === 'function' && window?.helpConfig) {
          new window.HelpOverlay(window.helpConfig);
          window.DoHelp();
        }
        else alert('Help not configured');
      }},
    ]);
  }
}

mixinPatchbay(OmniControlPanel);



export { OmniControlPanel};