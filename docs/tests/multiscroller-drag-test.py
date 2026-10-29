# Drag the multiscroller in OmniScene's Drinks chart, straight and bent both ways; check sync, tracking, clipping
"""multiscroller-drag-test.py — drag a column of the Drinks tree chart in
headless Chromium, straight and bent on both axes, and check what was drawn.

    python3 docs/tests/multiscroller-drag-test.py [-v]

Needs Python Playwright with Chromium.  three.js is stubbed (the chart is 2D),
so it runs without the network.  Exit status 1 if any check fails; -v prints
every step.

It wraps StackNode._positionChild to record, each frame, every item each
column drew: cursor, label, position and size along the column, the clip
interval, and the cell centre on screen (the column's path at the cell's
middle t, which lies inside the cell however curved it is).  The numbers come
from what was drawn, not from the orchestrator's own state.

A case selects an item in the first column, presses on an item in the second
column, and moves the pointer along that column's own path (sampled from the
path object, so a ring or a fan is followed, not its tangent).  Checks:

  sync      after every step, each column's focal block (the active item's
            ancestor, or its descendants) sits at the same ratio of that
            column's own travel: top / (viewport - block size).  Columns
            move at different speeds, even opposite ways, to keep this.
            Ratios are compared clamped to [0, 1]: the dragged column may
            overscroll past an end, and the others then stop at it.
  tracking  the grabbed item stays under the pointer (gap in page px).
  clipping  no column draws an item wholly outside its clip interval.

Sync is checked where every focal block is drawn whole; tracking where the
grabbed item is drawn (it can leave the end of its column, legitimately).
Bends: `bend` fans the columns into a pie, `bendStack` curls each column into
a ring (the donut axis).  Where columns overlap (bend 3 with Tea open, say)
a press can land on another column; the cases here avoid that.
"""
import math, os, re, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 8769
VERBOSE = '-v' in sys.argv   # CASE=2,5 runs only those cases (1-based)
TRACK_PX, SYNC_TOL = 2.5, 0.01

#        param       value  drag  select   grab
CASES = [('bend',      0,    300, 'Coffee', 'Filter Coffee'),
         ('bend',      0,    400, 'Tea',    'Filter Coffee'),   # Items block taller than the column: it moves against the drag
         ('bend',      0,   -150, 'Tea',    'Herbal Tea'),
         ('bend',      0.75, 300, 'Coffee', 'Filter Coffee'),
         ('bend',      1.5,  300, 'Coffee', 'Filter Coffee'),
         ('bend',      3.0,  300, 'Coffee', 'Filter Coffee'),
         ('bend',      6.28, 200, 'Coffee', 'Filter Coffee'),   # full pie
         ('bendStack', 0.25, 300, 'Coffee', 'Filter Coffee'),
         ('bendStack', 0.5,  300, 'Coffee', 'Filter Coffee'),
         ('bendStack', 0.5,  300, 'Tea',    'Filter Coffee'),
         ('bendStack', 0.75, 300, 'Coffee', 'Filter Coffee'),
         ('bendStack', 1.0,  500, 'Coffee', 'Filter Coffee')]   # full ring, past the seam

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

threading.Thread(target=lambda: http.server.ThreadingHTTPServer(
    ('127.0.0.1', PORT), functools.partial(Quiet, directory=os.path.join(REPO, 'website'))).serve_forever(),
    daemon=True).start()

def three_stub():
    """Every name the repo imports from three, each a do-anything proxy (as pages-smoke.py)."""
    names = set()
    for d, _, files in os.walk(os.path.join(REPO, 'website')):
        for f in files:
            if f.endswith(('.js', '.html')):
                t = open(os.path.join(d, f), encoding='utf-8', errors='replace').read()
                for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*['\"](?:three|https://unpkg[^'\"]*three)[^'\"]*['\"]", t):
                    names |= {n.split(' as ')[0].strip() for n in m.group(1).split(',') if n.strip()}
                names |= set(re.findall(r'\bTHREE\.([A-Za-z_]\w*)', t))
    body = ("const mk = () => new Proxy(function () {}, { get: (t, k) => k === 'then' ? undefined : "
            "k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? [][Symbol.iterator] : "
            "k === 'domElement' ? document.createElement('canvas') : mk(), "
            "construct: () => mk(), apply: () => mk(), set: () => true });\n")
    body += ''.join(f'export const {n} = mk();\n' for n in sorted(names) if n.isidentifier())
    return body + 'export default mk();\n'

SPY = r"""async ([param, value]) => {
  const ms = await import('/js/nodes2d/multiscroller-nodes.js');
  const sn = await import('/js/nodes2d/omni-scene-nodes.js');
  const S = ms.StackNode, L = sn.LayerNode;
  window.__cols = {}; window.__paths = {};
  const origLayer = L.before_draw2d;
  L.before_draw2d = function (ctxMix, node, params) {
    if (node.value?.name === 'Chart') { window.__layer = node; window.__cols = {}; }
    return origLayer.call(this, ctxMix, node, params);
  };
  const orig = S._positionChild;
  S._positionChild = function (ctxMix, node, child) {
    const r = orig.call(this, ctxMix, node, child);
    const it = ctxMix.iterators.at(-1), inst = node.inst;
    if (inst?.panelIdx == null || !it?.cursor) return r;
    window.__orch = ctxMix.coordinator?.orch;
    const m = ctxMix.ctx.getTransform(), dpr = window.devicePixelRatio || 1;
    const br = ctxMix.ctx.canvas.getBoundingClientRect();
    const toPage = p => ({ x: br.left + (m.a * p.x + m.c * p.y + m.e) / dpr, y: br.top + (m.b * p.x + m.d * p.y + m.f) / dpr });
    window.__paths[inst.panelIdx] = { path: node._path, toPage };
    const col = (window.__cols[inst.panelIdx] ??= { clipMin: it.clipMin, clipMax: it.clipMax, items: [] });
    const data = ctxMix.coordinator.data, fw = ctxMix.flyweight;
    let label = null; try { label = data.getDisplayText(it.cursor, {}); } catch {}
    col.items.push({ cursor: [...it.cursor], pos: it.position, size: it.size, label,
                     centre: toPage(node._path.positionAt((fw.t0 + fw.t1) / 2)) });
    return r;
  };
  window.__layer = null; window.OmniControlPanel.render();
  window.__layer.value.params[param] = value; window.OmniControlPanel.render();
}"""

SNAP = r"""() => {
  const o = window.__orch, cols = JSON.parse(JSON.stringify(window.__cols)), focal = {};
  if (o?.activeCursor) for (const p of o.panels)
    focal[p.state.panelIdx] = { first: o.nav.translateCursor(o.activeCursor, p.level), count: o.nav.focalCount(o.activeCursor, p.level) };
  return { cols, focal };
}"""

CENTRELINE = r"""(col) => { const P = window.__paths[col], out = [];
  for (let t = -1.5; t <= 2.5; t += 0.002) { const c = P.toPage(P.path.positionAt(t)); out.push([c.x, c.y]); }
  return out; }"""

def find(snap, col, label):
    for it in snap['cols'].get(str(col), {}).get('items', []):
        if it['label'] and (it['label'] == label or it['label'].endswith(': ' + label)): return it
    return None

def ratios(snap):
    """Each column's focal-block ratio, or None if some block is not drawn whole."""
    out = []
    for col, c in sorted(snap['cols'].items(), key=lambda kv: int(kv[0])):
        f = snap['focal'].get(col)
        if not f: return None
        items = sorted(c['items'], key=lambda i: i['pos']); keys = [i['cursor'] for i in items]
        if f['first'] not in keys: return None
        a = keys.index(f['first']); block = items[a:a + f['count']]
        if len(block) != f['count']: return None
        top = block[0]['pos'] - c['clipMin']; size = block[-1]['pos'] + block[-1]['size'] - block[0]['pos']
        travel = (c['clipMax'] - c['clipMin']) - size
        if abs(travel) < 0.5: return None
        out.append(top / travel)
    return out

def outside(snap):
    return sum(1 for c in snap['cols'].values() for i in c['items']
               if i['pos'] + i['size'] <= c['clipMin'] or i['pos'] >= c['clipMax'])

def walker(line, gx, gy):
    k0 = min(range(len(line)), key=lambda k: math.hypot(line[k][0] - gx, line[k][1] - gy))
    ox, oy = gx - line[k0][0], gy - line[k0][1]
    def at(dist):
        step, left, k = (1 if dist >= 0 else -1), abs(dist), k0
        while 0 <= k + step < len(line):
            (x0, y0), (x1, y1) = line[k], line[k + step]; seg = math.hypot(x1 - x0, y1 - y0)
            if seg >= left:
                f = left / seg if seg else 0
                return x0 + (x1 - x0) * f + ox, y0 + (y1 - y0) * f + oy
            left -= seg; k += step
        return line[k][0] + ox, line[k][1] + oy
    return at

def run_case(browser, stub, param, value, drag, select, grab):
    pg = browser.new_page(viewport={'width': 1300, 'height': 820})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e).split('\n')[0]))
    pg.route('https://unpkg.com/three@*/**', lambda r: r.fulfill(status=200, content_type='text/javascript', body=stub))
    pg.goto(f'http://127.0.0.1:{PORT}/html/omni-scene.html'); pg.wait_for_timeout(1000)
    pg.evaluate("() => { const s = document.getElementById('sceneSelector'); s.value = 'drinks'; s.dispatchEvent(new Event('change')); }")
    pg.wait_for_timeout(1000)
    pg.evaluate(SPY, [param, value]); pg.wait_for_timeout(200)
    fails, notes = [], []
    s0 = pg.evaluate(SNAP); sel = find(s0, 0, select)
    if not sel: pg.close(); return [f'{select!r} not drawn in column 0'], notes
    pg.mouse.click(sel['centre']['x'], sel['centre']['y']); pg.wait_for_timeout(200)
    s1 = pg.evaluate(SNAP); g = find(s1, 1, grab)
    if not g: pg.close(); return [f'{grab!r} not drawn in column 1'], notes
    gx, gy = g['centre']['x'], g['centre']['y']
    at = walker(pg.evaluate(CENTRELINE, 1), gx, gy)
    pg.mouse.move(gx, gy); pg.mouse.down()
    gaps, worst_sync, synced, clip_bad, start = [], 0.0, 0, 0, None
    for k in range(1, 9):
        for j in range(1, 6): pg.mouse.move(*at(drag * (k - 1 + j / 5) / 8))
        pg.wait_for_timeout(50)
        px, py = at(drag * k / 8); sk = pg.evaluate(SNAP); it = find(sk, 1, grab)
        r = ratios(sk); clip_bad += outside(sk)
        if r:
            # Past an end the dragged column overscrolls and the others stop at 0 or 1.
            r = [min(1.0, max(0.0, x)) for x in r]
            synced += 1; worst_sync = max(worst_sync, max(r) - min(r))
        if it: gaps.append(math.hypot(it['centre']['x'] - px, it['centre']['y'] - py))
        if VERBOSE:
            offs = ' '.join(f"{c}:{min(i['pos'] for i in v['items']):7.1f}" for c, v in sorted(sk['cols'].items()))
            print(f'      step {k}: ratios {r and " ".join(f"{x:.3f}" for x in r)}  gap {gaps[-1] if it else float("nan"):5.1f}  first item per column {offs}')
    pg.mouse.up(); pg.close()
    if len(gaps) < 4: fails.append(f'grabbed item drawn in only {len(gaps)} of 8 steps')
    if gaps and max(gaps) > TRACK_PX: fails.append(f'tracking: gap up to {max(gaps):.1f} px')
    if synced and worst_sync > SYNC_TOL: fails.append(f'sync: ratios differ by {worst_sync:.3f}')
    if clip_bad: fails.append(f'clipping: {clip_bad} item draws wholly outside their column')
    if errs: fails.append('page errors: ' + '; '.join(errs[:3]))
    notes.append(f'gap max {max(gaps) if gaps else float("nan"):.1f} px over {len(gaps)} steps, '
                 f'sync checked on {synced} steps (spread {worst_sync:.4f})')
    return fails, notes

with sync_playwright() as p:
    browser = p.chromium.launch(); stub = three_stub(); bad = ran = 0
    only = os.environ.get('CASE')
    for n, case in enumerate(CASES, 1):
        if only and str(n) not in only.split(','): continue
        param, value, drag, select, grab = case
        fails, notes = run_case(browser, stub, *case)
        bad += bool(fails); ran += 1
        print(f"{'FAIL' if fails else 'ok  '}  {param}={value:<5g} drag {drag:+5g}px  select {select}, grab {grab}:  {'; '.join(fails or notes)}")
    browser.close()
    print(f'{ran - bad} of {ran} cases passed')
    sys.exit(1 if bad else 0)
