// patchbay-boot.js
// Generic bootstrap for Patchbay support in any OmniControlPanel app.
// Injected into child tabs by an orchestrator, or included as a script tag.
// Activates only if URL contains ?patchbay=<role> parameter.
// Requires the app to expose window.OmniControlPanel (one-line convention).
//
// What it does:
//   1. Reads role from URL param
//   2. Imports Patchbay and the OmniControlPanel mixin
//   3. Applies the mixin to OmniControlPanel
//   4. Creates a Patchbay instance, connects it to the app's OmniControlPanel
//   5. Exposes window.patchbay for the orchestrator to attach handlers

const params = new URLSearchParams(window.location.search);
const role = params.get('patchbay');

if (role) {
  (async () => {
    const { Patchbay } = await import('./patchbay.js');
    const { mixinPatchbay } = await import('./omni-controls-patchbay.js');

    // Wait for OmniControlPanel to be available (app may still be initialising)
    const waitForBase = () => new Promise((resolve) => {
      if (window.OmniControlPanel) return resolve(window.OmniControlPanel);
      const check = setInterval(() => {
        if (window.OmniControlPanel) { clearInterval(check); resolve(window.OmniControlPanel); }
      }, 50);
    });

    const base = await waitForBase();

    mixinPatchbay(OmniControlPanel);

    const bay = new Patchbay(role);
    base.connectPatchbay(bay);

    // Expose for orchestrator to attach app-specific handlers
    window.patchbay = bay;
  })();
}
// Auto-generated exports
if (typeof window !== 'undefined') window.params = params;
export { params };
if (typeof window !== 'undefined') window.role = role;
export { role };
