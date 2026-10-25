/* ============================================
   Molam — Full Application (shell + controls + widget)
   ============================================

   Wires together:
   - Molam (widget) → 3D scene, protein loading, camera, resize
   - OmniApp        → page shell
   - OmniControlPanel   → sliders, presets UI
*/

import * as THREE           from 'three';
import { Molam }            from './molam-widget.js';
import { OmniApp }          from '../omni-support/omni-app.js';
import { OmniControlPanel } from '../omni-support/omni-control-panel.js';
import { mixinPatchbay }    from '../omni-support/omni-controls-patchbay.js';
import { AppUtils }         from '../omni-support/app-utils.js'

class MolamApp {

  static EXTRA_CSS = `.chart-container { cursor: default; }`;

  static PROTEIN_OPTIONS = [
    { value: '', label: '-- Select a protein --' },
    { value: '1GFL', label: 'GFP (1GFL) - Green Fluorescent Protein' },
    { value: '1A3N', label: 'Hemoglobin (1A3N)' },
    { value: '1CRN', label: 'Crambin (1CRN) - Small protein' },
    { value: '1CRN.cif', label: 'Crambin (1CRN) - mmCIF format' },
    { value: '1CRN.bcif', label: 'Crambin (1CRN) - BinaryCIF format' },
    { value: '1UBQ', label: 'Ubiquitin (1UBQ)' },
    { value: '1UBQ.cif', label: 'Ubiquitin (1UBQ) - mmCIF format' },
    { value: '1UBQ.bcif', label: 'Ubiquitin (1UBQ) - BinaryCIF format' },
    { value: '2PTC', label: 'Trypsin (2PTC)' },
    { value: '1HHO', label: 'Deoxy Hemoglobin (1HHO)' },
    { value: '4HHB', label: 'Hemoglobin T-state (4HHB)' },
    { value: '1MBO', label: 'Myoglobin (1MBO)' },
    { value: '2LZM', label: 'Lysozyme (2LZM)' },
    { value: '1IGT', label: 'Immunoglobulin (1IGT)' },
    { value: '1TIM', label: 'Triose Phosphate Isomerase (1TIM)' },
    { value: '3CLN', label: 'Calmodulin (3CLN)' },
    { value: 'Q5VSL9.af', label: 'STRIP1 (AlphaFold Q5VSL9)' },
    { value: 'P00519.af', label: 'ABL1 (AlphaFold P00519)' },
  ];

  constructor(options = {}) {
    const {
      title         = 'Molam',
      subtitle      = '3D Protein Ribbon Viewer. Left-drag to rotate, right-drag moves atoms, scroll to zoom.',
      extraCSS      = MolamApp.EXTRA_CSS,
      hintHtml      = '<strong>Left-drag</strong> to rotate view<br>'
                    + '<strong>Right-drag</strong> atoms to move (XZ)<br>'
                    + '<strong>Shift+drag</strong> moves Y axis<br>'
                    + '<strong>Scroll</strong> to zoom',
      defaultPreset = 'Standard',
    } = options;

    // ── Shell ─────────────────────────────────────────────────
    const shell = new OmniApp({
      title, subtitle, extraCSS,
      displayElement: 'div',
      displayId: 'scene-viewport',
    });

    // ── Widget ────────────────────────────────────────────────
    this.widget = Molam(shell.display, {
      preset: defaultPreset,
      container: shell.container,
    });

    // Wire widget events to UI
    this.widget
      .on('status', (msg) => { if (this.controls) this.controls.setStatus(msg); })
      .on('error',  (err) => { if (this.controls) this.controls.setStatus(`Error: ${err.message}`, true); })
      .on('loaded', (info) => {
        this._displayProteinInfo(info);
        if (this.controls) {
          this.controls.setControlEnabled('numPoints', false);
          this.controls.updateSlider('numPoints', info.totalResidues, false);
          this.controls.render();
        }
        this._updateRollControls();
      });

    // ── OmniControlPanel ──────────────────────────────────────────
    this.controls = new OmniControlPanel({
      elements: {
        container:     shell.container,
        controls:      shell.controls,
        multiscroller: shell.multiscroller,
      },
      sliderConfig:   this._buildSliderConfig(),
      presets:        Molam.PRESETS,
      defaultPreset,
      enablePanZoom:  false,
      aspectRatio:    1,
      hintHtml,

      onRender: (params) => {
        this.widget.params(params);
      },

      onParamChange: (id, value) => {
        if (id === 'numPoints' && !this.widget.chains) {
          this.widget.setControlPointCount(value);
          this._updateRollControls();
        }
      },

      // Widget handles its own resize
      onResize: () => {},
    });

    // ── Nav Menu ──────────────────────────────────────────────
    this.controls.addMenuItems([
      { label: 'Set Axis',        action: () => this.widget.setAxis() },
      { label: 'Clear Axis',      action: () => this.widget.clearAxis() },
      { type: 'divider' },
      { label: 'Colour: Chain',   action: () => this.controls.updateSlider('colorMode', 0) },
      { label: 'Colour: Residue', action: () => this.controls.updateSlider('colorMode', 1) },
      { type: 'divider' },
    ]);
    this.controls.addHelp();

    // ── Roll controls ─────────────────────────────────────────
    this._updateRollControls();

    // ── Patchbay ──────────────────────────────────────────────
    this.controls.setupPatchbay('molam', (bay) => {
      bay.on('load-structure', (msg) => {
        if (msg.id && msg.type) {
          this.widget.loadProtein(msg.id, msg.type);
        } else if (msg.id) {
          let type = 'pdb';
          if (msg.id.endsWith('.cif'))  type = 'mmcif';
          if (msg.id.endsWith('.bcif')) type = 'bmcif';
          let id = msg.id;
          if (id.includes('.')) id = id.substring(0, id.lastIndexOf('.'));
          this.widget.loadProtein(id, type);
        }
      });
    });

    // ── URL params ────────────────────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    const paramsMap = { pdb: 'pdb', mmcif: 'mmcif', bmcif: 'bmcif', af: 'af' };
    for (const [param, type] of Object.entries(paramsMap)) {
      const val = urlParams.get(param);
      if (val) {
        this.widget.loadProtein(val, type);
        break;
      }
    }

    // ── Initial render ────────────────────────────────────────
    this.controls.render();
  }

  // ── Info display ───────────────────────────────────────────

  _displayProteinInfo(info) {
    let idToDisplay = info.chainIds ? this.widget.currentProteinId : '';
    if (idToDisplay && idToDisplay.length > 50) idToDisplay = idToDisplay.substring(0, 47) + '...';

    const chainInfo = info.chainIds
      ?.map(cId => `${cId}: ${this.widget.chains.get(cId).points.length}`)
      .join(', ') || '';

    this.controls.setInfo(`
      <strong>${info.labelType} ID: ${idToDisplay}</strong><br>
      Chains: ${info.chainIds.join(', ')} (${info.chainIds.length} separate)<br>
      Residues per chain: ${chainInfo}<br>
      Total residues: ${info.totalResidues}<br>
      Total atoms: ${info.totalAtoms}<br>
      ${info.title ? `<br>${info.title}` : ''}
    `);

    this.controls.setStatus(
      `${idToDisplay} loaded! (${info.chainIds.length} chain${info.chainIds.length > 1 ? 's' : ''}, ${info.totalAtoms} atoms)`
    );
  }

  // ── Slider config ──────────────────────────────────────────

  _buildSliderConfig() {
    return [
      ...this._sectionLoadData(),
      ...this._sectionLoadProtein(),
      ...this._sectionProteinInfo(),
      ...this._sectionPresets(),
      ...this._sectionMain(),
      ...this._sectionRibbon(),
      ...this._sectionRibbonNodes(),
      ...this._sectionColors(),
      ...this._sectionAtoms(),
      ...this._sectionBonds(),
      ...this._sectionAxisFade(),
      ...this._sectionDisplay(),
      ...this._sectionLighting(),
      ...this._sectionPersistentState(),
    ];
  }

  _sectionLoadData() {
    return [{
      group: 'Load Data', id: 'loadDataDrop', abbrev: 'Load',
      type: 'filedrop',
      label: 'Drop PDB, mmCIF or BinaryCIF file',
      accept: '.pdb,.ent,.cif,.bcif',
      onDrop: (files) => { if (files[0]) this.widget.loadFile(files[0]); },
    }];
  }

  _sectionLoadProtein() {
    return [{
      group: 'Load Protein', id: 'load', abbrev: 'Load',
      type: 'select', selectId: 'proteinSelector',
      options: MolamApp.PROTEIN_OPTIONS,
      onChange: async (value, base) => {
        if (value) {
          let type = 'pdb', pId = value;
          if (value.endsWith('.bcif')) { type = 'bmcif'; pId = value.replace('.bcif', ''); }
          else if (value.endsWith('.cif')) { type = 'mmcif'; pId = value.replace('.cif', ''); }
          else if (value.endsWith('.af')) { type = 'af'; pId = value.replace('.af', ''); }
          await this.widget.loadProtein(pId, type);
        } else {
          this.widget.demo();
          base.setControlEnabled('numPoints', true);
          base.updateSlider('numPoints', 5, false);
          base.clearInfo();
          base.clearStatus();
          this._updateRollControls();
        }
        base.render();
      },
    }];
  }

  _sectionPresets() {
    return [{ group: 'Presets', id: 'presets', abbrev: 'Pre', type: 'presets' }];
  }

  _sectionMain() {
    return [{
      group: 'Main', id: 'main', abbrev: 'mn',
      sliders: [
        { id: 'width',      label: 'Ribbon Width',     min: 0, max: 1,  step: 0.01, default: 0.34 },
        { id: 'thickness',  label: 'Ribbon Thickness',  min: 0, max: 1,  step: 0.01, default: 0.08 },
        { id: 'atomRadius', label: 'Atom Size',         min: 0, max: 4,  step: 0.01, default: 0.5 },
        { id: 'bondRadius', label: 'Bond Size',         min: 0, max: 5,  step: 0.01, default: 3.0 },
      ],
    }];
  }

  _sectionRibbon() {
    return [{
      group: 'Ribbon', id: 'ribbon', abbrev: 'Rib',
      sliders: [
        { id: 'smoothing',             label: 'CA Smoothing',   min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'controlNodeSmoothing',  label: 'Node Smoothing', min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'arrowHeads',            label: 'Arrow Heads',    min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'arrowHeads2',           label: 'Arrow Heads 2',  min: 0, max: 1, step: 0.01, default: 0 },
      ],
    }];
  }

  _sectionRibbonNodes() {
    return [{
      group: 'Ribbon Nodes', id: 'ribbon-nodes', abbrev: 'Rbn',
      sliders: [
        { id: 'normalIndicatorSize', label: 'Normal Indicators',   min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'nodeScale',           label: 'Node Scale',          min: 0, max: 1, step: 0.01, default: 0.5 },
        { id: 'controlNodeSize',     label: 'Control Nodes (grey)', min: 0, max: 1, step: 0.01, default: 0.5 },
        { id: 'jointNodeSize',       label: 'Joint Nodes (green)', min: 0, max: 1, step: 0.01, default: 0.5 },
        { id: 'nitroNodeSize',       label: 'Nitro Nodes (blue)',  min: 0, max: 1, step: 0.01, default: 0.5 },
        { id: 'nitroPos',            label: 'Nitro Position',      min: 0, max: 1, step: 0.01, default: 0.66 },
      ],
    }];
  }

  _sectionColors() {
    return [{
      group: 'Ribbon Colors', id: 'ribbon-colors', abbrev: 'Clr',
      sliders: [
        { id: 'colorSmoothing', label: 'Color Smoothing', min: 0, max: 1, step: 0.01, default: 1 },
        { id: 'small',        label: 'Small',        min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'hydroxyl',     label: 'Hydroxyl',     min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'hydrophobic',  label: 'Hydrophobic',  min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'negative',     label: 'Negative',     min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'polar',        label: 'Polar',        min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'aliphatic',    label: 'Aliphatic',    min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'positive',     label: 'Positive',     min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'large',        label: 'Large',        min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'sulfur',       label: 'Sulfur',       min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'aromatic',     label: 'Aromatic',     min: 0, max: 1, step: 0.01, default: 0 },
      ],
    }];
  }

  _sectionAtoms() {
    return [{
      group: 'Atoms', id: 'atoms', abbrev: 'Atm',
      sliders: [
        { id: 'atomLightness',  label: 'Lightness', min: 0, max: 1,   step: 0.01, default: 0.5 },
        { id: 'atomOpacity',    label: 'Opacity',   min: 0, max: 1,   step: 0.01, default: 1 },
        { id: 'atomRangeStart', label: 'Start',     min: 0, max: 100, step: 1,    default: 0 },
        { id: 'atomRangeEnd',   label: 'End',       min: 0, max: 100, step: 1,    default: 100 },
      ],
    }];
  }

  _sectionBonds() {
    return [{
      group: 'Bonds', id: 'bonds', abbrev: 'Bnd',
      sliders: [
        { id: 'bondHalfColor',        label: 'Half Color',     min: 0, max: 1, step: 0.01, default: 0.5 },
        { id: 'bondColorByAminoAcid', label: 'By Amino Acid',  min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'bondLightness',        label: 'Lightness',      min: 0, max: 1, step: 0.01, default: 0.5 },
        { id: 'bondRingPink',         label: 'Pink Rings',     min: 0, max: 1, step: 0.01, default: 0.5 },
      ],
    }];
  }

  _sectionAxisFade() {
    return [{
      group: 'Axis Filter', id: 'axis-filter', abbrev: 'Filt',
      sliders: [
        { id: 'ribbonFade',    label: 'Ribbon Threshold',    min: 0, max: 1, step: 0.01, default: 0 },
        { id: 'sidechainFade', label: 'Sidechain Threshold', min: 0, max: 1, step: 0.01, default: 0 },
      ],
    }];
  }

  _sectionDisplay() {
    return [{
      group: 'Display', id: 'display', abbrev: 'Dis',
      sliders: [
        { id: 'ortho', label: 'Ortho Morph', min: 0, max: 1, step: 0.005, default: 0 },
      ],
    }];
  }

  _sectionLighting() {
    return [{
      group: 'Lighting', id: 'lighting', abbrev: 'Lit',
      sliders: [
        { id: 'mainLight', label: 'Main Light', min: 0, max: 5, step: 0.05, default: 2 },
        { id: 'fillLight', label: 'Fill Light', min: 0, max: 5, step: 0.05, default: 2 },
        { id: 'backLight', label: 'Back Light', min: 0, max: 5, step: 0.05, default: 2 },
      ],
    }];
  }

  _sectionProteinInfo() {
    return [{
      group: 'Protein Info', id: 'protein-info', type: 'custom',
      build: (groupEl, base) => {
        const actions = AppUtils.createButtonGroup({
          buttons: [
            {
              text: 'Reset', className: 'btn secondary',
              onClick: () => {
                base.updateSliders({
                  width: 0.35, thickness: 0.15, smoothing: 0.5,
                  controlNodeSmoothing: 0.5, nodeScale: 0.5, controlNodeSize: 0.5,
                  jointNodeSize: 0, nitroNodeSize: 0.5, normalIndicatorSize: 0,
                }, false);
                if (this.widget.currentProteinId) {
                  this.widget.loadProtein(this.widget.currentProteinId, this.widget.currentProteinType);
                } else {
                  this.widget.demo();
                  base.updateSlider('numPoints', 5, false);
                }
                base.render();
              },
            },
            {
              text: 'Capture High-Res', className: 'btn secondary',
              onClick: () => this.widget.capture(),
            },
          ],
          direction: 'row',
        });
        groupEl.appendChild(actions);

        const statusContainer = document.createElement('div');
        statusContainer.style.display = 'flex';
        statusContainer.style.justifyContent = 'space-between';
        statusContainer.style.alignItems = 'center';

        const statusEl = document.createElement('div');
        statusEl.className = 'status-message';
        statusEl.id = 'status';
        base.statusEl = statusEl;
        statusContainer.appendChild(statusEl);

        this.axisStatusEl = document.createElement('div');
        this.axisStatusEl.id = 'axis-status';
        this.axisStatusEl.style.cssText = 'font-size:12px;color:#4fc3f7;font-weight:bold';
        statusContainer.appendChild(this.axisStatusEl);

        groupEl.appendChild(statusContainer);

        const infoEl = document.createElement('div');
        infoEl.className = 'info-panel';
        infoEl.id = 'info';
        base.infoEl = infoEl;
        groupEl.appendChild(infoEl);
      },
    }];
  }

  _sectionPersistentState() {
    return [{
      group: 'Persistent State', id: 'persistent-state', type: 'custom',
      build: (groupEl, base) => {
        const actions = AppUtils.createButtonGroup({
          buttons: [
            {
              text: 'Save', className: 'btn secondary',
              onClick: () => {
                const state = this.widget.getState();
                base.downloadState('molam-state.json', state);
              },
            },
            {
              text: 'Load', className: 'btn secondary',
              onClick: () => {
                base.uploadState(async (state) => {
                  await this.widget.restoreState(state);

                  if (state.proteinId) {
                    const suffix = state.proteinType === 'pdb' ? ''
                      : `.${state.proteinType === 'af' ? 'af' : state.proteinType === 'bmcif' ? 'bcif' : 'cif'}`;
                    base.setSelectValue('proteinSelector', state.proteinId + suffix);
                  }

                  //this._updateRollControls();
                });
              },
            },
          ],
          direction: 'row',
        });
        groupEl.appendChild(actions);
      },
    }];
  }

  // ── Roll controls (dynamic) ─────────────────────────────────

/*
   Roll Controls are an obsolete feature.
   We keep the code to remind ourselves how rolls are done.

  _updateRollControls() {
    const container = this.controls.getDynamicContainer('rolls');
    if (!container) return;

    container.innerHTML = '';

    if (this.widget.chains) {
      const note = document.createElement('div');
      note.style.cssText = 'color:#666;font-size:10px';
      const totalResidues = [...this.widget.chains.values()].reduce((s, c) => s + c.points.length, 0);
      note.textContent = `Roll controls hidden (${this.widget.chains.size} chains, ${totalResidues} residues)`;
      container.appendChild(note);
      return;
    }

    const points = this.widget.controlPoints;
    const rolls  = this.widget.controlPointRolls;
    const maxDisplayed = Math.min(points.length, 6);

    for (let i = 0; i < maxDisplayed; i++) {
      const div = document.createElement('div');
      div.className = 'control';

      const label = document.createElement('label');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = `Point ${i + 1} Roll`;
      const valSpan = document.createElement('span');
      valSpan.id = `roll${i}-val`;
      valSpan.textContent = `${rolls[i] || 0}\u00B0`;

      label.appendChild(nameSpan);
      label.appendChild(valSpan);

      const input = document.createElement('input');
      input.type = 'range';
      input.id = `roll${i}`;
      input.min = -180; input.max = 180; input.step = 5;
      input.value = rolls[i] || 0;

      const index = i;
      input.addEventListener('input', (e) => {
        rolls[index] = parseFloat(e.target.value);
        valSpan.textContent = `${rolls[index]}\u00B0`;
        this.controls.render();
      });

      div.appendChild(label);
      div.appendChild(input);
      container.appendChild(div);
    }

    if (points.length > maxDisplayed) {
      const note = document.createElement('div');
      note.style.cssText = 'color:#666;font-size:10px;margin-top:5px';
      note.textContent = `(${points.length - maxDisplayed} more roll controls hidden)`;
      container.appendChild(note);
    }
  }
*/  
}

new MolamApp();
// Auto-generated exports
if (typeof window !== 'undefined') window.MolamApp = MolamApp;
export { MolamApp };
