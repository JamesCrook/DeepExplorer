/**
 * omni-mask-model.js
 *
 * Builds and manages the mask editor's AST from layer state.
 *
 * Layer model:
 *   { id, name, color, vis, via, alpha,
 *     old: { on, sh: [{x,y,w,h}, ...] },
 *     xsa: { on, mode, sThk, mW },
 *     lld: { on, exp: [{a,d,ph},...], etch, gang },
 *   }
 *
 * Folder model:
 *   { id, name, collapsed, childIds: [layerId,...],
 *     repeat: { on, hp, vp },
 *     clipLayerId: layerId|null }
 *
 * AST is rebuilt when layers are added/removed/reordered.
 * Parameter changes (angles, zoom) re-render without rebuild.
 */

import { MiniAstNode } from '../omni-support/scene.js';

// ── Default colors for new layers ─────────────────────

const LAYER_COLORS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa'];

let _layerId = 0;
let _folderId = 0;


class OmniMaskModel {

  // ── Layer factory ───────────────────────────────────

  static createLayer(name, color) {
    const id = _layerId++;
    return {
      id,
      name: name || `Layer ${id + 1}`,
      color: color || LAYER_COLORS[id % LAYER_COLORS.length],
      vis: true,
      via: false,
      alpha: 1,
      old: { on: false, sh: [] },
      xsa: { on: false, mode: 'SADP', sThk: 20, mW: 40 },
      lld: {
        on: false,
        exp: [
          { a: 0, d: 0.5, ph: 0 },
          { a: 90, d: 0.5, ph: 0 },
          { a: 45, d: 0.5, ph: 0 },
        ],
        etch: '3of3',
        gang: false,
        ox: 0, oy: 0,   // screen offset for the directions widget
      },
    };
  }

  // ── Folder factory ──────────────────────────────────

  static createFolder(name) {
    return {
      id: _folderId++,
      name: name || `Group ${_folderId}`,
      collapsed: false,
      childIds: [],
      repeat: { on: false, hp: 500, vp: 500 },
      clipLayerId: null,
    };
  }

  // ── Reset ID counters (for load) ────────────────────

  static resetIds(layers, folders) {
    _layerId = layers.length
      ? Math.max(0, ...layers.map(l => l.id)) + 1 : 0;
    _folderId = folders.length
      ? Math.max(0, ...folders.map(f => f.id)) + 1 : 0;
  }

  // ── AST builder ─────────────────────────────────────
  //
  // Builds the full scene AST from current state.
  // Called when layers change structure (add/remove/reorder).
  // NOT called on slider changes — those flow through params.

  static buildAst(layers, folders, state = {}) {
    const children = [];

    // 1. Background grid
    children.push(new MiniAstNode('grid-bg'));

    // 2. Layers in render order
    const inFolder = new Set();
    folders.forEach(f => f.childIds.forEach(id => inFolder.add(id)));
    const renderedFolders = new Set();

    for (const L of layers) {
      if (!L.vis) continue;

      if (inFolder.has(L.id)) {
        const folder = folders.find(f => f.childIds.includes(L.id));
        if (folder && !renderedFolders.has(folder.id)) {
          renderedFolders.add(folder.id);
          // Render all visible children of this folder
          const folderChildren = folder.childIds
            .map(id => layers.find(l => l.id === id))
            .filter(l => l && l.vis);

          const clipShapes = this._getClipShapes(folder, layers);

          for (const child of folderChildren) {
            const isClip = folder.clipLayerId === child.id;
            children.push(
              this._layerAstNode(child, isClip ? null : folder, clipShapes)
            );
          }
        }
      } else {
        children.push(this._layerAstNode(L, null, null));
      }
    }

    // 3. Clip outlines
    const allClipShapes = [];
    for (const f of folders) {
      if (!f.clipLayerId) continue;
      const cL = layers.find(l => l.id === f.clipLayerId);
      if (cL && cL.old.sh.length) {
        allClipShapes.push(...cL.old.sh);
      }
    }
    if (allClipShapes.length) {
      children.push(new MiniAstNode('clip-outline', [], allClipShapes));
    }

    return new MiniAstNode('mask-root', children);
  }

  // ── Single layer → AST subtree ──────────────────────

  static _layerAstNode(L, folder, clipShapes) {
    const layerChildren = [];

    // Chip layer (Old Process shapes)
    if (L.old.on) {
      const shapeNodes = L.old.sh.map(s =>
        new MiniAstNode('rect', [], { x: s.x, y: s.y, w: s.w, h: s.h })
      );

      const chipValue = {
        color: L.color,
        via: L.via,
        repeat: folder?.repeat || null,
        clipShapes: clipShapes,
      };

      layerChildren.push(
        new MiniAstNode('chip-layer', shapeNodes, chipValue)
      );
    }

    // XSA (future — placeholder)
    if (L.xsa.on && L.old.on) {
      layerChildren.push(new MiniAstNode('xsa', [], L));
    }

    // Lloyd mirror with directions controller as child
    if (L.lld.on) {
      const directionsChild = new MiniAstNode('lloyd-directions', [], L);
      layerChildren.push(
        new MiniAstNode('lloyd', [directionsChild], L)
      );
    }

    // Layer wrapper
    const layerValue = {
      id: L.id,
      color: L.color,
      vis: L.vis,
      alpha: L.alpha ?? 1,
    };

    return new MiniAstNode('layer', layerChildren, layerValue);
  }

  // ── Clip shape lookup ───────────────────────────────

  static _getClipShapes(folder, layers) {
    if (!folder?.clipLayerId) return null;
    const L = layers.find(l => l.id === folder.clipLayerId);
    return (L && L.old.sh.length) ? L.old.sh : null;
  }

  // ── Default initial state ───────────────────────────

  static createDefaultState() {
    const l1 = this.createLayer('Layer 1', '#4ecdc4');
    l1.lld.on = true;
    l1.lld.exp[0].a = 5;
    l1.lld.exp[1].a = -5;
    l1.lld.exp[2].a = 90;
    l1.lld.exp[0].d = 0.4;
    l1.lld.exp[1].d = 0.4;
    l1.lld.exp[2].d = 0.4;
    l1.lld.etch = '3of3';

    return {
      layers: [l1],
      folders: [],
      selectedLayerId: l1.id,
      expandedLayerId: l1.id,
      activeSlot: 'lloyd',
    };
  }
}

export { OmniMaskModel };
