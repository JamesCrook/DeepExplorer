// `layers` and `selection-action-bar` — the twig panel's draggable layer list, and the bar of actions on a selection
/**
 * Refactored to use static mount with ctxMix.parentEl.
 * No compact branch — nav representation is handled by coerceToAST.
 *
 *   - Drag to reorder within the list
 *   - Drag off the twig panel to delete
 *   - Drop on the twig panel (not on a list) to cancel
 *   - Drop on a different layer list to re-parent (future)
 *   - Double-click to rename
 */

import { OmniWidget } from './widget-base.js';
import { SYS } from '../../omni-support/sys.js';


// ═══════════════════════════════════════════════════════
//  INJECTED CSS
// ═══════════════════════════════════════════════════════

const LAYERS_CSS = `
.sc-drag-ghost {
  position: fixed; z-index: 9999; pointer-events: none;
  padding: 4px 10px; border-radius: 6px;
  font: 12px/1.4 sans-serif; color: #c9d1d9;
  background: #21262d; border: 1px solid #4fc3f7;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4); opacity: 0.92;
  white-space: nowrap; display: flex; align-items: center; gap: 6px;
  transition: border-color 0.15s, background 0.15s;
}
.sc-drag-ghost .sc-layer-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.sc-drag-ghost.delete-zone { border-color: #f85149; background: #3d1117; }
.sc-drag-ghost.delete-zone::after {
  content: '×'; margin-left: 6px; color: #f85149; font-weight: bold; font-size: 14px;
}
.sc-drop-indicator {
  height: 2px; background: #4fc3f7; border-radius: 1px;
  margin: 0 4px; pointer-events: none; transition: opacity 0.1s;
}
.sc-layer-item.dragging { opacity: 0.25; }
.sc-layer-name-input {
  background: #0d1117; border: 1px solid #4fc3f7; border-radius: 3px;
  color: #c9d1d9; font: inherit; padding: 1px 4px; width: 100%; outline: none;
}
`;

(() => {
  if (typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = LAYERS_CSS;
  document.head.appendChild(style);
})();


// ═══════════════════════════════════════════════════════
//  DRAG STATE (module-scoped singleton)
// ═══════════════════════════════════════════════════════

let _suppressClick = false;

const _drag = {
  active: false, layer: null, sourceListId: null, sourceItem: null,
  ghost: null, indicator: null, startX: 0, startY: 0, threshold: 5, config: null,
};


// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function findTwigPanel(el) {
  return el?.closest('.controls-wrapper') || document.querySelector('.controls-wrapper');
}

function findLayerListAtPoint(x, y) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const panel = el.closest?.('.sc-layers-panel');
    if (panel) return panel;
  }
  return null;
}

function getListId(panel) { return panel?.dataset?.listId || null; }

function findDropIndex(panel, y, draggedItem) {
  const items = [...panel.querySelectorAll('.sc-layer-item')];
  if (!items.length) return 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i] === draggedItem) continue;
    const rect = items[i].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return i;
  }
  return items.length;
}

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

function ensureIndicator() {
  if (_drag.indicator) return _drag.indicator;
  const ind = document.createElement('div');
  ind.className = 'sc-drop-indicator';
  _drag.indicator = ind;
  return ind;
}

function removeIndicator() {
  if (_drag.indicator?.parentElement) _drag.indicator.remove();
}

function showIndicatorAt(panel, dropIndex, draggedItem) {
  const ind = ensureIndicator();
  const items = [...panel.querySelectorAll('.sc-layer-item')];
  const visibleItems = items.filter(it => it !== draggedItem);

  if (visibleItems.length === 0) { panel.appendChild(ind); return; }

  const dragIndex = items.indexOf(draggedItem);
  let refIndex = dropIndex;
  if (dragIndex >= 0 && dropIndex > dragIndex) {
    refIndex = Math.min(dropIndex, visibleItems.length);
  } else {
    refIndex = Math.min(dropIndex, visibleItems.length);
  }

  if (refIndex < visibleItems.length) visibleItems[refIndex].before(ind);
  else visibleItems[visibleItems.length - 1].after(ind);
}


// ═══════════════════════════════════════════════════════
//  DOCUMENT-LEVEL POINTER HANDLERS
// ═══════════════════════════════════════════════════════

function onPointerMove(e) {
  if (!_drag.layer) return;
  const dx = e.clientX - _drag.startX;
  const dy = e.clientY - _drag.startY;

  if (!_drag.active) {
    if (Math.abs(dx) + Math.abs(dy) < _drag.threshold) return;
    _drag.active = true;
    _drag.ghost = createGhost(_drag.layer);
    _drag.sourceItem?.classList.add('dragging');
  }

  _drag.ghost.style.left = (e.clientX + 12) + 'px';
  _drag.ghost.style.top  = (e.clientY - 12) + 'px';

  const twigPanel = findTwigPanel(_drag.sourceList);
  const twigRect  = twigPanel?.getBoundingClientRect();
  const inTwig    = twigRect && e.clientX >= twigRect.left && e.clientX <= twigRect.right
                             && e.clientY >= twigRect.top  && e.clientY <= twigRect.bottom;

  const targetList = findLayerListAtPoint(e.clientX, e.clientY);

  if (!inTwig) {
    _drag.ghost.classList.add('delete-zone');
    removeIndicator();
  } else if (targetList) {
    _drag.ghost.classList.remove('delete-zone');
    const dropIndex = findDropIndex(targetList, e.clientY, _drag.sourceItem);
    showIndicatorAt(targetList, dropIndex, _drag.sourceItem);
  } else {
    _drag.ghost.classList.remove('delete-zone');
    removeIndicator();
  }
}

function onPointerUp(e) {
  if (!_drag.layer) return;
  const layer  = _drag.layer;
  const config = _drag.config;

  if (_drag.active) {
    _suppressClick = true;
    const twigPanel = findTwigPanel(document.querySelector('.sc-layers-panel'));
    const twigRect  = twigPanel?.getBoundingClientRect();
    const inTwig    = twigRect && e.clientX >= twigRect.left && e.clientX <= twigRect.right
                               && e.clientY >= twigRect.top  && e.clientY <= twigRect.bottom;

    const targetList   = findLayerListAtPoint(e.clientX, e.clientY);
    const targetListId = getListId(targetList);

    if (!inTwig) {
      config?.onRemove?.(layer);
    } else if (targetListId && targetListId === _drag.sourceListId) {
      const dropIndex = findDropIndex(targetList, e.clientY, _drag.sourceItem);
      config?.onReorder?.(layer, dropIndex);
    } else if (targetList && targetListId !== _drag.sourceListId) {
      const targetConfig = targetList._layersConfig;
      if (targetConfig?.onReceive) {
        config?.onRemove?.(layer);
        targetConfig.onReceive(layer);
      }
    }
  }
  _cleanup();
}

function _cleanup() {
  _drag.sourceItem?.classList.remove('dragging');
  _drag.ghost?.remove();
  removeIndicator();
  _drag.active = false; _drag.layer = null; _drag.sourceListId = null;
  _drag.sourceItem = null; _drag.ghost = null; _drag.config = null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup',   onPointerUp);
  document.addEventListener('pointercancel', _cleanup);
}


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
//  LAYERS WIDGET — uses static mount + ctxMix.parentEl
// ═══════════════════════════════════════════════════════
//
//  Layers is a leaf in the AST (subtree: []).
//  It reads layers from node.inst.layers and builds the
//  list internally — layers are scene objects, not AST nodes.

class LayersWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const inst = node.inst || {};
    const layers = inst.layers || [];

    const panel = document.createElement('div');
    panel.className = 'sc-layers-panel';
    panel.dataset.listId = v.id || 'layers';

    // Stash config on DOM for cross-list drop detection
    panel._layersConfig = inst;

    const title = document.createElement('div');
    title.className = 'sc-layers-title';
    title.textContent = v.title || 'Layers';
    panel.appendChild(title);

    for (const layer of layers) {
      const item = document.createElement('div');
      item.className = 'sc-layer-item';
      if (layer === v.selectedLayer) item.classList.add('selected');

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
        inst.onToggleVisibility?.(layer);
      };

      item.appendChild(dot);
      item.appendChild(name);
      item.appendChild(vis);

      item.addEventListener('click', () => {
        if (_suppressClick) { _suppressClick = false; return; }
        inst.onSelect?.(layer);
      });

      item.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startRename(name, layer, inst);
      });

      item.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.sc-layer-vis')) return;
        e.preventDefault();
        _drag.layer        = layer;
        _drag.sourceListId = v.id || 'layers';
        _drag.sourceItem   = item;
        _drag.config       = inst;
        _drag.startX       = e.clientX;
        _drag.startY       = e.clientY;
        _drag.active       = false;
      });

      panel.appendChild(item);
    }

    ctxMix.parentEl.appendChild(panel);
  }
}


// ═══════════════════════════════════════════════════════
//  SELECTION ACTION BAR — depth-aware override
// ═══════════════════════════════════════════════════════

class SelectionActionBarWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const d = v._depth ?? '';
    const bar = document.createElement('div');
    bar.className = 'sc-selection-bar';

    const count = document.createElement('span');
    count.className = 'sc-sel-count';
    count.id = `sel-count-${d}`;
    count.textContent = v.count ?? 0;

    const display = document.createElement('span');
    display.className = 'sc-sel-display';
    display.id = `sel-display-${d}`;
    display.textContent = v.display || '—';

    const addBtn = document.createElement('button');
    addBtn.className = 'sc-sel-btn';
    addBtn.id = `sel-add-${d}`;
    addBtn.textContent = '+';
    addBtn.title = 'Add';
    addBtn.disabled = !v.canAdd;
    addBtn.onclick = () => { if (node.inst?.onAdd) node.inst.onAdd(); };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'sc-sel-btn sc-sel-btn-remove';
    removeBtn.id = `sel-remove-${d}`;
    removeBtn.textContent = '−';
    removeBtn.title = 'Remove';
    removeBtn.disabled = !v.canRemove;
    removeBtn.onclick = () => { if (node.inst?.onRemove) node.inst.onRemove(); };

    bar.appendChild(count);
    bar.appendChild(display);
    bar.appendChild(addBtn);
    bar.appendChild(removeBtn);
    ctxMix.parentEl.appendChild(bar);
  }
}


// ═══════════════════════════════════════════════════════
//  REGISTRATION
// ═══════════════════════════════════════════════════════
SYS.NODE_CLASSES.push({ name: 'layers', cls: LayersWidget, defaults: { wrapInGroup: false, showInStrip: false } });
SYS.NODE_CLASSES.push({ name: 'selection-action-bar', cls: SelectionActionBarWidget, defaults: { wrapInGroup: false, showInStrip: false } });

export { LayersWidget, SelectionActionBarWidget };
