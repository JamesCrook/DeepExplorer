import { SYS } from '../omni-support/sys.js';
export { RulerNode };

// `ruler` — a self-contained ruler: tick marks and numbers along a line, from the
/* ─────────────────────────────────────────────────────────────────────────────
Scorpio-era Ruler object.
──────────────────────────────────────────────────────────────────────────── */
//
// The ruler is a self-contained widget that draws tick marks.
// The Ruler prototype object from the old code is inlined here.

const RULER_SPEC_1 = [
  { mod: 10, height: 1.0, width: 1.7 },
  { mod:  5, height: 0.6, width: 0.7 },
  { mod:  1, height: 0.4, width: 0.7 },
];

const RULER_SPEC_2 = [
  { mod: 10, height: 1.0, width: 1.5 },
  { mod:  2, height: 0.5, width: 0.7 },
  { mod:  1, height: 0.25, width: 0.7 },
];

class RulerNode {

  static draw2d(ctxMix, node, params) {
    const ctx = ctxMix.ctx;
    if (!ctx) return;

    const val = node.value || {};
    const x = val.x ?? 0;
    const y = val.y ?? 0;
    const w = val.width  ?? 300;
    const h = val.height ?? 20;

    // Draw background bar.
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = params.rulerColor || '#ccc';
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = 'rgb(0,0,0)';
    ctx.rect(x, y, w, h);
    ctx.fill();

    // Compute bar density.
    const atStart = val.atStart ?? -10;
    const atEnd   = val.atEnd   ?? 310;
    const itemsPerPixel = (atEnd - atStart) / w;
    let pixelsPerBar = 100 / itemsPerPixel;
    let spec = 0;

    while (pixelsPerBar > 6) {
      spec++;
      pixelsPerBar /= 2;
      if (pixelsPerBar <= 15) break;
      spec++;
      pixelsPerBar /= 5;
    }

    const rulerSpec = (spec % 2 === 1) ? RULER_SPEC_2 : RULER_SPEC_1;
    const otherSpec = (spec % 2 === 1) ? RULER_SPEC_1 : RULER_SPEC_2;
    const itemsPerBar = itemsPerPixel * pixelsPerBar;

    // Draw ticks.
    const nBars = Math.floor(w / pixelsPerBar) + 1;
    const barObj = {
      pos: new Vector2D(x, y),
      rect: new Vector2D(w, h),
      pixelsPerBar,
      itemsPerBar,
      atStart,
    };

    for (let i = 0; i < nBars; i++) {
      RulerNode._drawMark(ctx, barObj, i, rulerSpec, otherSpec);
    }

    ctx.stroke();
    ctx.restore();
  }

  static _drawMark(ctx, obj, i, rulerSpec, otherSpec) {
    let xPos = obj.pos.x + i * obj.pixelsPerBar;
    const y   = obj.pos.y;
    const yh  = obj.rect.y;

    const barCountAtStart = obj.atStart / obj.itemsPerBar;
    const iAdj = i + Math.floor(barCountAtStart);
    xPos -= (barCountAtStart - Math.floor(barCountAtStart)) * obj.pixelsPerBar;

    const v = rulerSpec[1].mod;

    // Determine other-spec tier.
    let j1 = 2;
    for (let j = 0; j < 2; j++) {
      if (iAdj % (v * otherSpec[j].mod) === 0) { j1 = j; break; }
    }
    const spec2 = otherSpec[j1];

    // Determine primary-spec tier.
    let jPrimary = 2;
    for (let j = 0; j < 2; j++) {
      if (iAdj % rulerSpec[j].mod === 0) { jPrimary = j; break; }
    }
    const spec = rulerSpec[jPrimary];

    let height  = spec.height;
    let height2 = (jPrimary > 1) ? 0 : spec2.height;
    const blend = Math.max(0, Math.min((obj.pixelsPerBar - 4.5) / 1.1, 1.0));

    ctx.lineWidth = spec.width;
    height = height2 + blend * (height - height2);

    ctx.beginPath();
    ctx.moveTo(xPos, y + yh);
    ctx.lineTo(xPos, y + yh * (1 - height * 0.6));
    ctx.stroke();

    // Labels.
    let opacity = Math.max(0, Math.min((obj.pixelsPerBar - 2.9) / 2.1, 1.0));
    if (j1 > 1)     opacity = 0;
    if (j1 === 0)   opacity = 1;

    if (opacity > 0.1) {
      ctx.fillStyle = 'rgb(0,0,0)';
      ctx.font = '12px Arial';
      ctx.globalAlpha = opacity;
      ctx.textAlign = 'center';
      ctx.fillText(
        '' + Math.floor(10 * iAdj * obj.itemsPerBar + 0.9) / 10,
        xPos, y + 8);
      ctx.globalAlpha = 1.0;
    }
  }

  /**
   * Ruler as a Jatex component (old Ruler prototype methods).
   * These are used when the ruler is embedded in a math layout.
   */
  static jatex = {
    fns:  '\\ruler',
    name: 'Ruler',

    astOfRuler(ast, node, tokens, i, len) { return i; },

    measureRuler(ctx, prev, ast) {
      // EXTERNAL: Box class
      // const box = new Box();
      // ast.box = box;
      // ast.box.addRight(new Box(300, 20));
      // return ast.box;
    },

    positionRuler(parent, ast, v) {
      // ast.box.move(v);
    },
  };
}

SYS.NODE_CLASSES.push({ name: 'ruler', cls: RulerNode });
