// AppUtils — pan/zoom and control-building helpers for the older apps (molam-app, scenes-grid)

class AppUtils {

  static makeMouseWatchers(base, canvas, renderer, render) {
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });
    
    canvas.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        renderer.pan(dx, dy);
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        render();
      }
    });
    
    canvas.addEventListener('mouseup', () => isDragging = false);
    canvas.addEventListener('mouseleave', () => isDragging = false);
    
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      renderer.zoomAt(factor, x, y);
      
      base.updateSlider('zoom', renderer.camera.zoom, false);
      render();
    }, { passive: false });
  }

  // All the create methods should be using widgets from nodes-html/widgets/, 
  // suitably configured.
  static createSizeSelector(options) {
    const {
      id = 'sizeSelector',
      defaultSize = 'medium',
      sizes = ['small', 'medium', 'large'],
      onChange
    } = options;

    const container = document.createElement('div');
    container.className = 'size-selector';
    container.id = id;

    sizes.forEach(size => {
      const btn = document.createElement('button');
      btn.textContent = size[0].toUpperCase();
      btn.title = size;
      btn.dataset.size = size;
      if (size === defaultSize) btn.classList.add('active');

      btn.addEventListener('click', () => {
        container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (onChange) onChange(size);
      });

      container.appendChild(btn);
    });

    return container;
  }

  static createInfoRow(options) {
    const { items, className = 'tree-info', style = {} } = options;
    
    const info = document.createElement('div');
    info.className = className;
    Object.assign(info.style, style);
    
    info.innerHTML = items.map(item => 
      `<span>${item.label}: <span class="value" id="${item.id}">${item.value || '—'}</span></span>`
    ).join('');
    
    return info;
  }

  static createSelectRow(options) {
    const { id, label, options: opts = [], onChange, style = {} } = options;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;';
    Object.assign(row.style, style);

    if (label) {
      const lbl = document.createElement('span');
      lbl.textContent = label;
      lbl.style.cssText = 'font-size:11px;color:#888;';
      row.appendChild(lbl);
    }

    const sel = document.createElement('select');
    sel.id = id;
    sel.style.cssText = 'flex:1;padding:4px;border:1px solid #333;border-radius:4px;background:#0f0f23;color:#ccc;font-size:11px;';

    opts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });

    if (onChange) sel.addEventListener('change', () => onChange(sel.value));

    row.appendChild(sel);
    return row;
  }

  static createInfoLine(options) {
    const { id, text = '' } = options;
    const el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'font-size:11px;color:#888;margin-top:4px;';
    el.textContent = text;
    return el;
  }

  static createToggle(options) {
    const { 
      id, 
      label, 
      checked = false, 
      onChange 
    } = options;
    
    const toggle = document.createElement('label');
    toggle.className = 'toggle-item';
    toggle.innerHTML = `
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
      <span class="toggle-slider"></span>
      <span class="toggle-label">${label}</span>
    `;
    
    if (onChange) {
      toggle.addEventListener('change', onChange);
    }
    
    return toggle;
  }

  static createButton(options) {
    const { text, className = 'btn', id, style = {}, onClick } = options;
    const btn = document.createElement('button');
    btn.className = className;
    btn.textContent = text;
    if (id) btn.id = id;
    Object.assign(btn.style, style);
    if (onClick) btn.addEventListener('click', onClick);
    return btn;
  }

  static createButtonGroup(options) {
    const { 
      buttons, 
      direction = 'column', 
      gap = '8px' 
    } = options;
    
    const group = document.createElement('div');
    group.style.display = 'flex';
    group.style.flexDirection = direction;
    group.style.gap = gap;
    
    buttons.forEach(btnOptions => {
      group.appendChild( AppUtils.createButton(btnOptions));
    });
    
    return group;
  }

  static createFileLoader(options) {
    const {
      id, icon = '📁', text = 'Drop files or click',
      accept, directory = false, multiple = true,
      onFiles, onEntries
    } = options;

    const drop = document.createElement('div');
    drop.className = 'file-drop';
    if (id) drop.id = id;
    drop.innerHTML = `<div class="file-drop-icon">${icon}</div><div>${text}</div>`;

    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));

    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      if (onEntries && e.dataTransfer.items) {
        const entries = [...e.dataTransfer.items]
          .map(i => i.webkitGetAsEntry?.())
          .filter(Boolean);
        if (entries.length) { onEntries(entries); return; }
      }
      if (onFiles) onFiles([...e.dataTransfer.files]);
    });

    drop.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = multiple;
      if (accept) input.accept = accept;
      if (directory) { input.webkitdirectory = true; input.mozdirectory = true; }
      input.onchange = () => { if (onFiles) onFiles([...input.files]); };
      input.click();
    });

    return drop;
  }

  static createLoadDataSection(options) {
    return [{
      group: 'Load Data', id: 'load', abbrev: 'Load',
      type: 'filedrop',
      label: options.label || 'Drop file or click',
      accept: options.accept || '.csv,.txt',
      onDrop: options.onDrop
    }];
  }

  static createSampleDataSection(options) {
    return [{
      group: 'Sample Data', id: 'sample', abbrev: 'Smp',
      type: 'select',
      selectId: 'sampleSelect',
      options: options.options,
      onChange: options.onChange
    }];
  }

  static createSampleSizeSection(options) {
    return [{
      group: 'Sample Size', id: 'sampleSize',
      type: 'custom',
      build: (groupEl) => {
        groupEl.appendChild(AppUtils.createSizeSelector({
          defaultSize: options.currentSize,
          onChange: options.onChange
        }));
      }
    }];
  }

  static createModal(options) {
    const { id = 'omniModal', title = 'Modal', content = '' } = options;

    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'omni-modal';

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'omni-modal-content';

    const header = document.createElement('div');
    header.className = 'omni-modal-header';

    const titleEl = document.createElement('h3');
    titleEl.textContent = title;

    const closeBtn = document.createElement('span');
    closeBtn.className = 'omni-modal-close';
    closeBtn.innerHTML = '&times;';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'omni-modal-body';

    if (typeof content === 'string') {
      body.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      body.appendChild(content);
    }

    contentWrapper.appendChild(header);
    contentWrapper.appendChild(body);
    modal.appendChild(contentWrapper);

    document.body.appendChild(modal);

    const open = () => { modal.style.display = 'block'; };
    const close = () => { modal.style.display = 'none'; };

    closeBtn.addEventListener('click', close);
    window.addEventListener('click', (e) => { if (e.target === modal) close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    return { modal, titleEl, contentEl: body, open, close };
  }
}

export { AppUtils }