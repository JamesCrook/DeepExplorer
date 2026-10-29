# OmniGrid on the chart machinery: pointer, sync, clamping, focus, focusAlign, index, culling, speed
"""omnigrid-test.py — drive OmniGrid (html/omni-grid.html) in headless Chromium.

    python3 docs/tests/omnigrid-test.py [-v]

Needs Python Playwright with Chromium.  three.js is stubbed.  Exit status 1 if
any check fails.

The grid is grid-viewport > sticky bands > warpable-grid > vstack > table-cell
(nodes2d/grid-viewport-node.js).  Checks, with real mouse and wheel events:

  wheel       zooming about a cell keeps that cell under the cursor
  drag        dragging a cell keeps it under the pointer, in x and y
  aligned     every data column and the row names share one row position
              (rows scroll in the columns; equal heights make sync lockstep)
  clamp       rows stop at the table's top and bottom
  focus       pressing a cell focuses GridScene's run (same-initial rows
              round it in that column) and its letter
  focusAlign  0 puts the run's top at the body's top, 1 its bottom at the
              bottom; the index letter goes the same way at its own speed
  index       pressing a letter focuses the first run starting with it
  culling     a 1000 x 1000 table walks only the columns in view, and a
              frame takes under 250 ms
"""
import os, re, sys, json, time, threading, http.server, functools
sys.dont_write_bytecode = True          # importing golden-images.py leaves no __pycache__

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 8779
VERBOSE = '-v' in sys.argv
sys.path.insert(0, os.path.dirname(__file__))
import importlib.util
spec = importlib.util.spec_from_file_location('golden', os.path.join(os.path.dirname(__file__), 'golden-images.py'))
golden = importlib.util.module_from_spec(spec); spec.loader.exec_module(golden)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
threading.Thread(target=lambda: http.server.ThreadingHTTPServer(
    ('127.0.0.1', PORT), functools.partial(Quiet, directory=os.path.join(REPO, 'website'))).serve_forever(), daemon=True).start()

fails, checks = [], 0
def check(ok, what, detail=''):
    global checks
    checks += 1
    if not ok: fails.append(f'{what} {detail}')
    if VERBOSE or not ok: print(('ok   ' if ok else 'FAIL ') + what, detail)

STATE = r"""async () => {
  const G = (await import('/js/nodes2d/grid-viewport-node.js')).GridViewportNode;
  const vp = window.__goldenLayer.subtree[0], st = vp.inst, L = st.layout;
  const panels = st.orch.panels.map(p => ({ level: p.level, anchor: p.state.anchorCursor, offset: p.state.scrollOffset }));
  const canvas = document.getElementById('scene-canvas').getBoundingClientRect();
  return { zoom: st.camera.zoom, camX: st.camera.x, rowTop: L.rowTop, ch: L.cellHeight, viewH: L.viewH,
           ins: L.ins, ox: L.ox, oy: L.oy, W: L.W, H: L.H, rows: st.raw.rowCount, cols: st.raw.colCount,
           focus: st.nav.focus, panels, range: G.visibleRange(vp), left: canvas.left, top: canvas.top };
}"""

CELL_AT = r"""async ([x, y]) => {
  const G = (await import('/js/nodes2d/grid-viewport-node.js')).GridViewportNode;
  return G.cellAt(window.__goldenLayer.subtree[0], x, y);
}"""

def state(pg): return pg.evaluate(STATE)
def cell_at(pg, x, y): return pg.evaluate(CELL_AT, [x, y])
def page_xy(s, x, y): return s['left'] + x, s['top'] + y      # canvas px -> page px

def aligned(s):
    tops = [p['offset'] - p['anchor'][-1] * s['ch'] for p in s['panels'] if p['level'] != 'index']
    return max(tops) - min(tops) < 1e-6, tops[0] if tops else None

def render(pg): pg.evaluate("() => window.OmniControlPanel.render()"); pg.wait_for_timeout(60)
def set_param(pg, k, v): pg.evaluate("([k, v]) => { window.__goldenLayer.value.params[k] = v; window.OmniControlPanel.render(); }", [k, v]); pg.wait_for_timeout(60)
def sample(pg, sid):
    pg.evaluate("(s) => { const e = document.getElementById('sampleSelect'); e.value = s; e.dispatchEvent(new Event('change')); }", sid)
    pg.wait_for_timeout(300); render(pg)

from playwright.sync_api import sync_playwright
stub = golden.three_stub()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1300, 'height': 820})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e).splitlines()[0]))
    pg.route('https://unpkg.com/three@*/**', lambda r: r.fulfill(status=200, content_type='text/javascript', body=stub))
    pg.goto(f'http://127.0.0.1:{PORT}/html/omni-grid.html'); pg.wait_for_timeout(1000)
    pg.evaluate(golden.LAYER_SPY); render(pg)

    # ── multiplication table: numbers, no text runs; plenty of rows ──
    sample(pg, 'multiplication')
    s = state(pg)
    check(aligned(s)[0], 'aligned at load')

    # drag a cell: it stays under the pointer
    set_param(pg, 'zoom', 1); s = state(pg)
    cx, cy = s['ox'] + s['ins']['x'] + 150, s['oy'] + s['ins']['y'] + 300
    c0 = cell_at(pg, cx, cy)
    pg.mouse.move(*page_xy(s, cx, cy)); pg.mouse.down()
    for k in range(1, 6):
        pg.mouse.move(*page_xy(s, cx - 25 * k, cy - 40 * k)); pg.wait_for_timeout(40)
        ck = cell_at(pg, cx - 25 * k, cy - 40 * k)
        check(ck == c0, f'drag step {k}: the pressed cell stays under the pointer', f'{c0} -> {ck}')
    pg.mouse.up(); pg.wait_for_timeout(80)
    c1 = cell_at(pg, cx - 125, cy - 200)
    s = state(pg)
    check(c1 == c0, 'drag keeps the cell under the pointer', f'{c0} -> {c1}  (camX {s["camX"]:.1f}, rowTop {s["rowTop"]:.1f})')
    check(aligned(s)[0], 'aligned after drag')

    # wheel about a cell
    s = state(pg)          # the drag above left the view away from the table's edges
    cx, cy = s['ox'] + s['ins']['x'] + 3.5 * 70, s['oy'] + s['ins']['y'] + 6.5 * s['ch']
    before = cell_at(pg, cx, cy)
    pg.mouse.move(*page_xy(s, cx, cy))
    seen = 0
    for dy in (-100, -100, 100, 100, 100, 100):
        pg.mouse.wheel(0, dy); pg.wait_for_timeout(80)
        after = cell_at(pg, cx, cy)
        s2 = state(pg)
        if not (s2['camX'] < 0.5 or s2['rowTop'] > -0.5):      # an edge in view pins the zoom to it
            seen += 1
            check(after == before, f'wheel keeps the cell under the cursor at zoom {s2["zoom"]:.3f}', f'{before} -> {after}')
    check(seen >= 4, 'wheel steps away from the edges', f'{seen} of 6')
    s = state(pg)
    check(aligned(s)[0], 'aligned after wheel')

    # clamp: drag down far from the top, then up far
    for dy, want in ((+3000, 'top'), (-30000, 'bottom')):
        s = state(pg); cx, cy = s['ox'] + s['ins']['x'] + 100, s['oy'] + s['ins']['y'] + 200
        pg.mouse.move(*page_xy(s, cx, cy)); pg.mouse.down(); pg.mouse.move(*page_xy(s, cx, cy + dy / 10), steps=10); pg.mouse.up(); pg.wait_for_timeout(80)
        s = state(pg)
        lo = min(0, s['viewH'] - s['rows'] * s['ch'])
        if dy < 0:
            pg.mouse.move(*page_xy(s, cx, cy)); pg.mouse.down(); pg.mouse.move(*page_xy(s, cx, cy - 2500), steps=20); pg.mouse.up(); pg.wait_for_timeout(80)
            s = state(pg)
        target = 0 if want == 'top' else lo
        check(abs(s['rowTop'] - target) < 1e-6, f'rows clamp at the {want}', f'rowTop {s["rowTop"]:.1f}, want {target:.1f}')
        check(aligned(s)[0], f'aligned at the {want}')

    # ── cities: text, runs of initials, a distance matrix ──
    sample(pg, 'cities'); set_param(pg, 'indexOverlay', 1)
    s = state(pg)
    # press a cell in the first column (row names are cities; column 0 values are numbers) -> use the row-name column? GridScene focuses on the clicked column's values
    # pick a text-free sample for runs: the focus run of a number cell is the run of rows whose values share a first digit
    cx, cy = s['ox'] + s['ins']['x'] + 30, s['oy'] + s['ins']['y'] + 4.5 * s['ch']
    hit = cell_at(pg, cx, cy)
    pg.mouse.click(*page_xy(s, cx, cy)); pg.wait_for_timeout(100); render(pg)
    s = state(pg)
    run_ok = s['focus'] and s['focus']['run'] and s['focus']['run']['start'] <= hit['row'] <= s['focus']['run']['end']
    check(bool(run_ok), 'press focuses the run round the cell', json.dumps(s['focus']))
    want = pg.evaluate("""([row, col]) => { const st = window.__goldenLayer.subtree[0].inst; const raw = st.raw;
      const rr = st.opts.reverseRows, n = raw.rowCount, split = Math.floor(rr * n);
      const data = r => { const d = r < split ? (n - 1) - r : r - split; return String(raw.getValue(d, col) ?? '')[0]?.toUpperCase() ?? ''; };
      const L = data(row); let a = row, b = row; while (a > 0 && data(a - 1) === L) a--; while (b < n - 1 && data(b + 1) === L) b++; return { start: a, end: b }; }""", [hit['row'], hit['col']])
    check(s['focus'] and s['focus']['run'] == want, "run is GridScene's", f"{s['focus'] and s['focus']['run']} vs {want}")

    # focusAlign 0 and 1
    for t in (0, 1):
        set_param(pg, 'focusAlign', t); s = state(pg)
        run = s['focus']['run']; top = s['rowTop'] + run['start'] * s['ch']; bot = s['rowTop'] + (run['end'] + 1) * s['ch']
        lo = min(0, s['viewH'] - s['rows'] * s['ch'])
        clamped = s['rowTop'] in (0, lo)
        if t == 0: check(abs(top) < 1e-6 or clamped, 'focusAlign 0: run top at the body top', f'top {top:.1f}, rowTop {s["rowTop"]:.1f}')
        else:      check(abs(bot - s['viewH']) < 1e-6 or clamped, 'focusAlign 1: run bottom at the body bottom', f'bottom {bot:.1f} of {s["viewH"]:.1f}')
        idx = next(p for p in s['panels'] if p['level'] == 'index')
        if s['focus']['letter'] is not None:
            want_off = 0 if t == 0 else s['viewH'] - s['ch']
            check(idx['anchor'][-1] == s['focus']['letter'] and abs(idx['offset'] - want_off) < 1e-6,
                  f'focusAlign {t}: index letter at the {"top" if t == 0 else "bottom"}', f"{idx}")
        check(aligned(s)[0], f'aligned at focusAlign {t}')

    # index: press a letter
    s = state(pg)
    ix, iy = s['ox'] + 10, s['oy'] + s['ins']['y'] + 2.5 * s['ch']
    pg.mouse.click(*page_xy(s, ix, iy)); pg.wait_for_timeout(100); render(pg)
    s = state(pg)
    check(s['focus'] is not None and s['focus']['letter'] is not None, 'index press focuses a letter', json.dumps(s['focus']))

    # ── names: runs of initials mid-table, so focusAlign and the index move freely ──
    pg.evaluate("""async () => {
      const { CSVData } = await import('/js/data/csv-data.js');
      const G = (await import('/js/nodes2d/grid-viewport-node.js')).GridViewportNode;
      const lines = ['Id,Name,Score'];          // a number first, so Name is a data column
      let id = 0;
      for (let L = 0; L < 26; L++) for (let i = 0; i < 4 + (L % 5) * 3; i++)
        lines.push((++id) + ',' + String.fromCharCode(65 + L) + 'name' + String(i).padStart(2, '0') + ',' + ((L * 7 + i) % 50));
      const vp = window.__goldenLayer.subtree[0];
      const p = window.__goldenLayer.value.params; p.reverseRows = 0; p.zoom = 1; p.indexOverlay = 1;
      G.setData(vp, new CSVData(lines.join('\\n'))); G.markZoom(vp, 1);
      window.OmniControlPanel.render(); }""")
    pg.wait_for_timeout(100); render(pg)
    s = state(pg)
    # scroll so an 'M' run is in view, then press it
    m_row = pg.evaluate("() => { const raw = window.__goldenLayer.subtree[0].inst.raw; for (let r = 0; r < raw.rowCount; r++) if (String(raw.getValue(r, 1))[0] === 'M') return r; }")
    pg.evaluate("(y0) => { const st = window.__goldenLayer.subtree[0].inst; for (const p of st.orch.panels) if (p.level !== 'index') p.state.scrollOffset = y0 + p.state.anchorCursor[1] * st.layout.cellHeight; window.OmniControlPanel.render(); }",
                -(m_row - 5) * s['ch'])
    s = state(pg)
    name_x = pg.evaluate("() => { const st = window.__goldenLayer.subtree[0].inst; const w = st.dims.base; return w[0] + w[1] / 2; }")
    cx, cy = s['ox'] + s['ins']['x'] + name_x, s['oy'] + s['ins']['y'] + s['rowTop'] + (m_row + 1.5) * s['ch']
    pg.mouse.click(*page_xy(s, cx, cy)); pg.wait_for_timeout(100); render(pg)
    s = state(pg)
    f = s['focus']
    check(f and f['letter'] == 12 and f['run'] and f['run']['start'] == m_row, "press on an M name: the M run and letter M", json.dumps(f))
    for t in (0, 0.5, 1):
        set_param(pg, 'focusAlign', t); s = state(pg)
        run = s['focus']['run']; size = (run['end'] - run['start'] + 1) * s['ch']
        top = s['rowTop'] + run['start'] * s['ch']
        check(abs(top - t * (s['viewH'] - size)) < 1e-6, f'focusAlign {t}: run at that ratio of its travel', f'top {top:.1f}, want {t * (s["viewH"] - size):.1f}')
        idx = next(p for p in s['panels'] if p['level'] == 'index')
        check(idx['anchor'][-1] == 12 and abs(idx['offset'] - t * (s['viewH'] - s['ch'])) < 1e-6,
              f'focusAlign {t}: the index letter at the same ratio of its own travel', json.dumps(idx))
        check(aligned(s)[0], f'aligned at focusAlign {t}')
    # the slider moved nothing back: readBack is quiet; a drag moves it
    s = state(pg)
    cx, cy = s['ox'] + s['ins']['x'] + name_x, s['oy'] + s['ins']['y'] + s['rowTop'] + (s['focus']['run']['start'] + 0.5) * s['ch']
    pg.mouse.move(*page_xy(s, cx, cy)); pg.mouse.down(); pg.mouse.move(*page_xy(s, cx, cy - 120), steps=6); pg.mouse.up(); pg.wait_for_timeout(100); render(pg)
    fa = pg.evaluate("() => window.__goldenLayer.value.params.focusAlign")
    s = state(pg); run = s['focus']['run']; size = (run['end'] - run['start'] + 1) * s['ch']
    top = s['rowTop'] + run['start'] * s['ch']
    check(abs(fa - top / (s['viewH'] - size)) < 1e-3, 'a drag moves focusAlign, read back into the slider', f'focusAlign {fa:.3f}, ratio {top / (s["viewH"] - size):.3f}')

    if os.environ.get('SHOT'): pg.locator('#scene-canvas').screenshot(path=os.environ['SHOT'])

    # ── large wave: culling and speed ──
    pg.evaluate("""() => { const b = [...document.querySelectorAll('.size-selector button')].find(e => e.textContent.trim() === 'L'); b?.click(); }""")
    pg.wait_for_timeout(300)
    sample(pg, 'wave')
    s = state(pg)
    if s['rows'] >= 500:
        t0 = time.time(); pg.evaluate("() => { for (let i = 0; i < 5; i++) window.OmniControlPanel.render(); }"); ms = (time.time() - t0) / 5 * 1000
        r = s['range']
        check(r['endCol'] - r['startCol'] + 1 < s['cols'], f'{s["rows"]}x{s["cols"]}: only visible columns walked', f'{r}')
        check(ms < 250, f'{s["rows"]}x{s["cols"]}: frame under 250 ms', f'{ms:.0f} ms')
    else:
        check(False, 'large sample loaded', f'rows {s["rows"]}')

    if errs: check(False, 'page errors', '; '.join(errs[:3]))
    b.close()

print(f'{checks - len(fails)} of {checks} checks passed')
sys.exit(1 if fails else 0)
