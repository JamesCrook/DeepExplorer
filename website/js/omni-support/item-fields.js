/**
 * item-fields.js — Generic per-item property editor
 *
 * Creates a control-panel section with editable fields (text, textarea, color)
 * bound to a resolved AST node's `value` object.
 *
 * Returns { section, sync }:
 *   section()         — sliderConfig entry for OmniControlPanel (type:'custom')
 *   sync(layer, app)  — lightweight DOM update on selection change
 *
 * Usage:
 *   const fields = createItemFields({
 *     id: 'node-props', label: 'Node', abbrev: 'Nd',
 *     fields: [
 *       { key: 'name',  label: 'Name',  type: 'text' },
 *       { key: 'color', label: 'Color', type: 'color', default: '#4fc3f7' },
 *       { key: 'desc',  type: 'textarea', placeholder: 'Enter text…' },
 *     ],
 *     resolve:  (layer, app) => targetNode,
 *     onChange: (node, key, value, app) => { /* optional side-effects * / },
 *   });
 *
 *   layer.inst.itemFields = fields;
 *
 * Place in: omni-support/item-fields.js
 */

function createItemFields(options) {

  // ── Per-instance session state ──────────────────────────
  let _activeNode    = null;
  let _fieldEls      = {};
  let _textareaHeight = null;

  // ── Internal helpers ───────────────────────────────────

  /** Push field DOM values from the active node. */
  function _syncDOM() {
    for (const field of options.fields) {
      const el = _fieldEls[field.key];
      if (!el) continue;
      const raw = _activeNode?.value?.[field.key] ?? field.default ?? '';
      if (field.type === 'color') {
        el.value = String(raw).slice(0, 7) || '#ffffff';
        if (el._swatch) el._swatch.style.backgroundColor = raw;
      } else {
        el.value = raw;
      }
    }
  }

  /** Write a value to the active node, fire onChange, re-render. */
  function _write(key, value, app) {
    if (!_activeNode) return;
    if (!_activeNode.value) _activeNode.value = {};
    _activeNode.value[key] = value;
    options.onChange?.(_activeNode, key, value, app);
    app.render();
  }

  // ── Field builders ─────────────────────────────────────

  function _buildTextarea(parent, field, val, app) {
    const ta = document.createElement('textarea');
    ta.className = 'sc-item-field sc-item-textarea';
    ta.spellcheck = false;
    ta.placeholder = field.placeholder || '';
    ta.value = val;

    if (_textareaHeight) {
      ta.style.height = _textareaHeight + 'px';
    } else {
      requestAnimationFrame(() => {
        ta.style.height = 'auto';
        ta.style.height = Math.max(36, Math.min(ta.scrollHeight + 2, 200)) + 'px';
      });
    }

    new ResizeObserver(() => { _textareaHeight = ta.offsetHeight; }).observe(ta);
    ta.addEventListener('input', () => _write(field.key, ta.value, app));

    _fieldEls[field.key] = ta;
    parent.appendChild(ta);
  }

  function _buildText(parent, field, val, app) {
    const row = document.createElement('div');
    row.className = 'sc-item-field sc-item-text-row';

    if (field.label) {
      const lbl = document.createElement('span');
      lbl.className = 'sc-item-field-label';
      lbl.textContent = field.label;
      row.appendChild(lbl);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sc-item-text-input';
    input.placeholder = field.placeholder || '';
    input.value = val;
    input.addEventListener('input', () => _write(field.key, input.value, app));

    _fieldEls[field.key] = input;
    row.appendChild(input);
    parent.appendChild(row);
  }

  function _buildColor(parent, field, val, app) {
    const row = document.createElement('div');
    row.className = 'sc-item-field sc-item-color-row';

    if (field.label) {
      const lbl = document.createElement('span');
      lbl.className = 'sc-item-field-label';
      lbl.textContent = field.label;
      row.appendChild(lbl);
    }

    const swatch = document.createElement('button');
    swatch.className = 'sc-item-color-swatch';
    swatch.style.backgroundColor = val;

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'sc-item-color-picker';
    picker.value = String(val).slice(0, 7) || '#ffffff';
    picker._swatch = swatch;

    picker.addEventListener('input', () => {
      swatch.style.backgroundColor = picker.value;
      _write(field.key, picker.value, app);
    });
    swatch.addEventListener('click', () => picker.click());

    _fieldEls[field.key] = picker;
    row.appendChild(swatch);
    row.appendChild(picker);
    parent.appendChild(row);
  }

  // ── Public API ─────────────────────────────────────────

  /**
   * Lightweight selection-change sync (called from _updateActionBar).
   * Only updates if the selection buffer contains a different node.
   */
  function sync(layer, app) {
    if (!(app?._selectionBuffer?.length)) return;   // no selection → keep current
    const node = options.resolve(layer, app);
    if (!node || node === _activeNode) return;
    _activeNode = node;
    _syncDOM();
  }

  /**
   * Return a sliderConfig section suitable for OmniControlPanel.setContext.
   * Called once per _rebuildContext; the build closure captures fresh state.
   */
  function section() {
    return {
      group:  options.label  || 'Properties',
      id:     options.id     || 'item-fields',
      abbrev: options.abbrev || 'Fld',
      type:   'custom',
      build(groupEl, layer, app) {
        _activeNode = options.resolve(layer, app);
        _fieldEls   = {};

        for (const field of options.fields) {
          const val = _activeNode?.value?.[field.key] ?? field.default ?? '';
          if (field.type === 'textarea')   _buildTextarea(groupEl, field, val, app);
          else if (field.type === 'color') _buildColor(groupEl, field, val, app);
          else                             _buildText(groupEl, field, val, app);
        }
      },
    };
  }

  return { section, sync };
}

export { createItemFields };
