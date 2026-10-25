/**
 * mol-primitives.js
 *
 * Shared drawing functions for molecular scene nodes.
 * All take a canvas 2d context as the first argument.
 */

function drawLabel(ctx, x, y, text, color, size) {
  ctx.font = `${size || 11}px Menlo, monospace`;
  ctx.fillStyle = color || '#8b949e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawArrow(ctx, x1, y1, x2, y2, color,
                   { lineWidth = 2, headLen = 6, headAng = 0.4 } = {}) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(a - headAng), y2 - headLen * Math.sin(a - headAng));
  ctx.lineTo(x2 - headLen * Math.cos(a + headAng), y2 - headLen * Math.sin(a + headAng));
  ctx.fill();
}

function drawCircle(ctx, { x, y, r, fill, stroke, strokeWidth = 1.5,
                           glowRadius = 0, glowColor }) {
  if (glowRadius > 0 && glowColor) {
    const grd = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
    grd.addColorStop(0, glowColor);
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, glowRadius, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.stroke(); }
}

function drawRoundRect(ctx, { x, y, w, h, radius = 6, fill, stroke, strokeWidth = 1.5 }) {
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, radius);
  if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.stroke(); }
}

function drawDashedLine(ctx, { x1, y1, x2, y2, color, lineWidth = 2, dash = [4, 5] }) {
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
}

export { drawLabel, drawArrow, drawCircle, drawRoundRect, drawDashedLine };
