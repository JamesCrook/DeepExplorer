export { DEEP_DEFAULTS, DeepRender, HUBBLE, SPECTRAL, STAR_DEFAULTS, SkyGL, StarRender, magWeight, mixWhite, mulberry32, rgbCss, fieldStarData };

/* ─────────────────────────────────────────────────────────────────────────────
sky-gl — the star and deep-sky look from Constellation Labels, as sprites.

The scene graph draws with a 2D context, one node at a time.  The look is made
by fragment shaders.  This nugget is the bridge: one small offscreen WebGL2
canvas, two programs, and a sprite cache.  A node asks for its sprite and blits
it into the pane's 2D context; it never learns that WebGL exists.

  StarRender.draw(ctx, x, y, star, params)   Moffat core + four spikes + nova shell
  DeepRender.draw(ctx, value, params)        galaxies, nebulae, dark clouds

Both read the current canvas transform, so they work under any camera: in a
pane, on the stock strip, inside the arena.  Stars are screen-sized (their
brightness, not their size, follows zoom); deep objects are world-sized and
gain octaves of detail as they grow on screen, as in the original.

Cost control
  Stars: the sprite depends only on flux, colour and the look, so flux is
  quantised on a log scale and hundreds of field stars share a few dozen
  sprites.  Deep objects: when fully on screen the sprite depends only on size,
  so panning is free; when clipped, only the visible rectangle is rendered,
  which is what lets you zoom deep into one galaxy.

Without WebGL2 every node falls back to a plain dot.  No library is used.
──────────────────────────────────────────────────────────────────────────── */

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const skyHex = h => { const n = parseInt((h || '#888888').slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const mixWhite = (rgb, t) => rgb.map(v => v + (1 - v) * t);
const rgbCss = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const skyClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const skySmooth = (a, b, v) => { const t = skyClamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Magnitude to weight: about 0.72x per magnitude step; fractions allowed. */
const magWeight = mag => 150 * Math.pow(0.72, mag - 1);
const SPECTRAL = { B: skyHex('#9fbfff'), G: skyHex('#ffe3a0'), M: skyHex('#ff9f73'), N: skyHex('#e6fbff') };
const HUBBLE = {
  E0: { arms: 0, bulge: 1 }, E5: { arms: 0, bulge: 1 }, Sa: { arms: 2, pitch: 9, armS: 0.5, bulge: 0.55 },
  Sb: { arms: 2, pitch: 16, armS: 0.7, bulge: 0.35 }, Sc: { arms: 2, pitch: 26, armS: 0.85, bulge: 0.12 },
  SBb: { arms: 2, pitch: 16, armS: 0.7, bulge: 0.35, bar: 0.42 }, Sd: { arms: 4, pitch: 22, armS: 0.55, bulge: 0.06 },
};

const STAR_DEFAULTS = Object.freeze({ starCore: 2.1, spikeLen: 25, spikeGain: 0.9, couple: 0.25, exposure: 1, novaR: 15 });
const DEEP_DEFAULTS = Object.freeze({
  galGain: 1.6, nebGain: 1.6, darkGain: 0.85, resolve: 1.2, deepDetail: 0, palette: 0,
  discScale: 1, clump: 0.7, dust: 0.7, knots: 0.6, warm: 0.3,
  nebScale: 2.2, warp: 0.9, contrast: 1.4, filament: 0.35, oiii: 0.8, illum: 1.2, shell: 0.4, lobes: 0.35,
  pWobble: 0.25, pWaves: 3, pRagged: 0.4, rWobble: 0.15, rWaves: 6, rRagged: 1,
  darkScale: 2.4, darkThresh: 0.55, darkSoft: 0.5, rim: 0.3,
});
const DEEP_KEYS = Object.keys(DEEP_DEFAULTS);

/** A sparse field of faint stars over [-span, span]², plus a few round each galaxy. */
function fieldStarData(rng, gals, n, span) {
  const out = [];
  const push = (x, y, boost = 1) => {
    const t = rng();
    const base = t < 0.5 ? [0.62, 0.72, 1] : t < 0.85 ? [1, 0.9, 0.7] : [1, 0.65, 0.5];
    const bright = rng() < 0.03 ? 6 : 1;
    out.push({ x, y, w: (0.05 + Math.pow(rng(), 2.5) * 1.3) * boost * bright, c: mixWhite(base, 0.3 + rng() * 0.4) });
  };
  for (let k = 0; k < n; k++) push((rng() * 2 - 1) * span, (rng() * 2 - 1) * span);
  for (const g of gals) for (let k = 0; k < 50; k++) {
    const a = rng() * Math.PI * 2, d = g.r * (0.6 + 2.4 * Math.sqrt(rng()));
    push(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d, 1.4);
  }
  return out;
}

/* ── shaders (GLSL ES 3.00; the originals with Three.js's plumbing removed) ── */

const QUAD_VS = `#version 300 es
in vec2 aPos;
uniform float uExt;
uniform vec2 uQ0, uQx, uQy;
out vec2 vP; out vec2 vQ;
void main(){
  vP = aPos * uExt;
  vec2 uv = aPos * 0.5 + 0.5;
  vQ = uQ0 + uv.x * uQx + uv.y * uQy;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const STAR_FS = `#version 300 es
precision highp float;
in vec2 vP; in vec2 vQ;
out vec4 fragColor;
uniform vec3 vColor; uniform float vB, vA, vL, vOn, vNova;
uniform float uSpikeGain, uNovaR;
const float TAU = 6.2831853, BETA = 2.4, CORE_WHITE = 0.55, SPIKE_W = 1.1, CHROMA = 0.35, BAND = 0.2, BAND_FREQ = 0.45;
float spikes(vec2 p, float L, float s){
  if (L <= 0.0) return 0.0;
  float r = length(p), th = atan(p.y, p.x), sec = TAU / 4.0;
  float d = mod(th + sec * 0.5, sec) - sec * 0.5;
  float u = r * cos(d), v = r * sin(d), t = u / (L * s);
  if (t >= 1.0 || u < 0.0) return 0.0;
  float wid = SPIKE_W * (1.0 - 0.55 * t) + 0.25;
  float fall = exp(-3.2 * t) * (1.0 - smoothstep(0.7, 1.0, t));
  float band = 1.0 - BAND * (0.5 - 0.5 * cos(u * BAND_FREQ / s));
  return exp(-(v * v) / (wid * wid)) * fall * band;
}
void main(){
  float r = length(vP);
  float hot = smoothstep(vA * 1.2, 0.0, r);
  float core = (pow(1.0 + (r * r) / (vA * vA), -BETA) + hot * 0.35) * vB;
  vec3 sc = 1.0 + CHROMA * vec3(0.2, 0.0, -0.2);
  float g = vB * vOn * uSpikeGain;
  vec3 ex = g * vec3(spikes(vP, vL, sc.r), spikes(vP, vL, sc.g), spikes(vP, vL, sc.b));
  vec3 col = mix(vColor, vec3(1.0), CORE_WHITE * hot) * core + vColor * ex;
  if (vNova > 0.0) {
    float R = uNovaR, th = atan(vP.y, vP.x);
    float fil = 0.55 + 0.45 * sin(th * 5.0 + 3.0) * sin(th * 3.0 - 1.0);
    float qa = (r - R) / (R * 0.10), qb = (r - R * 1.13) / (R * 0.13);
    col += 0.8 * vNova * vB * fil * (vec3(0.3, 0.95, 0.85) * exp(-qa * qa) * 0.7 + vec3(1.0, 0.35, 0.42) * exp(-qb * qb) * 0.45);
  }
  col = 1.0 - exp(-col * 1.2);
  fragColor = vec4(col, max(col.r, max(col.g, col.b)));
}`;

const DEEP_FS = `#version 300 es
precision highp float; precision highp int;
in vec2 vP; in vec2 vQ;
out vec4 fragColor;
uniform float vType, vSeed, vGain, vPpu, vAxis;
uniform vec4 vM, vM2;
uniform float uTime, uOctBias, uPalette, uPass, uResolve;
uniform float uGalGain, uDiscScale, uClump, uDust, uKnots, uWarm;
uniform float uNebGain, uNebScale, uWarp, uContrast, uFilament, uOiii, uIllum, uShell, uLobes;
uniform float uPWobble, uPWaves, uPRagged, uRWobble, uRWaves, uRRagged;
uniform float uDarkGain, uDarkScale, uDarkThresh, uDarkSoft, uRim;
const float TAU = 6.2831853;

uint SEED;
uint hash2u(uvec2 v){
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u;
  return v.x ^ v.y;
}
float rnd(vec2 i, uint salt){ return float(hash2u(uvec2(ivec2(i)) + uvec2(SEED * 3u + salt, salt * 31u + SEED))) * 2.3283064e-10; }
vec2 grad(vec2 i){ float a = float(hash2u(uvec2(ivec2(i)) + uvec2(SEED, SEED * 7u))) * 1.4629180e-9; return vec2(cos(a), sin(a)); }
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grad(i), f), b = dot(grad(i + vec2(1, 0)), f - vec2(1, 0));
  float c = dot(grad(i + vec2(0, 1)), f - vec2(0, 1)), d = dot(grad(i + vec2(1, 1)), f - vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.4;
}
const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
float fbm(vec2 p, float octs){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 15; i++) {
    float fi = float(i); if (fi >= octs) break;
    s += a * clamp(octs - fi, 0.0, 1.0) * gnoise(p);
    p = ROT * p * 2.02 + vec2(1.7, 9.2); a *= 0.5;
  }
  return s;
}
float ridge(vec2 p, float octs){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 15; i++) {
    float fi = float(i); if (fi >= octs) break;
    float n = 1.0 - abs(gnoise(p));
    s += a * clamp(octs - fi, 0.0, 1.0) * n * n;
    p = ROT * p * 2.02 + vec2(5.3, 1.1); a *= 0.5;
  }
  return s;
}
float undulate(float th, float waves){
  float n = max(1.0, floor(waves + 0.5));
  float p1 = rnd(vec2(1.0), 501u) * TAU, p2 = rnd(vec2(2.0), 502u) * TAU, p3 = rnd(vec2(3.0), 503u) * TAU;
  return (sin(n * th + p1) + 0.5 * sin((n + 1.0) * th + p2) + 0.3 * sin((n + 2.0) * th + p3)) / 1.8;
}
float cascade(vec2 p, float octs, float a){
  float m = 1.0;
  for (int i = 0; i < 15; i++) {
    float fi = float(i); if (fi >= octs) break;
    m *= 1.0 + a * clamp(octs - fi, 0.0, 1.0) * gnoise(p);
    p = ROT * p * 2.02 + vec2(3.1, 7.7);
  }
  return max(m, 0.0);
}
float octsFor(float f){ return clamp(log2(max(vPpu * f, 1.0) / 3.0) + uOctBias, 1.0, 15.0); }
float edgeFade(float r, float a, float b){ return 1.0 - smoothstep(a, b, r); }
float knotField(vec2 q, float freq){
  vec2 g = q * freq, cell = floor(g);
  if (rnd(cell, 401u) > 0.3) return 0.0;
  vec2 pos = cell + 0.25 + 0.5 * vec2(rnd(cell, 402u), rnd(cell, 403u));
  float d = length(g - pos) / (0.12 + 0.18 * rnd(cell, 404u));
  return exp(-d * d) * (0.5 + rnd(cell, 405u));
}
vec2 nq(vec2 q){ return vec2(q.x, q.y * vAxis) / pow(vAxis, 0.6); }
vec3 palette(float ha, float o, float s){
  vec3 tint = vM2.yzw;
  bool hasTint = dot(tint, tint) > 0.0;
  if (hasTint && (vM.w > 0.5 || uPalette > 1.5)) return tint * ha + mix(tint, vec3(1.0), 0.6) * o * 0.9;
  if (uPalette > 0.5 && uPalette < 1.5) return vec3(0.95, 0.72, 0.28) * ha + vec3(0.2, 0.55, 1.0) * o + vec3(1.0, 0.35, 0.18) * s * 0.6;
  return vec3(1.0, 0.22, 0.32) * ha + vec3(0.18, 0.85, 0.8) * o + vec3(0.6, 0.12, 0.15) * s * 0.3;
}
vec3 spiral(vec2 q){
  float arms = vM.x, pitch = radians(max(vM.y, 3.0)), armS = vM.z, bulgeF = vM.w, bar = vM2.x;
  float r = length(q), th = atan(q.y, q.x), oc = octsFor(3.0);
  float rb = 0.1 + 0.3 * bulgeF;
  float bulge = exp(-4.0 * sqrt(r / rb)) * (0.5 + 2.0 * bulgeF) * 2.2;
  float disc = exp(-r / (0.28 * uDiscScale)) * (1.0 - 0.85 * bulgeF) * 1.5;
  float barI = bar > 0.0 ? exp(-pow(q.x / bar, 2.0) * 1.5 - pow(q.y / (bar * 0.22), 2.0)) * 0.9 : 0.0;
  float armPat = 0.0, dustPat = 0.0, armMod = 1.0;
  if (arms > 0.5) {
    float rr = max(r, bar * 0.9 + 0.03);
    float phase = arms * (th - log(rr) / tan(pitch)) + uTime * 0.03 + 0.7 * fbm(q * 2.5 + 4.0, min(oc, 4.0));
    armPat = pow(0.5 + 0.5 * cos(phase), 1.5 + 5.0 * armS);
    dustPat = pow(0.5 + 0.5 * cos(phase + 0.85), 5.0 + 6.0 * armS);
    float inner = smoothstep(bar * 0.8, bar * 0.8 + 0.15, r);
    armMod = mix(1.0, 0.25 + 2.3 * armPat, armS * inner);
    dustPat *= inner;
  }
  float clump = clamp(1.0 + uClump * 0.6 * fbm(q * 5.0 + 2.0, min(oc, 3.0)), 0.2, 2.0) * cascade(q * 6.0 + 2.0, octsFor(6.0 / 8.0), 0.32 * uClump);
  float lumDisc = disc * armMod * clump;
  float kn = 0.0;
  if (uKnots > 0.0 && arms > 0.5) kn = knotField(q, 16.0) * armPat * disc * 4.0 * uKnots * smoothstep(0.15, 0.4, r);
  vec3 warm = mix(vec3(1.0, 0.88, 0.7), vec3(1.0, 0.72, 0.48), uWarm);
  vec3 blue = vec3(0.6, 0.75, 1.0);
  vec3 col = warm * (bulge + barI) + mix(warm, blue, clamp(armPat * 1.3 + 0.2 * (1.0 - bulgeF), 0.0, 1.0)) * lumDisc + vec3(1.0, 0.42, 0.62) * kn;
  float dust = dustPat * uDust * smoothstep(1.0, 0.2, r) * min(cascade(q * 8.0 + 3.0, octsFor(8.0 / 8.0), 0.4), 2.5);
  float h = q.y * vAxis;
  float lane = uDust * exp(-pow(h / 0.03, 2.0)) * (1.0 - smoothstep(0.3, 0.7, vAxis)) * smoothstep(1.05, 0.3, r)
             * (1.0 - 0.8 * bulgeF) * (0.7 + 0.5 * fbm(q * 7.0, oc - 1.0)) * mix(1.0, 0.55, step(0.0, q.y));
  col *= 1.0 - clamp(dust * 0.85 + lane, 0.0, 0.95);
  return max(col, 0.0) * edgeFade(r, 1.1, 1.55) * uGalGain * vGain;
}
vec3 irregular(vec2 q){
  float oc = octsFor(2.0);
  vec2 w = q + 0.35 * vec2(fbm(q * 1.6 + 1.3, 3.0), fbm(q * 1.6 + 8.1, 3.0));
  float r = length(w), env = exp(-r * r * 2.2);
  float d = clamp(0.55 + 0.7 * fbm(w * 2.2, min(oc, 4.0)), 0.0, 1.5) * env * cascade(w * 4.0 + 1.0, octsFor(4.0 / 8.0), 0.35);
  float kn = knotField(q, 9.0) * d * uKnots * 2.6;
  vec3 col = mix(vec3(1.0, 0.9, 0.75), vec3(0.65, 0.8, 1.0), 0.6) * d * 1.5 + vec3(1.0, 0.45, 0.65) * kn;
  return col * edgeFade(length(q), 1.1, 1.45) * uGalGain * vGain;
}
vec2 warped(vec2 p, float oc, float amt){
  return p + amt * vec2(fbm(p * 0.7 + vec2(1.7, 9.2), min(oc, 6.0)), fbm(p * 0.7 + vec2(8.3, 2.8), min(oc, 6.0)));
}
vec3 emission(vec2 q){
  float oc = octsFor(uNebScale);
  vec2 w = warped(nq(q) * uNebScale + uTime * 0.02, oc, uWarp);
  float r = length(q), env = exp(-r * r * 2.6);
  float rid = ridge(w * 1.3 + 5.0, oc);
  float ha = clamp(0.5 + 0.75 * fbm(w, oc) + (env - 0.55) * 1.4, 0.0, 1.0);
  ha = pow(ha, uContrast) * env;
  ha = mix(ha, ha * rid * 2.2, uFilament) * cascade(w * 2.0 + 2.0, octsFor(uNebScale / 4.0), 0.28);
  float o = clamp(0.5 + 0.7 * fbm(w * 0.8 + 11.0, oc - 1.0) + (env - 0.4) * 1.6, 0.0, 1.0);
  o = pow(o, uContrast * 1.2) * exp(-r * r * 5.0) * uOiii * (1.0 - vM.z);
  float s = clamp(ha * (0.6 + 0.8 * rid) - 0.1, 0.0, 1.0);
  float illum = 1.0 + uIllum * exp(-r * r * 14.0) * (1.0 - vM.z);
  return palette(ha, o, s) * illum * edgeFade(r, 1.1, 1.45) * uNebGain * vGain;
}
vec3 reflection(vec2 q){
  float f = uNebScale * 0.8, oc = octsFor(f);
  vec2 w = warped(nq(q) * f + uTime * 0.015, oc, uWarp * 0.6);
  float r = length(q);
  float d = clamp(0.5 + 0.6 * fbm(w, min(oc, 5.0)), 0.0, 1.0) * exp(-r * 1.8) * 1.3 * cascade(w * 2.0 + 4.0, octsFor(f / 4.0), 0.22);
  vec3 tint = dot(vM2.yzw, vM2.yzw) > 0.0 && uPalette > 1.5 ? mix(vM2.yzw, vec3(0.45, 0.62, 1.0), 0.5) : vec3(0.45, 0.62, 1.0);
  return tint * d * edgeFade(r, 1.1, 1.45) * uNebGain * vGain;
}
float darkMask(vec2 q){
  float f = uDarkScale, oc = octsFor(f);
  vec2 w = warped(nq(q) * f, oc, uWarp * 0.8);
  float r = length(q), env = exp(-r * r * 2.2);
  float v = 0.5 + 0.6 * fbm(w, min(oc, 5.0)) + (env - 0.5) * 1.5 + 0.3 * log(max(cascade(w * 2.0 + 6.0, octsFor(f / 4.0), 0.35), 0.05));
  return smoothstep(uDarkThresh - 0.5 * uDarkSoft, uDarkThresh + 0.1 + 0.5 * uDarkSoft, v) * edgeFade(r, 0.8, 1.4);
}
vec3 planetary(vec2 q){
  float r = length(q), th = atan(q.y, q.x), oc = octsFor(4.0);
  float n = fbm(nq(q) * 4.0 + 3.0, oc);
  float R = 0.55 * (1.0 + 0.25 * uPRagged * n + 0.3 * uPWobble * undulate(th, uPWaves));
  float sw = 0.05 + 0.08 * uShell;
  float lobes = 1.0 + uLobes * cos(2.0 * th);
  float o = exp(-pow((r - R * 0.88) / sw, 2.0)) * 0.9 + smoothstep(R, 0.0, r) * 0.28;
  float ha = exp(-pow((r - R) / (sw * 1.2), 2.0)) * lobes;
  float halo = exp(-pow((r - R * 1.5) / 0.18, 2.0)) * 0.08 * (0.6 + 0.4 * n);
  vec3 col = palette(ha + halo, o, ha * 0.5) * (0.8 + 0.4 * n);
  return col * smoothstep(5.0, 18.0, vPpu) * edgeFade(r, 1.1, 1.45) * uNebGain * vGain * 1.4;
}
vec3 remnant(vec2 q){
  float r = length(q), oc = octsFor(6.0);
  vec2 w = warped(q * 3.0, oc, 0.5);
  float n = fbm(w, oc);
  float R = 0.72 * (1.0 + 0.3 * uRRagged * n + 0.3 * uRWobble * undulate(atan(q.y, q.x), uRWaves)), sw = 0.08 + 0.12 * uShell;
  float rid = ridge(w * 2.0, oc); rid = rid * rid * 2.5;
  float ha = exp(-pow((r - R) / sw, 2.0)) * rid + 0.06 * smoothstep(R, 0.0, r) * (0.5 + n);
  float o = exp(-pow((r - R * 0.92) / (sw * 0.8), 2.0)) * ridge(w * 2.6 + 9.0, oc) * 1.2;
  return palette(ha, o * 0.8, ha * 0.6) * edgeFade(r, 1.1, 1.45) * uNebGain * vGain * 1.3;
}
float resolved(vec2 q, float lum){
  if (lum <= 0.002) return 0.0;
  float Lt = log2(vPpu / 8.0), acc = 0.0;
  for (int i = 0; i < 10; i++) {
    float l = floor(Lt) + 1.0 - float(i);
    if (l < 3.0) break;
    float cs = exp2(-l);
    vec2 g = q / cs, cell = floor(g);
    uint salt = uint(l) * 977u;
    if (rnd(cell, salt + 11u) > lum * 0.4) continue;
    vec2 pos = cell + 0.2 + 0.6 * vec2(rnd(cell, salt + 12u), rnd(cell, salt + 13u));
    float dpx = length(g - pos) * cs * vPpu;
    float b = min(2.0, pow(rnd(cell, salt + 14u), 2.0) * pow(0.7, l - Lt + 4.0) * 3.0);
    float fade = i == 0 ? fract(Lt) : 1.0;
    acc += b * fade * exp(-dpx * dpx / 1.1);
  }
  return acc;
}
void main(){
  SEED = uint(vSeed * 65535.0) + 1u;
  vec2 q = vQ;
  int t = int(vType + 0.5);
  if (uPass > 0.5) {
    float m = darkMask(q), a = m * uDarkGain * vGain;
    if (uPass < 1.5) { fragColor = vec4(0.0, 0.0, 0.0, clamp(a, 0.0, 0.97)); return; }
    vec3 c = vec3(1.0, 0.62, 0.4) * m * (1.0 - m) * 4.0 * uRim * 0.3 * vGain;
    c = 1.0 - exp(-c);
    fragColor = vec4(c, max(c.r, max(c.g, c.b))); return;
  }
  vec3 col;
  if (t == 0) col = spiral(q);
  else if (t == 1) col = irregular(q);
  else if (t == 2) col = emission(q);
  else if (t == 3) col = reflection(q);
  else if (t == 5) col = planetary(q);
  else if (t == 6) col = remnant(q);
  else col = vec3(0.0);
  col = max(col, 0.0);
  float lum = clamp(dot(col, vec3(0.3, 0.5, 0.2)) * 1.4, 0.0, 1.0);
  float rg = (t <= 1 ? 1.0 : 0.35) * uResolve, rf = smoothstep(150.0, 900.0, vPpu);
  if (rg > 0.0 && rf > 0.0) {
    float st = resolved(q, lum) * rg * rf;
    vec3 hue = (col + 0.02) / max(max(col.r, max(col.g, col.b)), 0.02);
    col = col * (1.0 - 0.35 * rf * min(rg, 1.0)) + mix(hue, vec3(1.0), 0.5) * st;
  }
  col = 1.0 - exp(-col);
  fragColor = vec4(col, max(col.r, max(col.g, col.b)));
}`;

/** Least-recently-used map of sprite canvases. */
class SpriteLRU {
  constructor(cap) { this.cap = cap; this.m = new Map(); this.hits = 0; this.misses = 0; }
  get(k) {
    const v = this.m.get(k);
    if (v) { this.m.delete(k); this.m.set(k, v); this.hits++; } else this.misses++;
    return v;
  }
  set(k, v) { this.m.set(k, v); if (this.m.size > this.cap) this.m.delete(this.m.keys().next().value); }
  clear() { this.m.clear(); }
}

class SkyGL {
  static MAX = 2048;
  static ok = null;            // null until first use, then true / false
  static starCache = new SpriteLRU(3000);
  static deepCache = new SpriteLRU(80);

  static init() {
    if (SkyGL.ok !== null) return SkyGL.ok;
    SkyGL.ok = false;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
      if (!gl) return false;
      SkyGL.canvas = canvas; SkyGL.gl = gl;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      SkyGL.progs = { star: SkyGL._program(QUAD_VS, STAR_FS, buf), deep: SkyGL._program(QUAD_VS, DEEP_FS, buf) };
      SkyGL.ok = !!(SkyGL.progs.star && SkyGL.progs.deep);
    } catch (e) { console.warn('sky-gl: WebGL2 unavailable', e); }
    return SkyGL.ok;
  }

  static _program(vsSrc, fsSrc, buf) {
    const gl = SkyGL.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('sky-gl shader:', gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, vsSrc), fs = sh(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('sky-gl link:', gl.getProgramInfoLog(p)); return null; }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { p, vao, locs: new Map() };
  }

  /** Render one quad of w×h device pixels and return a 2D canvas copy of it. */
  static render(name, w, h, uniforms) {
    const gl = SkyGL.gl, pr = SkyGL.progs[name], cv = SkyGL.canvas;
    if (cv.width < w || cv.height < h) {
      cv.width = Math.min(SkyGL.MAX, Math.max(cv.width, w));
      cv.height = Math.min(SkyGL.MAX, Math.max(cv.height, h));
    }
    gl.useProgram(pr.p);
    gl.bindVertexArray(pr.vao);
    for (const k in uniforms) {
      let loc = pr.locs.get(k);
      if (loc === undefined) { loc = gl.getUniformLocation(pr.p, k); pr.locs.set(k, loc); }
      if (loc === null) continue;
      const v = uniforms[k];
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2fv(loc, v);
      else if (v.length === 3) gl.uniform3fv(loc, v);
      else gl.uniform4fv(loc, v);
    }
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, w, h);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(cv, 0, cv.height - h, w, h, 0, 0, w, h);
    return out;
  }
}

/* ── stars ─────────────────────────────────────────────────────────────── */

class StarRender {
  /** The vertex-shader arithmetic of the original, in JS, in CSS pixels. */
  static look(flux, fI, mag, p, knee, nova) {
    const on = 1 - skySmooth(3.7, 4.7, mag);
    const L = Math.min(260, p.spikeLen * Math.pow(fI / 150, 0.9)) * on;
    const a = skyClamp(p.starCore * (0.5 + 0.12 * Math.sqrt(flux)), 0.5, 6);
    const B = flux / (flux + knee);
    let ext = B > 0.003 ? a * Math.sqrt(Math.pow(0.003 / B, -1 / 2.4) - 1) : a;
    ext = Math.max(skyClamp(Math.max(ext, 2 * a), 1, 220), L * 1.25);
    if (nova) ext = Math.max(ext, p.novaR * 1.6);
    return { on, L, a, B, ext: ext + 2 };
  }

  static colourOf(star) {
    if (star.rgb) return star.rgb;
    if (star.color) return skyHex(star.color);
    return mixWhite(SPECTRAL[star.cls] || SPECTRAL.G, 0.25);
  }

  /** Draw a star centred on world (x, y).  Returns { coreR } in CSS px, or null when culled. */
  static draw(ctx, x, y, star, params) {
    const p = { ...STAR_DEFAULTS, ...params };
    const M = ctx.getTransform(), D = Math.hypot(M.a, M.b) || 1, dpr = window.devicePixelRatio || 1, z = D / dpr;
    const cx = M.a * x + M.c * y + M.e, cy = M.b * x + M.d * y + M.f;
    const mag = star.mag ?? 3, knee = star.knee ?? 20, nova = !!star.nova;
    // Quantise brightness on a log scale so neighbouring stars share sprites.
    // The grid is absolute, so after a zoom step most needed sprites already exist.
    const q = v => Math.exp(Math.round(Math.log(Math.max(v, 1e-4)) * 8) / 8);
    const flux = q(star.weight * z * p.exposure), fI = q(star.weight * p.exposure * Math.pow(z, p.couple));
    const lk = StarRender.look(flux, fI, mag, p, knee, nova);
    const coreR = lk.a * 1.4;
    let S = Math.ceil(2 * lk.ext * dpr);
    if (S > 1024) S = 1024;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (cx + S / 2 < 0 || cy + S / 2 < 0 || cx - S / 2 > W || cy - S / 2 > H) return { coreR, z };
    if (lk.B < 0.004 && !nova) return { coreR, z };

    if (!SkyGL.init()) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = Math.min(1, lk.B * 3); ctx.fillStyle = rgbCss(StarRender.colourOf(star));
      ctx.beginPath(); ctx.arc(cx, cy, coreR * dpr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      return { coreR, z };
    }
    const rgb = StarRender.colourOf(star).map(v => Math.round(v * 10) / 10);
    const key = ['S', flux.toFixed(5), fI.toFixed(5), lk.on.toFixed(2), rgb.join(','), nova ? 1 : 0, knee,
                 p.starCore, p.spikeLen, p.spikeGain, p.novaR, S, dpr].join('|');
    let sprite = SkyGL.starCache.get(key);
    if (!sprite) {
      sprite = SkyGL.render('star', S, S, {
        uExt: S / (2 * dpr), vColor: rgb, vB: lk.B, vA: lk.a, vL: lk.L, vOn: lk.on, vNova: nova ? 1 : 0,
        uSpikeGain: p.spikeGain, uNovaR: p.novaR,
      });
      SkyGL.starCache.set(key, sprite);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sprite, cx - S / 2, cy - S / 2);
    ctx.restore();
    return { coreR, z };
  }
}

/* ── galaxies and nebulae ──────────────────────────────────────────────── */

const DEEP_TYPE = { spiral: 0, irregular: 1, emission: 2, reflection: 3, dark: 4, planetary: 5, remnant: 6 };

class DeepRender {
  /** Draw a deep-sky object.  v: { x, y, r, rot (deg), axis, type, seed, gain,
   *  arms, pitch, armS, bulge, bar, tint }. */
  static draw(ctx, v, params) {
    const p = { ...DEEP_DEFAULTS, ...params };
    const type = DEEP_TYPE[v.type] ?? 0;
    const M = ctx.getTransform(), D = Math.hypot(M.a, M.b) || 1, dpr = window.devicePixelRatio || 1;
    const x = v.x || 0, y = v.y || 0, r = Math.max(1, v.r || 40), axis = skyClamp(v.axis ?? 1, 0.05, 1);
    const rot = (v.rot || 0) * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot);
    const cx = M.a * x + M.c * y + M.e, cy = M.b * x + M.d * y + M.f;
    const e = type <= 1 ? 1.6 : 1.45;
    const hw = e * r * D * (Math.abs(c) + axis * Math.abs(s)), hh = e * r * D * (Math.abs(s) + axis * Math.abs(c));
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (cx + hw < 0 || cy + hh < 0 || cx - hw > W || cy - hh > H) return;
    if (r * D < 1.5) return;

    if (!SkyGL.init()) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = type === 4 ? 'rgba(0,0,0,0.5)' : 'rgba(180,170,220,0.12)';
      ctx.beginPath(); ctx.ellipse(cx, cy, r * D, r * D * axis, rot, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      return;
    }

    // Which device rectangle to render: the whole sprite when it is on screen, else the visible part.
    const full = cx - hw >= 0 && cy - hh >= 0 && cx + hw <= W && cy + hh <= H && 2 * hw <= SkyGL.MAX && 2 * hh <= SkyGL.MAX;
    let x0, y0, w, h, rectKey;
    if (full) {
      w = Math.ceil(2 * hw); h = Math.ceil(2 * hh); x0 = cx - w / 2; y0 = cy - h / 2;
      rectKey = w + 'x' + h;
    } else {
      x0 = Math.max(0, Math.floor(cx - hw)); y0 = Math.max(0, Math.floor(cy - hh));
      w = Math.min(W, Math.ceil(cx + hw)) - x0; h = Math.min(H, Math.ceil(cy + hh)) - y0;
      if (w <= 0 || h <= 0) return;
      rectKey = [x0, y0, w, h, Math.round(cx * 4), Math.round(cy * 4)].join(',');
    }
    const down = Math.min(1, SkyGL.MAX / Math.max(w, h));
    const rw = Math.max(1, Math.ceil(w * down)), rh = Math.max(1, Math.ceil(h * down));

    // Device pixel -> object space q (pre-rotation, pre-squash, in radii).
    const Q = (px, py) => {
      const dx = (px - cx) / D, dy = (py - cy) / D;
      const lx = c * dx + s * dy, ly = -s * dx + c * dy;
      return [lx / r, ly / (r * axis)];
    };
    const q0 = Q(x0, y0 + h), qx = Q(x0 + w, y0 + h), qy = Q(x0, y0);
    const uQ0 = q0, uQx = [qx[0] - q0[0], qx[1] - q0[1]], uQy = [qy[0] - q0[0], qy[1] - q0[1]];

    const g = HUBBLE[v.hubble] || {};
    const pick = (k, d) => v[k] ?? g[k] ?? d;
    const tint = v.tint ? skyHex(v.tint) : [0, 0, 0];
    const vM = type === 0
      ? [pick('arms', 0), pick('pitch', 15), pick('armS', 0), pick('bulge', 0.4)]
      : [0, 15, v.unlit ? 1 : 0, v.tint && v.forceTint !== false ? 1 : 0];
    const ppu = r * D / dpr;
    const uniforms = {
      uQ0, uQx, uQy, uExt: 1,
      vType: type, vSeed: ((v.seed ?? 1) * 0.61803) % 1, vGain: v.gain ?? 1, vPpu: ppu, vAxis: axis,
      vM, vM2: [pick('bar', 0), ...tint],
      uTime: 0, uOctBias: p.deepDetail + Math.log2(dpr * down), uPalette: +p.palette || 0, uResolve: p.resolve,
      uGalGain: p.galGain, uDiscScale: p.discScale, uClump: p.clump, uDust: p.dust, uKnots: p.knots, uWarm: p.warm,
      uNebGain: p.nebGain, uNebScale: p.nebScale, uWarp: p.warp, uContrast: p.contrast, uFilament: p.filament,
      uOiii: p.oiii, uIllum: p.illum, uShell: p.shell, uLobes: p.lobes,
      uPWobble: p.pWobble, uPWaves: p.pWaves, uPRagged: p.pRagged, uRWobble: p.rWobble, uRWaves: p.rWaves, uRRagged: p.rRagged,
      uDarkGain: p.darkGain, uDarkScale: p.darkScale, uDarkThresh: p.darkThresh, uDarkSoft: p.darkSoft, uRim: p.rim,
    };
    const objKey = [type, r, rot, axis, v.seed, v.gain, ...vM, ...uniforms.vM2, ppu.toFixed(3), dpr].join(',');
    const parKey = DEEP_KEYS.map(k => p[k]).join(',');
    const passes = type === 4
      ? [[1, 'source-over'], ...(p.rim > 0 ? [[2, 'lighter']] : [])]
      : [[0, 'lighter']];

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const [pass, op] of passes) {
      const key = ['D', pass, rectKey, rw, rh, objKey, parKey].join('|');
      let sprite = SkyGL.deepCache.get(key);
      if (!sprite) {
        sprite = SkyGL.render('deep', rw, rh, { ...uniforms, uPass: pass });
        SkyGL.deepCache.set(key, sprite);
      }
      ctx.globalCompositeOperation = op;
      ctx.drawImage(sprite, x0, y0, w, h);
    }
    ctx.restore();
  }
}
