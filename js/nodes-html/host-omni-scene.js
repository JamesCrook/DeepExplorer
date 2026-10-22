/*
# ESSENTIALS

host.omni-scene — an OmniSceneApp inside an html-host, and D+'s 'stage': a
host of that kind framed by the 'stage-frame' template.

The host node (html-host-node.js) does what every host does: it waits for a
size, gates the wheel, engages on a press, pauses out of view, and calls
live() when it becomes its group's active member.  This file is only what is
particular to OmniScene:

  - the layer stack OmniSceneApp expects (a sized wrapper Omni2d measures, the
    canvas, the 3D and HTML viewports overlaid), ids from the node's id or
    its scene;
  - the shared control panel, from the harness's paneConfig (panel, and
    elements.panel, its container);
  - live(): the app rebuilds the shared panel from its own layer tree.
    Making an app points the panel at it, so an app made after the live one
    would take the panel over; the live one is remembered per panel and takes
    it back.

  stage value  scene, label, badge, height (default 520), id
*/

import { SYS } from '../omni-support/sys.js';
import { SCENES } from '../omni-support/scene.js';
import { OmniSceneApp } from '../apps/omni-scene-app.js';
import { HtmlHostNode } from './html-host-node.js';

const owners = new WeakMap();      // panel → the handle that drives it
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

SYS.FUNCTIONS.push({
  name: 'host.omni-scene',
  fn: (holder, node, harness) => {
    const v = node.value || {};
    const cfg = harness?.paneConfig || {};
    const panelKey = cfg.panel ?? owners;
    const fail = (msg) => {
      holder.insertAdjacentHTML('beforeend', `<div class="stage-err">${esc(msg)}</div>`);
      return { failed: true };
    };
    if (!SCENES.find(s => s.id === v.scene)) return fail(`No scene registered with id "${v.scene ?? ''}"`);

    const uid = v.id || v.scene;
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
    holder.appendChild(stack);

    let app;
    try {
      app = new OmniSceneApp({
        shell: {
          container: node.inst?.el ?? holder,
          layers: { 'scene-canvas': canvas, 'scene-viewport-3d': v3d, 'scene-viewport-html': vhtml },
          controls: cfg.elements?.panel ?? null,
          multiscroller: null,
        },
        controls: cfg.panel,
        defaultScene: v.scene,
      });
    } catch (err) {
      console.error('host.omni-scene: scene "' + v.scene + '" failed to load', err);
      return fail(`${v.scene} failed to load — see console`);
    }

    const handle = {
      app,
      resize() { app.activeBackend?.resize(); app.render(); },
      pause()  { app._stopAnimLoop(); },
      resume() { app.activeBackend?.resize(); app.render(); if (app.currentScene?.animated) app._startAnimLoop(); },
      live()   { app._rebuildContext(); app.render(); owners.set(panelKey, handle); },
      destroy() {
        try { app._stopAnimLoop(); app.activeBackend?.deactivate(); } catch { /* nothing to undo */ }
        if (owners.get(panelKey) === handle) owners.delete(panelKey);
      },
    };
    // This app took the panel when it was made; give it back to its owner.
    const owner = owners.get(panelKey);
    if (owner && owner !== handle) owner.live();
    return handle;
  },
});

/* D+'s stage card: an OmniScene host in a frame, pinned while the chat
   scrolls under it, is-live while it drives the panel. */
SYS.NODE_CLASSES.push({
  name: 'stage',
  cls: HtmlHostNode.typed(
    { host: 'omni-scene', frame: 'stage-frame', height: 520, badge: 'O', label: 'OmniScene' },
    { sticky: true, activeClass: 'is-live' }),
});
