export { HIGHLIGHT, roundRectPath, rrPath };

/* ─────────────────────────────────────────────────────────────────────────────
paint — canvas paths and the highlight colour.  No scene-graph knowledge.
(The colour arithmetic that was here is in colour/colour.js.)

These were strays: the colour helpers lived at the foot of model-utils, where a
builder facade had quietly become a helper bag, and rrPath/HIGHLIGHT lived in
zone-support, which existed for no other reason.  Both homes are now here.

roundRectPath takes one radius, rrPath takes four.  They are near-duplicates and
sit next to each other so that stays visible.
──────────────────────────────────────────────────────────────────────────── */

const HIGHLIGHT = '#daa02e';

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
