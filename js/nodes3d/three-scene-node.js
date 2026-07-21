import { SceneNode, sceneRegistry } from '../omni-support/scene.js';
import * as THREE from 'three';

/**
 * ThreeSceneNode — root of the 3D AST.
 * Owns a THREE.Scene and WebGLRenderer.
 *
 * Positional children:
 *   [0] camera   [1] lights   [2] scene
 *
 * AST wiring:
 *   new MiniAstNode('three-scene', [camera, lights, scene], {
 *     background: 0x0f0f23,
 *     clipping: true,
 *   })
 *
 * ctxMix supplies: { THREE, container }
 * ctxMix enriched during before_build: { canvas } — renderer's domElement
 *
 * After build:
 *   node.inst.scene     — THREE.Scene
 *   node.inst.renderer  — THREE.WebGLRenderer
 *
 * Static utility:
 *   ThreeSceneNode.setupDrag(canvas, camera, controls, opts)
 *     Wires right-click drag on any mesh whose userData.dragOwnerInst
 *     implements the drag protocol (onDragStart, onDragEnd,
 *     getDragScale, getDragTargetForMesh, markDirty).
 *
 * Phases handled: before_build, after_build, after_update,
 *                 before_resize, after_teardown
 */

class ThreeSceneNode extends SceneNode {

  static rebuildParams = [];
  static updateParams = [];

  // ── Drag interaction (static utility) ──────────────────
  //    Shared by all 3D apps using the AST pattern.
  //    Drag owner is found via mesh.userData.dragOwnerInst
  //    (set by RibbonUI when dragOwnerInst is assigned).
  //
  //    opts:
  //      getDraggables() → Mesh[]   — collect from AST nodes
  //      getParams()     → Object   — current slider params
  //      onDirty()       → void     — trigger re-render

  static setupDrag(canvas, camera, controls, { getDraggables, getParams, onDirty }) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const dragPlane = new THREE.Plane();
    const intersection = new THREE.Vector3();
    let selectedMesh = null;
    let isDragging = false;
    let dragStartVisualPos = new THREE.Vector3();

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 2) return;

      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(getDraggables());

      if (hits.length > 0) {
        selectedMesh = hits[0].object;
        isDragging = true;
        controls.enabled = false;
        dragStartVisualPos.copy(selectedMesh.position);

        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        dragPlane.setFromNormalAndCoplanarPoint(camDir, selectedMesh.position);

        const owner = selectedMesh.userData.dragOwnerInst;
        if (owner && owner.onDragStart) owner.onDragStart(selectedMesh);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDragging || !selectedMesh) return;

      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
        const owner = selectedMesh.userData.dragOwnerInst;
        const newVisualPos = intersection.clone();
        const visualDelta = newVisualPos.clone().sub(dragStartVisualPos);

        let scale = 1;
        if (owner && owner.getDragScale) {
          const params = getParams ? getParams() : {};
          scale = owner.getDragScale(selectedMesh, params);
        }

        const target = owner && owner.getDragTargetForMesh
          ? owner.getDragTargetForMesh(selectedMesh)
          : null;

        if (target) {
          target.add(visualDelta.multiplyScalar(scale));
          if (owner.markDirty) owner.markDirty();
        }

        dragStartVisualPos.copy(newVisualPos);
        if (onDirty) onDirty();
      }
    });

    const release = () => {
      if (selectedMesh) {
        const owner = selectedMesh.userData.dragOwnerInst;
        if (owner && owner.onDragEnd) owner.onDragEnd(selectedMesh);
      }
      selectedMesh = null;
      isDragging = false;
      controls.enabled = true;
    };

    canvas.addEventListener('mouseup', release);
    canvas.addEventListener('mouseleave', release);
  }

  // ── Build ──────────────────────────────────────────────
  //    before_build creates scene + renderer before children build.
  //    after_build wires the THREE graph from child instances.

  before_build(ctxMix, node, params) {
    if (this.scene) return;

    const cfg = node.value || {};

    // Scene
    this.scene = new THREE.Scene();
    if (cfg.background !== undefined) {
      this.scene.background = new THREE.Color(cfg.background);
    }

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    if (cfg.clipping) {
      this.renderer.localClippingEnabled = true;
    }

    // Append canvas to container and expose on ctxMix
    ctxMix.container.appendChild(this.renderer.domElement);
    ctxMix.canvas = this.renderer.domElement;

    // Initial size
    const rect = ctxMix.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(rect.width, rect.height);
  }

  after_build(ctxMix, node, params) {
    const lightsInst = node.subtree[1].inst;   // LightsNode
    const sceneInst  = node.subtree[2].inst;   // SceneNode3D

    // Add lights to scene
    for (const light of lightsInst.getLights()) {
      this.scene.add(light);
    }

    // Add scene group
    if (sceneInst.group) {
      this.scene.add(sceneInst.group);
    }
  }

  // ── Update ─────────────────────────────────────────────
  //    after_update fires after all children have updated.
  //    This is the actual THREE render call.

  after_update(ctxMix, node, params) {
    const camera = node.subtree[0].inst.camera;
    this.renderer.render(this.scene, camera);
  }

  // ── Resize ─────────────────────────────────────────────
  //    before_resize so renderer is sized before CameraNode
  //    updates its aspect ratio in the same walk.

  before_resize(ctxMix, node, params) {
    const rect = ctxMix.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(rect.width, rect.height);
  }

  // ── Teardown ───────────────────────────────────────────
  //    Children have already torn down by the time after_teardown runs.

  after_teardown(ctxMix, node, params) {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    this.scene = null;
  }
}

sceneRegistry.registerNodeClass('three-scene', ThreeSceneNode);

export { ThreeSceneNode };
