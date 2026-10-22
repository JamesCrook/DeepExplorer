/*
# ESSENTIALS

StageNode — an OmniScene inside the HTML tree: D+'s stage card.  The
boundary between backends, like html-host in the widget panopticon, but
hosting a whole OmniSceneApp (2D, 3D and HTML layers, and the shared control
panel) rather than a bare 2D harness.

  scene    the id of a registered scene (SCENES in scene.js)
  id       names the card's canvas and viewports, else the scene does
  label    the card's title; badge, its one-letter badge
  height   px, default 520
  group    with groupKey: the selection group this stage belongs to (D+
           puts every stage and every scene topic in group 'scene', keyed
           by scene id).  The active member is the live stage: its class
           is-live, and it drives the shared panel.

Everything the old d-plus.html did by querying for .scene-stage after a
render is here, per stage, in mount and teardown:

  - the OmniSceneApp is made on the first frame the card is connected and
    has a size (Omni2d measures its parent), and resized when the card is;
  - a card scrolled out of its scroller stops animating, and its last frame
    stays on the canvas;
  - the wheel reaches the scene only while the card is engaged: a press
    engages it, a press anywhere else releases it, so scrolling the chat
    never zooms a scene by accident;
  - a press makes the stage live (it sets its group's param), and when a
    stage becomes live, its app rebuilds the shared panel from its own
    layer tree.

What the harness's paneConfig provides: panel (the OmniControlPanel every
stage shares) and elements.panel (its container element).
*/

import { SYS } from '../omni-support/sys.js';
import { SCENES } from '../omni-support/scene.js';
import { OmniSceneApp } from '../apps/omni-scene-app.js';

/* Which stage drives each shared panel.  Making an OmniSceneApp points the
   panel at it, so a stage that starts after the live one would take the panel
   over; the owner takes it back. */
const owners = new WeakMap();
const panelKey = (node) => node.inst?.harness?.paneConfig?.panel ?? owners;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

class StageNode {
  static meta = { sticky: true, activeClass: 'is-live' };

  static mount(ctxMix, node, params) {
    const c = node.value || {};
    const t = document.createElement('template');
    t.innerHTML = `<div class="scene-stage" data-stage-id="${esc(c.id ?? '')}" data-stage-scene="${esc(c.scene)}" style="height:${+c.height || 520}px">
        <div class="stage-mount"></div>
        <div class="stage-bar">
          <div class="stage-badge">${esc(c.badge || 'O')}</div>
          <div class="stage-name">${esc(c.label || 'OmniScene')}</div>
          <div class="stage-live">live</div>
        </div>
        <div class="stage-hint">click to engage · scroll passes through until you do</div>
      </div>`;
    const el = t.content.firstElementChild;
    ctxMix.parentEl.appendChild(el);
    const harness = ctxMix.harness;
    const inst = node.inst = { ...(node.inst || {}), el, mountEl: el.querySelector('.stage-mount'), harness, engaged: false };

    inst.ro = new ResizeObserver(() => {
      if (!el.isConnected || el.clientWidth === 0) return;
      if (!inst.app && !inst.failed) StageNode._start(node);
      else if (inst.app?.activeBackend) { inst.app.activeBackend.resize(); inst.app.render(); }
    });
    inst.ro.observe(el);

    // Wheel gating: a capture listener on the mount runs before the canvas's
    // own, and stops the event reaching it until the card is engaged.
    inst.mountEl.addEventListener('wheel', (e) => { if (!inst.engaged) e.stopPropagation(); }, { capture: true });
    el.addEventListener('pointerdown', () => {
      StageNode._engage(node, true);
      if (c.group) harness?.setParam(c.group, c.groupKey ?? c.scene);
    });
    inst.outside = (e) => { if (!el.contains(e.target)) StageNode._engage(node, false); };
    document.addEventListener('pointerdown', inst.outside, true);
  }

  static _engage(node, on) {
    const i = node.inst;
    if (i.engaged === on) return;
    i.engaged = on;
    i.el.classList.toggle('is-engaged', on);
  }

  /** Make the app.  The card is in the document and has a size by now. */
  static _start(node) {
    const c = node.value || {}, i = node.inst;
    const cfg = i.harness?.paneConfig || {};
    if (!SCENES.find(s => s.id === c.scene)) {
      i.failed = true;
      i.mountEl.insertAdjacentHTML('beforeend', `<div class="stage-err">No scene registered with id "${esc(c.scene || '')}"</div>`);
      return;
    }
    // Mirrors OmniApp's layer stack: a sized wrapper (Omni2d.resize measures
    // it), the canvas flowing normally, the other backends overlaid.
    const uid = c.id || c.scene;
    const stack = document.createElement('div');
    stack.className = 'layer-stack';
    const canvas = document.createElement('canvas');
    canvas.id = 'scene-canvas-' + uid;
    const v3d = document.createElement('div');
    v3d.id = 'scene-viewport-3d-' + uid;
    const vhtml = document.createElement('div');
    vhtml.id = 'scene-viewport-html-' + uid;
    for (const el of [v3d, vhtml]) el.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
    stack.append(canvas, v3d, vhtml);
    i.mountEl.appendChild(stack);

    const shell = {
      container: i.el,
      layers: { 'scene-canvas': canvas, 'scene-viewport-3d': v3d, 'scene-viewport-html': vhtml },
      controls: cfg.elements?.panel ?? null,
      multiscroller: null,
    };
    try {
      i.app = new OmniSceneApp({ shell, controls: cfg.panel, defaultScene: c.scene });
    } catch (err) {
      i.failed = true;
      console.error('stage: scene "' + c.scene + '" failed to load', err);
      i.mountEl.insertAdjacentHTML('beforeend', `<div class="stage-err">${esc(c.scene)} failed to load — see console</div>`);
      return;
    }

    // Dormancy: a card out of its scroller's view costs nothing.
    const root = i.el.closest('.is-scroll-y, .is-scroll-both');
    i.io = new IntersectionObserver(([e]) => {
      i.el.dataset.visible = e.isIntersecting ? '1' : '0';
      if (e.isIntersecting) {
        i.app.activeBackend?.resize();
        i.app.render();
        if (i.app.currentScene?.animated) i.app._startAnimLoop();
      } else {
        i.app._stopAnimLoop();
        StageNode._engage(node, false);
      }
    }, { root, threshold: 0 });
    i.io.observe(i.el);

    i.wasLive = false;
    StageNode._live(node, i.harness?.params || {});
    const owner = owners.get(panelKey(node));
    if (owner && owner !== node && owner.inst?.app) { owner.inst.app._rebuildContext(); owner.inst.app.render(); }
  }

  /** If this stage has just become its group's active member, it drives the
      shared panel. */
  static _live(node, params) {
    const c = node.value || {}, i = node.inst;
    if (!i?.app || !c.group) return;
    const live = String(params[c.group]) === String(c.groupKey ?? c.scene);
    if (live && !i.wasLive) {
      i.app._rebuildContext();
      i.app.render();
      owners.set(panelKey(node), node);
    }
    i.wasLive = live;
  }

  static update(ctxMix, node, params) { StageNode._live(node, params); }

  static teardown(ctxMix, node, params) {
    const i = node.inst;
    if (!i) return;
    try { i.app?._stopAnimLoop(); i.app?.activeBackend?.deactivate(); } catch { /* nothing to undo */ }
    i.ro?.disconnect();
    i.io?.disconnect();
    document.removeEventListener('pointerdown', i.outside, true);
    if (owners.get(panelKey(node)) === node) owners.delete(panelKey(node));
    i.app = null;
  }
}

SYS.NODE_CLASSES.push({ name: 'stage', cls: StageNode });

export { StageNode };
