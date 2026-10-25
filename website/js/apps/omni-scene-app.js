/**
 * omni-scene-app.js  — v9
 *
 * Changes from v8:
 *   - Recursive twig: _pushLayerSystem emits add-bar + layer-list
 *     + controls at each depth; containers (layer.inst.addables)
 *     recurse to deeper levels
 *   - _addObjectTo / _doAddToLayer / _doRemoveFromLayer generalize
 *     the old fixed-depth methods
 *   - _updateActionBar supports depth-keyed action bars
 *
 * Place in: apps/omni-scene-app.js
 */

import { sceneRegistry, MiniAstNode, ADDABLES, SCENES } from '../omni-support/scene.js';
import { OmniApp }            from '../omni-support/omni-app.js';
import { OmniControlPanel }   from '../omni-support/omni-control-panel.js';
import { Omni2d }             from '../omni-support/omni-2d.js';
import { autoName }           from '../omni-support/layer-ops.js';

import '../nodes2d/omni-scene-nodes.js';
import '../omni-support/layers-widget.js';

import { LAYER_COLORS }       from './omni-scene-scenes.js';

// ── 3D backend: conditional (requires Three.js in importmap) ──
let Omni3d = null;
try {
  const mod = await import('../omni-support/omni-3d.js');
  Omni3d = mod.Omni3d;
} catch (e) { /* 3D not available — Three.js not present */ }

let OmniHtml = null;
try {
  const mod = await import('../omni-support/omni-html.js');
  OmniHtml = mod.OmniHtml;
} catch (e) { /* HTML backend not available */ }


let _layerCount = 0;


class OmniSceneApp {

  constructor(options = {}) {
    const {
      title        = 'OmniScene',
      subtitle     = 'Drag to reshape. Scroll to zoom. Drag background to pan.',
      defaultScene = 'chart-sales',
    } = options;

    // A host may inject its own shell — an object exposing the same four
    // things OmniApp provides: { container, controls, multiscroller, layers }.
    // d-plus.html does this to mount a scene into a chat stage card instead
    // of taking over the page. Absent it, behaviour is exactly as before.
    const shell = options.shell || new OmniApp({
      title, subtitle,
      displayLayers: [
        { element: 'canvas', id: 'scene-canvas' },
        { element: 'div',    id: 'scene-viewport-3d' },
        { element: 'div',    id: 'scene-viewport-html' },
      ],
    });

    this.container = shell.container;

    this.backends = {
      '2d': new Omni2d(shell.layers['scene-canvas'], shell.container, this),
    };
    if (Omni3d) {
      this.backends['3d'] = new Omni3d(shell.layers['scene-viewport-3d'], shell.container, this);
    }
    if (OmniHtml) {
      this.backends['html'] = new OmniHtml(shell.layers['scene-viewport-html'], shell.container, this);
    }

    this.activeBackend = null;
    for (const el of Object.values(shell.layers)) el.style.display = 'none';

    // ── Scene state ────────────────────────────────────────
    this.currentScene    = null;
    this.root            = null;
    this.sceneLayer      = null;
    this.selectedLayer   = null;   // depth-0 selection
    this._animPlaying    = true;
    this._animFrame      = null;

    this._selectionBuffer  = [];
    this._networkCounter   = 0;
    this._actionBarMap     = {};   // depth → layer, for _updateActionBar

    // A host may share one panel across several apps (one per stage card).
    // Whoever is live calls _rebuildContext(), which re-points the panel's
    // onRender at itself. ownsControls tells us whether we may dispose it.
    this.ownsControls = !options.controls;
    this.controls = options.controls || new OmniControlPanel({
      elements: {
        container:     shell.container,
        controls:      shell.controls,
        multiscroller: shell.multiscroller,
      },
      sliderConfig:   [],
      presets:        {},
      enablePanZoom:  false,
      onRender: () => this.render(),
      onResize: () => {
        if (this.activeBackend) { this.activeBackend.resize(); this.render(); }
      },
    });

    this._loadScene(defaultScene);
  }

  // ═══════════════════════════════════════════════════════
  //  SCENE LOADING
  // ═══════════════════════════════════════════════════════

  _loadScene(sceneId) {
    this._stopAnimLoop();
    const def = SCENES.find(s => s.id === sceneId);
    if (!def) return;

    const mode    = def.displayMode || '2d';
    const backend = this.backends[mode];
    if (!backend) { console.warn(`OmniScene: no backend for "${mode}"`); return; }

    if (this.activeBackend && this.activeBackend !== backend) this.activeBackend.deactivate();

    this.currentScene = def;
    this.root         = def.create();
    this.sceneLayer   = this.root.subtree[0];
    _layerCount       = this._contentLayers().length;

    const content = this._contentLayers();
    this.selectedLayer     = content.length > 0 ? content[0] : this.sceneLayer;
    this._selectionBuffer  = [];
    this._networkCounter   = 0;

    this.activeBackend = backend;
    backend.activate();
    this._rebuildContext();

    if (def.preset) this.controls.setPreset(def.preset);
    this.render();

    if (def.preset) {
      setTimeout(() => {
        let layers = (!def.hasLayers) ? [this.sceneLayer] : this._contentLayers;
        for (const layer of layers) {
          const targetPreset = layer.inst?.presets?.[def.preset];
          if (targetPreset) this.controls._morphToTarget(layer.value.params, targetPreset, 600);
        }
      }, 50);
    }

    if (def.animated) this._startAnimLoop();
  }

  // ═══════════════════════════════════════════════════════
  //  LAYER QUERIES
  // ═══════════════════════════════════════════════════════

  /** Content layers of the scene root (backward compat). */
  _contentLayers() {
    return this._contentLayersOf(this.sceneLayer);
  }

  /** Content layers of any parent node. */
  _contentLayersOf(parent) {
    const contentParent = parent?.inst?.getContentParent?.(parent) || parent;
    return (contentParent?.subtree || []).filter(n => n.token === 'layer');
  }

  _nextName(type) {
    _layerCount++;
    return (ADDABLES.find(a => a.id === type)?.label || type) + ' ' + _layerCount;
  }

  _nextNetworkName() {
    return autoName(this._networkCounter++);
  }

  // ═══════════════════════════════════════════════════════
  //  RENDERING
  // ═══════════════════════════════════════════════════════

  render() {
    if (!this.activeBackend || !this.root) return;
    this.activeBackend.render(this.sceneLayer?.value?.params);
  }

  // ═══════════════════════════════════════════════════════
  //  ANIMATION LOOP
  // This code is way too specific to a particular use case.
  // Needs to become more general.
  // ═══════════════════════════════════════════════════════

  _hasActiveRuntimes() {
    if (this.sceneLayer?.inst?.runtime) return true;
    return this._contentLayers().some(l => l.inst?.runtime);
  }

  _startAnimLoop() {
    if (this._animFrame) return;
    this._animPlaying = true;
    const step = () => {
      if (!this._hasActiveRuntimes()) { this._stopAnimLoop(); this.render(); return; }
      this._animFrame = requestAnimationFrame(step);
      if (this._animPlaying) {
        const sceneRT = this.sceneLayer?.inst?.runtime;
        if (sceneRT) sceneRT.tick(this.sceneLayer.value.params?.speed ?? 1);
        for (const layer of this._contentLayers()) {
          const rt = layer.inst?.runtime;
          if (rt && rt !== sceneRT) rt.tick(layer.value.params?.speed ?? 1);
        }
        this.render();
        this._updateRuleCards();
      }
    };
    this._animFrame = requestAnimationFrame(step);
  }

  _stopAnimLoop() {
    if (this._animFrame) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
  }

  _updateRuleCards() {
    const allRules = this.sceneLayer?.inst?.rules || this.selectedLayer?.inst?.rules;
    if (!allRules) return;
    for (let i = 0; i < allRules.length; i++) {
      const r = allRules[i];
      const card = document.getElementById('rule-' + i);
      if (!card) continue;
      const active = r.isActive();
      card.classList.toggle('active', active && (r.type === 'while' || r.type === 'phase' || r.type === 'couple'));
      card.classList.toggle('fired', active && r.type === 'on');
    }
  }

  // ═══════════════════════════════════════════════════════
  //  SELECTION BUFFER
  // ═══════════════════════════════════════════════════════

  _onSelect(hitNode) {
    if (!hitNode) { this._clearSelection(); return; }

    if (hitNode.token === 'edge-ref') {
      const fn = hitNode.value?.fromNode;
      const tn = hitNode.value?.toNode;
      this._selectionBuffer = [];
      if (fn) { const ctx = this._findNodeContext(fn); if (ctx) this._selectionBuffer.push({ node: fn, item: ctx.item, layer: ctx.layer }); }
      if (tn) { const ctx = this._findNodeContext(tn); if (ctx) this._selectionBuffer.push({ node: tn, item: ctx.item, layer: ctx.layer }); }
      this._updateActionBar();
      this.render();
      return;
    }

    const ctx = this._findNodeContext(hitNode);
    if (!ctx) return;

    const entry = { node: hitNode, item: ctx.item, layer: ctx.layer };
    const selSize = this.selectedLayer?.inst?.selectionSize ?? 1;

    const last = this._selectionBuffer[this._selectionBuffer.length - 1];
    if (last && last.node === hitNode) { this._updateActionBar(); this.render(); return; }

    this._selectionBuffer.push(entry);
    while (this._selectionBuffer.length > selSize) this._selectionBuffer.shift();

    this._updateActionBar();
    this.render();
  }

  _clearSelection() {
    if (this._selectionBuffer.length === 0) return;
    this._selectionBuffer = [];
    this._updateActionBar();
    this.render();
  }

  // ═══════════════════════════════════════════════════════
  //  TREE SEARCH HELPERS
  // ═══════════════════════════════════════════════════════

  _findNodeContext(hitNode) {
    for (const layer of this._contentLayers()) {
      for (const item of (layer.subtree || [])) {
        if (item === hitNode) return { item, layer };
        if (this._containsNode(item, hitNode)) return { item, layer };
      }
    }
    return null;
  }

  _containsNode(parent, target) {
    for (const child of (parent.subtree || [])) {
      if (child === target) return true;
      if (this._containsNode(child, target)) return true;
    }
    return false;
  }

  _isNodeInLayer(node, layer) {
    for (const item of (layer.subtree || [])) {
      if (item === node) return true;
      if (this._containsNode(item, node)) return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════
  //  SELECTION INFO
  // ═══════════════════════════════════════════════════════

  /** Selection info for any layer (used by action bars at all depths). */
  _getSelectionInfoForLayer(layer) {
    if (!layer || layer === this.sceneLayer) {
      return { display: '', canAdd: false, canRemove: false, count: 0 };
    }
    if (layer.inst?.selectionInfo) {
      return layer.inst.selectionInfo(layer, this._selectionBuffer, this);
    }
    const count = (layer.subtree || []).length;
    const buf   = this._selectionBuffer;
    let display = '—', canRemove = false;
    if (buf.length >= 1) {
      const entry = buf[buf.length - 1];
      const item  = entry.item || entry.node;
      if (this._isNodeInLayer(entry.node, layer) ||
          (entry.item && layer.subtree?.includes(entry.item))) {
        display = item.value?.name || '?';
        canRemove = true;
      }
    }
    return { display, canAdd: true, canRemove, count };
  }

  /** Backward compat — selection info for this.selectedLayer. */
  _getSelectionInfo() {
    return this._getSelectionInfoForLayer(this.selectedLayer);
  }

  /** Lightweight DOM-only update for all visible action bars. */
  _updateActionBar() {
    for (const [depth, layer] of Object.entries(this._actionBarMap)) {
      const info    = this._getSelectionInfoForLayer(layer);
      const display = document.getElementById(`sel-display-${depth}`);
      const addBtn  = document.getElementById(`sel-add-${depth}`);
      const rmBtn   = document.getElementById(`sel-remove-${depth}`);
      const countEl = document.getElementById(`sel-count-${depth}`);
      if (display) display.textContent = info.display;
      if (addBtn)  addBtn.disabled     = !info.canAdd;
      if (rmBtn)   rmBtn.disabled      = !info.canRemove;
      if (countEl) countEl.textContent = info.count;
    }
    // Sync item-fields along the full selected path
    let layer = this.selectedLayer;
    while (layer) {
      if (layer.inst?.itemFields) layer.inst.itemFields.sync(layer, this);
      layer = layer._selectedChild;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  ADD / REMOVE — generalized for any layer
  // ═══════════════════════════════════════════════════════

  /** Add an item to a specific layer (protocol or fallback). */
  _doAddToLayer(layer) {
    if (!layer) return;
    if (layer.inst?.addItem) {
      layer.inst.addItem(layer, this._selectionBuffer, this);
    } else {
      const def = ADDABLES.find(a => a.id === layer.value?.layerType);
      if (!def?.createItem) return;
      layer.subtree.push(def.createItem((layer.subtree || []).length));
    }
    this._selectionBuffer = [];
    this._rebuildContext();
    this.render();
  }

  /** Remove the selected item from a specific layer. */
  _doRemoveFromLayer(layer) {
    if (!layer || this._selectionBuffer.length === 0) return;
    if (layer.inst?.removeItem) {
      layer.inst.removeItem(layer, this._selectionBuffer, this);
    } else {
      const entry = this._selectionBuffer[this._selectionBuffer.length - 1];
      const item  = entry.item || entry.node;
      const idx   = layer.subtree.indexOf(item);
      if (idx >= 0) layer.subtree.splice(idx, 1);
    }
    this._selectionBuffer = [];
    this._rebuildContext();
    this.render();
  }

  /** Backward compat wrappers. */
  _doAdd()    { this._doAddToLayer(this.selectedLayer); }
  _doRemove() { this._doRemoveFromLayer(this.selectedLayer); }

  /** Public backward compat. */
  addItemToLayer(layer) {
    const def = ADDABLES.find(a => a.id === layer.value?.layerType);
    if (!def?.createItem) return;
    layer.subtree.push(def.createItem((layer.subtree || []).length));
    this._selectionBuffer = [];
    this._rebuildContext();
    this.render();
  }

  // ═══════════════════════════════════════════════════════
  //  ADD / REMOVE / REORDER LAYERS — at any depth
  // ═══════════════════════════════════════════════════════

  /** Add a new layer (from ADDABLES) into a parent node at a given depth. */
  _addObjectTo(parentNode, id, depth) {
    const def = ADDABLES.find(a => a.id === id);
    if (!def) return;
    const result = def.create(this);
    const layers = Array.isArray(result) ? result : [result];

    // Insert into the content parent's subtree (may differ from parentNode
    // if the container delegates to an inner node like stamp-frame)
    const contentParent = parentNode.inst?.getContentParent?.(parentNode) || parentNode;

    for (const layer of layers) {
      if (!layer.value.name) layer.value.name = this._nextName(id);
      if (!layer.value.dotColor) {
        layer.value.dotColor =
          LAYER_COLORS[this._contentLayersOf(parentNode).length % LAYER_COLORS.length];
      }
      contentParent.subtree.push(layer);
    }

    const newSel = layers[layers.length - 1];
    if (depth === 0) {
      this.selectedLayer = newSel;
    } else {
      parentNode._selectedChild = newSel;
    }

    this._selectionBuffer = [];
    this._rebuildContext();
    if (layers.some(l => l.inst?.runtime) && !this._animFrame) this._startAnimLoop();
    this.render();
  }

  /** Backward compat — add to scene root at depth 0. */
  addObject(id) {
    if (!this.currentScene?.hasLayers) return;
    this._addObjectTo(this.sceneLayer, id, 0);
  }

  /** Reorder a layer within a parent's subtree. */
  _reorderLayerIn(parentNode, layer, newIndex) {
    const contentParent = parentNode.inst?.getContentParent?.(parentNode) || parentNode;
    const subtree = contentParent.subtree;
    const layerChildren = subtree.filter(n => n.token === 'layer');
    const oldIndex = layerChildren.indexOf(layer);
    if (oldIndex < 0) return;

    subtree.splice(subtree.indexOf(layer), 1);
    const adjustedNew = newIndex > oldIndex ? newIndex - 1 : newIndex;
    const remaining = subtree.filter(n => n.token === 'layer');
    if (adjustedNew >= remaining.length) {
      subtree.push(layer);
    } else {
      subtree.splice(subtree.indexOf(remaining[adjustedNew]), 0, layer);
    }
    this._rebuildContext();
    this.render();
  }

  /** Remove a layer from a parent at a given depth. */
  _removeLayerFrom(parentNode, layer, depth) {
    const contentParent = parentNode.inst?.getContentParent?.(parentNode) || parentNode;
    const idx = contentParent.subtree.indexOf(layer);
    if (idx < 0) return;
    contentParent.subtree.splice(idx, 1);

    if (depth === 0) {
      if (this.selectedLayer === layer) {
        const remaining = this._contentLayersOf(parentNode);
        this.selectedLayer = remaining.length > 0
          ? remaining[Math.min(idx, remaining.length - 1)]
          : this.sceneLayer;
      }
    } else {
      if (parentNode._selectedChild === layer) {
        const remaining = this._contentLayersOf(parentNode);
        parentNode._selectedChild = remaining[0] || null;
      }
    }
    this._selectionBuffer = [];
    this._rebuildContext();
    this.render();
  }

  // ═══════════════════════════════════════════════════════
  //  CONTEXT — recursive twig builder
  // ═══════════════════════════════════════════════════════

  _rebuildContext() {
    this._actionBarMap = {};
    const sections = [];

    sections.push(this._buildSceneSection());
    this._pushLayerUI(sections, this.sceneLayer, 'scene');

    if (this.currentScene?.hasLayers) {
      this._pushLayerSystem(sections, this.sceneLayer, 0);
    }

    this.controls.setContext({
      sliderConfig: sections,
      // Harmless for a private panel (same function it was built with); load
      // bearing for a shared one, where it hands rendering to the live app.
      onRender: () => this.render(),
    });
  }

  /**
   * Recursive layer system: emits add-bar + layer-list + controls
   * for one level, then recurses if the selected layer is a container.
   */
  _pushLayerSystem(sections, parentNode, depth) {

    // ── Add bar ──────────────────────────────────────────
    const addableIds = depth === 0
      ? ADDABLES.map(a => a.id)
      : (parentNode.inst?.addables || []);

    const addableItems = addableIds
      .map(id => ADDABLES.find(a => a.id === id))
      .filter(Boolean);

    if (addableItems.length) {
      sections.push({
        type: 'addbar',
        id: `addbar-${depth}`,
        items: addableItems.map(a => ({ id: a.id, label: a.label })),
        onAdd: (id) => this._addObjectTo(parentNode, id, depth),
      });
    }

    // ── Layer list ───────────────────────────────────────
    const content = this._contentLayersOf(parentNode);

    // Always show the list for containers (depth > 0) even if empty,
    // so the user has a drag target to receive layers from elsewhere.
    if (!content.length && depth === 0) return;

    const rawSelected = depth === 0
      ? this.selectedLayer
      : parentNode._selectedChild;
    const selected = (rawSelected && content.includes(rawSelected))
      ? rawSelected : null;

    sections.push({
      type: 'layers',
      id: `layers-${depth}`,
      title: depth === 0 ? 'Layers' : 'Contents',
      layers: content,
      selectedLayer: selected,
      onSelect: (layer) => {
        if (depth === 0) this.selectedLayer = layer;
        else parentNode._selectedChild = layer;
        this._selectionBuffer = [];
        this._rebuildContext();
      },
      onToggleVisibility: () => this.render(),
      onReorder: (layer, newIndex) => this._reorderLayerIn(parentNode, layer, newIndex),
      onRemove:  (layer)           => this._removeLayerFrom(parentNode, layer, depth),
      onRename:  (layer, newName)  => { layer.value.name = newName; },
      onReceive: (layer) => {
        const contentParent = parentNode.inst?.getContentParent?.(parentNode) || parentNode;
        if (!layer.value.dotColor) {
          layer.value.dotColor =
            LAYER_COLORS[this._contentLayersOf(parentNode).length % LAYER_COLORS.length];
        }
        contentParent.subtree.push(layer);
        if (depth === 0) this.selectedLayer = layer;
        else parentNode._selectedChild = layer;
        this._selectionBuffer = [];
        this._rebuildContext();
        this.render();
      },
    });

    if (!selected) return;

    // ── Is this a container or a leaf? ───────────────────
    const isContainer = selected.inst?.addables?.length > 0;

    // ── Action bar (leaf layers only) ────────────────────
    if (!isContainer) {
      const info = this._getSelectionInfoForLayer(selected);
      this._actionBarMap[depth] = selected;
      sections.push({
        type: 'selection-action-bar',
        id: `action-bar-${depth}`,
        _depth: depth,
        ...info,
        onAdd:    () => this._doAddToLayer(selected),
        onRemove: () => this._doRemoveFromLayer(selected),
      });
    }

    // ── Layer controls ───────────────────────────────────
    this._pushLayerUI(sections, selected, `d${depth}`);

    // ── Recurse into container ───────────────────────────
    if (isContainer) {
      this._pushLayerSystem(sections, selected, depth + 1);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  UI HELPERS
  // ═══════════════════════════════════════════════════════

  _pushLayerUI(sections, layer, prefix = '') {
    if (layer.inst?.itemFields) {
      sections.push(
        ...this._wrapBuildUI(layer, [layer.inst.itemFields.section()]));
    }
    if (layer.inst?.presets) {
      sections.push({
        type: 'presets', group: 'Presets',
        id: prefix ? `${prefix}-presets` : 'presets',
        abbrev: 'Pre',
        presets: layer.inst.presets,
        _params: layer.value.params,
      });
    }
    if (layer.inst?.buildUI) {
      sections.push(
        ...this._wrapBuildUI(layer, layer.inst.buildUI(layer)));
    }
  }

  _buildSceneSection() {
    const optgroups = {};
    for (const s of SCENES) {
      (optgroups[s.group] ??= []).push({
        value: s.id, label: s.label,
        selected: s.id === this.currentScene?.id,
        preset: s.preset ?? null,
      });
    }
    return {
      group: 'Scene', id: 'scene', abbrev: 'Scn',
      type: 'select', selectId: 'sceneSelector',
      optgroups,
      onChange: (val) => { if (val) this._loadScene(val); },
    };
  }

  _wrapBuildUI(layer, sections) {
    return sections.map(sec => {
      const wrapped = { ...sec, _params: layer.value.params };
      if (sec.type === 'custom' && sec.build) {
        const origBuild = sec.build;
        wrapped.build = (groupEl, _controls) => origBuild(groupEl, layer, this);
      }
      return wrapped;
    });
  }
}


// Auto-boot when this module IS the page's app (omni-scene.html loads it
// directly via <script type="module" src=...>, and needs no change).
//
// A host that wants the class without the app — d-plus.html imports it and
// injects its own shell — sets the flag in a plain <script> beforehand:
//
//   <script>window.OMNI_SCENE_NO_AUTOBOOT = true;</script>
//   <script type="module" src="./d-plus-app.js"></script>
//
// A classic script runs before any deferred module, so the flag is always
// set in time. An `import` alone could not do it: imports are hoisted.
if (typeof window === 'undefined' || !window.OMNI_SCENE_NO_AUTOBOOT) {
  new OmniSceneApp();
}
export { OmniSceneApp };