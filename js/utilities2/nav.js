/* ============================================
   nav.js — Navigation & Hamburger Menu
   ============================================

   Provides a top-left nav button that is either:
   - A back arrow (if browser history exists)
   - A hamburger menu (otherwise)

   The hamburger opens a dropdown menu built from nav-widget configs.
   Menu rendering is delegated to WidgetFactory.buildControls —
   every menu item is a widget (nav-item, nav-checkbox, nav-submenu,
   nav-divider, nav-link) defined in omni-widget.js.

   Apps register menu items via:

     NavMenu.addItems([
       { type: 'nav-item', label: 'Help', action: () => doHelp() },
       { type: 'nav-divider' },
       { type: 'nav-checkbox', label: 'Dark Mode', checked: true, onChange: (v) => ... },
       { type: 'nav-submenu', label: 'Export', subtree: [
           { type: 'nav-item', label: 'PNG', action: exportPng },
           { type: 'nav-item', label: 'SVG', action: exportSvg }
       ]},
       { type: 'nav-link', label: 'Home', href: '/' }
     ]);

   Legacy format (without type: 'nav-*') is auto-translated for
   backward compatibility.

   The menu is a singleton. Multiple addItems() calls append.
   Call NavMenu.clear() to reset, NavMenu.setItems(config) to replace.
*/

import { OmniWidget, createWidget, parseDslValue, _esc, WidgetContext } from '../omni-support/omni-widget.js';
import { sceneRegistry }  from '../omni-support/scene.js';
// ============================================================
// STYLES (OmniBase dark theme)
// ============================================================

const NAV_STYLES = `
  #nav-utility-btn {
    position: fixed;
    top: 20px;
    left: 20px;
    width: 40px;
    height: 40px;
    background: rgba(0, 0, 0, 0.2);
    color: white;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 10000;
    transition: transform 0.2s, background 0.2s, border-color 0.2s;
    padding: 0;
    font-size: 16px;
    line-height: 1;
  }
  #nav-utility-btn:hover {
    transform: scale(1.05);
  }
  #nav-utility-btn.has-menu:hover {
    background: rgba(25, 25, 55, 0.95);
    border-color: rgba(79, 195, 247, 0.4);
  }
  #nav-utility-btn.menu-open {
    border-color: rgba(79, 195, 247, 0.6);
    background: rgba(25, 25, 55, 0.95);
  }

  .nav-hamburger-bars {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
  }
  .nav-hamburger-bars span {
    display: block;
    width: 18px;
    height: 2px;
    background: currentColor;
    border-radius: 1px;
    transition: transform 0.2s, opacity 0.2s;
  }
  #nav-utility-btn.menu-open .nav-hamburger-bars span:nth-child(1) {
    transform: translateY(6px) rotate(45deg);
  }
  #nav-utility-btn.menu-open .nav-hamburger-bars span:nth-child(2) {
    opacity: 0;
  }
  #nav-utility-btn.menu-open .nav-hamburger-bars span:nth-child(3) {
    transform: translateY(-6px) rotate(-45deg);
  }

  .nav-dropdown {
    display: none;
    position: fixed;
    top: 66px;
    left: 20px;
    background: rgba(18, 18, 42, 0.96);
    border: 1px solid rgba(79, 195, 247, 0.25);
    border-radius: 8px;
    padding: 6px 0;
    min-width: 200px;
    max-width: 280px;
    z-index: 10000;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    max-height: calc(100vh - 80px);
    overflow-y: auto;
  }
  .nav-dropdown.open {
    display: block;
  }

  .nav-menu-item {
    display: block;
    padding: 8px 16px;
    color: #b0b8c8;
    text-decoration: none;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    box-sizing: border-box;
    line-height: 1.4;
  }
  .nav-menu-item:hover {
    background: rgba(79, 195, 247, 0.1);
    color: #e0e8f0;
  }

  .nav-menu-divider {
    height: 1px;
    background: rgba(79, 195, 247, 0.12);
    margin: 4px 12px;
  }

  /* Submenu */
  .nav-menu-item-sub {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    padding: 0; /* remove padding from container */
  }
  .nav-menu-item-sub-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 8px 16px; /* add padding to header */
    box-sizing: border-box;
  }
  .nav-menu-item-sub-header::after {
    content: '▸';
    margin-left: 12px;
    font-size: 10px;
    opacity: 0.5;
    transition: transform 0.2s;
  }
  .nav-menu-item-sub.open .nav-menu-item-sub-header::after {
    transform: rotate(90deg);
  }
  .nav-submenu {
    display: none;
    width: 100%;
    padding-top: 8px;
    padding-left: 12px;
  }
  .nav-menu-item-sub.open > .nav-submenu {
    display: block;
  }

  /* Checkbox items */
  .nav-menu-checkbox {
    margin-right: 8px;
    accent-color: #4fc3f7;
    vertical-align: middle;
  }
`;

// ============================================================
// NAV MENU (singleton)
// ============================================================

class NavMenu {

  static _instance = null;

  static getInstance() {
    if (!NavMenu._instance) {
      NavMenu._instance = new NavMenu();
    }
    return NavMenu._instance;
  }

  // ── Legacy format translation ─────────────────────────────
  //
  // Converts old-style { label, action } / { type:'divider' } /
  // { type:'checkbox' } / { submenu } / { href } configs into
  // nav-widget configs.  New-format configs (type starts with
  // 'nav-') pass through unchanged.

  static _normalizeConfig(item) {
    if (!item) return item;
    // Already in widget format
    if (typeof item.type === 'string' && item.type.startsWith('nav-')) return item;

    if (item.type === 'divider')   return { ...item, type: 'nav-divider' };
    if (item.type === 'checkbox')  return { ...item, type: 'nav-checkbox' };
    if (item.submenu) {
      return {
        ...item,
        type: 'nav-submenu',
        subtree: item.submenu.map(s => NavMenu._normalizeConfig(s)),
      };
    }
    if (item.href)   return { ...item, type: 'nav-link' };
    return { ...item, type: 'nav-item' };
  }

  /** Append items to the menu. Accepts old or new format. */
  static addItems(items) {
    const inst = NavMenu.getInstance();
    inst.config.push(...items.map(NavMenu._normalizeConfig));
    inst._renderMenu();
  }

  /** Replace all items. Accepts old or new format. */
  static setItems(items) {
    const inst = NavMenu.getInstance();
    inst.config = items.map(NavMenu._normalizeConfig);
    inst._renderMenu();
  }

  /** Remove all items. */
  static clear() {
    const inst = NavMenu.getInstance();
    inst.config = [];
    inst._renderMenu();
  }

  /** Get the instance (e.g. for direct method calls). */
  static get menu() {
    return NavMenu.getInstance();
  }

  // ── Instance ────────────────────────────────────────────────

  constructor() {
    this.config = [];
    this.isOpen = false;
    this.isBackMode = false;
    this.btn = null;
    this.dropdown = null;
    this._widgetElements = [];

    // WidgetContext used when rendering menu items via WidgetFactory.
    // closeMenu is the only action nav widgets need from the host.
    this._ctx = new WidgetContext({
      closeMenu: () => this._close(),
    });

    this._init();
  }

  /** Replace the widget-generated menu elements.
   *  Called by OmniControlPanel._rebuildSubmenus(). */
  setWidgetElements(elements) {
    this._widgetElements = elements;
    this._renderMenu();
  }

  _init() {
    // Inject styles
    if (!document.getElementById('nav-menu-styles')) {
      const style = document.createElement('style');
      style.id = 'nav-menu-styles';
      style.textContent = NAV_STYLES;
      document.head.appendChild(style);
    }

    // Determine mode
    this.isBackMode = window.history.length > 1;

    // Create button
    this.btn = document.createElement('div');
    this.btn.id = 'nav-utility-btn';

    if (this.isBackMode) {
      this.btn.innerHTML = '<div>←</div>';
      this.btn.onclick = () => window.history.back();
    } else {
      this._setHamburgerIcon();
      this.btn.onclick = (e) => {
        e.stopPropagation();
        if (this.config.length === 0) {
          window.location.href = 'https://catalase.com/';
        } else {
          this._toggle();
        }
      };
    }

    document.body.appendChild(this.btn);

    // Create dropdown (even in back mode — items can still be added later)
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'nav-dropdown';
    document.body.appendChild(this.dropdown);

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.dropdown.contains(e.target) && e.target !== this.btn) {
        this._close();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this._close();
    });
  }

  _setHamburgerIcon() {
    this.btn.innerHTML = `<div class="nav-hamburger-bars">
      <span></span><span></span><span></span>
    </div>`;
  }

  _toggle() {
    this.isOpen = !this.isOpen;
    this._updateState();
  }

  _close() {
    this.isOpen = false;
    this._updateState();
  }

  _updateState() {
    this.btn.classList.toggle('menu-open', this.isOpen);
    this.dropdown.classList.toggle('open', this.isOpen);
  }

  _renderMenu() {
    this.dropdown.innerHTML = '';

    if (this.config.length > 0) {
      WidgetFactory.buildControls(this.config, this._ctx, this.dropdown);
    }

    // Append widget-generated elements (from OmniControlPanel._rebuildSubmenus)
    if (this._widgetElements.length > 0) {
      if (this.config.length > 0) {
        // Divider between app items and widget items
        const div = document.createElement('div');
        div.className = 'nav-menu-divider';
        this.dropdown.appendChild(div);
      }
      for (const el of this._widgetElements) {
        this.dropdown.appendChild(el);
      }
    }

    const hasItems = this.config.length > 0 || this._widgetElements.length > 0;
    this.btn.classList.toggle('has-menu', hasItems);

    // If items were added and we were in back mode, switch to hamburger
    if (this.isBackMode && hasItems) {
      this.isBackMode = false;
      this._setHamburgerIcon();
      this.btn.onclick = (e) => {
        e.stopPropagation();
        this._toggle();
      };
    }
  }
}

// ============================================================
// AUTO-INIT on DOMContentLoaded
// ============================================================

function addBackCircle() {
  NavMenu.getInstance();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addBackCircle);
} else {
  addBackCircle();
}

// Expose globally
if (typeof window !== 'undefined') {
  window.NavMenu = NavMenu;
}
// Auto-generated exports
if (typeof window !== 'undefined') window.NAV_STYLES = NAV_STYLES;
export { NAV_STYLES };
export { NavMenu };
if (typeof window !== 'undefined') window.addBackCircle = addBackCircle;
export { addBackCircle };
