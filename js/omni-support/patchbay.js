// patchbay.js
// Inter-tab communication, configuration, and dynamic module loading for Trisk apps.
// Sits alongside OmniControlPanel, PatcherBase etc. — not inside them.
// An app opts in by creating a Patchbay instance. Simple apps ignore it entirely.
//
// Usage:
//   import { Patchbay, Profile } from './patchbay.js';
//   const bay = new Patchbay('omnislice');
//   bay.on('show-path', (msg) => { ... });

// --- Helpers ---

function _shortId() {
  return Math.random().toString(36).slice(2, 10);
}

// ============================================================
// Patchbay
// ============================================================

export class Patchbay {

  // --- Construction and lifecycle ---

  constructor(role, options = {}) {
    this.role = role;                              // e.g. 'omnislice', 'flight-paths'
    this.instanceId = role + ':' + _shortId();
    this.channelName = options.channel || 'trisk';
    this.channel = new BroadcastChannel(this.channelName);

    this.children = {};       // role -> window reference (from window.open)
    this.peers = {};          // instanceId -> { role, lastSeen }
    this.handlers = {};       // type -> [handler, ...]
    this.modules = {};        // path -> loaded module (cache)
    this.renderers = {};      // name -> module (registered renderers)
    this.knownChildren = [];  // roles of children from previous session

    this._restore();
    this.channel.onmessage = (e) => this._route(e.data);
    window.addEventListener('beforeunload', () => this._persist());

    // Standard handlers
    this.on('announce', (msg) => {
      this.peers[msg.from] = { role: msg.role, lastSeen: Date.now() };
    });

    this.on('load-module', async (msg) => {
      const mod = await this.loadModule(msg.path);
      if (msg.registrar === 'registerRenderer') {
        this.registerRenderer(msg.name, mod.default || mod);
      }
      this._emit('module-loaded', { name: msg.name, path: msg.path, module: mod });
      this.send(msg.from, 'module-loaded', { name: msg.name, path: msg.path });
    });

    this.announce();
  }

  destroy() {
    this._persist();
    this.channel.close();
  }

  // --- Renderer registry ---

  registerRenderer(name, renderer) {
    this.renderers[name] = renderer;
  }

  getRenderer(name) {
    return this.renderers[name] || null;
  }

  listRenderers() {
    return Object.keys(this.renderers);
  }

  // --- Announce / discover ---

  announce() {
    this._broadcast('announce', { role: this.role });
  }

  listPeers(roleFilter) {
    return Object.entries(this.peers)
      .filter(([, info]) => !roleFilter || info.role === roleFilter)
      .map(([id, info]) => ({ instanceId: id, ...info }));
  }

  // --- Messaging ---

  send(target, type, payload = {}) {
    this._broadcast(type, payload, target);
  }

  broadcast(type, payload = {}) {
    this._broadcast(type, payload, null);
  }

  on(type, handler) {
    (this.handlers[type] ||= []).push(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    const list = this.handlers[type];
    if (list) this.handlers[type] = list.filter(h => h !== handler);
  }

  // --- Tab management ---

  summon(role, url) {
    const existing = this.children[role];
    if (existing && !existing.closed) {
      existing.focus();
      return existing;
    }
    const win = window.open(url, role);
    this.children[role] = win;
    this._persist();
    return win;
  }

  focus(role) {
    const win = this.children[role];
    if (win && !win.closed) { win.focus(); return true; }
    return false;
  }

  returnFocus() {
    if (window.opener && !window.opener.closed) {
      window.opener.focus();
    }
  }

  // --- Configuration protocol ---

  configure(target, config) {
    this.send(target, 'configure', { config });
  }

  addParameters(target, params) {
    this.configure(target, { addParameters: params });
  }

  hideParameters(target, names) {
    this.configure(target, { hideParameters: names });
  }

  setPresets(target, presets) {
    this.configure(target, { presets });
  }

  applyProfile(target, profile) {
    this.configure(target, profile);
  }

  // --- Dynamic module loading ---

  async loadModule(path) {
    if (!this.modules[path]) {
      this.modules[path] = await import(path);
    }
    return this.modules[path];
  }

  requestModule(target, name, path, registrar) {
    this.send(target, 'load-module', { name, path, registrar });
  }

  // --- Selection / data protocol ---

  select(target, selection) {
    this.send(target, 'select', { selection });
  }

  update(target, data) {
    this.send(target, 'update', { data });
  }

  // --- Internal ---

  _broadcast(type, payload, target) {
    this.channel.postMessage({
      from: this.instanceId,
      role: this.role,
      target: target || undefined,
      type,
      ...payload
    });
  }

  _emit(type, detail) {
    const list = this.handlers[type];
    if (list) list.forEach(h => h(detail));
  }

  _route(msg) {
    if (msg.from === this.instanceId) return;
    if (msg.target && msg.target !== this.role && msg.target !== this.instanceId) return;

    const list = this.handlers[msg.type];
    if (list) list.forEach(h => h(msg));
  }

  _persist() {
    const state = {
      role: this.role,
      instanceId: this.instanceId,
      childRoles: Object.keys(this.children),
    };
    try {
      localStorage.setItem(`patchbay:${this.role}`, JSON.stringify(state));
    } catch (e) { /* storage full or unavailable — not fatal */ }
  }

  _restore() {
    try {
      const json = localStorage.getItem(`patchbay:${this.role}`);
      if (json) {
        const state = JSON.parse(json);
        this.knownChildren = state.childRoles || [];
      }
    } catch (e) { /* corrupt state — start fresh */ }
  }
}

// ============================================================
// Profile builder
// ============================================================

export class Profile {
  constructor() {
    this._add = [];
    this._hide = [];
    this._presets = [];
  }

  param(name, label, defVal = 0.5, options = {}) {
    this._add.push({
      id: name,
      label,
      min: options.min ?? 0,
      max: options.max ?? 1,
      step: options.step ?? 0.01,
      default: defVal,
      ...(options.group && { group: options.group })
    });
    return this;
  }

  hide(...names) {
    this._hide.push(...names);
    return this;
  }

  preset(name, values) {
    this._presets.push({ name, values });
    return this;
  }

  build() {
    const config = {};
    if (this._add.length) config.addParameters = this._add;
    if (this._hide.length) config.hideParameters = this._hide;
    if (this._presets.length) config.presets = this._presets;
    return config;
  }
}
// Auto-generated exports
if (typeof window !== 'undefined') window._shortId = _shortId;
export { _shortId };
