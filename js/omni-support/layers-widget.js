/**
 * layers-widget.js — Draggable layer list for the twig panel
 *
 * Replaces the default LayersWidget with:
 *   - Drag to reorder within the list
 *   - Drag off the twig panel to delete
 *   - Drop on the twig panel (not on a list) to cancel
 *   - Drop on a different layer list to re-parent (future)
 *   - Double-click to rename
 *
 * Import after omni-widget.js to override the registration:
 *   import './layers-widget.js';
 *
 * Place in: omni-support/layers-widget.js
 */

import { OmniWidget, createWidget, parseDslValue, _esc }
                             from './omni-widget.js';
import { sceneRegistry }     from './scene.js';


// ═══════════════════════════════════════════════════════
//  INJECTED CSS
// ═══════════════════════════════════════════════════════

const LAYERS_CSS = `
/* Drag ghost — fixed overlay that follows the pointer */
.sc-drag-ghost {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  padding: 4px 10px;
  border-radius: 6px;
  font: 12px/1.4 sans-serif;
  color: #c9d1d9;
  background: #21262d;
  border: 1px solid #4fc3f7;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  opacity: 0.92;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: border-color 0.15s, background 0.15s;
}
.sc-drag-ghost .sc-layer-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.sc-drag-ghost.delete-zone {
  border-color: #f85149;
  background: #3d1117;
}
.sc-drag-ghost.delete-zone::after {
  content: '×';
  margin-left: 6px;
  color: #f85149;
  font-weight: bold;
  font-size: 14px;
}

/* Drop indicator — thin line between items */
.sc-drop-indicator {
  height: 2px;
  background: #4fc3f7;
  border-radius: 1px;
  margin: 0 4px;
  pointer-events: none;
  transition: opacity 0.1s;
}

/* Dragging state on the source item */
.sc-layer-item.dragging {
  opacity: 0.25;
}

/* Rename input — inline editing */
.sc-layer-name-input {
  background: #0d1117;
  border: 1px solid #4fc3f7;
  border-radius: 3px;
  color: #c9d1d9;
  font: inherit;
  padding: 1px 4px;
  width: 100%;
  outline: none;
}
`;

(() => {
  const style = document.createElement('style');
  style.textContent = LAYERS_CSS;
  document.head.appendChild(style);
})();


// ═══════════════════════════════════════════════════════
//  DRAG STATE (module-scoped singleton)
// ═══════════════════════════════════════════════════════

let _suppressClick = false;   // prevents click-after-drag firing onSelect

const _drag = {
  active:       false,
  layer:        null,      // the MiniAstNode being dragged
  sourceListId: null,      // stable id of the source .sc-layers-panel
  sourceItem:   null,      // the .sc-layer-item element
  ghost:        null,      // the floating ghost element
  indicator:    null,      // the drop indicator line
  startX:       0,
  startY:       0,
  threshold:    5,         // px before drag activates
  config:       null,      // the widget config (has callbacks)
};


// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

/** Find the .controls-wrapper ancestor (the twig panel boundary). */
function findTwigPanel(el) {
  return el?.closest('.controls-wrapper') || document.querySelector('.controls-wrapper');
}

/** Find which .sc-layers-panel the pointer is over (if any). */
function findLayerListAtPoint(x, y) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const panel = el.closest?.('.sc-layers-panel');
    if (panel) return panel;
  }
  return null;
}

/** Get the stable list ID from a panel element. */
function getListId(panel) {
  return panel?.dataset?.listId || null;
}

/** Find the gap index for insertion given pointer Y within a list panel. */
function findDropIndex(panel, y, draggedItem) {
  const items = [...panel.querySelectorAll('.sc-layer-item')];
  if (!items.length) return 0;

  for (let i = 0; i < items.length; i++) {
    if (items[i] === draggedItem) continue;
    const rect = items[i].getBoundingClientRect();
    const mid  = rect.top + rect.height / 2;
    if (y < mid) return i;
  }
  return items.length;
}

/** Create the floating ghost element. */
function createGhost(layer) {
  const ghost = document.createElement('div');
  ghost.className = 'sc-drag-ghost';

  const dot = document.createElement('div');
  dot.className = 'sc-layer-dot';
  dot.style.backgroundColor = layer.value?.dotColor || '#888';

  const name = document.createElement('span');
  name.textContent = layer.value?.name || 'Layer';

  ghost.appendChild(dot);
  ghost.appendChild(name);
  document.body.appendChild(ghost);
  return ghost;
}

/** Create or reuse the drop indicator line. */
function ensureIndicator() {
  if (_drag.indicator) return _drag.indicator;
  const ind = document.createElement('div');
  ind.className = 'sc-drop-indicator';
  _drag.indicator = ind;
  return ind;
}

/** Remove indicator from the DOM. */
function removeIndicator() {
  if (_drag.indicator?.parentElement) {
    _drag.indicator.remove();
  }
}

/** Position the indicator at a gap index in a layer list panel. */
function showIndicatorAt(panel, dropIndex, draggedItem) {
  const ind   = ensureIndicator();
  const items = [...panel.querySelectorAll('.sc-layer-item')];

  // Remove the dragged item from consideration for positioning
  const visibleItems = items.filter(it => it !== draggedItem);

  if (visibleItems.length === 0) {
    // Empty list — show at top
    panel.appendChild(ind);
    return;
  }

  // Insert before the item at dropIndex, or after the last item
  let refIndex = dropIndex;
  // Adjust for the dragged item being absent from visible
  const dragIndex = items.indexOf(draggedItem);
  if (dragIndex >= 0 && dropIndex > dragIndex) {
    refIndex = Math.min(dropIndex, visibleItems.length);
  } else {
    refIndex = Math.min(dropIndex, visibleItems.length);
  }

  if (refIndex < visibleItems.length) {
    visibleItems[refIndex].before(ind);
  } else {
    visibleItems[visibleItems.length - 1].after(ind);
  }
}


// ═══════════════════════════════════════════════════════
//  DOCUMENT-LEVEL POINTER HANDLERS
// ═══════════════════════════════════════════════════════

function onPointerMove(e) {
  if (!_drag.layer) return;

  const dx = e.clientX - _drag.startX;
  const dy = e.clientY - _drag.startY;

  // ── Threshold check ──
  if (!_drag.active) {
    if (Math.abs(dx) + Math.abs(dy) < _drag.threshold) return;
    _drag.active = true;
    _drag.ghost = createGhost(_drag.layer);
    _drag.sourceItem?.classList.add('dragging');
  }

  // ── Move ghost ──
  _drag.ghost.style.left = (e.clientX + 12) + 'px';
  _drag.ghost.style.top  = (e.clientY - 12) + 'px';

  // ── Detect zone ──
  const twigPanel = findTwigPanel(_drag.sourceList);
  const twigRect  = twigPanel?.getBoundingClientRect();
  const inTwig    = twigRect && e.clientX >= twigRect.left && e.clientX <= twigRect.right
                             && e.clientY >= twigRect.top  && e.clientY <= twigRect.bottom;

  const targetList = findLayerListAtPoint(e.clientX, e.clientY);

  if (!inTwig) {
    // DELETE ZONE — outside the twig panel
    _drag.ghost.classList.add('delete-zone');
    removeIndicator();
  } else if (targetList) {
    // REORDER / RE-PARENT — over a layer list
    _drag.ghost.classList.remove('delete-zone');
    const dropIndex = findDropIndex(targetList, e.clientY, _drag.sourceItem);
    showIndicatorAt(targetList, dropIndex, _drag.sourceItem);
  } else {
    // CANCEL ZONE — on twig panel but not on a list
    _drag.ghost.classList.remove('delete-zone');
    removeIndicator();
  }
}

function onPointerUp(e) {
  if (!_drag.layer) return;

  const layer  = _drag.layer;
  const config = _drag.config;

  if (_drag.active) {
    _suppressClick = true;   // prevent the trailing click from firing onSelect

    const twigPanel = findTwigPanel(document.querySelector('.sc-layers-panel'));
    const twigRect  = twigPanel?.getBoundingClientRect();
    const inTwig    = twigRect && e.clientX >= twigRect.left && e.clientX <= twigRect.right
                               && e.clientY >= twigRect.top  && e.clientY <= twigRect.bottom;

    const targetList   = findLayerListAtPoint(e.clientX, e.clientY);
    const targetListId = getListId(targetList);

    if (!inTwig) {
      // ── DELETE ──
      config?.onRemove?.(layer);
    } else if (targetListId && targetListId === _drag.sourceListId) {
      // ── REORDER within same list ──
      const dropIndex = findDropIndex(targetList, e.clientY, _drag.sourceItem);
      config?.onReorder?.(layer, dropIndex);
    } else if (targetList && targetListId !== _drag.sourceListId) {
      // ── RE-PARENT to different list ── (future: cross-list move)
      const targetConfig = targetList._layersConfig;
      if (targetConfig?.onReceive) {
        config?.onRemove?.(layer);
        targetConfig.onReceive(layer);
      }
    }
    // else: cancel — on twig but not on a list
  }

  _cleanup();
}

function _cleanup() {
  _drag.sourceItem?.classList.remove('dragging');
  _drag.ghost?.remove();
  removeIndicator();
  _drag.active       = false;
  _drag.layer        = null;
  _drag.sourceListId = null;
  _drag.sourceItem   = null;
  _drag.ghost        = null;
  _drag.config       = null;
}

// Register document-level handlers once
document.addEventListener('pointermove', onPointerMove);
document.addEventListener('pointerup',   onPointerUp);
document.addEventListener('pointercancel', _cleanup);


// ═══════════════════════════════════════════════════════
//  RENAME HELPERS
// ═══════════════════════════════════════════════════════

function startRename(nameEl, layer, config) {
  const input = document.createElement('input');
  input.type      = 'text';
  input.className = 'sc-layer-name-input';
  input.value     = layer.value?.name || '';

  const commit = () => {
    const newName = input.value.trim();
    if (newName && newName !== layer.value?.name) {
      config?.onRename?.(layer, newName);
    }
    // Restore the name span
    input.replaceWith(nameEl);
    nameEl.textContent = layer.value?.name || 'Layer';
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') {
      input.removeEventListener('blur', commit);
      input.replaceWith(nameEl);
    }
  });

  nameEl.replaceWith(input);
  input.focus();
  input.select();
}


// ═══════════════════════════════════════════════════════
//  LAYERS WIDGET
// ═══════════════════════════════════════════════════════

class LayersWidget extends OmniWidget {

  get wrapInGroup() { return false; }
  get showInStrip() { return false; }

  mount(ctxMix, node, params) {
    if (ctxMix.compact) {
      const layers = node.layers || [];
      if (!layers.length) return null;
      const cfg = {
        type: 'nav-submenu', label: node.title || 'Layers',
        subtree: layers.map(layer => ({
          type: 'nav-item', label: layer.value?.name || 'Layer',
          action: () => { node.onSelect?.(layer); },
        })),
      };
      
      return createWidget(cfg).mount(ctxMix, cfg, params);
    }

    const panel = document.createElement('div');
    panel.className = 'sc-layers-panel';
    panel.dataset.listId = node.id || 'layers';

    // Stash config on the DOM node for cross-list drop detection
    panel._layersConfig = node;

    const title = document.createElement('div');
    title.className = 'sc-layers-title';
    title.textContent = node.title || 'Layers';
    panel.appendChild(title);

    for (const layer of (node.layers || [])) {
      const item = document.createElement('div');
      item.className = 'sc-layer-item';
      if (layer === node.selectedLayer) item.classList.add('selected');

      const dot = document.createElement('div');
      dot.className = 'sc-layer-dot';
      dot.style.backgroundColor = layer.value?.dotColor || '#888';

      const name = document.createElement('span');
      name.className = 'sc-layer-name';
      name.textContent = layer.value?.name || 'Layer';

      const vis = document.createElement('button');
      vis.className = 'sc-layer-vis';
      vis.textContent = layer.value?.visible !== false ? '👁' : '·';
      vis.onclick = (e) => {
        e.stopPropagation();
        layer.value.visible = !layer.value.visible;
        vis.textContent = layer.value.visible ? '👁' : '·';
        node.onToggleVisibility?.(layer);
      };

      item.appendChild(dot);
      item.appendChild(name);
      item.appendChild(vis);

      // ── Click to select ──
      item.addEventListener('click', () => {
        if (_suppressClick) { _suppressClick = false; return; }
        node.onSelect?.(layer);
      });

      // ── Double-click to rename ──
      item.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startRename(name, layer, node);
      });

      // ── Pointer down to start drag ──
      item.addEventListener('pointerdown', (e) => {
        // Only left button, ignore vis button
        if (e.button !== 0) return;
        if (e.target.closest('.sc-layer-vis')) return;

        e.preventDefault();
        _drag.layer        = layer;
        _drag.sourceListId = node.id || 'layers';
        _drag.sourceItem   = item;
        _drag.config       = node;
        _drag.startX       = e.clientX;
        _drag.startY       = e.clientY;
        _drag.active       = false;
      });

      panel.appendChild(item);
    }

    return panel;
  }

}


// ═══════════════════════════════════════════════════════
//  SELECTION ACTION BAR — depth-aware override
// ═══════════════════════════════════════════════════════
//
// Uses config._depth (number) to generate unique element IDs
// so multiple action bars at different twig depths don't collide.

class SelectionActionBarWidget extends OmniWidget {

  get wrapInGroup() { return false; }
  get showInStrip() { return false; }

  mount(ctxMix, node, params) {
    if (ctxMix.compact) return null;

    const d = node._depth ?? '';
    const bar = document.createElement('div');
    bar.className = 'sc-selection-bar';

    const count = document.createElement('span');
    count.className = 'sc-sel-count';
    count.id = `sel-count-${d}`;
    count.textContent = node.count ?? 0;

    const display = document.createElement('span');
    display.className = 'sc-sel-display';
    display.id = `sel-display-${d}`;
    display.textContent = node.display || '—';

    const addBtn = document.createElement('button');
    addBtn.className = 'sc-sel-btn';
    addBtn.id = `sel-add-${d}`;
    addBtn.textContent = '+';
    addBtn.title = 'Add';
    addBtn.disabled = !node.canAdd;
    addBtn.onclick = () => { if (node.onAdd) node.onAdd(); };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'sc-sel-btn sc-sel-btn-remove';
    removeBtn.id = `sel-remove-${d}`;
    removeBtn.textContent = '−';
    removeBtn.title = 'Remove';
    removeBtn.disabled = !node.canRemove;
    removeBtn.onclick = () => { if (node.onRemove) node.onRemove(); };

    bar.appendChild(count);
    bar.appendChild(display);
    bar.appendChild(addBtn);
    bar.appendChild(removeBtn);
    return bar;
  }
}


// ═══════════════════════════════════════════════════════
//  RE-REGISTER
// ═══════════════════════════════════════════════════════
sceneRegistry.registerNodeClass('layers',               LayersWidget);
sceneRegistry.registerNodeClass('selection-action-bar',  SelectionActionBarWidget);

export { LayersWidget, SelectionActionBarWidget };