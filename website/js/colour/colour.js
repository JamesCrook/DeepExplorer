export {
  hexToRgb, hexToRgbArray, hexToRgba, shiftColor,
  isHexColor, parseHexColor, formatHexColor, lerpColor,
  ColorEngine,
};

// colour — hex/RGB arithmetic shared by the 2D nodes, the widgets and the param engine
/* ─────────────────────────────────────────────────────────────────────────────
No canvas, DOM or scene-graph knowledge.

It gathers what used to be copied about:
  - hexToRgb, hexToRgba, shiftColor          from 2d-support/paint.js
  - hexToRgbArray                            the [r,g,b] hexToRgb of nodes2d/mask-scene-nodes.js
  - isHexColor, parseHexColor,
    formatHexColor, lerpColor                from omni-widget.js (and the _isHex /
                                             _parseC / _fmtC copies in omni-param-engine.js)
  - ColorEngine (diverging value -> colour)  from utilities/color-engine.js
Perceptual work (LCH/Lab, gradients, proximity blending) is in ./perceptual.js.

Two parsers, on purpose, until the callers agree:
  hexToRgb      forgiving: null -> #888888, accepts #rgb, drops alpha; {r,g,b}.
  parseHexColor strict #rrggbb[aa], keeps alpha as 0..1; {r,g,b,a}.
  It is what the morphing code round-trips through formatHexColor, which
  always writes 8 digits.
──────────────────────────────────────────────────────────────────────────── */

// ── Forgiving parse, for drawing ────────────────────────

function hexToRgb(hex) {
  hex = (hex || '#888888').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length === 8) hex = hex.slice(0, 6);
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** As hexToRgb, as an [r, g, b] array (for ImageData loops). */
function hexToRgbArray(hex) {
  const { r, g, b } = hexToRgb(hex);
  return [r, g, b];
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Lighten (amt > 0, towards white) or darken (amt < 0) by a fraction; CSS rgb(). */
function shiftColor({ r, g, b }, amt) {
  const f = v => Math.round(Math.min(255, Math.max(0, amt > 0 ? v + (255 - v) * amt : v + v * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ── Strict parse with alpha, for morphing params ────────

function isHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6,8}$/.test(v);
}

function parseHexColor(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

function formatHexColor({ r, g, b, a }) {
  const hx = (v) => Math.round(Math.max(0, Math.min(255, v)))
                      .toString(16).padStart(2, '0');
  return '#' + hx(r) + hx(g) + hx(b) + hx((a ?? 1) * 255);
}

function lerpColor(c0, c1, t) {
  return {
    r: c0.r + (c1.r - c0.r) * t,
    g: c0.g + (c1.g - c0.g) * t,
    b: c0.b + (c1.b - c0.b) * t,
    a: c0.a + (c1.a - c0.a) * t,
  };
}

// ── Diverging schemes: a signed value -> [r, g, b] ──────

const ColorEngine = {
  schemes: {
    'red-green': { negative: [220, 50, 50], zero: [255, 255, 255], positive: [50, 180, 50] },
    'blue-red': { negative: [50, 100, 200], zero: [255, 255, 255], positive: [200, 50, 50] },
    'purple-orange': { negative: [150, 50, 200], zero: [255, 255, 255], positive: [230, 150, 50] },
    'cyan-magenta': { negative: [50, 200, 200], zero: [255, 255, 255], positive: [200, 50, 200] }
  },

  getColor(value, range, scheme, smooth) {
    const { min, max } = range;
    const colors = this.schemes[scheme] || this.schemes['red-green'];

    if (max === min) return colors.zero;

    const fullRange = Math.max(Math.abs(min), Math.abs(max));
    let t = value / (fullRange || 1);

    if (!smooth) {
      if (t < -0.5) return colors.negative;
      if (t > 0.5) return colors.positive;
      return colors.zero;
    }

    if (t < 0) {
      const factor = Math.abs(t);
      return this.lerp(colors.zero, colors.negative, factor);
    } else {
      return this.lerp(colors.zero, colors.positive, t);
    }
  },

  lerp(c1, c2, t) {
    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t)
    ];
  },

  toCSS(rgb, alpha = 1) {
    if (alpha < 1) {
      return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
    }
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  }
};
