import { MiniAstNode, SCENES, ADDABLES } from '../omni-support/scene.js';
import { OmniAnimateModel } from './omni-animate-model.js';
import { ReactiveRuntime }  from '../omni-support/reactive-runtime.js';


/*
OmniScene scenes: Haemoglobin and ATP Synthase animations, and the Haemoglobin frame addable

An animation unit is { runtime, scene }, scene = { root, rules, update }
   (omni-animate-model.js).  A layer animates every unit it holds: its own
   (layer.inst.anim, the full-page scenes) or one per item (item.anim, the
   Haemoglobin frames added to a canvas layer, however many there are).  Each
   frame the layer's tick advances every unit's runtime; before each render,
   updateValues runs every unit's facade, which writes its nodes. */
function animUnits(layer) {
  const items = (layer.subtree || []).filter(n => n.anim).map(n => n.anim);
  return items.length ? items : (layer.inst?.anim ? [layer.inst.anim] : []);
}

function animateUpdateValues(layer) {
  for (const u of animUnits(layer)) u.scene.update();
}

/* Advance each runtime by one frame at params.speed.  (A runtime steps a
   fixed 1/60 s per tick, scaled by speed, as before.) */
function animateTick(layer, params) {
  for (const u of animUnits(layer)) u.runtime.tick(params.speed ?? 1);
}

/* A Haemoglobin frame for a canvas layer, carrying its own animation unit. */
function makeHbFrame(offset = 0) {
  const runtime = new ReactiveRuntime();
  const scene = OmniAnimateModel.setupHB(runtime);
  const frame = new MiniAstNode('handle-frame', [
    new MiniAstNode('drag-point', [], { x: -160 + offset, y: -130 + offset, name: '⌜', color: '#ffffffaa' }),
    new MiniAstNode('drag-point', [], { x:  160 + offset, y:  130 + offset, name: '⌟', color: '#ffffffaa' }),
    scene.root,
  ]);
  frame.anim = { runtime, scene };
  return frame;
}

// ═══════════════════════════════════════════════════════
//  ANIMATE SCENES
// ═══════════════════════════════════════════════════════

function animateBuildUI(layer) {
  const rules = layer.inst?.rules || [];
  return [
    { group: 'Playback', id: 'playback', abbrev: 'Play', sliders: [
      { id: 'speed', label: 'Speed', min: 0.1, max: 3, step: 0.1, default: 1 },
    ]},
    {
      group: 'Controls', id: 'playControls',
      type: 'custom',
      build: (groupEl, lyr, app) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:4px;';

        const playBtn = document.createElement('button');
        playBtn.className = 'preset-btn';
        playBtn.style.flex = '1';
        playBtn.textContent = '⏸ Pause';
        playBtn.onclick = () => {
          app.setPlaying(!app._animPlaying);
          playBtn.textContent = app._animPlaying ? '⏸ Pause' : '▶ Play';
        };

        const resetBtn = document.createElement('button');
        resetBtn.className = 'preset-btn';
        resetBtn.style.flex = '1';
        resetBtn.textContent = '⟲ Reset';
        resetBtn.onclick = () => app._loadScene(app.currentScene.id);

        row.appendChild(playBtn);
        row.appendChild(resetBtn);
        groupEl.appendChild(row);
      },
    },
    {
      group: 'Reactive Rules', id: 'rules', abbrev: 'Rule',
      type: 'custom',
      build: (groupEl) => {
        const container = document.createElement('div');
        container.id = 'rule-container';
        rules.forEach((r, i) => {
          const card = document.createElement('div');
          card.className = 'rule-card';
          card.id = 'rule-' + i;
          card.innerHTML =
            `<div class="rule-header">` +
              `<div class="rule-dot"></div>` +
              `<span class="rule-type ${r.type}">${r.type}</span>` +
              `<span style="font-size:10px;color:#c9d1d9">${r.label}</span>` +
            `</div>` +
            `<div class="rule-dsl">${r.dsl}</div>`;
          container.appendChild(card);
        });
        groupEl.appendChild(container);
      },
    },
  ];
}

function createAnimateScene(sceneId) {
  const R = new ReactiveRuntime();
  const sceneDef = OmniAnimateModel.SCENES.find(s => s.id === sceneId);
  if (!sceneDef) return null;
  const scene = sceneDef.setup(R);

  const zoomable = new MiniAstNode('zoom-pan', [scene.root]);
  const layer = new MiniAstNode('layer', [zoomable], {
    name: sceneDef.label, visible: true,
    params: { speed: 1 },
  });
  layer.inst = {
    buildUI: animateBuildUI,
    presets: null,
    rules: scene.rules,
    anim: { runtime: R, scene },
    updateValues: animateUpdateValues,
    tick: animateTick,
  };

  return new MiniAstNode('scene-root', [layer]);
}

SCENES.push(
  { id: 'animate-hb',    label: 'Haemoglobin',    group: 'Animate', hasLayers: false, animated: true, create: () => createAnimateScene('hb') },
  { id: 'animate-atp',   label: 'ATP Synthase',   group: 'Animate', hasLayers: false, animated: true, create: () => createAnimateScene('atp') },
);


// ═══════════════════════════════════════════════════════
//  HAEMOGLOBIN ADDABLE (for Canvas scene)
// ═══════════════════════════════════════════════════════

function hbAddableBuildUI(layer) {
  const rules = layer.inst?.rules || [];
  return [
    { group: 'Playback', id: 'playback', abbrev: 'Play', sliders: [
      { id: 'speed', label: 'Speed', min: 0.1, max: 3, step: 0.1, default: 1 },
      { id: 'pointRadius', label: 'Handles', min: 2, max: 15, step: 1, default: 5 },
    ]},
    {
      group: 'Controls', id: 'playControls',
      type: 'custom',
      build: (groupEl) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:4px;';

        const playBtn = document.createElement('button');
        playBtn.className = 'preset-btn';
        playBtn.style.flex = '1';
        playBtn.textContent = '⏸ Pause';
        playBtn.onclick = () => {
          const p = layer.value.params;
          if (p.speed !== 0) {
            layer.inst._savedSpeed = p.speed;
            p.speed = 0;
            playBtn.textContent = '▶ Play';
          } else {
            p.speed = layer.inst._savedSpeed ?? 1;
            playBtn.textContent = '⏸ Pause';
          }
        };

        const resetBtn = document.createElement('button');
        resetBtn.className = 'preset-btn';
        resetBtn.style.flex = '1';
        resetBtn.textContent = '⟲ Reset';
        resetBtn.onclick = () => {
          // Every frame starts again: fresh runtime state and nodes, in place.
          for (const item of layer.subtree || []) {
            if (!item.anim) continue;
            const scene = OmniAnimateModel.setupHB(item.anim.runtime);
            const idx = item.subtree.indexOf(item.anim.scene.root);
            if (idx >= 0) item.subtree[idx] = scene.root;
            item.anim.scene = scene;
          }
          const first = (layer.subtree || []).find(n => n.anim);
          if (first) layer.inst.rules = first.anim.scene.rules;
        };

        row.appendChild(playBtn);
        row.appendChild(resetBtn);
        groupEl.appendChild(row);
      },
    },
    {
      group: 'Reactive Rules', id: 'rules', abbrev: 'Rule',
      type: 'custom',
      build: (groupEl) => {
        const container = document.createElement('div');
        container.id = 'rule-container';
        rules.forEach((r, i) => {
          const card = document.createElement('div');
          card.className = 'rule-card';
          card.id = 'rule-' + i;
          card.innerHTML =
            `<div class="rule-header">` +
              `<div class="rule-dot"></div>` +
              `<span class="rule-type ${r.type}">${r.type}</span>` +
              `<span style="font-size:10px;color:#c9d1d9">${r.label}</span>` +
            `</div>` +
            `<div class="rule-dsl">${r.dsl}</div>`;
          container.appendChild(card);
        });
        groupEl.appendChild(container);
      },
    },
  ];
}

const HB_ADDABLE = {
  id:            'animate-hb',
  label:         'Haemoglobin',
  selectionSize: 1,
  refCount:      0,
  buildUI:       hbAddableBuildUI,
  presets:       null,

  /* Another frame in an existing Haemoglobin layer: it animates too. */
  createItem(index = 0) {
    return makeHbFrame(index * 30);
  },

  create() {
    const frame = makeHbFrame(0);
    const layer = new MiniAstNode('layer', [frame], {
      name:      'Haemoglobin',
      layerType: 'animate-hb',
      visible:   true,
      params:    { speed: 1, pointRadius: 5 },
    });
    layer.inst = {
      buildUI:       hbAddableBuildUI,
      presets:       null,
      selectionSize: 1,
      refCount:      0,
      rules:         frame.anim.scene.rules,   // the sidebar shows the first frame's rules
      updateValues:  animateUpdateValues,
      tick:          animateTick,
    };
    return layer;
  },
};

ADDABLES.push(HB_ADDABLE);