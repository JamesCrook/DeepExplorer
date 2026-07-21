/**
 * scenes-mask.js
 *
 * Mask-editor nodes surfaced in OmniScene.
 *
 * Provides:
 *   - Lloyd Mirror scene    (standalone, full-canvas via nm-frame)
 *   - Lloyd Mirror addable  (full-canvas overlay in canvas scene)
 *   - Chip Layer scene      (standalone, Sobel edge detection)
 *   - Chip Layer addable    (full-canvas overlay in canvas scene)
 *
 * Both use nm-sizing-nodes (nm-frame / nm-box) to bridge the
 * nm coordinate system into OmniScene's pipeline.
 *
 * Place in: apps/scenes-mask.js
 */

import { MiniAstNode, SCENES, ADDABLES, sceneRegistry }
  from '../omni-support/scene.js';
import { createItemFields } from '../omni-support/item-fields.js';

// ── Node registrations (side effects) ────────────────────

// mask-scene-nodes.js registers grid-bg, rect, clip-outline,
// AND a mask 'layer' node that conflicts with omni-scene-nodes.
// Re-register OmniScene's LayerNode immediately after.
import '../nodes2d/mask-scene-nodes.js';
import { screen2nm, nm2screen } from '../nodes2d/mask-scene-nodes.js';
import { LayerNode as SceneLayerNode } from '../nodes2d/omni-scene-nodes.js';
sceneRegistry.registerNodeClass('layer', SceneLayerNode);

import '../nodes2d/lloyd-mask-node.js';
import '../nodes2d/chip-layer-node.js';
import '../nodes2d/sizing-nodes.js';

import { ETCH_RULES, getEtchRule } from '../nodes2d/lloyd-mask-node.js';


// ── Helpers ──────────────────────────────────────────────

let _lloydId = 100;   // start above typical OmniMask IDs

/**
 * Create a lloyd-data object (the value shared by lloyd +
 * lloyd-directions AST nodes).
 */
function createLloydData(color = '#4ecdc4') {
  const id = _lloydId++;
  return {
    id,
    color,
    lld: {
      on:   true,
      exp:  [
        { a:  5,  d: 0.4, ph: 0 },
        { a: -5,  d: 0.4, ph: 0 },
        { a: 90,  d: 0.4, ph: 0 },
      ],
      etch: '3of3',
      gang: false,
      ox: 0, oy: 0,
    },
    old: { on: false },
  };
}

/** Walk a subtree and return the first node matching a token. */
function findByToken(root, token) {
  if (!root) return null;
  if (root.token === token) return root;
  for (const child of (root.subtree || [])) {
    const hit = findByToken(child, token);
    if (hit) return hit;
  }
  return null;
}

/** Get the lloyd-data object from a layer's subtree. */
function findLloydData(layer) {
  const n = findByToken(layer, 'lloyd');
  return n?.value || null;
}


// ── Exposure item-fields editor ──────────────────────────
//
// Shows exposure angles and duty cycles, plus etch rule and
// gang toggle.  Angles are also settable by dragging the
// directions handles on canvas.

function buildLloydFields(layer, _app) {
  const ld = findLloydData(layer);
  if (!ld) return null;
  return ld;                // resolve returns the data object
}

function onLloydFieldChange(data, key, value, _app) {
  // Keys are like 'exp0_a', 'exp0_d', 'etch', 'gang'
  if (key === 'etch') {
    data.lld.etch = value;
    return;
  }
  if (key === 'gang') {
    data.lld.gang = !!value;
    return;
  }
  const m = key.match(/^exp(\d+)_(a|d)$/);
  if (m) {
    const idx = parseInt(m[1], 10);
    const field = m[2];
    if (data.lld.exp[idx]) {
      data.lld.exp[idx][field] = parseFloat(value) || 0;
    }
  }
}


// ── Shared UI builder ────────────────────────────────────

const LLOYD_PALETTE = [
  '#4ecdc4', '#ff6b6b', '#a78bfa', '#ffe66d',
  '#4fc3f7', '#81c784', '#f06292', '#ffb74d',
];

function lloydCustomSection() {
  return {
    group: 'Lloyd Mirror', id: 'lloyd-cfg', abbrev: 'Lld',
    type: 'custom',
    build: (groupEl, layer, app) => {
      const ld = findLloydData(layer);
      if (!ld) return;

      const sty = (extra = '') => `
        font-size:10px;color:#888;display:flex;align-items:center;
        gap:6px;padding:3px 0;${extra}
      `;
      const inputSty = `
        width:55px;padding:2px 4px;background:#1a2035;border:1px solid #333;
        color:#ccc;font-family:inherit;font-size:11px;border-radius:3px;
        text-align:right;
      `;
      const selSty = `
        flex:1;padding:2px 4px;background:#1a2035;border:1px solid #333;
        color:#ccc;font-family:inherit;font-size:11px;border-radius:3px;
      `;

      // ── Color ──
      const colorRow = document.createElement('div');
      colorRow.style.cssText = sty();
      const colorLabel = document.createElement('span');
      colorLabel.textContent = 'Color';
      colorLabel.style.cssText = 'min-width:50px;';
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = ld.color;
      colorInput.style.cssText = 'width:24px;height:20px;border:1px solid #333;border-radius:3px;cursor:pointer;';
      colorInput.oninput = () => { ld.color = colorInput.value; app.render(); };
      colorRow.appendChild(colorLabel);
      colorRow.appendChild(colorInput);
      groupEl.appendChild(colorRow);

      // ── Etch rule ──
      const etchRow = document.createElement('div');
      etchRow.style.cssText = sty();
      const etchLabel = document.createElement('span');
      etchLabel.textContent = 'Etch rule';
      etchLabel.style.cssText = 'min-width:50px;';
      const etchSel = document.createElement('select');
      etchSel.style.cssText = selSty;
      for (const rule of ETCH_RULES) {
        const opt = document.createElement('option');
        opt.value = rule.id;
        opt.textContent = `${rule.label}  (${rule.cnt} exp, thr ${rule.thr})`;
        if (rule.id === ld.lld.etch) opt.selected = true;
        etchSel.appendChild(opt);
      }
      etchSel.onchange = () => {
        ld.lld.etch = etchSel.value;
        rebuildExposures();
        app.render();
      };
      etchRow.appendChild(etchLabel);
      etchRow.appendChild(etchSel);
      groupEl.appendChild(etchRow);

      // ── Gang ──
      const gangRow = document.createElement('div');
      gangRow.style.cssText = sty();
      const gangLabel = document.createElement('span');
      gangLabel.textContent = 'Gang 1↔2';
      gangLabel.style.cssText = 'min-width:50px;';
      const gangCb = document.createElement('input');
      gangCb.type = 'checkbox';
      gangCb.checked = ld.lld.gang;
      gangCb.onchange = () => { ld.lld.gang = gangCb.checked; };
      gangRow.appendChild(gangLabel);
      gangRow.appendChild(gangCb);
      groupEl.appendChild(gangRow);

      // ── Exposure rows ──
      const expContainer = document.createElement('div');
      groupEl.appendChild(expContainer);

      function rebuildExposures() {
        expContainer.innerHTML = '';
        const rule = getEtchRule(ld.lld.etch);
        for (let i = 0; i < rule.cnt; i++) {
          const exp = ld.lld.exp[i];
          if (!exp) continue;

          const row = document.createElement('div');
          row.style.cssText = sty('flex-wrap:wrap;');

          const label = document.createElement('span');
          label.style.cssText = 'min-width:50px;color:#888;';
          label.textContent = `Exp ${i + 1}`;

          const angL = document.createElement('span');
          angL.style.cssText = 'color:#555;font-size:9px;';
          angL.textContent = '∠';
          const angIn = document.createElement('input');
          angIn.type = 'number';
          angIn.value = exp.a.toFixed(1);
          angIn.step = 0.5;
          angIn.id = `lloyd-exp-${ld.id}-${i}-a`;
          angIn.style.cssText = inputSty;
          angIn.oninput = () => {
            exp.a = parseFloat(angIn.value) || 0;
            app.render();
          };

          const dutyL = document.createElement('span');
          dutyL.style.cssText = 'color:#555;font-size:9px;';
          dutyL.textContent = 'd';
          const dutyIn = document.createElement('input');
          dutyIn.type = 'number';
          dutyIn.value = exp.d.toFixed(2);
          dutyIn.step = 0.05;
          dutyIn.min = 0.05;
          dutyIn.max = 0.95;
          dutyIn.style.cssText = inputSty;
          dutyIn.oninput = () => {
            exp.d = Math.max(0.05, Math.min(0.95, parseFloat(dutyIn.value) || 0.5));
            app.render();
          };

          row.append(label, angL, angIn, dutyL, dutyIn);
          expContainer.appendChild(row);
        }
      }

      rebuildExposures();
    },
  };
}


// ═══════════════════════════════════════════════════════
//  LLOYD SCENE — standalone, full-canvas
// ═══════════════════════════════════════════════════════
//
// AST:
//   scene-root
//     layer (no center, params: zoom/vx/vy/nmPx/…)
//       nm-frame
//         grid-bg
//         lloyd → lloyd-directions

function lloydSceneBuildUI() {
  return [
    {
      group: 'View', id: 'nm-view', abbrev: 'View',
      sliders: [
        { id: 'zoom',       label: 'Zoom',  min: 0.1, max: 20,   step: 0.01, default: 2 },
        { id: 'wavelength', label: 'λ (nm)', min: 1,   max: 1000, step: 1,    default: 193 },
      ],
    },
    lloydCustomSection(),
  ];
}

const LLOYD_SCENE_PRESETS = {
  'Default': {
    zoom: 2, wavelength: 193,
  },
  'UV Litho': {
    zoom: 2, wavelength: 193,
  },
  'Visible': {
    zoom: 0.5, wavelength: 532,
  },
  'Wide': {
    zoom: 0.3, wavelength: 193,
  },
};

function createLloydScene() {
  const ld = createLloydData('#4ecdc4');

  const nmFrame = new MiniAstNode('nm-frame', [
    new MiniAstNode('grid-bg'),
    new MiniAstNode('lloyd', [
      new MiniAstNode('lloyd-directions', [], ld),
    ], ld),
  ]);

  const layer = new MiniAstNode('layer', [nmFrame], {
    name: 'Lloyd Mirror',
    visible: true,
    // NO center — mask nodes centre via nm2screen
    params: {
      zoom: 2, vx: 0, vy: 0, nmPx: 10,
      wavelength: 193, snap: 1000,
      activeSlot: 'lloyd',
      expandedLayerId: ld.id,
    },
  });
  layer.inst = {
    buildUI: lloydSceneBuildUI,
    presets: LLOYD_SCENE_PRESETS,
  };

  return new MiniAstNode('scene-root', [layer]);
}


// ═══════════════════════════════════════════════════════
//  LLOYD ADDABLE — full-canvas overlay in canvas scene
// ═══════════════════════════════════════════════════════
//
// When added to the canvas scene, creates a layer with an
// nm-frame child that renders the lloyd pattern + directions
// widget over the full canvas, independent of other layers.
//
// The layer's center is NOT set, so the scene layer's center
// translate (in the main ctx) is bypassed by nm-frame's
// offscreen composite.

function lloydAddableBuildUI() {
  return [
    {
      group: 'View', id: 'nm-view', abbrev: 'View',
      sliders: [
        { id: 'zoom',       label: 'Zoom',  min: 0.1, max: 20,   step: 0.01, default: 2 },
        { id: 'wavelength', label: 'λ (nm)', min: 1,   max: 1000, step: 1,    default: 193 },
      ],
    },
    lloydCustomSection(),
  ];
}

const LLOYD_ADDABLE_PRESETS = {
  'Default': { zoom: 2, wavelength: 193 },
  'Visible': { zoom: 0.5, wavelength: 532 },
};

const LLOYD_ADDABLE = {
  id:    'lloyd',
  label: 'Lloyd Mirror',

  create(app) {
    const color = LLOYD_PALETTE[
      (app?._contentLayers?.()?.length || 0) % LLOYD_PALETTE.length
    ];
    const ld = createLloydData(color);

    const nmFrame = new MiniAstNode('nm-frame', [
      new MiniAstNode('lloyd', [
        new MiniAstNode('lloyd-directions', [], ld),
      ], ld),
    ]);

    const layer = new MiniAstNode('layer', [nmFrame], {
      name:      'Lloyd Mirror',
      layerType: 'lloyd',
      visible:   true,
      // NO center — nm-frame renders via offscreen composite
      params: {
        zoom: 2, vx: 0, vy: 0, nmPx: 10,
        wavelength: 193, snap: 1000,
        activeSlot: 'lloyd',
        expandedLayerId: ld.id,
      },
    });
    layer.inst = {
      buildUI: lloydAddableBuildUI,
      presets: LLOYD_ADDABLE_PRESETS,
    };

    return layer;
  },
};


// ═══════════════════════════════════════════════════════
//  CHIP LAYER — shared helpers
// ═══════════════════════════════════════════════════════

const CHIP_PALETTE = [
  '#4ecdc4', '#ff6b6b', '#a78bfa', '#ffe66d',
  '#4fc3f7', '#81c784', '#f06292', '#ffb74d',
];

/** Default shape set demonstrating Sobel edges on overlapping rectangles. */
function defaultChipRects() {
  return [
    { x: -300, y: -200, w: 400, h: 300 },
    { x: -100, y:   50, w: 300, h: 200 },
    { x:  150, y: -150, w: 150, h: 250 },
  ];
}

/** Build rect MiniAstNodes from shape array. */
function rectsToNodes(shapes) {
  return shapes.map(s =>
    new MiniAstNode('rect', [], { x: s.x, y: s.y, w: s.w, h: s.h })
  );
}

/** Get the chip-layer node from a layer's subtree. */
function findChipLayer(layer) {
  return findByToken(layer, 'chip-layer');
}


// ── Draw / Remove mode ──────────────────────────────────
//
// Activated from the chip-layer control panel.
// Draw mode:   shift+drag creates snapped rectangles.
// Remove mode: click a rectangle to delete it.
// A HUD overlay shows the remaining count; Esc cancels.

function enterChipDrawMode(app, layer, chipNode, type, count) {
  // Exit any existing mode
  if (app._drawMode) app._drawMode.cancel();

  let remaining = count;
  let startNm = null;

  // ── HUD overlay ──
  const hud = document.createElement('div');
  hud.style.cssText = `
    position:absolute; top:12px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.75); color:#fff; padding:6px 18px;
    border-radius:6px; font-size:12px; font-family:inherit;
    z-index:100; pointer-events:none; white-space:nowrap;
    border:1px solid ${type === 'add' ? '#4ecdc466' : '#ff6b6b66'};
  `;
  function updateHud() {
    const verb = type === 'add' ? 'Draw' : 'Remove';
    const hint = type === 'add' ? 'Shift+drag' : 'Click rect';
    hud.textContent = `${verb}: ${remaining} remaining  ·  ${hint}  ·  Esc cancel`;
  }
  updateHud();
  app.container.style.position = 'relative';
  app.container.appendChild(hud);

  function exitMode() {
    app._drawOverlay = null;
    hud.remove();
    app._drawMode = null;
    app._rebuildContext?.();
    app.render();
  }

  /** Read current canvas CSS-pixel dims + layer params. */
  function getSpace() {
    const sp = layer.value?.params || {};
    const r  = app.container.getBoundingClientRect();
    const W  = r.width;
    const H  = r.height;
    const snap = sp.snap || 1000;
    return { sp, W, H, snap };
  }

  function snapNm(nm, snap) {
    return {
      x: Math.round(nm.x / snap) * snap,
      y: Math.round(nm.y / snap) * snap,
    };
  }

  app._drawMode = {

    /**
     * Called from Omni2d pointerdown after hit_test.
     * Returns drag interactions object if intercepting, else null.
     */
    onDown(x, y, event, hitResult) {

      // ── ADD: shift+drag draws a new rect ──
      if (type === 'add') {
        if (!event.shiftKey) return null;

        const { sp, W, H, snap } = getSpace();
        startNm = snapNm(screen2nm(x, y, sp, W, H), snap);
        const color = chipNode.value?.color || '#4ecdc4';

        // Preview only — rect is NOT in the subtree yet
        let previewNm = { x: startNm.x, y: startNm.y, w: 0, h: 0 };

        return {
          applyDrag(sx, sy) {
            const endNm = snapNm(screen2nm(sx, sy, sp, W, H), snap);
            previewNm.x = Math.min(startNm.x, endNm.x);
            previewNm.y = Math.min(startNm.y, endNm.y);
            previewNm.w = Math.abs(endNm.x - startNm.x);
            previewNm.h = Math.abs(endNm.y - startNm.y);

            // Dotted rect overlay — drawn after the scene render
            app._drawOverlay = (ctx) => {
              if (!previewNm.w || !previewNm.h) return;
              const tl = nm2screen(previewNm.x, previewNm.y + previewNm.h, sp, W, H);
              const sc = (sp.zoom || 1) / (sp.nmPx || 10);
              ctx.save();
              ctx.strokeStyle = color;
              ctx.lineWidth = 1.5;
              ctx.setLineDash([6, 4]);
              ctx.strokeRect(tl.x, tl.y, previewNm.w * sc, previewNm.h * sc);
              ctx.restore();
            };
          },
          applyRelease() {
            app._drawOverlay = null;

            // Commit if non-zero area
            if (previewNm.w && previewNm.h) {
              chipNode.subtree.push(
                new MiniAstNode('rect', [], { ...previewNm })
              );
              remaining--;
              updateHud();
            }

            startNm = null;
            if (remaining <= 0) exitMode();
            else app.render();
          },
        };
      }

      // ── REMOVE: click a rect to delete it ──
      if (type === 'remove') {
        const hitNode = hitResult?.nodeRef;
        if (!hitNode) return null;
        const idx = chipNode.subtree.indexOf(hitNode);
        if (idx < 0) return null;

        chipNode.subtree.splice(idx, 1);
        remaining--;
        updateHud();
        if (remaining <= 0) exitMode();
        // Return a no-op interaction to consume the event
        return { applyDrag() {}, applyRelease() {} };
      }

      return null;
    },

    cancel() {
      app._drawOverlay = null;
      exitMode();
    },
  };
}

/** Custom UI section for the selected chip sub-layer's properties. */
function chipCustomSection() {
  return {
    group: 'Selected Layer', id: 'chip-cfg', abbrev: 'Sel',
    type: 'custom',
    build: (groupEl, layer, app) => {
      // Find the selected chip-layer by id
      const chips = getChipLayers(layer);
      const selId = layer.inst?._selectedChipId;
      const chipNode = chips.find(c => c.value?.id === selId) || chips[0];
      if (!chipNode) return;
      const cv = chipNode.value;
      const sp = layer.value?.params;

      const sty = (extra = '') => `
        font-size:10px;color:#888;display:flex;align-items:center;
        gap:6px;padding:3px 0;${extra}
      `;
      const inputSty = `
        width:55px;padding:2px 4px;background:#1a2035;border:1px solid #333;
        color:#ccc;font-family:inherit;font-size:11px;border-radius:3px;
        text-align:right;
      `;

      // ── Color ──
      const colorRow = document.createElement('div');
      colorRow.style.cssText = sty();
      const colorLabel = document.createElement('span');
      colorLabel.textContent = 'Edge color';
      colorLabel.style.cssText = 'min-width:65px;';
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = (cv.color || '#4ecdc4').slice(0, 7);
      colorInput.style.cssText = 'width:24px;height:20px;border:1px solid #333;border-radius:3px;cursor:pointer;';
      colorInput.oninput = () => { cv.color = colorInput.value; app.render(); };
      colorRow.append(colorLabel, colorInput);
      groupEl.appendChild(colorRow);

      // ── Sobel toggle ──
      const sobelRow = document.createElement('div');
      sobelRow.style.cssText = sty();
      const sobelLabel = document.createElement('span');
      sobelLabel.textContent = 'Sobel edges';
      sobelLabel.style.cssText = 'min-width:65px;';
      const sobelCb = document.createElement('input');
      sobelCb.type = 'checkbox';
      sobelCb.checked = sp?.sobelEnabled ?? true;
      sobelCb.onchange = () => { if (sp) sp.sobelEnabled = sobelCb.checked; app.render(); };
      sobelRow.append(sobelLabel, sobelCb);
      groupEl.appendChild(sobelRow);

      // ── Via toggle ──
      const viaRow = document.createElement('div');
      viaRow.style.cssText = sty();
      const viaLabel = document.createElement('span');
      viaLabel.textContent = 'Via hatch';
      viaLabel.style.cssText = 'min-width:65px;';
      const viaCb = document.createElement('input');
      viaCb.type = 'checkbox';
      viaCb.checked = !!cv.via;
      viaCb.onchange = () => { cv.via = viaCb.checked; app.render(); };
      viaRow.append(viaLabel, viaCb);
      groupEl.appendChild(viaRow);

      // ── Draw / Remove mode buttons ──
      const modeRow = document.createElement('div');
      modeRow.style.cssText = sty('gap:4px;padding:6px 0 3px;');

      const countInput = document.createElement('input');
      countInput.type = 'number';
      countInput.value = 5;
      countInput.min = 1;
      countInput.max = 50;
      countInput.style.cssText = inputSty + 'width:36px;text-align:center;';

      const drawBtn = document.createElement('button');
      drawBtn.className = 'preset-btn';
      drawBtn.textContent = 'Draw';
      drawBtn.style.cssText = 'font-size:10px;padding:2px 8px;flex:1;';
      drawBtn.onclick = () => {
        const n = Math.max(1, parseInt(countInput.value) || 5);
        enterChipDrawMode(app, layer, chipNode, 'add', n);
      };

      const removeBtn = document.createElement('button');
      removeBtn.className = 'preset-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.style.cssText = 'font-size:10px;padding:2px 8px;flex:1;color:#f99;';
      removeBtn.onclick = () => {
        const n = Math.max(1, parseInt(countInput.value) || 5);
        enterChipDrawMode(app, layer, chipNode, 'remove', n);
      };

      modeRow.append(drawBtn, removeBtn, countInput);
      groupEl.appendChild(modeRow);

      // ── Shape list ──
      const shapesHeader = document.createElement('div');
      shapesHeader.style.cssText = sty('justify-content:space-between;');
      const shapesLabel = document.createElement('span');
      shapesLabel.textContent = `Rectangles (${chipNode.subtree.length})`;
      const addBtn = document.createElement('button');
      addBtn.className = 'preset-btn';
      addBtn.textContent = '+ Rect';
      addBtn.style.cssText = 'font-size:10px;padding:2px 8px;';
      addBtn.onclick = () => {
        chipNode.subtree.push(
          new MiniAstNode('rect', [], { x: 0, y: 0, w: 200, h: 150 })
        );
        rebuildShapes();
        app.render();
      };
      shapesHeader.append(shapesLabel, addBtn);
      groupEl.appendChild(shapesHeader);

      const shapesContainer = document.createElement('div');
      groupEl.appendChild(shapesContainer);

      function rebuildShapes() {
        shapesContainer.innerHTML = '';
        shapesLabel.textContent = `Rectangles (${chipNode.subtree.length})`;

        chipNode.subtree.forEach((rect, i) => {
          const s = rect.value;
          if (!s) return;

          const row = document.createElement('div');
          row.style.cssText = sty('flex-wrap:wrap;gap:3px;');

          const idx = document.createElement('span');
          idx.style.cssText = 'min-width:18px;color:#555;font-size:9px;';
          idx.textContent = `${i + 1}`;

          const fields = [
            ['x', s.x], ['y', s.y], ['w', s.w], ['h', s.h],
          ];
          const inputs = fields.map(([key, val]) => {
            const lbl = document.createElement('span');
            lbl.style.cssText = 'color:#555;font-size:9px;';
            lbl.textContent = key;
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = val;
            //inp.step = 10;
            inp.style.cssText = inputSty + 'width:50px;';
            inp.oninput = () => {
              s[key] = parseFloat(inp.value) || 0;
              app.render();
            };
            return [lbl,inp];
          });

          const delBtn = document.createElement('button');
          delBtn.className = 'preset-btn';
          delBtn.textContent = '×';
          delBtn.style.cssText = 'font-size:10px;padding:1px 5px;color:#f66;';
          delBtn.onclick = () => {
            chipNode.subtree.splice(i, 1);
            rebuildShapes();
            app.render();
          };

          row.appendChild(idx);
          for (const [lbl, inp] of inputs) row.append( inp);
          row.appendChild(delBtn);
          shapesContainer.appendChild(row);
        });
      }

      rebuildShapes();
    },
  };
}


// ═══════════════════════════════════════════════════════
//  CHIP LAYER SCENE — multiple sub-layers, shared nm-frame
// ═══════════════════════════════════════════════════════
//
// All chip-layers paint to the SAME offscreen canvas
// sequentially — each reads the existing pixels (including
// previous layers' contributions), adds its tint and Sobel
// edges, and puts them back.  This gives the rich accumulated
// colors that OmniMask produces.
//
// AST:
//   scene-root
//     layer (no center, params: zoom/vx/vy/nmPx/sobelEnabled)
//       nm-frame
//         grid-bg
//         chip-layer { color:'#4ecdc4', id:0, via:false }
//           rect, rect, ...
//         chip-layer { color:'#ff6b6b', id:1, via:false }
//           rect, rect, ...

let _chipSubId = 0;

function createChipValue(color) {
  return {
    id: _chipSubId++,
    color: color || CHIP_PALETTE[(_chipSubId - 1) % CHIP_PALETTE.length],
    via: false,
    repeat: null,
    clipShapes: null,
  };
}

/** Return all chip-layer nodes inside an nm-frame. */
function getChipLayers(layer) {
  const nmFrame = findByToken(layer, 'nm-frame');
  if (!nmFrame) return [];
  return nmFrame.subtree.filter(n => n.token === 'chip-layer');
}

/** Return the nm-frame node from a layer. */
function getNmFrame(layer) {
  return findByToken(layer, 'nm-frame');
}

function chipSceneBuildUI(layer) {
  const chips = getChipLayers(layer);
  const selectedId = layer.inst?._selectedChipId ?? chips[0]?.value?.id;

  return [
    {
      group: 'View', id: 'nm-view', abbrev: 'View',
      sliders: [
        { id: 'zoom', label: 'Zoom', min: 0.1, max: 20, step: 0.01, default: 2 },
      ],
    },
    {
      group: 'Chip Layers', id: 'chip-list', abbrev: 'Lyrs',
      type: 'custom',
      build: (groupEl, lyr, app) => {
        const nmFrame = getNmFrame(lyr);
        if (!nmFrame) return;

        const sty = (extra = '') => `
          font-size:10px;color:#888;display:flex;align-items:center;
          gap:6px;padding:3px 0;${extra}
        `;

        // ── Sub-layer list ──
        const listEl = document.createElement('div');
        groupEl.appendChild(listEl);

        // ── Add button ──
        const addRow = document.createElement('div');
        addRow.style.cssText = sty('justify-content:flex-end;padding:4px 0;');
        const addLayerBtn = document.createElement('button');
        addLayerBtn.className = 'preset-btn';
        addLayerBtn.textContent = '+ Layer';
        addLayerBtn.style.cssText = 'font-size:10px;padding:2px 10px;';
        addLayerBtn.onclick = () => {
          const cv = createChipValue();
          nmFrame.subtree.push(
            new MiniAstNode('chip-layer', rectsToNodes([
              { x: 0, y: 0, w: 200, h: 150 },
            ]), cv)
          );
          lyr.inst._selectedChipId = cv.id;
          app._rebuildContext?.();
          app.render();
        };
        addRow.appendChild(addLayerBtn);
        groupEl.appendChild(addRow);

        // Build the list
        function rebuildList() {
          listEl.innerHTML = '';
          const chips = nmFrame.subtree.filter(n => n.token === 'chip-layer');
          chips.forEach((chip, i) => {
            const cv = chip.value;
            const selected = cv.id === (lyr.inst?._selectedChipId ?? chips[0]?.value?.id);

            const row = document.createElement('div');
            row.style.cssText = sty(`
              cursor:pointer;padding:4px 6px;border-radius:4px;
              ${selected ? 'background:#ffffff10;border:1px solid #ffffff20;' : 'border:1px solid transparent;'}
            `);
            row.onclick = () => {
              lyr.inst._selectedChipId = cv.id;
              app._rebuildContext?.();
            };

            const swatch = document.createElement('div');
            swatch.style.cssText = `width:14px;height:14px;border-radius:3px;
              background:${cv.color};border:1px solid #ffffff30;flex-shrink:0;`;

            const name = document.createElement('span');
            name.style.cssText = 'flex:1;color:#ccc;';
            name.textContent = `Sub-layer ${i + 1}`;

            const count = document.createElement('span');
            count.style.cssText = 'color:#555;font-size:9px;';
            count.textContent = `${chip.subtree.length} rect${chip.subtree.length !== 1 ? 's' : ''}`;

            const delBtn = document.createElement('button');
            delBtn.className = 'preset-btn';
            delBtn.textContent = '×';
            delBtn.style.cssText = 'font-size:10px;padding:1px 5px;color:#f66;';
            delBtn.onclick = (e) => {
              e.stopPropagation();
              const idx = nmFrame.subtree.indexOf(chip);
              if (idx >= 0) nmFrame.subtree.splice(idx, 1);
              // Select next available
              const remaining = nmFrame.subtree.filter(n => n.token === 'chip-layer');
              lyr.inst._selectedChipId = remaining[0]?.value?.id ?? null;
              app._rebuildContext?.();
              app.render();
            };

            row.append(swatch, name, count, delBtn);
            listEl.appendChild(row);
          });
        }
        rebuildList();
      },
    },
    // ── Properties for selected sub-layer ──
    chipCustomSection(),
  ];
}

const CHIP_SCENE_PRESETS = {
  'Default':  { zoom: 2, sobelEnabled: true },
  'No Edges': { zoom: 2, sobelEnabled: false },
  'Wide':     { zoom: 0.5, sobelEnabled: true },
};

function createChipScene() {
  const cv1 = createChipValue('#4ecdc4');
  const cv2 = createChipValue('#ff6b6b');

  const nmFrame = new MiniAstNode('nm-frame', [
    new MiniAstNode('grid-bg'),
    new MiniAstNode('chip-layer', rectsToNodes(defaultChipRects()), cv1),
    new MiniAstNode('chip-layer', rectsToNodes([
      { x: -50, y: -250, w: 300, h: 200 },
      { x: 100, y: 100, w: 250, h: 180 },
    ]), cv2),
  ]);

  const layer = new MiniAstNode('layer', [nmFrame], {
    name: 'Chip Layer',
    visible: true,
    params: {
      zoom: 2, vx: 0, vy: 0, nmPx: 10,
      snap: 1000, sobelEnabled: true,
    },
  });
  layer.inst = {
    buildUI: chipSceneBuildUI,
    presets: CHIP_SCENE_PRESETS,
    _selectedChipId: cv1.id,
  };

  return new MiniAstNode('scene-root', [layer]);
}


// ═══════════════════════════════════════════════════════
//  CHIP LAYER ADDABLE — adds to shared nm-frame layer
// ═══════════════════════════════════════════════════════
//
// First chip addable in the Canvas scene creates the
// nm-frame layer.  Subsequent ones add a new chip-layer
// node to the existing nm-frame so they share the same
// offscreen and accumulate colors like OmniMask.

function chipAddableBuildUI() {
  return [
    {
      group: 'View', id: 'nm-view', abbrev: 'View',
      sliders: [
        { id: 'zoom', label: 'Zoom', min: 0.1, max: 20, step: 0.01, default: 2 },
      ],
    },
    {
      group: 'Chip Layers', id: 'chip-list', abbrev: 'Lyrs',
      type: 'custom',
      build: (groupEl, lyr, app) => chipSceneBuildUI(lyr)[1].build(groupEl, lyr, app),
    },
    chipCustomSection(),
  ];
}

const CHIP_ADDABLE_PRESETS = {
  'Default':  { zoom: 2, sobelEnabled: true },
  'No Edges': { zoom: 2, sobelEnabled: false },
};

const CHIP_ADDABLE = {
  id:    'chip-layer',
  label: 'Chip Layer',

  create(app) {
    const color = CHIP_PALETTE[
      (app?._contentLayers?.()?.length || 0) % CHIP_PALETTE.length
    ];
    const cv = createChipValue(color);

    // ── Check for existing chip nm-frame layer ──
    const existing = app?._contentLayers?.().find(
      l => l.value?.layerType === 'chip-frame'
    );

    if (existing) {
      // Add to existing nm-frame
      const nmFrame = getNmFrame(existing);
      if (nmFrame) {
        nmFrame.subtree.push(
          new MiniAstNode('chip-layer', rectsToNodes([
            { x: 0, y: 0, w: 200, h: 150 },
          ]), cv)
        );
        existing.inst._selectedChipId = cv.id;
        // Return existing layer so addObject selects it
        // (it won't be re-pushed — addObject checks for duplicates)
        return existing;
      }
    }

    // ── Create new nm-frame layer ──
    const nmFrame = new MiniAstNode('nm-frame', [
      new MiniAstNode('chip-layer', rectsToNodes(defaultChipRects()), cv),
    ]);

    const layer = new MiniAstNode('layer', [nmFrame], {
      name:      'Chip Layers',
      layerType: 'chip-frame',     // shared identifier
      visible:   true,
      params: {
        zoom: 2, vx: 0, vy: 0, nmPx: 10,
        snap: 1000, sobelEnabled: true,
      },
    });
    layer.inst = {
      buildUI:    chipAddableBuildUI,
      presets:    CHIP_ADDABLE_PRESETS,
      _selectedChipId: cv.id,
    };

    return layer;
  },
};


// ═══════════════════════════════════════════════════════
//  REGISTER
// ═══════════════════════════════════════════════════════

ADDABLES.push(LLOYD_ADDABLE);
ADDABLES.push(CHIP_ADDABLE);

SCENES.push({
  id: 'lloyd',
  label: 'Lloyd Mirror',
  group: 'Mask',
  hasLayers: false,
  phases: ['draw2d'],
  create: createLloydScene,
});

SCENES.push({
  id: 'chip',
  label: 'Chip Layer',
  group: 'Mask',
  hasLayers: false,
  phases: ['draw2d'],
  create: createChipScene,
});