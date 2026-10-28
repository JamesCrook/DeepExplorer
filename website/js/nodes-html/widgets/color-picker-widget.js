import { SYS } from '../../omni-support/sys.js';
import { OmniWidget, parseHexColor, formatHexColor } from './widget-base.js';
export { ColorPickerWidget };

// ════════════════════════════════════════════════════════════════
//  ColorPickerWidget — extracted from SliderGroupWidget._buildColor
// ════════════════════════════════════════════════════════════════

class ColorPickerWidget extends OmniWidget {

  static mount(ctxMix, node, params) {
    const v = node.value || {};
    const p = ctxMix.getParams(ctxMix, node, params);
    const initVal = p[v.id] ?? v.default ?? '#ffffffff';

    const controlEl = document.createElement('div');
    controlEl.className = 'control sc-color-control';

    const label = document.createElement('label');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = v.label;
    const valSpan = document.createElement('span');
    valSpan.id = `${v.id}-val`;
    valSpan.textContent = initVal;
    label.appendChild(nameSpan);
    label.appendChild(valSpan);

    const swatch = document.createElement('button');
    swatch.className = 'sc-color-swatch';
    swatch.id = `${v.id}-swatch`;
    swatch.style.backgroundColor = initVal;

    const popup = document.createElement('div');
    popup.className = 'sc-color-popup';
    popup.style.display = 'none';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = v.id;
    colorInput.value = initVal.slice(0, 7);

    const alphaRow = document.createElement('div');
    alphaRow.className = 'sc-color-alpha-row';
    const alphaLabel = document.createElement('span');
    alphaLabel.textContent = 'Alpha';
    const alphaSlider = document.createElement('input');
    alphaSlider.type = 'range';
    alphaSlider.id = `${v.id}-alpha`;
    alphaSlider.min = 0; alphaSlider.max = 1; alphaSlider.step = 0.01;
    alphaSlider.value = parseHexColor(initVal).a;

    alphaRow.appendChild(alphaLabel);
    alphaRow.appendChild(alphaSlider);
    popup.appendChild(colorInput);
    popup.appendChild(alphaRow);

    const writeColor = () => {
      const rgb = parseHexColor(colorInput.value);
      rgb.a = parseFloat(alphaSlider.value);
      const hex = formatHexColor(rgb);
      ctxMix.setParam(v.id, hex, p);
      swatch.style.backgroundColor = hex;
      valSpan.textContent = hex;
      ctxMix.render();
      ctxMix.clearActivePreset();
    };
    colorInput.addEventListener('input', writeColor);
    alphaSlider.addEventListener('input', writeColor);

    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasHidden = popup.style.display === 'none';
      document.querySelectorAll('.sc-color-popup')
              .forEach(p => p.style.display = 'none');
      popup.style.display = wasHidden ? '' : 'none';
    });
    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && e.target !== swatch) {
        popup.style.display = 'none';
      }
    });

    controlEl.appendChild(label);
    controlEl.appendChild(swatch);
    controlEl.appendChild(popup);
    ctxMix.parentEl.appendChild(controlEl);
  }
}

SYS.NODE_CLASSES.push({ name: 'color-picker', cls: ColorPickerWidget });
