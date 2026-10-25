// omni-controls-patchbay.js
// Extends OmniControlPanel with reconfiguration support and Patchbay wiring.
// Import after omni-control-panel.js, or call these as mixin methods.
//
// Usage:
//   import { Patchbay } from './patchbay.js';
//   import { mixinPatchbay } from './omni-controls-patchbay.js';
//
//   mixinPatchbay(OmniControlPanel);   // adds methods to prototype, once
//
//   const base = new OmniControlPanel({ ... });
//   const bay = new Patchbay('omnislice');
//   base.connectPatchbay(bay);  // now listens for 'configure' messages

export function mixinPatchbay(OmniControlPanelClass) {

  // Guard against double-mixin
  if (OmniControlPanelClass.prototype._patchbayMixed) return;
  OmniControlPanelClass.prototype._patchbayMixed = true;

  // ============================================================
  // reconfigure(config)
  //
  // Rebuilds the control panel from a modified slider config.
  // config may contain:
  //   addParameters: [{ id, label, min, max, step, default, group? }, ...]
  //   hideParameters: ['sliderId', ...]
  //   presets: [{ name, values: { paramId: value, ... } }, ...]
  //   sliderConfig: [...]   (full replacement — nuclear option)
  // ============================================================

  OmniControlPanelClass.prototype.reconfigure = function(config) {

    // --- Full replacement ---
    if (config.sliderConfig) {
      this.sliderConfig = config.sliderConfig;
    }

    // --- Add parameters ---
    if (config.addParameters) {
      for (const param of config.addParameters) {
        const groupName = param.group || 'Extra';
        let group = this.sliderConfig.find(g =>
          g.group === groupName && g.sliders
        );
        if (!group) {
          group = {
            group: groupName,
            id: groupName.toLowerCase().replace(/\s+/g, '-'),
            abbrev: groupName.substring(0, 3),
            sliders: []
          };
          this.sliderConfig.push(group);
        }
        // Avoid duplicates
        if (!group.sliders.find(s => s.id === param.id)) {
          group.sliders.push(param);
        }
        // Ensure param has a current value
        if (this.params[param.id] === undefined) {
          this.params[param.id] = param.default ?? 0.5;
        }
      }
    }

    // --- Hide parameters ---
    if (config.hideParameters) {
      const hideSet = new Set(config.hideParameters);
      for (const group of this.sliderConfig) {
        if (group.sliders) {
          group.sliders = group.sliders.filter(s => !hideSet.has(s.id));
        }
      }
      // Remove empty groups
      this.sliderConfig = this.sliderConfig.filter(g =>
        g.type === 'presets' || (g.sliders && g.sliders.length > 0) || g.type
      );
    }

    // --- Presets ---
    if (config.presets) {
      // Array of { name, values } → merge into presets object
      for (const p of config.presets) {
        this.presets[p.name] = p.values;
      }
    }

    // --- Rebuild UI ---
    this._rebuild();
  };

  // ============================================================
  // _rebuild()
  //
  // Only defined here if the class doesn't already provide one.
  // OmniControlPanel now ships its own _rebuild(); this fallback
  // exists for older versions that lack it.
  // ============================================================

  if (!OmniControlPanelClass.prototype._rebuild) {
    OmniControlPanelClass.prototype._rebuild = function() {
      const controlsEl = this.elements.controls;
      const multiEl = this.elements.multiscroller;

      if (controlsEl) controlsEl.innerHTML = '';
      if (multiEl) multiEl.innerHTML = '';

      // Reset dynamic containers
      this.dynamicContainers = {};
      this.statusEl = null;
      this.infoEl = null;

      // Rebuild
      this._buildMultiscroller();
      this._buildControls();
      this._setupScrollTracking();

      // Sync slider DOM to current param values
      for (const group of this.sliderConfig) {
        if (!group.sliders) continue;
        for (const s of group.sliders) {
          if (s.isData) continue;
          const val = this.params[s.id];
          if (val === undefined) continue;
          const input = document.getElementById(s.id);
          const valEl = document.getElementById(`${s.id}-val`);
          if (input) input.value = val;
          if (valEl) valEl.textContent = this._formatValue(val, s.format);
        }
      }

      this._updateActiveStripButton(this.sliderConfig[0]?.id);
      requestAnimationFrame(() => this._updateMultiscrollerNames());

      this.render();
    };
  }

  // ============================================================
  // connectPatchbay(bay)
  //
  // Wire a Patchbay instance to this OmniControlPanel so that incoming
  // 'configure' messages automatically call reconfigure().
  // Returns an unsubscribe function.
  // ============================================================

  OmniControlPanelClass.prototype.connectPatchbay = function(bay) {
    const unsub = bay.on('configure', (msg) => {
      this.reconfigure(msg.config);
    });
    // Store reference for convenience
    this._patchbay = bay;
    return unsub;
  };

  // ============================================================
  // setupPatchbay(role, onAttach)
  //
  // Utility function that connects to Patchbay if available or
  // dynamically loads it if not.
  // ============================================================

  OmniControlPanelClass.prototype.setupPatchbay = async function(role, onAttach) {
    let bay;
    if (window.patchbay) {
      bay = window.patchbay;
    } else {
      const { Patchbay } = await import('./patchbay.js');
      bay = new Patchbay(role);
      window.patchbay = bay;
      this.connectPatchbay(bay);
    }

    if (onAttach) {
      onAttach(bay);
    }

    return bay;
  };
}