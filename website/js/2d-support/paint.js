export { HIGHLIGHT, hexToRgb, hexToRgba, roundRectPath, rrPath, shiftColor };

/* ─────────────────────────────────────────────────────────────────────────────
paint — colour arithmetic and canvas paths.  No scene-graph knowledge.

These were strays: the colour helpers lived at the foot of model-utils, where a
builder facade had quietly become a helper bag, and rrPath/HIGHLIGHT lived in
zone-support, which existed for no other reason.  Both homes are now here.

roundRectPath takes one radius, rrPath takes four.  They are near-duplicates and
sit next to each other so that stays visible.
──────────────────────────────────────────────────────────────────────────── */

const HIGHLIGHT = '#daa02e';

function hexToRgb(hex) {
  hex = (hex || '#888888').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length === 8) hex = hex.slice(0, 6);
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function hexToRgba(hex, alpha) {
  hex = (hex || '#888888').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length === 8) hex = hex.slice(0, 6);
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function shiftColor({ r, g, b }, amt) {
  const f = v => Math.round(Math.min(255, Math.max(0, amt > 0 ? v + (255 - v) * amt : v + v * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  else {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
}

function rrPath(ctx, x, y, w, h, rtl, rtr, rbr, rbl) {
  ctx.beginPath();
  ctx.moveTo(x + rtl, y); ctx.lineTo(x + w - rtr, y);
  ctx.arcTo(x + w, y, x + w, y + rtr, rtr); ctx.lineTo(x + w, y + h - rbr);
  ctx.arcTo(x + w, y + h, x + w - rbr, y + h, rbr); ctx.lineTo(x + rbl, y + h);
  ctx.arcTo(x, y + h, x, y + h - rbl, rbl); ctx.lineTo(x, y + rtl);
  ctx.arcTo(x, y, x + rtl, y, rtl); ctx.closePath();
}
