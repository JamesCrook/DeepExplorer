export { Geo };

// Geo — angle and polygon helpers for pips and tiles: normalise, angle difference, polygon vertices

class Geo {
  static PI = Math.PI;
  static TAU = Math.PI * 2;

  static norm(a) { return ((a % Geo.TAU) + Geo.TAU + Geo.PI) % Geo.TAU - Geo.PI; }
  static adiff(a, b) { return Math.abs(Geo.norm(a - b)); }
  static dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
  static dist2(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
  static pipsOpposite(a, b) { return Geo.adiff(a, b) > Geo.PI * 0.85; }

  static verts(n, cx, cy, r, tilt) {
    const v = [];
    for (let i = 0; i < n; i++) {
      const a = tilt + (i * Geo.TAU) / n - Geo.PI;
      v.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return v;
  }

  static pips(n, cx, cy, r, tilt) {
    const vs = Geo.verts(n, cx, cy, r, tilt);
    const p = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const mx = (vs[i].x + vs[j].x) / 2;
      const my = (vs[i].y + vs[j].y) / 2;
      p.push({ x: mx, y: my, out: Math.atan2(my - cy, mx - cx) });
    }
    return p;
  }

  static ptInPoly(px, py, vs) {
    let ins = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      if ((vs[i].y > py) !== (vs[j].y > py) &&
        px < (vs[j].x - vs[i].x) * (py - vs[i].y) / (vs[j].y - vs[i].y) + vs[i].x)
        ins = !ins;
    }
    return ins;
  }
}
