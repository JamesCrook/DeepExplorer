/* ============================================
   OmniControlPanel - Generic Control Panel Framework
   ============================================

   Now uses the scene graph walker for DOM construction.

   _buildControls():
     coerceToAST(sliderConfig) → walkPhase('mount')

   _rebuildSubmenus():
     coerceToAST(sliderConfig, { menu: true }) → walkPhase('mount')

   coerceToAST is the bridge: it takes the existing sliderConfig
   format (which molam-app and other apps produce) and converts it
   into an AST of { type, value, subtree, inst } nodes that the
   walker dispatches through registered widget classes.
*/

import { OmniParamEngine } from './omni-param-engine.js';
import { mixinPatchbay } from './omni-controls-patchbay.js';
import { Vector2D } from '../2d-support/vector2d.js';
import { sceneRegistry } from './scene.js';
import {
  resolveWidgetType, stripConfigs, WidgetContext,
  formatValue, isHexColor, parseHexColor, formatHexColor, lerpColor,
} from './omni-widget.js';
import './layers-widget.js'
import './topics-widget.js'

// ============================================================
// Spec support — constants for the JSON control-spec compiler
// ============================================================

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
    this.manageLayout = config.manageLayout !== false;

    // Layout constants
    this.ASPECT_RATIO = config.aspectRatio || (800 / 650);
    this.MAX_ASPECT_RATIO = config.maxAspectRatio || null;
    this.CONTROLS_WIDTH = 320;
    this.HEADER_HEIGHT = 30;
    this.MIN_CONTROLS_HEIGHT = 210;
    this.PADDING = 20;

    // Pan/zoom state
    this.panZoom = { panX: 0, panY: 0 };
    this.showLegend = true;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.panStart = { panX: 0, panY: 0 };
    this.clickedSectionId = null;

    // Dynamic element refs
    this.dynamicContainers = {};
    this.statusEl = null;
    this.infoEl = null;

    // Morph animation state
    this._morphAnim = null;

    // Retained AST (for future update walks)
    this._panelAST = null;

    // ── OmniParamEngine ──
    this.engine = new OmniParamEngine({
      params:   this._buildInitialParams(),
      presets:  this.presets,
      onUpdate: (params) => {
        this._syncSlidersToParams(params);
        this.render();
      },
      morphDuration: config.morphDuration ?? 600,
    });

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

    // Apply default preset
    if (this.defaultPreset && this.presets[this.defaultPreset]) {
      this.engine.setPreset(this.defaultPreset, false);
      this._setActivePreset(this.defaultPreset);
    }

    this._updateActiveStripButton(stripConfigs(this.sliderConfig)[0]?.id);

    // Initial render
    this.render();

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
      const origOnUpdate = this.engine.onUpdate;
      this.engine.onUpdate = (params) => {
        origOnUpdate(params);
        if (this.engine.activePreset === name) {
          this._setActivePreset(name);
          this.engine.onUpdate = origOnUpdate;
        }
      };
      this.engine.setPreset(name, true);
    } else {
      this.engine.setPreset(name, false);
      this._setActivePreset(name);
    }
  }

  updateSlider(id, value, render = true) {
    this.engine.setParam(id, value, false);

    const input = document.getElementById(id);
    const valEl = document.getElementById(`${id}-val`);
    const slider = this._findSlider(id);

    if (input) input.value = value;
    if (valEl && slider) valEl.textContent = formatValue(value, slider.format);

    if (render) this.render();
  }

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

  getParams() { return this.engine.getParams(); }
  setParam(id, value) { this.engine.setParam(id, value, false); }
  getPanZoom() { return { ...this.panZoom }; }

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

  getDynamicContainer(id) { return this.dynamicContainers[id]; }

  setControlEnabled(id, enabled) {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  }

  setSelectValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  downloadState(filename = 'state.json', extraState = {}) {
    const state = { params: this.getParams(), ...extraState };
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
          if (state.params) this.updateSliders(state.params, false);
          if (onStateLoaded) onStateLoaded(state);
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
  // coerceToAST — convert sliderConfig to AST for walkPhase
  // ============================================================

  /**
   * Convert a sliderConfig array into an AST tree.
   *
   * @param {Array}  sliderConfig — the flat config array
   * @param {Object} [opts]
   * @param {boolean}  [opts.menu]   — if true, produce a nav-menu AST
   * @returns {{ type: 'panel', value: {}, subtree: [] }}
   */
  coerceToAST(sliderConfig, opts = {}) {
    const menu = opts.menu || false;
    const children = [];

    for (const sec of sliderConfig) {
      const panelNode = this._coercePanelNode(sec);

      if (menu) {
        const type = resolveWidgetType(sec);
        const navType = sceneRegistry.meta[type]?.defaultParams?.navVersion;
        if (!navType) continue;
        children.push(this._coerceNavNode(navType, sec, panelNode));
      } else {
        // Wrap in control-group if needed (slider-group handles its own wrapper)
        const type = resolveWidgetType(sec);
        const meta = sceneRegistry.meta[type];
        const needsWrap = meta?.defaultParams?.wrapInGroup !== false;

        if (needsWrap && type !== 'slider-group') {
          children.push({
            type: 'control-group',
            value: { group: sec.group, id: sec.id, abbrev: sec.abbrev },
            inst: sec._params ? { _params: sec._params } : {},
            subtree: [panelNode],
          });
        } else {
          children.push(panelNode);
        }
      }
    }

    return { type: 'panel', value: {}, subtree: children };
  }


  /**
   * Convert a single sliderConfig entry to a panel AST node.
   */
  _coercePanelNode(sec) {
    const type = resolveWidgetType(sec);

    // ── slider-group: children are morph-slider / color-picker / button-row ──
    if (type === 'slider-group') {
      return {
        type: 'slider-group',
        value: { group: sec.group, id: sec.id, abbrev: sec.abbrev },
        inst: sec._params ? { _params: sec._params } : {},
        subtree: (sec.sliders || []).map(s => this._coerceSliderChild(s)),
      };
    }

    // ── presets: children are preset-item ──
    if (type === 'presets') {
      const presets = sec.presets || this.presets || {};
      const _params = sec._params || null;
      return {
        type: 'presets',
        value: { id: sec.id || 'presets', presetsId: sec.presetsId },
        subtree: Object.keys(presets).map(name => ({
          type: 'preset-item',
          value: { label: name },
          inst: {
            action: () => {
              if (_params) {
                this._morphToTarget(_params, presets[name]);
              } else {
                this.setPreset(name);
              }
            },
          },
          subtree: [],
        })),
      };
    }

    // ── select: children are option or optgroup ──
    if (type === 'select') {
      let subtree;
      if (sec.optgroups) {
        subtree = Object.entries(sec.optgroups).map(([groupLabel, opts]) => ({
          type: 'optgroup',
          value: { label: groupLabel },
          subtree: opts.map(o => ({
            type: 'option',
            value: { value: o.value, label: o.label, selected: o.selected },
            subtree: [],
          })),
        }));
      } else {
        subtree = (sec.options || []).map(o => ({
          type: 'option',
          value: { value: o.value, label: o.label, selected: o.selected },
          subtree: [],
        }));
      }
      return {
        type: 'select',
        value: {
          id: sec.id,
          selectId: sec.selectId || sec.id,
          label: sec.label,
        },
        inst: { onChange: sec.onChange },
        subtree,
      };
    }

    // ── topics: children are topic-link ──
    if (type === 'topics') {
      return {
        type: 'topics',
        value: { id: sec.id, group: sec.group },
        inst: { onSelect: sec.onSelect },
        subtree: (sec.topics || []).map(t => ({
          type: 'topic-link',
          value: { ...t },
          inst: { action: () => sec.onSelect?.(t, this) },
          subtree: [],
        })),
      };
    }

    // ── filedrop ──
    if (type === 'filedrop') {
      return {
        type: 'filedrop',
        value: { id: sec.id, label: sec.label, accept: sec.accept, multiple: sec.multiple },
        inst: { onDrop: sec.onDrop },
        subtree: [],
      };
    }

    // ── button ──
    if (type === 'button') {
      return {
        type: 'button',
        value: { id: sec.id, buttonId: sec.buttonId, label: sec.label, secondary: sec.secondary },
        inst: { onClick: sec.onClick },
        subtree: [],
      };
    }

    // ── toggle ──
    if (type === 'toggle') {
      return {
        type: 'toggle',
        value: { id: sec.id, label: sec.label, checked: sec.checked },
        inst: { onChange: sec.onChange },
        subtree: [],
      };
    }

    // ── custom ──
    if (type === 'custom') {
      return {
        type: 'custom',
        value: { id: sec.id },
        inst: { build: sec.build },
        subtree: [],
      };
    }

    // ── status ──
    if (type === 'status') {
      return {
        type: 'status',
        value: { id: sec.id, statusId: sec.statusId },
        subtree: [],
      };
    }

    // ── info ──
    if (type === 'info') {
      return {
        type: 'info',
        value: { id: sec.id, infoId: sec.infoId },
        subtree: [],
      };
    }

    // ── dynamic ──
    if (type === 'dynamic') {
      return {
        type: 'dynamic',
        value: { id: sec.id, containerId: sec.containerId },
        subtree: [],
      };
    }

    // ── addbar ──
    if (type === 'addbar') {
      return {
        type: 'addbar',
        value: { items: sec.items },
        inst: { onAdd: sec.onAdd },
        subtree: [],
      };
    }

    // ── divider ──
    if (type === 'divider') {
      return { type: 'divider', value: {}, subtree: [] };
    }

    // ── label ──
    if (type === 'label') {
      return {
        type: 'label',
        value: { id: sec.id, labelId: sec.labelId, text: sec.text, html: sec.html },
        subtree: [],
      };
    }

    // ── number-input ──
    if (type === 'number-input') {
      return {
        type: 'number-input',
        value: { id: sec.id, label: sec.label, default: sec.default, min: sec.min, max: sec.max, step: sec.step },
        inst: { onChange: sec.onChange },
        subtree: [],
      };
    }

    // ── text-input ──
    if (type === 'text-input') {
      return {
        type: 'text-input',
        value: { id: sec.id, label: sec.label, default: sec.default, placeholder: sec.placeholder, liveUpdate: sec.liveUpdate },
        inst: { onChange: sec.onChange },
        subtree: [],
      };
    }

    // ── button-group ──
    if (type === 'button-group') {
      return {
        type: 'button-group',
        value: { id: sec.id, direction: sec.direction, gap: sec.gap, buttons: sec.buttons },
        subtree: [],
      };
    }

    // ── selection-action-bar ──
    if (type === 'selection-action-bar') {
      return {
        type: 'selection-action-bar',
        value: { _depth: sec._depth, count: sec.count, display: sec.display, canAdd: sec.canAdd, canRemove: sec.canRemove },
        inst: { onAdd: sec.onAdd, onRemove: sec.onRemove },
        subtree: [],
      };
    }

    // ── layers (handled by layers-widget.js) ──
    if (type === 'layers') {
      return {
        type: 'layers',
        value: { id: sec.id, title: sec.title, selectedLayer: sec.selectedLayer },
        inst: {
          layers: sec.layers,
          onSelect: sec.onSelect,
          onToggleVisibility: sec.onToggleVisibility,
          onRemove: sec.onRemove,
          onReorder: sec.onReorder,
          onRename: sec.onRename,
        },
        subtree: [],
      };
    }

    // ── Fallback: pass through with all properties on value ──
    return {
      type,
      value: { ...sec },
      subtree: [],
    };
  }

  /**
   * Convert a slider config entry (within a slider-group) to a child node.
   */
  _coerceSliderChild(s) {
    if (s.type === 'color') {
      return {
        type: 'color-picker',
        value: { id: s.id, label: s.label, default: s.default },
        subtree: [],
      };
    }
    if (s.type === 'button-row') {
      return {
        type: 'button-row',
        value: { id: s.id, label: s.label, default: s.default, options: s.options },
        subtree: [],
      };
    }
    // Default: morph-slider (range)
    return {
      type: 'morph-slider',
      value: {
        id: s.id, label: s.label, min: s.min, max: s.max, step: s.step,
        default: s.default, format: s.format, disabled: s.disabled,
        isData: s.isData, dataValue: s.dataValue,
        numPoints: s.numPoints,
      },
      inst: s.onChange ? { onChange: s.onChange } : {},
      subtree: [],
    };
  }

  /**
   * Convert a panel node to a nav node.
   * navType is looked up from meta.defaultParams.navVersion.
   */
  _coerceNavNode(navType, sec, panelNode) {
    return {
      type: navType,
      value: { label: sec.group || sec.id || '' },
      inst: {
        action: () => {
          const section = document.getElementById(`section-${sec.id}`);
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      },
      subtree: this._navChildrenOf(panelNode),
    };
  }

  /**
   * Recursively map a panel node's subtree into nav AST nodes.
   *
   * Tracks `selectNode` so that option leaves without their own action
   * can synthesize one that calls the enclosing select's onChange.
   */
  _navChildrenOf(parentNode, selectNode) {
    if (parentNode.type === 'select') selectNode = parentNode;

    return parentNode.subtree
      .filter(child => sceneRegistry.meta[child.type]?.defaultParams?.navVersion)
      .map(child => {
        const childNavType = sceneRegistry.meta[child.type].defaultParams.navVersion;

        if (childNavType === 'nav-submenu') {
          return {
            type: 'nav-submenu',
            value: { label: child.value?.label || child.value?.name || '' },
            subtree: this._navChildrenOf(child, selectNode),
          };
        }

        // Leaf: use the child's own action, or synthesize from the
        // enclosing select's onChange + the child's value.
        const action = child.inst?.action || (selectNode ? () => {
          const el = document.getElementById(
            selectNode.value?.selectId || selectNode.value?.id || ''
          );
          if (el) el.value = child.value?.value ?? '';
          selectNode.inst?.onChange?.(child.value?.value, this);
        } : undefined);

        return {
          type: 'nav-item',
          value: { label: child.value?.label || child.value?.name || '' },
          inst: { action },
          subtree: [],
        };
      });
  }


  // ============================================================
  // Spec API (unchanged — still produces sliderConfig, then coerced)
  // ============================================================

  static validateSpec(spec) {
    const errs = [];
    if (!spec || typeof spec !== 'object') { errs.push('spec is not an object'); return errs; }
    if (!Array.isArray(spec.sections)) { errs.push('spec.sections must be an array'); return errs; }
    const seen = new Set();
    spec.sections.forEach((sec, i) => {
      const where = `sections[${i}]`;
      if (!sec || typeof sec !== 'object') { errs.push(`${where} is not an object`); return; }
      if (!sec.group) errs.push(`${where} has no group`);
      if (sec.type === 'select') {
        if (!sec.bind) errs.push(`${where} (select) needs "bind"`);
        if (!Array.isArray(sec.options) || !sec.options.length) errs.push(`${where} (select) needs a non-empty options array`);
        return;
      }
      if (sec.type === 'topics') {
        if (!Array.isArray(sec.topics) || !sec.topics.length) errs.push(`${where} (topics) needs a non-empty topics array`);
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
          if (!Array.isArray(s.options) || !s.options.length) errs.push(`${w} (button-row) needs a non-empty options array`);
        } else if (s.type !== 'color' && !s.isData) {
          if (typeof s.min !== 'number' || typeof s.max !== 'number') errs.push(`${w} needs numeric min and max`);
          else if (s.min >= s.max) errs.push(`${w} min must be less than max`);
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

  static extractSpec(md) {
    const m = String(md).match(/```[ \t]*json[ \t]*\r?\n([\s\S]*?)```/i);
    return m ? JSON.parse(m[1]) : null;
  }

  static paramsFromSpec(spec) {
    const params = {};
    for (const sec of (spec.sections || [])) {
      if (sec.type === 'select' && sec.bind) {
        params[sec.bind] = sec.default !== undefined ? sec.default : sec.options?.[0]?.value;
        continue;
      }
      for (const s of (sec.sliders || [])) {
        if (s.isData) continue;
        params[s.id] = s.default;
      }
    }
    return params;
  }

  static _formatterFor(s) {
    if (typeof s.format === 'function') return s.format;
    if (typeof s.format === 'string') return SPEC_FORMATS[s.format] || s.format;
    if (s.suffix) {
      const suffix = s.suffix;
      const dp = typeof s.decimals === 'number' ? s.decimals : null;
      return (v) => (dp === null ? String(+(+v).toFixed(4)) : (+v).toFixed(dp)) + suffix;
    }
    return undefined;
  }

  compileSpec(spec, params) {
    const out = [];

    (spec.sections || []).forEach((sec, i) => {
      const id = sec.id
        || (sec.group || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        || `section-${i}`;
      const base = { group: sec.group, id, abbrev: sec.abbrev, _params: params };

      if (sec.type === 'select') {
        out.push({
          ...base, type: 'select',
          selectId: sec.selectId || `${id}-sel`,
          options: (sec.options || []).map(o => ({ ...o, selected: o.value === params[sec.bind] })),
          onChange: (val, controls) => {
            params[sec.bind] = val;
            this.onParamChange(sec.bind, val, controls);
            (controls || this).render();
          },
        });
        return;
      }

      if (sec.type === 'topics') {
        out.push({
          ...base, type: 'topics',
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
            delete copy.suffix; delete copy.decimals;
            if (fmt === undefined) delete copy.format;
            else copy.format = fmt;
            return copy;
          }),
        });
        return;
      }

      out.push({ ...base, ...sec });
    });

    if (spec.presets && Object.keys(spec.presets).length) {
      const presetSection = {
        group: spec.presetsLabel || 'Presets',
        id: 'presets', abbrev: spec.presetsAbbrev || 'Pre',
        type: 'presets', presets: spec.presets, _params: params,
      };
      if (spec.presetsPosition === 'last') out.push(presetSection);
      else out.unshift(presetSection);
    }

    return out;
  }

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
      sliderConfig, presets: spec.presets || {}, params,
      onRender: opts.onRender, onParamChange: opts.onParamChange,
    });

    if (spec.defaultPreset && spec.presets?.[spec.defaultPreset]) {
      this.setPreset(spec.defaultPreset, false);
    }

    return { params, sliderConfig, errors };
  }

  setContextFromMarkdown(md, opts = {}) {
    let spec;
    try { spec = OmniControlPanel.extractSpec(md); }
    catch (err) {
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

    this.dynamicContainers = {};
    this.statusEl = null;
    this.infoEl   = null;

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
        if (s.type === 'button-row') continue;
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
  // _buildControls — uses walkPhase('mount') on the coerced AST
  // ============================================================

  _buildControls() {
    const controlsEl = this.elements.controls;
    if (!controlsEl) return;

    const ctx = WidgetContext.fromPanel(this);
    ctx.parentEl = controlsEl;
    ctx.parentStack = [];

    this._panelAST = this.coerceToAST(this.sliderConfig);
    sceneRegistry.runPhases(ctx, this._panelAST, this.params, ['mount']);

    if (this.hintHtml) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.innerHTML = this.hintHtml;
      controlsEl.appendChild(hint);
    }
  }


  // ============================================================
  // _rebuildSubmenus — nav AST via coerceToAST({ menu: true })
  // ============================================================

  _rebuildSubmenus() {
    if (typeof NavMenu === 'undefined') return;
    const inst = NavMenu.getInstance();

    // Build nav AST and walk it into a temporary container
    const navContainer = document.createElement('div');

    const ctx = WidgetContext.fromPanel(this);
    ctx.parentEl = navContainer;
    ctx.parentStack = [];

    const navAST = this.coerceToAST(this.sliderConfig, { menu: true });
    sceneRegistry.runPhases(ctx, navAST, this.params, ['mount']);

    // Collect the top-level nav elements for the menu
    const elements = [...navContainer.children];
    inst.setWidgetElements(elements);
  }


  // ============================================================
  // _morphToTarget
  // ============================================================

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
        params[k] = tv;
      }
    }

    if (!numKeys.length && !colorKeys.length) { this.render(); return; }

    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - t, 3);

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
      if (t < 1) { this._morphAnim = requestAnimationFrame(step); }
      else { this._morphAnim = null; }
    };

    this._morphAnim = requestAnimationFrame(step);
  }


  // ============================================================
  // Private: Initialization
  // ============================================================

  _buildInitialParams() {
    const params = {};
    for (const group of this.sliderConfig) {
      if (group.sliders) {
        for (const s of group.sliders) {
          if (!s.isData) params[s.id] = s.default;
        }
      }
    }
    return params;
  }

  _syncSlidersToParams(params) {
    for (const group of this.sliderConfig) {
      if (!group.sliders) continue;
      for (const s of group.sliders) {
        if (s.isData) continue;
        const val = params[s.id];
        if (val === undefined) continue;

        if (s.type === 'color') { this._updateColorDOM(s.id, val); continue; }
        if (s.type === 'button-row') {
          const row = document.getElementById(s.id);
          if (row) row.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('on', btn.dataset.v === String(val));
          });
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

          if (sectionTop <= scrollTop + 20) computedActiveSection = stripGroups[i].id;

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

    this._updateStripButtons();
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
  // Private: Pan/Zoom
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
  // Private: Color helpers
  // ============================================================

  _updateColorDOM(id, hex) {
    const swatch = document.getElementById(`${id}-swatch`);
    const input  = document.getElementById(id);
    const alpha  = document.getElementById(`${id}-alpha`);
    const valEl  = document.getElementById(`${id}-val`);
    if (swatch) swatch.style.backgroundColor = hex;
    if (input)  input.value = hex.slice(0, 7);
    if (alpha) { const parsed = parseHexColor(hex); alpha.value = parsed.a; }
    if (valEl) valEl.textContent = hex;
  }

  addMenuItems(items) {
    if (typeof NavMenu === 'undefined') return;
    NavMenu.addItems(items);
  }

  addHelp() {
    this.addMenuItems([
      { type: 'nav-item', label: 'Help', action: () => {
        if (window.DoHelp) window.DoHelp();
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

export { OmniControlPanel };