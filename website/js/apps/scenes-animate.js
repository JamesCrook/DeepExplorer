import { MiniAstNode, SCENES, ADDABLES } from '../omni-support/scene.js';
import { OmniAnimateModel } from './omni-animate-model.js';
import { ReactiveRuntime }  from '../omni-support/reactive-runtime.js';


/* Each scene is { root, rules, update } (omni-animate-model.js).  The app
   ticks layer.inst.runtime; then, before every render, updateValues calls the
   scene's update(), the facade that writes the nodes from the entities. */
function animateUpdateValues(layer) {
  layer.inst?.scene?.update();
}

/* The layer's own clock: advance its runtime by one frame at params.speed.
   (The runtime steps a fixed 1/60 s per tick, scaled by speed, as before.) */
function animateTick(layer, params) {
  layer.inst?.runtime?.tick(params.speed ?? 1);
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
    runtime: R,
    rules: scene.rules,
    scene,
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
          const R = layer.inst?.runtime;
          if (!R) return;
          // A fresh scene: new runtime state, new nodes, in place of the old root.
          const old = layer.inst.scene;
          const scene = OmniAnimateModel.setupHB(R);
          const frame = layer.subtree?.[0];
          if (frame) {
            const idx = frame.subtree.indexOf(old?.root);
            if (idx >= 0) frame.subtree[idx] = scene.root;
          }
          layer.inst.scene = scene;
          layer.inst.rules = scene.rules;
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

  createItem(index = 0) {
    const offset = index * 30;
    const R = new ReactiveRuntime();
    const scene = OmniAnimateModel.setupHB(R);
    const frame = new MiniAstNode('handle-frame', [
      new MiniAstNode('drag-point', [], { x: -160 + offset, y: -130 + offset, name: '⌜', color: '#ffffffaa' }),
      new MiniAstNode('drag-point', [], { x:  160 + offset, y:  130 + offset, name: '⌟', color: '#ffffffaa' }),
      scene.root,
    ]);
    // An extra item in an existing layer: drawn in its starting state.  Only
    // the layer's own runtime is ticked (as before).
    frame._runtime = R;
    frame._rules   = scene.rules;
    return frame;
  },

  create() {
    const R = new ReactiveRuntime();
    const scene = OmniAnimateModel.setupHB(R);
    const frame = new MiniAstNode('handle-frame', [
      new MiniAstNode('drag-point', [], { x: -160, y: -130, name: '⌜', color: '#ffffffaa' }),
      new MiniAstNode('drag-point', [], { x:  160, y:  130, name: '⌟', color: '#ffffffaa' }),
      scene.root,
    ]);

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
      runtime:       R,
      rules:         scene.rules,
      scene,
      updateValues:  animateUpdateValues,
      tick:          animateTick,
    };
    return layer;
  },
};

ADDABLES.push(HB_ADDABLE);