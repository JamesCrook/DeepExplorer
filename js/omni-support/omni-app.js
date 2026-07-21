class OmniApp {
  constructor(options) {
    const {
      title = 'OmniApp',
      subtitle,
      extraCSS,
      displayElement = 'canvas',
      displayId = 'canvas',
      displayLayers = null
    } = options;

    // ── <head> additions ───────────────────────────────────────────

    if (extraCSS) {
      const style = document.createElement('style');
      style.textContent = extraCSS;
      document.head.appendChild(style);
    }

    // ── <body> content ─────────────────────────────────────────────
    // Header
    const header = document.createElement('header');
    header.className = 'header';
    const h1 = document.createElement('h1');
    h1.textContent = title;
    header.appendChild(h1);
    if (subtitle) {
      const p = document.createElement('p');
      p.className = 'subtitle';
      p.textContent = subtitle;
      header.appendChild(p);
    }

    // Layout wrapper
    const layout = document.createElement('div');
    layout.className = 'layout';

    // Chart container + display layer(s)
    const container = document.createElement('div');
    container.className = 'chart-container';
    container.id = 'chart-container';

    const SVG_NS = 'http://www.w3.org/2000/svg';

    function _createEl(tag, id) {
      const el = tag === 'svg'
        ? document.createElementNS(SVG_NS, 'svg')
        : document.createElement(tag);
      el.id = id;
      return el;
    }

    // Build layer stack
    const layerDefs = displayLayers || [{ element: displayElement, id: displayId }];
    const isMultiLayer = layerDefs.length > 1;
    const layers = {};       // keyed by id
    let display = null;      // first layer (backward-compat)

    if (isMultiLayer) {
      // Wrapper fills the container; overlays are positioned inside it
      const wrapper = document.createElement('div');
      wrapper.className = 'layer-stack';
      wrapper.style.cssText = 'position:relative;width:100%;height:100%;';

      layerDefs.forEach((def, i) => {
        const el = _createEl(def.element, def.id);
        if (def.className) el.className = def.className;
        // First layer flows normally; subsequent layers overlay
        if (i > 0) {
          el.style.cssText += 'position:absolute;top:0;left:0;width:100%;height:100%;';
        }
        wrapper.appendChild(el);
        layers[def.id] = el;
        if (i === 0) display = el;
      });

      container.appendChild(wrapper);
    } else {
      // Single-layer (original path — no wrapper overhead)
      display = _createEl(layerDefs[0].element, layerDefs[0].id);
      if (layerDefs[0].className) display.className = layerDefs[0].className;
      container.appendChild(display);
      layers[layerDefs[0].id] = display;
    }

    // Controls wrapper
    const controlsWrapper = document.createElement('div');
    controlsWrapper.className = 'controls-wrapper';

    const multiscroller = document.createElement('div');
    multiscroller.className = 'multiscroller-strip';
    multiscroller.id = 'multiscroller';

    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.id = 'controls';

    controlsWrapper.appendChild(multiscroller);
    controlsWrapper.appendChild(controls);

    layout.appendChild(container);
    layout.appendChild(controlsWrapper);

    document.body.appendChild(header);
    document.body.appendChild(layout);

    this.container = container;
    this.display = display;
    this.layers = layers;
    this.controls = controls;
    this.multiscroller = multiscroller;
    this.header = header;
  }
}

export {OmniApp}
