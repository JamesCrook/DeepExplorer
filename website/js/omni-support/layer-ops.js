/**
 * layer-ops.js — Twig protocol helpers
 *
 * Provides:
 *   - Tree utilities: findByToken, containsNode, isNodeInLayer
 *   - autoName: spreadsheet-column naming (0→A, 25→Z, 26→AA)
 *   - createLayerOps: generates default protocol methods for a layer type
 *
 * ── The Twig Protocol ──────────────────────────────────────────
 *
 * Every layer.inst may implement these methods so the twig
 * (OmniSceneApp's right-hand panel) can drive add/remove/select
 * uniformly without switching on layerType:
 *
 *   addItem(layer, selectionBuffer, app)
 *     → add a new item to this layer
 *
 *   removeItem(layer, selectionBuffer, app)
 *     → remove the currently selected item (may cascade)
 *
 *   selectionInfo(layer, selectionBuffer, app)
 *     → { display, canAdd, canRemove, count }
 *
 * Layers that don't implement these get a generic fallback in the
 * app (ADDABLE.createItem / splice from subtree).
 *
 * createLayerOps() builds default implementations for the common
 * case: a flat list of same-token items inside a container node.
 *
 * Place in: omni-support/layer-ops.js
 */

import { MiniAstNode } from './scene.js';


// ═══════════════════════════════════════════════════════
//  TREE UTILITIES
// ═══════════════════════════════════════════════════════

/** Walk a subtree depth-first; return the first node matching `token`. */
function findByToken(root, token) {
  if (!root) return null;
  if (root.token === token) return root;
  for (const child of (root.subtree || [])) {
    const hit = findByToken(child, token);
    if (hit) return hit;
  }
  return null;
}

/** True if `target` is anywhere inside `parent`'s subtree. */
function containsNode(parent, target) {
  for (const child of (parent.subtree || [])) {
    if (child === target) return true;
    if (containsNode(child, target)) return true;
  }
  return false;
}

/** True if `node` is (or is inside) any direct child of `layer`. */
function isNodeInLayer(node, layer) {
  for (const item of (layer.subtree || [])) {
    if (item === node) return true;
    if (containsNode(item, node)) return true;
  }
  return false;
}


// ═══════════════════════════════════════════════════════
//  NAMING
// ═══════════════════════════════════════════════════════

/** Spreadsheet-column naming: 0→A, 1→B, … 25→Z, 26→AA, 27→AB … */
function autoName(index) {
  let name = '';
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}


// ═══════════════════════════════════════════════════════
//  createLayerOps — default protocol implementation
// ═══════════════════════════════════════════════════════

/**
 * Generate default twig-protocol methods for a layer whose items
 * are a flat list of same-token children inside a container node.
 *
 * @param {Object} config
 * @param {string}   config.itemToken     — token to match (e.g. 'ribbon-point')
 * @param {Function} config.getContainer  — (layer) → node whose subtree holds items
 * @param {Function} config.createItem    — (layer, index, app) → new MiniAstNode
 * @param {Function} [config.getDisplayName] — (item, index) → string
 * @param {boolean|Function} [config.canAlwaysAdd=true]
 *
 * @returns {{ addItem, removeItem, selectionInfo }}
 */
function createLayerOps(config) {
  const {
    itemToken,
    getContainer,
    createItem,
    getDisplayName = (item) => item.value?.name || '?',
    canAlwaysAdd = true,
  } = config;

  /** Find the selected item node in the container from the selection buffer. */
  function findSelected(layer, buf) {
    const container = getContainer(layer);
    if (!container) return null;
    for (let i = buf.length - 1; i >= 0; i--) {
      const entry = buf[i];
      if (entry.node?.token === itemToken &&
          container.subtree?.includes(entry.node)) {
        return entry.node;
      }
    }
    return null;
  }

  return {

    addItem(layer, _buf, app) {
      const container = getContainer(layer);
      if (!container) return;
      const index = container.subtree.length;
      const item = createItem(layer, index, app);
      container.subtree.push(item);
    },

    removeItem(layer, buf, _app) {
      const container = getContainer(layer);
      if (!container) return;
      const selected = findSelected(layer, buf);
      if (!selected) return;
      const idx = container.subtree.indexOf(selected);
      if (idx >= 0) container.subtree.splice(idx, 1);
    },

    selectionInfo(layer, buf, app) {
      const container = getContainer(layer);
      const items = container?.subtree?.filter(n => n.token === itemToken) || [];
      const selected = findSelected(layer, buf);

      const add = typeof canAlwaysAdd === 'function'
        ? canAlwaysAdd(layer, buf, app)
        : canAlwaysAdd;

      return {
        display:   selected ? getDisplayName(selected, items.indexOf(selected)) : '—',
        canAdd:    add,
        canRemove: !!selected,
        count:     items.length,
      };
    },
  };
}


export { findByToken, containsNode, isNodeInLayer, autoName, createLayerOps };
