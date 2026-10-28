import { SceneNode } from '../omni-support/scene.js';
import { THREE as BOOT_THREE } from '../3d-support/three-boot.js';
import { SYS } from '../omni-support/sys.js';

/**
 * GroundPlaneNode — owns a GridHelper and optional AxesHelper.
 *
 * One class for both worlds (it replaces ground-plane-node-zones.js).
 *
 * AST wiring:
 *   new MiniAstNode('ground-plane', [], {
 *     grid: { size: 20, divisions: 20, y: -4, color1: 0x444444, color2: 0x333333 },
 *     axes: { size: 2, position: [-9, -3.9, -9] },   // optional
 *   })
 *
 * After build:
 *   node.inst.group  — THREE.Group (for parent to add to scene)
 *
 * Update params (each optional; absent means "leave as built"):
 *   gridSize, gridDivisions  — rebuild the grid
 *   gridY                    — move it
 *   gridOpacity              — fade it (transparent below 1)
 *
 * THREE comes from ctxMix.THREE (Omni harnesses) or three-boot's live
 * binding (Zones), so a Zones page still loads three.js lazily.
 *
 * Phases handled: build, update, teardown.
 */

class GroundPlaneNode extends SceneNode {

  static rebuildParams = [];
  static updateParams = ['gridSize', 'gridDivisions', 'gridY', 'gridOpacity'];

  // ── Build ──────────────────────────────────────────────

  build(ctxMix, node, params) {
    if (this.group) return;

    this.THREE = ctxMix?.THREE ?? BOOT_THREE;
    const cfg = node.value || {};
    this.group = new this.THREE.Group();

    // Grid
    if (cfg.grid) {
      const g = cfg.grid;
      this._grid = {
        size: g.size ?? 20, divisions: g.divisions ?? 20,
        color1: g.color1 ?? 0x444444, color2: g.color2 ?? 0x333333,
        y: g.y,
      };
      this._buildGrid();
    }

    // Axes
    if (cfg.axes) {
      const a = cfg.axes;
      this.axesHelper = new this.THREE.AxesHelper(a.size ?? 2);
      if (a.position) this.axesHelper.position.set(...a.position);
      this.group.add(this.axesHelper);
    }
  }

  // ── Update ─────────────────────────────────────────────

  update(ctxMix, node, params) {
    const g = this._grid;
    if (!this.group || !g) return;

    const size = params.gridSize ?? g.size;
    const divisions = Math.round(params.gridDivisions ?? g.divisions);
    if (size !== g.size || divisions !== g.divisions) {
      g.size = size; g.divisions = divisions;
      this._removeGrid();
      this._buildGrid();
    }

    const y = params.gridY ?? g.y;
    if (y !== g.y) {
      g.y = y;
      if (this.gridHelper) this.gridHelper.position.y = y;
    }

    if (params.gridOpacity !== undefined && this.gridHelper) {
      const m = this.gridHelper.material;
      m.opacity = params.gridOpacity;
      m.transparent = params.gridOpacity < 1;
      m.needsUpdate = true;
    }
  }

  _buildGrid() {
    const g = this._grid;
    this.gridHelper = new this.THREE.GridHelper(g.size, g.divisions, g.color1, g.color2);
    if (g.y !== undefined) this.gridHelper.position.y = g.y;
    this.group.add(this.gridHelper);
  }

  _removeGrid() {
    if (!this.gridHelper) return;
    this.gridHelper.geometry.dispose();
    this.gridHelper.material.dispose();
    this.group.remove(this.gridHelper);
    this.gridHelper = null;
  }


  // ── Teardown ───────────────────────────────────────────

  teardown(ctxMix, node, params) {
    this.clear();
  }

  clear() {
    this._removeGrid();
    if (this.axesHelper) {
      this.axesHelper.geometry.dispose();
      this.axesHelper.material.dispose();
      this.axesHelper = null;
    }
    if (this.group) {
      while (this.group.children.length > 0) {
        this.group.remove(this.group.children[0]);
      }
      this.group = null;
    }
    this._grid = null;
  }
}

SYS.NODE_CLASSES.push({ name: 'ground-plane', cls: GroundPlaneNode });

export { GroundPlaneNode };
