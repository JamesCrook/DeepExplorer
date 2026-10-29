// scenes-cards.js — Card scene definition for OmniScene
/**
 * Renders a grid of styled HTML cards via the omni-html.js backend.
 * The node types live in nodes-html/card-grid-node.js and flash-card-node.js;
 * this file holds the scene, its presets and its panel.
 *
 * AST shape:
 *
 *   scene-root
 *     layer  (params: card-styling params)
 *       card-grid
 *         flash-card  (value: ['Heading text', 'Body text 1', …])
 *         flash-card  (value: ['Heading text', 'Body text 1', …])
 *         …
 *
 * walkPhase dispatches:
 *   card-grid (has subtree) → before_mount / after_mount,
 *                              before_update / after_update,
 *                              before_teardown / after_teardown
 *   flash-card (leaf)       → mount, teardown
 *
 * Place in: apps/scenes-cards.js
 */


import { MiniAstNode, SCENES } from '../omni-support/scene.js';
import { CSVData } from '../data/csv-data.js';
import { generateDynamicCSS } from '../nodes-html/card-grid-node.js';
import '../nodes-html/flash-card-node.js';


// ═══════════════════════════════════════════════════════
//  SAMPLE DATA
// ═══════════════════════════════════════════════════════

const SAMPLE_CARDS = [
  ['What is the capital of France?',      'Paris is the capital and largest city of France.'],
  ['Define photosynthesis',               'The process by which plants convert light energy into chemical energy.'],
  ['Who wrote Hamlet?',                   'William Shakespeare wrote Hamlet around 1600.'],
  ['What is the speed of light?',         'Approximately 299,792,458 meters per second in a vacuum.'],
  ['Explain recursion',                   'A programming technique where a function calls itself.'],
  ['What is π (pi)?',                     'The ratio of a circle\'s circumference to its diameter, approximately 3.14159.'],
  ['Define entropy',                      'A measure of disorder or randomness in a system.'],
  ['What is DNA?',                        'Deoxyribonucleic acid, the molecule carrying genetic instructions.'],
  ['Who painted the Mona Lisa?',          'Leonardo da Vinci painted it in the early 16th century.'],
  ['What is the Pythagorean theorem?',    'a² + b² = c² for right-angled triangles.'],
  ['Define machine learning',             'Computer systems that learn from data without explicit programming.'],
  ['What is quantum mechanics?',          'The physics of matter and energy at atomic and subatomic scales.'],
];


// ═══════════════════════════════════════════════════════
//  PRESETS + DEFAULT PARAMS
// ═══════════════════════════════════════════════════════

const PRESETS = {
  'Hide Answer': {
    alignH: 0, alignV: 0, padding: 20, contentGap: 12,
    cardWidth: 280, cardHeight: 180,
    headingSize: 16, headingWeight: 600, headingSpacing: 0, headingLineHeight: 1.3,
    headingHue: 0, headingSat: 0, headingLight: 93, headingOpacity: 1,
    bodySize: 14, bodyWeight: 400, bodySpacing: 0, bodyLineHeight: 1.5,
    bodyHue: 0, bodySat: 0, bodyLight: 70, bodyOpacity: 0,
    dividerHeight: 1, dividerWidth: 100, dividerTopMargin: 0,
    dividerHue: 0, dividerSat: 0, dividerLight: 40, dividerOpacity: 0.3,
    bgHue: 240, bgSat: 15, bgLight: 20, bgOpacity: 1,
    borderRadius: 8, borderWidth: 0, borderHue: 200, borderOpacity: 0.3,
    shadowBlur: 10, shadowX: 0, shadowY: 4, shadowOpacity: 0.3,
    backdropBlur: 0, saturation: 1, brightness: 1,
  },
  'Default': {
    alignH: 0, alignV: 0, padding: 20, contentGap: 12,
    cardWidth: 280, cardHeight: 180,
    headingSize: 16, headingWeight: 600, headingSpacing: 0, headingLineHeight: 1.3,
    headingHue: 0, headingSat: 0, headingLight: 93, headingOpacity: 1,
    bodySize: 14, bodyWeight: 400, bodySpacing: 0, bodyLineHeight: 1.5,
    bodyHue: 0, bodySat: 0, bodyLight: 70, bodyOpacity: 1,
    dividerHeight: 1, dividerWidth: 100, dividerTopMargin: 0,
    dividerHue: 0, dividerSat: 0, dividerLight: 40, dividerOpacity: 0.3,
    bgHue: 240, bgSat: 15, bgLight: 20, bgOpacity: 1,
    borderRadius: 8, borderWidth: 0, borderHue: 200, borderOpacity: 0.3,
    shadowBlur: 10, shadowX: 0, shadowY: 4, shadowOpacity: 0.3,
    backdropBlur: 0, saturation: 1, brightness: 1,
  },
  'Glassmorphic': {
    alignH: 0, alignV: 0, padding: 24, contentGap: 14,
    cardWidth: 280, cardHeight: 180,
    headingSize: 17, headingWeight: 500, headingSpacing: 0.3, headingLineHeight: 1.3,
    headingHue: 0, headingSat: 0, headingLight: 100, headingOpacity: 1,
    bodySize: 14, bodyWeight: 400, bodySpacing: 0, bodyLineHeight: 1.6,
    bodyHue: 0, bodySat: 0, bodyLight: 95, bodyOpacity: 0.9,
    dividerHeight: 1, dividerWidth: 100, dividerTopMargin: 0,
    dividerHue: 0, dividerSat: 0, dividerLight: 100, dividerOpacity: 0.15,
    bgHue: 200, bgSat: 50, bgLight: 50, bgOpacity: 0.15,
    borderRadius: 16, borderWidth: 1, borderHue: 0, borderOpacity: 0.2,
    shadowBlur: 20, shadowX: 0, shadowY: 8, shadowOpacity: 0.1,
    backdropBlur: 10, saturation: 1.2, brightness: 1.1,
  },
  'Minimal': {
    alignH: 0, alignV: 0, padding: 30, contentGap: 16,
    cardWidth: 280, cardHeight: 180,
    headingSize: 14, headingWeight: 700, headingSpacing: 0.5, headingLineHeight: 1.4,
    headingHue: 0, headingSat: 0, headingLight: 10, headingOpacity: 1,
    bodySize: 12, bodyWeight: 400, bodySpacing: -0.3, bodyLineHeight: 1.4,
    bodyHue: 0, bodySat: 0, bodyLight: 40, bodyOpacity: 1,
    dividerHeight: 1, dividerWidth: 100, dividerTopMargin: -12,
    dividerHue: 0, dividerSat: 0, dividerLight: 85, dividerOpacity: 1,
    bgHue: 0, bgSat: 0, bgLight: 98, bgOpacity: 1,
    borderRadius: 0, borderWidth: 0, borderHue: 0, borderOpacity: 0,
    shadowBlur: 0, shadowX: 0, shadowY: 0, shadowOpacity: 0,
    backdropBlur: 0, saturation: 0.8, brightness: 1,
  },
  'Bold Neon': {
    alignH: 0.5, alignV: 0.5, padding: 20, contentGap: 16,
    cardWidth: 280, cardHeight: 180,
    headingSize: 20, headingWeight: 700, headingSpacing: 1, headingLineHeight: 1.2,
    headingHue: 320, headingSat: 100, headingLight: 70, headingOpacity: 1,
    bodySize: 15, bodyWeight: 500, bodySpacing: 0.3, bodyLineHeight: 1.5,
    bodyHue: 280, bodySat: 80, bodyLight: 80, bodyOpacity: 0.9,
    dividerHeight: 2, dividerWidth: 80, dividerTopMargin: -5,
    dividerHue: 320, dividerSat: 100, dividerLight: 50, dividerOpacity: 0.8,
    bgHue: 280, bgSat: 80, bgLight: 15, bgOpacity: 1,
    borderRadius: 12, borderWidth: 2, borderHue: 320, borderOpacity: 0.8,
    shadowBlur: 25, shadowX: 0, shadowY: 0, shadowOpacity: 0.6,
    backdropBlur: 0, saturation: 1.5, brightness: 1.2,
  },
  'Soft Pastel': {
    alignH: 0, alignV: 0, padding: 25, contentGap: 14,
    cardWidth: 280, cardHeight: 180,
    headingSize: 16, headingWeight: 600, headingSpacing: 0.2, headingLineHeight: 1.3,
    headingHue: 30, headingSat: 50, headingLight: 25, headingOpacity: 1,
    bodySize: 14, bodyWeight: 400, bodySpacing: 0, bodyLineHeight: 1.6,
    bodyHue: 30, bodySat: 30, bodyLight: 40, bodyOpacity: 0.9,
    dividerHeight: 1, dividerWidth: 100, dividerTopMargin: 0,
    dividerHue: 30, dividerSat: 30, dividerLight: 80, dividerOpacity: 0.5,
    bgHue: 30, bgSat: 30, bgLight: 90, bgOpacity: 1,
    borderRadius: 20, borderWidth: 0, borderHue: 0, borderOpacity: 0,
    shadowBlur: 15, shadowX: 0, shadowY: 6, shadowOpacity: 0.15,
    backdropBlur: 0, saturation: 0.9, brightness: 1.05,
  },
};

const DEFAULT_PARAMS = { ...PRESETS['Default'] };


// ═══════════════════════════════════════════════════════
//  BUILD-UI  (slider sections for OmniControlPanel)
// ═══════════════════════════════════════════════════════

function sectionLayout() {
  return [{ group: 'Layout', id: 'layout', abbrev: 'Lay', sliders: [
    { id: 'alignH',     label: 'Align horizontal', min: 0, max: 1,  step: 0.01, default: 0 },
    { id: 'alignV',     label: 'Align vertical',   min: 0, max: 1,  step: 0.01, default: 0 },
    { id: 'padding',    label: 'Padding',           min: 0, max: 60, step: 1,    default: 20, format: 'int' },
    { id: 'contentGap', label: 'Content gap',       min: 0, max: 40, step: 1,    default: 12, format: 'int' },
  ]}];
}

function sectionDimensions() {
  return [{ group: 'Dimensions', id: 'dimensions', abbrev: 'Dim', sliders: [
    { id: 'cardWidth',  label: 'Card width',  min: 200, max: 400, step: 1, default: 280, format: 'int' },
    { id: 'cardHeight', label: 'Card height', min: 120, max: 300, step: 1, default: 180, format: 'int' },
  ]}];
}

function sectionHeadingType() {
  return [{ group: 'Heading Typography', id: 'headingType', abbrev: 'H-Typ', sliders: [
    { id: 'headingSize',       label: 'Font size',      min: 10,  max: 32,  step: 1,   default: 16,  format: 'int' },
    { id: 'headingWeight',     label: 'Font weight',     min: 100, max: 900, step: 100, default: 600, format: 'int' },
    { id: 'headingSpacing',    label: 'Letter spacing',  min: -2,  max: 4,   step: 0.1, default: 0 },
    { id: 'headingLineHeight', label: 'Line height',     min: 1,   max: 2,   step: 0.1, default: 1.3 },
  ]}];
}

function sectionHeadingColor() {
  return [{ group: 'Heading Color', id: 'headingColor', abbrev: 'H-Col', sliders: [
    { id: 'headingHue',     label: 'Hue',        min: 0, max: 360, step: 1,    default: 0,  format: 'int' },
    { id: 'headingSat',     label: 'Saturation',  min: 0, max: 100, step: 1,    default: 0,  format: 'int' },
    { id: 'headingLight',   label: 'Lightness',   min: 0, max: 100, step: 1,    default: 93, format: 'int' },
    { id: 'headingOpacity', label: 'Opacity',     min: 0, max: 1,   step: 0.01, default: 1 },
  ]}];
}

function sectionBodyType() {
  return [{ group: 'Body Typography', id: 'bodyType', abbrev: 'B-Typ', sliders: [
    { id: 'bodySize',       label: 'Font size',      min: 8,   max: 24,  step: 1,   default: 14,  format: 'int' },
    { id: 'bodyWeight',     label: 'Font weight',     min: 100, max: 900, step: 100, default: 400, format: 'int' },
    { id: 'bodySpacing',    label: 'Letter spacing',  min: -2,  max: 4,   step: 0.1, default: 0 },
    { id: 'bodyLineHeight', label: 'Line height',     min: 1,   max: 2.5, step: 0.1, default: 1.5 },
  ]}];
}

function sectionBodyColor() {
  return [{ group: 'Body Color', id: 'bodyColor', abbrev: 'B-Col', sliders: [
    { id: 'bodyHue',     label: 'Hue',        min: 0, max: 360, step: 1,    default: 0,  format: 'int' },
    { id: 'bodySat',     label: 'Saturation',  min: 0, max: 100, step: 1,    default: 0,  format: 'int' },
    { id: 'bodyLight',   label: 'Lightness',   min: 0, max: 100, step: 1,    default: 70, format: 'int' },
    { id: 'bodyOpacity', label: 'Opacity',     min: 0, max: 1,   step: 0.01, default: 1 },
  ]}];
}

function sectionDivider() {
  return [{ group: 'Divider', id: 'divider', abbrev: 'Div', sliders: [
    { id: 'dividerHeight',    label: 'Height',     min: 0,   max: 8,   step: 0.1,  default: 1 },
    { id: 'dividerWidth',     label: 'Width %',    min: 0,   max: 100, step: 1,    default: 100, format: 'int' },
    { id: 'dividerTopMargin', label: 'Top margin', min: -20, max: 40,  step: 1,    default: 0,   format: 'int' },
    { id: 'dividerHue',       label: 'Hue',        min: 0,   max: 360, step: 1,    default: 0,   format: 'int' },
    { id: 'dividerSat',       label: 'Saturation',  min: 0,   max: 100, step: 1,    default: 0,   format: 'int' },
    { id: 'dividerLight',     label: 'Lightness',   min: 0,   max: 100, step: 1,    default: 40,  format: 'int' },
    { id: 'dividerOpacity',   label: 'Opacity',     min: 0,   max: 1,   step: 0.01, default: 0.3 },
  ]}];
}

function sectionBackground() {
  return [{ group: 'Background', id: 'bgColor', abbrev: 'BG', sliders: [
    { id: 'bgHue',     label: 'Hue',        min: 0, max: 360, step: 1,    default: 240, format: 'int' },
    { id: 'bgSat',     label: 'Saturation',  min: 0, max: 100, step: 1,    default: 15,  format: 'int' },
    { id: 'bgLight',   label: 'Lightness',   min: 0, max: 100, step: 1,    default: 20,  format: 'int' },
    { id: 'bgOpacity', label: 'Opacity',     min: 0, max: 1,   step: 0.01, default: 1 },
  ]}];
}

function sectionBorder() {
  return [{ group: 'Border', id: 'border', abbrev: 'Bdr', sliders: [
    { id: 'borderRadius',  label: 'Border radius',  min: 0, max: 50,  step: 0.1,  default: 8 },
    { id: 'borderWidth',   label: 'Border width',   min: 0, max: 8,   step: 0.1,  default: 0 },
    { id: 'borderHue',     label: 'Border hue',     min: 0, max: 360, step: 1,    default: 200, format: 'int' },
    { id: 'borderOpacity', label: 'Border opacity',  min: 0, max: 1,   step: 0.01, default: 0.3 },
  ]}];
}

function sectionShadow() {
  return [{ group: 'Shadow', id: 'shadow', abbrev: 'Shd', sliders: [
    { id: 'shadowBlur',    label: 'Shadow blur',     min: 0,   max: 50, step: 1,    default: 10, format: 'int' },
    { id: 'shadowX',       label: 'Shadow offset X', min: -30, max: 30, step: 1,    default: 0,  format: 'int' },
    { id: 'shadowY',       label: 'Shadow offset Y', min: -30, max: 30, step: 1,    default: 4,  format: 'int' },
    { id: 'shadowOpacity', label: 'Shadow opacity',  min: 0,   max: 1,  step: 0.01, default: 0.3 },
  ]}];
}

function sectionEffects() {
  return [{ group: 'Effects', id: 'effects', abbrev: 'FX', sliders: [
    { id: 'backdropBlur', label: 'Backdrop blur', min: 0, max: 20, step: 1,   default: 0, format: 'int' },
    { id: 'saturation',   label: 'Saturation',    min: 0, max: 2,  step: 0.1, default: 1 },
    { id: 'brightness',   label: 'Brightness',    min: 0, max: 2,  step: 0.1, default: 1 },
  ]}];
}

function sectionExport(cardData) {
  return [{
    group: 'Export', id: 'export', abbrev: 'Exp',
    type: 'custom',
    build: (groupEl, layer, app) => {
      const mkBtn = (text, cls, onClick) => {
        const btn = document.createElement('button');
        btn.className = cls || 'preset-btn';
        btn.style.flex = '1';
        btn.textContent = text;
        btn.addEventListener('click', onClick);
        return btn;
      };

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';

      row.appendChild(mkBtn('Copy CSS', 'preset-btn', () => {
        const css = generateDynamicCSS(layer.value.params);
        navigator.clipboard.writeText(css).then(() => {
          const btn = row.children[0];
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = 'Copy CSS', 1500);
        });
      }));

      row.appendChild(mkBtn('Copy HTML', 'preset-btn', () => {
        const sample = cardData[0] || ['Heading', 'Body'];
        const bodyHtml = sample.slice(1)
          .filter(Boolean)
          .map(t => `    <div class="ocard-body-item">${t}</div>`)
          .join('\n');
        const html = `<div class="ocard">\n  <div class="ocard-heading">${sample[0]}</div>\n  <div class="ocard-divider"></div>\n  <div class="ocard-body">\n${bodyHtml}\n  </div>\n</div>`;
        navigator.clipboard.writeText(html).then(() => {
          const btn = row.children[1];
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = 'Copy HTML', 1500);
        });
      }));

      groupEl.appendChild(row);
    },
  }];
}


/**
 * Load Data: a CSV whose first line is a header and whose rows are cards,
 * [heading, body, body…], as omni-card loaded them.  The cards are replaced
 * and the HTML backend remounts the scene.
 */
function sectionLoadData() {
  return [{
    group: 'Load Data', id: 'load', abbrev: 'Load',
    type: 'filedrop',
    label: 'Drop CSV file or click',
    accept: '.csv,.txt',
    onDrop: (files, layer, app) => {
      const file = files?.[0];
      if (!file) return;
      file.text().then(text => {
        const csv = new CSVData(text);
        const grid = layer.subtree.find(n => n.type === 'card-grid');
        if (!grid) return;
        app.activeBackend?.deactivate();
        grid.subtree = csv.rows.map(row => new MiniAstNode('flash-card', [], row));
        app.activeBackend?.activate();
      }).catch(err => console.error('CSV error:', err));
    },
  }];
}

/** Assemble all slider sections for OmniControlPanel. */
function cardsBuildUI(layer) {
  return [
    ...sectionLoadData(),
    ...sectionLayout(),
    ...sectionDimensions(),
    ...sectionHeadingType(),
    ...sectionHeadingColor(),
    ...sectionBodyType(),
    ...sectionBodyColor(),
    ...sectionDivider(),
    ...sectionBackground(),
    ...sectionBorder(),
    ...sectionShadow(),
    ...sectionEffects(),
    ...sectionExport(SAMPLE_CARDS),
  ];
}


// ═══════════════════════════════════════════════════════
//  SCENE FACTORY
// ═══════════════════════════════════════════════════════

function createCardScene() {
  const cards = SAMPLE_CARDS.map(data =>
    new MiniAstNode('flash-card', [], data));

  const grid  = new MiniAstNode('card-grid', cards);

  const layer = new MiniAstNode('layer', [grid], {
    name:    'Cards',
    visible: true,
    params:  { ...DEFAULT_PARAMS },
  });

  layer.inst = {
    buildUI: cardsBuildUI,
    presets: PRESETS,
  };

  return new MiniAstNode('scene-root', [layer]);
}


// ═══════════════════════════════════════════════════════
//  SCENE REGISTRATION
// ═══════════════════════════════════════════════════════

SCENES.push({
  id:          'cards-default',
  label:       'Flash Cards',
  group:       'Cards',
  displayMode: 'html',
  hasLayers:   false,
  create:      createCardScene,
});
