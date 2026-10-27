import { SYS, sceneRegistry } from '../omni-support/sys.js';
import { PipKinds } from '../2d-support/pip-kind.js';
import { Values } from '../omni-support/values.js';
import { BTN_DEFAULTS } from './pipped-button-node.js';
export { PippedEdgeRefNode };
class PippedEdgeRefNode {
  static meta = {
    zOrder: -1,
    pipKind: PipKinds.EDGE_END,
    coneParams: (node) => ({ n: node.value.n || 4, tilt: node.value.tilt || 0 }),
    spawnOverrides: (wp) => ({ x1: wp.x - 25, y1: wp.y, x2: wp.x + 25, y2: wp.y }),
    editableFields: (node) => [
      { key: 'color', label: 'Color', type: 'color', value: node.value.color || BTN_DEFAULTS.fill },
    ]

  };
  static getCentreXY(res, node, params) {
    const v = res.getValue(res, node, params);
    return { x: (v.x1 + v.x2) / 2, y: (v.y1 + v.y2) / 2 };
  }
  static getPips(res, node, params) {
    const v = res.getValue(res, node, params);
    const a = Math.atan2(v.y2 - v.y1, v.x2 - v.x1);
    return [
      { x: v.x1, y: v.y1, out: a + Math.PI },
      { x: v.x2, y: v.y2, out: a }
    ];
  }
  static setPipPos(res, node, params) {
    if (params.idx === 0) res.setValue(res, node, params, { x1: params.x, y1: params.y });
    else                  res.setValue(res, node, params, { x2: params.x, y2: params.y });
  }
  static getSnapSegments(res, node, params) {
    const v = res.getValue(res, node, params);
    return [{ x1: v.x1, y1: v.y1, x2: v.x2, y2: v.y2 }];
  }
  static setXY(res, node, params){
    res.setValue(res, node, params, {
      x1: params.x - 18, y1: params.y,
      x2: params.x + 18, y2: params.y,
    });
  }
  // Translation keeps the edge's own length; setXY deliberately does not.
  static moveBy(res, node, params) {
    const v = res.getValue(res, node, params);
    res.setValue(res, node, params, {
      x1: v.x1 + params.dx, y1: v.y1 + params.dy,
      x2: v.x2 + params.dx, y2: v.y2 + params.dy,
    });
  }
  // How to build one spanning two points, and how to divide one in two.
  static spanValue(a, b) { return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }
  static splitValues(node, at) {
    const v = node.value;
    return [
      { x1: v.x1,  y1: v.y1,  x2: at.x, y2: at.y  },
      { x1: at.x,  y1: at.y,  x2: v.x2, y2: v.y2  },
    ];
  }
  static _curveTo(ctx, v, bend) {
    if (Math.abs(bend) > 0.001) {
      const mx = (v.x1 + v.x2) / 2, my = (v.y1 + v.y2) / 2, dx = v.x2 - v.x1, dy = v.y2 - v.y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1, bulge = len * Math.tan(bend / 2) / 2;
      ctx.quadraticCurveTo(mx + (-dy / len) * bulge, my + (dx / len) * bulge, v.x2, v.y2);
    } else { ctx.lineTo(v.x2, v.y2); }
  }
  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx, v = ctxMix.getValue(ctxMix, node, params);
    const w = params.edgeWidth ?? 6, outline = params.edgeOutline ?? 1, bend = params.edgeBend ?? 0;
    if (outline > 0) {
      ctx.beginPath(); ctx.moveTo(v.x1, v.y1); PippedEdgeRefNode._curveTo(ctx, v, bend);
      ctx.strokeStyle = '#aa8'; ctx.lineWidth = w + outline * 2; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(v.x1, v.y1); PippedEdgeRefNode._curveTo(ctx, v, bend);
    ctx.strokeStyle = v.color ?? '#557'; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();

    if (v.selected || v.hovered) {
      ctx.beginPath(); ctx.moveTo(v.x1, v.y1); PippedEdgeRefNode._curveTo(ctx, v, bend);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
  static hit_test(ctxMix, node, params) {
    const pt = ctxMix.hitPoint;
    if (!pt) return;
    const v = node.value, dx = v.x2 - v.x1, dy = v.y2 - v.y1, lenSq = dx * dx + dy * dy;
    if (lenSq < 1) return;
    const t = Math.max(0, Math.min(1, ((pt.x - v.x1) * dx + (pt.y - v.y1) * dy) / lenSq));
    const len = Math.sqrt(lenSq), exclude = 10 / len;
    if (t < exclude || t > 1 - exclude) return;
    const px = v.x1 + t * dx, py = v.y1 + t * dy, hitW = Math.max((params.edgeWidth ?? 2) / 2 + 4, 8);
    if (Math.hypot(pt.x - px, pt.y - py) > hitW) return;
    const mx = (v.x1 + v.x2) / 2, my = (v.y1 + v.y2) / 2, ox = pt.x - mx, oy = pt.y - my;
    const hdx = dx / 2, hdy = dy / 2;
    ctxMix.hitResult = {
      node, interactions: { applyDrag(wx, wy) {
        const cx = wx - ox, cy = wy - oy;
        Values.setValue(Values, node, params, {
          x1: cx - hdx, y1: cy - hdy,
          x2: cx + hdx, y2: cy + hdy,
        });
        return node;
      }}
    };
  }
}

class MorphSliderWidget {

  static mount(ctxMix, node, params) {
    // Compatability hack... we permit values directly on node.
    // in future they will need to be in node.value. 
    if( node.value)
      node = node.value;

    const pid = node.id;
    const initVal = node.isData
      ? (node.dataValue || node.default)
      : (params[pid] ?? node.default ?? node.min ?? 0);

    const { el, setValue, getValue, valEl } = MorphSliderWidget.buildMorphSlider({
      label:    node.label,
      min:      node.min ?? 0,
      max:      node.max ?? 100,
      step:     node.step,
      value:    initVal,
      disabled: node.disabled,
      format:   node.format
        ? (v => formatValue(v, node.format))
        : node.formatFn || undefined,
      onChange: v => {
        if (node.isData) {
          ctxMix.onParamChange(pid, v, true, ctxMix.panel);
        } else {
          ctxMix.setParam(pid, v);
          ctxMix.onParamChange(pid, v, false, ctxMix.panel);
        }
        if (node.onChange) node.onChange(v, ctxMix.panel);
        ctxMix.render();
        ctxMix.clearActivePreset();
      },
    });

    // Keep the same id conventions so preset morph / param sync can find them
    el.id = pid;
    valEl.id = `${pid}-val`;
    el.dataset.sliderId = pid;
    ctxMix.parentEl?.appendChild(el);
    return el;
  }

  // ── Static factory — the core DOM builder ───────────────────
  //
  //  Returns { el, setValue(v), getValue(), valEl } where el is the
  //  root .morph-slider div and setValue repositions the pip/fill/
  //  readout programmatically (preset morph, param sync, etc).
  //
  //  @param {Object} opts
  //  @param {string}   opts.label
  //  @param {number}   opts.min
  //  @param {number}   opts.max
  //  @param {number}   opts.step
  //  @param {number}   opts.value     — initial value
  //  @param {Function} [opts.format]  — (v) => display string
  //  @param {Function} [opts.onChange] — (v) => void
  //  @param {boolean}  [opts.disabled]

  static buildMorphSlider(opts) {
    const min = +opts.min, max = +opts.max, step = +(opts.step || 1);
    const fmt = opts.format || (v => {
      // Auto-format: up to 2 decimals if step is fractional
      return step % 1 !== 0 ? (+v).toFixed(2) : String(Math.round(+v));
    });

    const el = document.createElement('div');
    el.className = 'morph-slider';
    if (opts.disabled) el.style.opacity = '0.4';

    const track = document.createElement('div');
    track.className = 'ms-track';
    const fill = document.createElement('div');
    fill.className = 'ms-fill';
    track.appendChild(fill);

    const pip = document.createElement('div');
    pip.className = 'ms-pip';

    const lbl = document.createElement('span');
    lbl.className = 'ms-label';
    lbl.textContent = opts.label || '';

    const val = document.createElement('span');
    val.className = 'ms-val';

    el.append(track, pip, lbl, val);

    // ── Internal state ───────────────────────────────────
    let currentValue = +(opts.value ?? min);

    function pctFromValue(v) {
      return max === min ? 0 : (v - min) / (max - min);
    }

    function valueFromPct(pct) {
      let v = min + pct * (max - min);
      // Snap to step
      v = Math.round(v / step) * step;
      return Math.max(min, Math.min(max, +v.toFixed(10)));
    }

    function render(v) {
      const pct = pctFromValue(v) * 100;
      fill.style.width = pct + '%';
      pip.style.left   = pct + '%';
      val.textContent   = fmt(v);
    }

    // Public: set value from outside (preset morph, param sync)
    function setValue(v) {
      currentValue = +v;
      render(currentValue);
    }

    render(currentValue);

    // ── Pointer interaction ──────────────────────────────
    if (!opts.disabled) {
      const update = (clientX) => {
        const rect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        currentValue = valueFromPct(pct);
        render(currentValue);
        if (opts.onChange) opts.onChange(currentValue);
      };

      let engaged = false;

      el.addEventListener('pointerdown', e => {
        engaged = true;
        el.classList.add('engaged');
        el.setPointerCapture(e.pointerId);
        update(e.clientX);
      });
      el.addEventListener('pointermove', e => {
        if (engaged) update(e.clientX);
      });
      el.addEventListener('pointerup', () => {
        engaged = false;
        el.classList.remove('engaged');
      });
      el.addEventListener('pointercancel', () => {
        engaged = false;
        el.classList.remove('engaged');
      });
    }

    // Expose the value element for external id assignment
    el._valEl   = val;
    el._setValue = setValue;
    el._getValue = () => currentValue;

    // Backward-compat: the panel reads/writes .value like an <input>.
    // defineProperty so it's not enumerable (won't confuse iteration).
    Object.defineProperty(el, 'value', {
      get: () => currentValue,
      set: v => { setValue(+v); },
      configurable: true,
    });

    return { el, setValue, getValue: () => currentValue, valEl: val };
  }
}

SYS.NODE_CLASSES.push({ name: 'morph-slider', cls: MorphSliderWidget });;



SYS.STOCK?.push( SYS.makeNode('pipped-edge',    { x1: 0, y1: 0, x2: 40, y2: 0, label: 'Edge' }))

SYS.CONTROLS.push({ type: 'separator', label: 'Edges' })
SYS.CONTROLS.push({ id: 'edgeWidth',   label: 'Width',   min: 1,    max: 12,  step: 0.5, value: SYS.P.edgeWidth })
SYS.CONTROLS.push({ id: 'edgeBend1',    label: 'Bend',    min: -1.5, max: 1.5, step: 0.05,value: SYS.P.edgeBend })
SYS.CONTROLS.push({ id: 'edgeOutline', label: 'Outline', min: 0,    max: 6,   step: 0.5, value: SYS.P.edgeOutline })
SYS.CONTROLS.push({ type: 'morph-slider', id: 'edgeBend',   label: 'Bend2',    min: -1.5, max: 1.5, step: 0.05,value: SYS.P.edgeBend })


SYS.NODE_CLASSES.push({ name: 'pipped-edge', cls: PippedEdgeRefNode });;
