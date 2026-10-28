/**
 * OmniCard - Card Renderer + Application Controller
 *
 * Classes:
 * -  CardSetNode    – renders a grid of styled cards via CSS injection
 * - OmniCardApp     – full application controller (slider config, presets, CSV loading)
 */

// ============================================================
//  CardSetNode
// ============================================================

import { OmniApp } from '../../../deep-explorer/js/omni-support/omni-app.js'
import { OmniControlPanel } from '../../../deep-explorer/js/omni-support/omni-control-panel.js'
import { MiniAstNode, sceneRegistry  } from '../../../deep-explorer/js/omni-support/scene.js';
import { CardSetNode } from '../../../deep-explorer/js/nodes-html/card-set-node.js'
import { AppUtils } from '../omni-support/app-utils.js' 

/**
 * Currently CardSetNode is monolithic
 * in time I plan to create a CardNode and a FlexFlowNode so that it can 
 * be composed as a tree
 * 
 * This is not yet using the Ast node system.
 */

class OmniCardModel {

  // --- Handler for direct access to top level
  static makeTopLevelHandler( container, root) {
    let handler = new CardSetNode( container, root.value );
    return handler;
  }

  // --- Creation
  static makeCardAst(data){
    let cards  = new MiniAstNode('card-set', [], data);
    return cards;    
  }
}

// ============================================================
// OmniCardApp — full application controller
// ============================================================

class OmniCardApp {
  // ── Static configuration ─────────────────────────────────────

  static SAMPLE_CARDS = [
    ['What is the capital of France?', 'Paris is the capital and largest city of France.'],
    ['Define photosynthesis', 'The process by which plants convert light energy into chemical energy.'],
    ['Who wrote Hamlet?', 'William Shakespeare wrote Hamlet around 1600.'],
    ['What is the speed of light?', 'Approximately 299,792,458 meters per second in a vacuum.'],
    ['Explain recursion', 'A programming technique where a function calls itself.'],
    ['What is π (pi)?', 'The ratio of a circle\'s circumference to its diameter, approximately 3.14159.'],
    ['Define entropy', 'A measure of disorder or randomness in a system.'],
    ['What is DNA?', 'Deoxyribonucleic acid, the molecule carrying genetic instructions.'],
    ['Who painted the Mona Lisa?', 'Leonardo da Vinci painted it in the early 16th century.'],
    ['What is the Pythagorean theorem?', 'a² + b² = c² for right-angled triangles.'],
    ['Define machine learning', 'Computer systems that learn from data without explicit programming.'],
    ['What is quantum mechanics?', 'The physics of matter and energy at atomic and subatomic scales.']
  ];

  static PRESETS = {
    'Hide Answer': {
      alignH: 0, alignV: 0, padding: 20, contentGap: 12,
      cardWidth: 280, cardHeight: 180,
      headingSize: 16, headingWeight: 600, headingSpacing: 0, headingLineHeight: 1.3,
      headingHue: 0, headingSat: 0, headingLight: 93, headingOpacity: 1,
      bodySize: 14, bodyWeight: 400, bodySpacing: 0, bodyLineHeight: 1.5,
      bodyHue: 0, bodySat: 0, bodyLight: 70, bodyOpacity: 0,
      dividerHeight: 1, dividerWidth: 100, dividerTopMargin: 0, dividerHue: 0, dividerSat: 0, dividerLight: 40, dividerOpacity: 0.3,
      bgHue: 240, bgSat: 15, bgLight: 20, bgOpacity: 1,
      borderRadius: 8, borderWidth: 0, borderHue: 200, borderOpacity: 0.3,
      shadowBlur: 10, shadowX: 0, shadowY: 4, shadowOpacity: 0.3,
      backdropBlur: 0, saturation: 1, brightness: 1
    },
    'Default': {
      alignH: 0, alignV: 0, padding: 20, contentGap: 12,
      cardWidth: 280, cardHeight: 180,
      headingSize: 16, headingWeight: 600, headingSpacing: 0, headingLineHeight: 1.3,
      headingHue: 0, headingSat: 0, headingLight: 93, headingOpacity: 1,
      bodySize: 14, bodyWeight: 400, bodySpacing: 0, bodyLineHeight: 1.5,
      bodyHue: 0, bodySat: 0, bodyLight: 70, bodyOpacity: 1,
      dividerHeight: 1, dividerWidth: 100, dividerTopMargin: 0, dividerHue: 0, dividerSat: 0, dividerLight: 40, dividerOpacity: 0.3,
      bgHue: 240, bgSat: 15, bgLight: 20, bgOpacity: 1,
      borderRadius: 8, borderWidth: 0, borderHue: 200, borderOpacity: 0.3,
      shadowBlur: 10, shadowX: 0, shadowY: 4, shadowOpacity: 0.3,
      backdropBlur: 0, saturation: 1, brightness: 1
    },
    'Glassmorphic': {
      alignH: 0, alignV: 0, padding: 24, contentGap: 14,
      cardWidth: 280, cardHeight: 180,
      headingSize: 17, headingWeight: 500, headingSpacing: 0.3, headingLineHeight: 1.3,
      headingHue: 0, headingSat: 0, headingLight: 100, headingOpacity: 1,
      bodySize: 14, bodyWeight: 400, bodySpacing: 0, bodyLineHeight: 1.6,
      bodyHue: 0, bodySat: 0, bodyLight: 95, bodyOpacity: 0.9,
      dividerHeight: 1, dividerWidth: 100, dividerTopMargin: 0, dividerHue: 0, dividerSat: 0, dividerLight: 100, dividerOpacity: 0.15,
      bgHue: 200, bgSat: 50, bgLight: 50, bgOpacity: 0.15,
      borderRadius: 16, borderWidth: 1, borderHue: 0, borderOpacity: 0.2,
      shadowBlur: 20, shadowX: 0, shadowY: 8, shadowOpacity: 0.1,
      backdropBlur: 10, saturation: 1.2, brightness: 1.1
    },
    'Minimal': {
      alignH: 0, alignV: 0, padding: 30, contentGap: 16,
      cardWidth: 280, cardHeight: 180,
      headingSize: 14, headingWeight: 700, headingSpacing: 0.5, headingLineHeight: 1.4,
      headingHue: 0, headingSat: 0, headingLight: 10, headingOpacity: 1,
      bodySize: 12, bodyWeight: 400, bodySpacing: -0.3, bodyLineHeight: 1.4,
      bodyHue: 0, bodySat: 0, bodyLight: 40, bodyOpacity: 1,
      dividerHeight: 1, dividerWidth: 100, dividerTopMargin: -12, dividerHue: 0, dividerSat: 0, dividerLight: 85, dividerOpacity: 1,
      bgHue: 0, bgSat: 0, bgLight: 98, bgOpacity: 1,
      borderRadius: 0, borderWidth: 0, borderHue: 0, borderOpacity: 0,
      shadowBlur: 0, shadowX: 0, shadowY: 0, shadowOpacity: 0,
      backdropBlur: 0, saturation: 0.8, brightness: 1
    },
    'Bold Neon': {
      alignH: 0.5, alignV: 0.5, padding: 20, contentGap: 16,
      cardWidth: 280, cardHeight: 180,
      headingSize: 20, headingWeight: 700, headingSpacing: 1, headingLineHeight: 1.2,
      headingHue: 320, headingSat: 100, headingLight: 70, headingOpacity: 1,
      bodySize: 15, bodyWeight: 500, bodySpacing: 0.3, bodyLineHeight: 1.5,
      bodyHue: 280, bodySat: 80, bodyLight: 80, bodyOpacity: 0.9,
      dividerHeight: 2, dividerWidth: 80, dividerTopMargin: -5, dividerHue: 320, dividerSat: 100, dividerLight: 50, dividerOpacity: 0.8,
      bgHue: 280, bgSat: 80, bgLight: 15, bgOpacity: 1,
      borderRadius: 12, borderWidth: 2, borderHue: 320, borderOpacity: 0.8,
      shadowBlur: 25, shadowX: 0, shadowY: 0, shadowOpacity: 0.6,
      backdropBlur: 0, saturation: 1.5, brightness: 1.2
    },
    'Soft Pastel': {
      alignH: 0, alignV: 0, padding: 25, contentGap: 14,
      cardWidth: 280, cardHeight: 180,
      headingSize: 16, headingWeight: 600, headingSpacing: 0.2, headingLineHeight: 1.3,
      headingHue: 30, headingSat: 50, headingLight: 25, headingOpacity: 1,
      bodySize: 14, bodyWeight: 400, bodySpacing: 0, bodyLineHeight: 1.6,
      bodyHue: 30, bodySat: 30, bodyLight: 40, bodyOpacity: 0.9,
      dividerHeight: 1, dividerWidth: 100, dividerTopMargin: 0, dividerHue: 30, dividerSat: 30, dividerLight: 80, dividerOpacity: 0.5,
      bgHue: 30, bgSat: 30, bgLight: 90, bgOpacity: 1,
      borderRadius: 20, borderWidth: 0, borderHue: 0, borderOpacity: 0,
      shadowBlur: 15, shadowX: 0, shadowY: 6, shadowOpacity: 0.15,
      backdropBlur: 0, saturation: 0.9, brightness: 1.05
    }
  };

  static EXTRA_CSS = `
    /* Card grid container (UI element, not card styling) */
    .ocard-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding: 20px;
      justify-content: center;
      align-content: flex-start;
      width: 100%;
      height: 100%;
      overflow-y: auto;
    }

    /* Base card structure (non-parametric) */
    .ocard {
      display: flex;
      flex-direction: column;
      position: relative;
      transition: transform 0.2s;
      overflow: hidden;
    }

    .ocard:hover {
      transform: translateY(-2px);
    }

    .ocard-number {
      position: absolute;
      top: 8px;
      right: 12px;
      font-size: 10px;
      color: #555;
      font-family: monospace;
    }

    .ocard-body {
      flex: 1;
      overflow-y: auto;
    }

    .ocard-body-item:last-child {
      margin-bottom: 0;
    }
  `;

  // ── Constructor ──────────────────────────────────────────────

  /**
   * @param {Object} [options]
   * @param {string}   [options.title='OmniCard']
   * @param {string}   [options.subtitle]
   * @param {string}   [options.extraCSS]
   * @param {string}   [options.hintHtml]
   * @param {string}   [options.defaultPreset='Hide Answer']
   * @param {boolean}  [options.createShell=true]
   * @param {number}   [options.maxAspectRatio=10]
   * @param {Array}    [options.cardData]  – override sample cards
   */
  constructor(options = {}) {
    const {
      title = 'OmniCard',
      subtitle = 'Design and style cards with continuous parameters',
      extraCSS = OmniCardApp.EXTRA_CSS,
      hintHtml = '<b>Alignment:</b> 0=left/top, 0.5=center, 1=right/bottom<br>'
               + '<b>HSL:</b> Hue (0-360°), Sat (0-100%), Light (0-100%)<br>'
               + '<b>CSV:</b> First column = heading, rest = body items (alternating styles)',
      defaultPreset = 'Hide Answer',
      maxAspectRatio = 10,
      cardData = OmniCardApp.SAMPLE_CARDS,
      mode = 'html'
    } = options;
    this.mode = mode;

    // ── DOM ────────────────────────────────────────────────────
    const shell = new OmniApp({
      title,
      subtitle,
      extraCSS,
      displayElement: 'div',
      displayId: 'card-grid',
      mode
    });

    // ── Renderer ───────────────────────────────────────────────

    this.rootNode = OmniCardModel.makeCardAst(cardData);

    if (this.mode === 'html') {
      this.canvas = shell.display;
      this.container = shell.container;
      this.cardGrid = shell.display;
      this.cardGrid.className = 'ocard-grid';
      this.controlsEl = shell.controls;
      this.multiscrollerEl = shell.multiscroller;

      // Dynamic style element for card CSS injection
      this.ocardStyleEl = document.createElement('style');
      this.ocardStyleEl.id = 'ocard-styles';
      document.head.appendChild(this.ocardStyleEl);

      this.handler = OmniCardModel.makeTopLevelHandler( this.cardGrid, this.rootNode );
    } else {
      debugger;
    }


    // ── OmniControlPanel ───────────────────────────────────────────────
    this.base = new OmniControlPanel({
      elements: {
        container: this.container,
        controls: this.controlsEl,
        multiscroller: this.multiscrollerEl
      },
      sliderConfig: this._buildSliderConfig(),
      presets: OmniCardApp.PRESETS,
      defaultPreset,
      enablePanZoom: false,
      maxAspectRatio,
      hintHtml,

      onRender: (params, panZoom, controls) => {
        const fullParams = {
          ...params
        };
        this.handler.update(params);
//      GenericScene.renderAny(this.ctxMix, fullParams, panZoom, this.rootNode);
      },

      onParamChange: () => {},
      onResize: () => {},
    });

    this.base.addHelp();

    // Does not need an initial render
    //this.handler.update(this.base.getParams());
  }

  // ── Slider config: composable sections ─────────────────────────

  _buildSliderConfig() {
    return [
      ...this._sectionLoadData(),
      ...this._sectionPresets(),
      ...this._sectionLayout(),
      ...this._sectionDimensions(),
      ...this._sectionHeadingType(),
      ...this._sectionHeadingColor(),
      ...this._sectionBodyType(),
      ...this._sectionBodyColor(),
      ...this._sectionDivider(),
      ...this._sectionBackground(),
      ...this._sectionBorder(),
      ...this._sectionShadow(),
      ...this._sectionEffects(),
      ...this._sectionExport(),
    ];
  }

  _sectionLoadData() {
    return [{
      group: 'Load Data', id: 'load', abbrev: 'Load',
      type: 'filedrop',
      label: 'Drop CSV file or click',
      accept: '.csv,.txt',
      onDrop: (files) => { if (files[0]) this._loadCSV(files[0]); }
    }];
  }

  _sectionPresets() {
    return [
      { group: 'Presets', id: 'presets', abbrev: 'Pre', type: 'presets' }
    ];
  }

  _sectionLayout() {
    return [{
      group: 'Layout', id: 'layout', abbrev: 'Lay',
      sliders: [
        { id: 'alignH',     label: 'Align horizontal', min: 0, max: 1,  step: 0.01, default: 0 },
        { id: 'alignV',     label: 'Align vertical',   min: 0, max: 1,  step: 0.01, default: 0 },
        { id: 'padding',    label: 'Padding',          min: 0, max: 60, step: 1,    default: 20, format: 'int' },
        { id: 'contentGap', label: 'Content gap',      min: 0, max: 40, step: 1,    default: 12, format: 'int' }
      ]
    }];
  }

  _sectionDimensions() {
    return [{
      group: 'Dimensions', id: 'dimensions', abbrev: 'Dim',
      sliders: [
        { id: 'cardWidth',  label: 'Card width',  min: 200, max: 400, step: 1, default: 280, format: 'int' },
        { id: 'cardHeight', label: 'Card height', min: 120, max: 300, step: 1, default: 180, format: 'int' }
      ]
    }];
  }

  _sectionHeadingType() {
    return [{
      group: 'Heading Typography', id: 'headingType', abbrev: 'H-Typ',
      sliders: [
        { id: 'headingSize',       label: 'Font size',       min: 10, max: 32, step: 1,   default: 16,  format: 'int' },
        { id: 'headingWeight',     label: 'Font weight',     min: 100, max: 900, step: 100, default: 600, format: 'int' },
        { id: 'headingSpacing',    label: 'Letter spacing',  min: -2, max: 4,  step: 0.1, default: 0 },
        { id: 'headingLineHeight', label: 'Line height',     min: 1,  max: 2,  step: 0.1, default: 1.3 }
      ]
    }];
  }

  _sectionHeadingColor() {
    return [{
      group: 'Heading Color', id: 'headingColor', abbrev: 'H-Col',
      sliders: [
        { id: 'headingHue',     label: 'Hue',        min: 0, max: 360, step: 1,    default: 0,  format: 'int' },
        { id: 'headingSat',     label: 'Saturation',  min: 0, max: 100, step: 1,    default: 0,  format: 'int' },
        { id: 'headingLight',   label: 'Lightness',   min: 0, max: 100, step: 1,    default: 93, format: 'int' },
        { id: 'headingOpacity', label: 'Opacity',     min: 0, max: 1,   step: 0.01, default: 1 }
      ]
    }];
  }

  _sectionBodyType() {
    return [{
      group: 'Body Typography', id: 'bodyType', abbrev: 'B-Typ',
      sliders: [
        { id: 'bodySize',       label: 'Font size',       min: 8,  max: 24,  step: 1,   default: 14,  format: 'int' },
        { id: 'bodyWeight',     label: 'Font weight',     min: 100, max: 900, step: 100, default: 400, format: 'int' },
        { id: 'bodySpacing',    label: 'Letter spacing',  min: -2, max: 4,   step: 0.1, default: 0 },
        { id: 'bodyLineHeight', label: 'Line height',     min: 1,  max: 2.5, step: 0.1, default: 1.5 }
      ]
    }];
  }

  _sectionBodyColor() {
    return [{
      group: 'Body Color', id: 'bodyColor', abbrev: 'B-Col',
      sliders: [
        { id: 'bodyHue',     label: 'Hue',       min: 0, max: 360, step: 1,    default: 0,  format: 'int' },
        { id: 'bodySat',     label: 'Saturation', min: 0, max: 100, step: 1,    default: 0,  format: 'int' },
        { id: 'bodyLight',   label: 'Lightness',  min: 0, max: 100, step: 1,    default: 70, format: 'int' },
        { id: 'bodyOpacity', label: 'Opacity',    min: 0, max: 1,   step: 0.01, default: 1 }
      ]
    }];
  }

  _sectionDivider() {
    return [{
      group: 'Divider', id: 'divider', abbrev: 'Div',
      sliders: [
        { id: 'dividerHeight',    label: 'Height',     min: 0,   max: 8.0,   step: 0.1,    default: 1},
        { id: 'dividerWidth',     label: 'Width %',    min: 0,   max: 100, step: 1,    default: 100, format: 'int' },
        { id: 'dividerTopMargin', label: 'Top margin', min: -20, max: 40,  step: 1,    default: 0,   format: 'int' },
        { id: 'dividerHue',       label: 'Hue',        min: 0,   max: 360, step: 1,    default: 0,   format: 'int' },
        { id: 'dividerSat',       label: 'Saturation', min: 0,   max: 100, step: 1,    default: 0,   format: 'int' },
        { id: 'dividerLight',     label: 'Lightness',  min: 0,   max: 100, step: 1,    default: 40,  format: 'int' },
        { id: 'dividerOpacity',   label: 'Opacity',    min: 0,   max: 1,   step: 0.01, default: 0.3 }
      ]
    }];
  }

  _sectionBackground() {
    return [{
      group: 'Background', id: 'bgColor', abbrev: 'BG',
      sliders: [
        { id: 'bgHue',     label: 'Hue',       min: 0, max: 360, step: 1,    default: 240, format: 'int' },
        { id: 'bgSat',     label: 'Saturation', min: 0, max: 100, step: 1,    default: 15,  format: 'int' },
        { id: 'bgLight',   label: 'Lightness',  min: 0, max: 100, step: 1,    default: 20,  format: 'int' },
        { id: 'bgOpacity', label: 'Opacity',    min: 0, max: 1,   step: 0.01, default: 1 }
      ]
    }];
  }

  _sectionBorder() {
    return [{
      group: 'Border', id: 'border', abbrev: 'Bdr',
      sliders: [
        { id: 'borderRadius',  label: 'Border radius',  min: 0, max: 50,  step: 0.1,    default: 8},
        { id: 'borderWidth',   label: 'Border width',   min: 0, max: 8,   step: 0.1,    default: 0},
        { id: 'borderHue',     label: 'Border hue',     min: 0, max: 360, step: 1,    default: 200, format: 'int' },
        { id: 'borderOpacity', label: 'Border opacity',  min: 0, max: 1,   step: 0.01, default: 0.3 }
      ]
    }];
  }

  _sectionShadow() {
    return [{
      group: 'Shadow', id: 'shadow', abbrev: 'Shd',
      sliders: [
        { id: 'shadowBlur',    label: 'Shadow blur',     min: 0,   max: 50, step: 1,    default: 10, format: 'int' },
        { id: 'shadowX',       label: 'Shadow offset X', min: -30, max: 30, step: 1,    default: 0,  format: 'int' },
        { id: 'shadowY',       label: 'Shadow offset Y', min: -30, max: 30, step: 1,    default: 4,  format: 'int' },
        { id: 'shadowOpacity', label: 'Shadow opacity',  min: 0,   max: 1,  step: 0.01, default: 0.3 }
      ]
    }];
  }

  _sectionEffects() {
    return [{
      group: 'Effects', id: 'effects', abbrev: 'FX',
      sliders: [
        { id: 'backdropBlur', label: 'Backdrop blur', min: 0, max: 20, step: 1,   default: 0, format: 'int' },
        { id: 'saturation',   label: 'Saturation',    min: 0, max: 2,  step: 0.1, default: 1 },
        { id: 'brightness',   label: 'Brightness',    min: 0, max: 2,  step: 0.1, default: 1 }
      ]
    }];
  }

  _update(){
    this.handler.update( this.base.getParams() );
  }
  _getCss(){
    return this.handler.generateCSS(this.base.getParams());
  }
  _getHtml(){
    return this.handler.generateSampleHTML();
  }
  _setData( data ){
    this.handler.setCardData(cards);
    this._update()
  }

  _sectionExport() {
    return [{
      group: 'Export', id: 'export', abbrev: 'Exp',
      type: 'custom',
      build: (groupEl) => {
        groupEl.appendChild( AppUtils.createButton({
          text: 'Copy CSS',
          onClick: () => {
            const css = this._getCss();
            navigator.clipboard.writeText(css).then(() => {
              const btn = groupEl.querySelector('.btn');
              btn.textContent = 'Copied!';
              setTimeout(() => btn.textContent = 'Copy CSS', 1500);
            });
          }
        }));

        groupEl.appendChild( AppUtils.createButton({
          text: 'Copy Sample HTML',
          className: 'btn secondary',
          style: { marginTop: '8px' },
          onClick: () => {
            const html = this._getHtml();
            navigator.clipboard.writeText(html).then(() => {
              const btns = groupEl.querySelectorAll('.btn');
              const btn = btns[btns.length - 1];
              btn.textContent = 'Copied!';
              setTimeout(() => btn.textContent = 'Copy Sample HTML', 1500);
            });
          }
        }));
      }
    }];
  }

  // ── CSV loading ────────────────────────────────────────────────

  _loadCSV(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvData = new CSVData(e.target.result);
        const cards = [];
        for (let i = 0; i < csvData.rowCount; i++) {
          cards.push(csvData.getRow(i));
        }
        this._setData( cards );
      } catch (err) {
        alert('Error loading CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
  }
}

new OmniCardApp();

// Auto-generated exports
if (typeof window !== 'undefined') window.OmniCardApp = OmniCardApp;
export { OmniCardApp };
if (typeof window !== 'undefined') window.OmniCardModel = OmniCardModel;
export { OmniCardModel };
