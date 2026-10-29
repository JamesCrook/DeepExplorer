import { SYS } from './sys.js';
import '../models/organiser-model.js';   // self-registers the show/hide panel
import { loadThree } from '../3d-support/three-boot.js';
import { Values } from './values.js';
import { Utils } from './utils.js';
import { DemoHarness2D } from './demo-harness2-d.js';
import { DemoHarness3D } from './demo-harness3-d.js';
import { HudPanel } from '../nodes-html/hud-panel.js';
import { Animator } from './animator.js';
export { App };
// App — the Zones demo shell: a pane per model in SYS.MODELS, each with its 2D, 3D or HTML harness, and the HUD
/* ═══════════════════════════════════════════════════════════════════════════
Changes from original:
- this.views3D replaced by this.harnesses (holds both 2D and 3D).
- buildLayout creates DemoHarness2D / DemoHarness3D uniformly.
- resize / animate delegate to harnesses instead of inlining 3D logic.
- handleHudChange routes control changes through the active model's
 harness, so 2D controls now take effect (not just display).
═══════════════════════════════════════════════════════════════════════════ */
class App {
  constructor() {
    this.container = document.getElementById('container');
    this.paneEls = [];
    this.harnesses = [];
    this.hudState = {};
    this.animator = new Animator();   // one frame loop for every pane

    SYS.MODELS.forEach((m, i) => {
      this.hudState['vis_' + i] = m.visible !== false;
      if (m.controls) {
        m.controls.forEach(c => {
          if (c.id && c.value !== undefined) this.hudState[c.id] = c.value;
        });
      }
    });

    this.activeModel = SYS.MODELS.find(m => (m.displayType || '2d') !== 'none' && m.visible !== false);
    this.buildHud();

    loadThree().then(() => {
      this.buildLayout();
      this.animate();
    });

    const handleResize = () => {
      if (this._resizeTimer) clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this.resize(), 50);
    };
    new ResizeObserver(handleResize).observe(document.body);
    window.addEventListener('resize', handleResize);
  }

/* ── HUD ───────────────────────────────────────────────────────── */

  solo() {
    this._applyVisibility(
      SYS.MODELS.map(m => m === this.activeModel ?? 0),
      SYS.MODELS.map(m => m.visible !== false)
      );
  }

  unsolo() {
    this._applyVisibility(
      this._soloRestore ?? [], 
      null
      );
  }

  _applyVisibility(visibilities, saved) {
    SYS.MODELS.forEach((m, i) => this.hudState[`vis_${i}`] = m.visible = visibilities[i]);
    this._soloRestore = saved;
    this.buildHud();
    this.buildLayout();
  }

  buildHud() {
    let savedPosition = {
      top: parseInt(this?.hud?._root?.style?.top, 10) || 60,
      left: parseInt(this?.hud?._root?.style?.left, 10) || 12
    };
    this?.hud?.destroy?.();

    const controls = [];

    const dropdownModels = SYS.MODELS.filter(m => m.visible !== false);
    if (!dropdownModels.includes(this.activeModel) && dropdownModels.length > 0) {
      this.activeModel = dropdownModels[0];
    }

    if (dropdownModels.length > 0) {
      controls.push({ type: 'separator', label: 'Active Panel' });
      controls.push({
        type: 'select', id: 'activePanel', label: 'Controls For',
        options: dropdownModels.map(m => [
          String(SYS.MODELS.indexOf(m)),
          m.name?.split(/[.·]/)[0].trim() || 'Unnamed',
        ]),
        value: String(SYS.MODELS.indexOf(this.activeModel)),
      });
      controls.push(
      {
        type: 'button',
        label: this._soloRestore ? 'Unsolo' : 'Solo',
        action: () => this._soloRestore ? this.unsolo() : this.solo()
      }
      );

      controls.push(...(
        this.activeModel?.controls ?? 
        this.activeModel?.getControls?.(this) ?? 
        [])
      );
    }

    this.hud = new HudPanel({
      title: 'Zoned Elements',
      controls,
      position: savedPosition, 
      onChange: (id, val) => this.handleHudChange(id, val),
    });

    if (!this._selPanel) {
      this._selPanel = document.createElement('div');
      this._selPanel.className = 'hud-panel';
      this._selPanel.style.cssText = 'position:absolute; top:12px; right:12px; display:none; min-width:220px;';
      document.body.appendChild(this._selPanel);
    }
  }

/* ── selection ──────────────────────────────────────────────────── */

  selectNode(hit, harness) {
    this.selectedHit = hit;
    this.selectedNode = hit?.node ?? null;
    this.activeHarness = harness;
    this.updateSelectedPanel();
  }

  removeSelectedNode() {
    const node = this.selectedNode;
    if (!node) return;

    let params = {};
    const removeFrom = (parent) => {
      if (!parent.subtree) return false;
      const idx = parent.subtree.indexOf(node);
      if (idx >= 0) { Utils.removeChild(parent, node, params); return true; }
      for (const child of parent.subtree) {
        if (removeFrom(child)) return true;
      }
      return false;
    };

// Search the harness the node was selected from first,
// then fall back to all 2D non-zoned harnesses
    const candidates = this.activeHarness
    ? [this.activeHarness, ...this.harnesses.filter(h => h !== this.activeHarness)]
    : this.harnesses;

    for (const h of candidates) {
      if (!h.node)
        continue;
      params = h.params || {};
      if (removeFrom(h.node)) {
        this.selectedNode = null;
        this.selectedHit = null;
        this.activeHarness = null;
        this.updateSelectedPanel();
        h.selectedHit = null;
        h.hoveredHit = null;
        h.draw();
        return;
      }
    }
  }

  updateSelectedPanel() {
    const el = this._selPanel, node = this.selectedNode;
    const cls = node ? Utils.classOfNode(node) : null;
    const mixNow = this.activeHarness?._ctxMix();
    const shown = this.selectedHit && mixNow
      ? { ...node, value: Values.access(mixNow, this.selectedHit, this.activeHarness.params).getValue() }
      : node;
    const fields = cls?.meta?.editableFields?.(shown);
    if (!node ) { el.style.display = 'none'; return; }
//  if (!node || !fields || fields.length === 0) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.innerHTML = '';
    const header = document.createElement('h3');
    header.textContent = `SELECTED ${node.type.toUpperCase()}`;
    el.appendChild(header);

// Remove button
    const rmBtn = document.createElement('button');
    rmBtn.textContent = '✕ Remove Node';
    rmBtn.style.cssText = 'width:100%; margin:6px 0 4px; padding:5px 8px; font-size:11px; font-weight:600; cursor:pointer; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.06); color:#999; border-radius:4px; letter-spacing:0.03em; transition:background 0.15s;';
    rmBtn.addEventListener('mouseenter', () => rmBtn.style.background = 'rgba(255,255,255,0.12)');
    rmBtn.addEventListener('mouseleave', () => rmBtn.style.background = 'rgba(255,255,255,0.06)');
    rmBtn.addEventListener('click', () => this.removeSelectedNode());
    el.appendChild(rmBtn);

    for (const f of fields ?? []) {
      const row = document.createElement('div'); row.className = 'sel-row';
      const span = document.createElement('span'); span.textContent = f.label; row.appendChild(span);
      const inp = document.createElement('input'); inp.type = f.type; inp.value = f.value;
      inp.addEventListener('input', () => {
        const v = f.type === 'number' ? Number(inp.value) : inp.value;
        // Through the interaction, so editing one item of a flyweight works
        // exactly as editing an ordinary node does.
        const mix = this.activeHarness?._ctxMix();
        const access = this.selectedHit && mix
          ? Values.access(mix, this.selectedHit, this.activeHarness.params) : null;
        if (access) access.setValue({ [f.key]: v });
        else node.value[f.key] = v;
        if (this.activeHarness) this.activeHarness.draw();
      });
      row.appendChild(inp); el.appendChild(row);
    }
  }


/* ── control dispatch ──────────────────────────────────────────── */

  handleHudChange(id, val) {
    this.hudState[id] = val;

    if (id === 'activePanel') {
      this.activeModel = SYS.MODELS[parseInt(val, 10)];
      this.buildHud();
    } else if (id.startsWith('vis_')) {
      const mIdx = parseInt(id.split('_')[1], 10);
      if (SYS.MODELS[mIdx]) SYS.MODELS[mIdx].visible = val;
    } else {
  // Route to the active model's harness — works for both 2D and 3D
      const harness = this.harnesses.find(h => h.paneConfig === this.activeModel);
      if (harness) {
        harness.applyControl(id, val, () => this.hudState);
      }
    }
  }

/* ── grid layout ───────────────────────────────────────────────── */

  bestGrid(n) {
    const headerEl = document.querySelector('header');
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 40;
    const contW = Math.max(1, window.innerWidth);
    const contH = Math.max(1, window.innerHeight - headerH - 1);
    let bestCols = 1, bestScore = Infinity;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c), aspect = (contW / c) / (contH / r);
      const score = Math.abs(Math.log(aspect)) + (n - c * r !== 0 ? 0.3 : 0);
      if (score < bestScore) { bestScore = score; bestCols = c; }
    }
    return { cols: bestCols, rows: Math.ceil(n / bestCols) };
  }

/* ── build panes ───────────────────────────────────────────────── */

  buildLayout() {
    this.container.innerHTML = '';
    this.paneEls.length = 0;
    this.harnesses.length = 0;

    const visibleModels = SYS.MODELS.filter(p => (p.visible !== false) && (p.displayType || '2d') !== 'none');
    const N = visibleModels.length;
    document.getElementById('pane-count').textContent = `${N} of ${SYS.MODELS.length - 1} panels`;

    if (N === 0) { this.container.style.background = '#111210'; return; }

    const grid = this.bestGrid(N);
    const headerEl = document.querySelector('header');
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 40;
    const contH = Math.max(1, window.innerHeight - headerH - 1);

    for (const pane of visibleModels) {
      const i = SYS.MODELS.indexOf(pane);
      const type = pane.displayType || '2d';
      const div = document.createElement('div');
      div.className = 'pane' + (type === '3d' ? ' pane-3d' : '');
      div.style.flexBasis = `calc(${100 / grid.cols}% - 1px)`;
      div.style.height = `${contH / grid.rows}px`;
      div.style.minWidth = '0';
      if (pane.background) div.style.background = pane.background;
      div.dataset.paneIndex = i;

      /* Clicking a pane's title makes it the active panel and solos it;
         clicking again restores the others. */
      const soloOnClick = (el) => {
        el.title = 'Click to solo this panel';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._soloRestore) { this.unsolo(); return; }
          this.activeModel = pane;
          this.hudState.activePanel = String(i);
          this.solo();
        });
      };

      if (type === '2d') {
        const label = document.createElement('div');
        label.className = 'label'; label.textContent = pane.name;
        soloOnClick(label);
        div.appendChild(label);
        const canvas = document.createElement('canvas');
        div.appendChild(canvas);
        this.container.appendChild(div);

        if (pane.sceneRoot) {
          const harness = new DemoHarness2D(canvas, pane, this);
          canvas.harness = harness;
          this.harnesses.push(harness);
        }
      } else if (type === '3d') {
        const title = document.createElement('div');
        title.className = 'pane-title-3d'; title.textContent = pane.name;
        soloOnClick(title);
        div.appendChild(title);
        this.container.appendChild(div);

        const harness = new DemoHarness3D(div, pane, this);
        if (harness.view) this.harnesses.push(harness);
      }

      this.paneEls[i] = div;
    }
  }

/* ── resize ────────────────────────────────────────────────────── */

  resize() {
    const visibleModels = SYS.MODELS.filter(p => p.visible && (p.displayType || '2d') !== 'none');
    const N = visibleModels.length;
    if (!N) return;

    const grid = this.bestGrid(N);
    const headerEl = document.querySelector('header');
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 40;
    const contH = Math.max(1, window.innerHeight - headerH - 1);

// Adjust div sizes — individual harness ResizeObservers handle the rest
    for (const pane of visibleModels) {
      const i = SYS.MODELS.indexOf(pane);
      const el = this.paneEls[i];
      if (!el)
        continue;
      el.style.flexBasis = `calc(${100 / grid.cols}% - 1px)`;
      el.style.height = `${contH / grid.rows}px`;
    }
  }

/* ── render loop ───────────────────────────────────────────────── */

  /* Every frame, for ever, as before: the 3D panes orbit and spin.  A track
     on the App's Animator, which the 2D and HTML harnesses also batch their
     redraws on, so one frame does all the work. */
  animate() {
    if (this.animator.has('harnesses')) return;
    this.animator.add('harnesses', () => {
      for (const h of this.harnesses) {
        if (h.animate) h.animate();
      }
      return true;
    });
  }
}
