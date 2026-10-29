export { nm2screen, screen2nm, viewBounds };

// nm-coords — the mask editor's coordinates: nanometres (y up) to screen pixels (y down) and back, and the nm rectangle a view shows
/* ─────────────────────────────────────────────────────────────────────────────
params carry zoom, the view centre vx, vy and nmPx, the nanometres per pixel
at zoom 1.
──────────────────────────────────────────────────────────────────────────── */

function nm2screen(nx, ny, params, W, H) {
  const sc = (params.zoom || 1) / (params.nmPx || 10);
  return {
    x: W / 2 + (nx - (params.vx || 0)) * sc,
    y: H / 2 - (ny - (params.vy || 0)) * sc,
  };
}

function screen2nm(sx, sy, params, W, H) {
  const sc = (params.zoom || 1) / (params.nmPx || 10);
  return {
    x: (params.vx || 0) + (sx - W / 2) / sc,
    y: (params.vy || 0) - (sy - H / 2) / sc,
  };
}

function viewBounds(params, W, H) {
  const tl = screen2nm(0, 0, params, W, H);
  const br = screen2nm(W, H, params, W, H);
  return {
    xMin: Math.min(tl.x, br.x), xMax: Math.max(tl.x, br.x),
    yMin: Math.min(tl.y, br.y), yMax: Math.max(tl.y, br.y),
  };
}
