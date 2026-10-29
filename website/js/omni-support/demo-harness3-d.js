export { DemoHarness3D };

// DemoHarness3D — owns a 3D pane
// DemoHarness3D — owns a 3D pane for the Zones App: makes or re-attaches the view, passes controls on

class DemoHarness3D {
  constructor(div, paneConfig, app) {
    this.container = div;
    this.paneConfig = paneConfig;
    this.app = app;
    this.view = null;

    if (typeof paneConfig.init !== 'function') return;

    if (paneConfig._view) {
  // ── Re-attach an existing view (happens on layout rebuild) ──
      this.view = paneConfig._view;
      const title = div.querySelector('.pane-title-3d');
      div.insertBefore(this.view.renderer.domElement, title);
      if (this.view.ro) {
        this.view.ro.unobserve(this.view.container);
        this.view.ro.observe(div);
      }
      this.view.container = div;
    } else {
  // ── First-time init ──
      this.view = paneConfig.init(div);
      paneConfig._view = this.view;

  // Push initial control values through onControl
      if (this.view && paneConfig.onControl) {
        const initVals = {};
        (paneConfig.controls || []).forEach(c => { if (c.id) initVals[c.id] = c.value; });
        paneConfig.onControl(null, null, () => initVals, app);
      }
    }
  }

/* ── per-frame (called from App.animate) ───────────────────────── */

  animate() {
    const v = this.view;
    if (!v) return;
    v.controls.update();
    if (v.phyloNode) {
      v.phyloNode.value.group.rotation.z += 0.001;
      v.phyloNode.value.group.rotation.x = Math.sin(Date.now() * 0.0003) * 0.1;
    }
    v.renderer.render(v.scene, v.camera);
  }

/* ── resize (called from App.resize as a safety net;
    the ResizeObserver in make3DPane also fires) ──────────────── */

  resize() {
    const v = this.view;
    if (!v) return;
    const w = v.container.clientWidth, h = v.container.clientHeight;
    if (w > 0 && h > 0) {
      v.camera.aspect = w / h;
      v.camera.updateProjectionMatrix();
      v.renderer.setSize(w, h);
    }
  }

/* ── control routing (called by App.handleHudChange) ───────────── */

  applyControl(id, val, getValues) {
    if (this.paneConfig.onControl) {
      this.paneConfig.onControl(id, val, getValues, this.app);
    }
  }
}

