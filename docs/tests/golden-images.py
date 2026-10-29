# Golden images: screenshot every chart preset x dataset and OmniGrid samples x zooms; compare two runs
"""golden-images.py — screenshot the chart and grid scenes, or compare two runs.

    python3 docs/tests/golden-images.py capture DIR [--only chart|grid]
    python3 docs/tests/golden-images.py compare DIR_A DIR_B [--threshold N]

Needs Python Playwright with Chromium, Pillow and numpy.  three.js is stubbed.

capture  OmniScene's four chart datasets (sales, footfall, drinks, kanji) under
         every chart preset, each applied instantly, at zoom 1; then the same
         four at zoom 0.6 under three presets; then OmniGrid's samples at three
         zooms.  One PNG per view, of the scene canvas only, named
         <scene>__<preset or zoom>.png.
compare  for each name in both dirs: the share of pixels that differ by more
         than --threshold (default 24) in any channel, and the largest
         difference.  Writes <DIR_B>/diff/<name>.png (changed pixels in
         magenta over a dimmed copy) for any image that changed, and lists
         names present in only one dir.

Use it around a refactor: capture before, change, capture after, compare.
Differences that should appear are the point of looking, not a failure in
themselves; the listing is sorted, worst first.
"""
import os, re, sys, json, threading, http.server, functools

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 8772

CHART_SCENES = ['chart-sales', 'chart-foot', 'drinks', 'kanji']
ZOOMED_PRESETS = ['Stacked', 'Radial Bar', 'Donut Chart']
GRID_SAMPLES = ['cities', 'pam250', 'sales', 'wave']
GRID_ZOOMS = [1, 0.4, 0.1]


def three_stub():
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


# Keep the scene's top layer (the chart layer) where the script can reach it.
LAYER_SPY = r"""async () => {
  const sn = await import('/js/nodes2d/omni-scene-nodes.js');
  const L = sn.LayerNode, orig = L.before_draw2d;
  L.before_draw2d = function (ctxMix, node, params) {
    if (node.inst?.presets) window.__goldenLayer = node;
    return orig.call(this, ctxMix, node, params);
  };
}"""

# Reset the layer's params to the scene's own, apply a preset at once (no morph), set zoom.
APPLY = r"""([base, name, zoom]) => {
  const L = window.__goldenLayer, p = L.value.params;
  for (const k of Object.keys(p)) delete p[k];
  Object.assign(p, base, L.inst.presets[name], { zoom });
  window.OmniControlPanel.render();
}"""


def capture(out, only):
    from playwright.sync_api import sync_playwright

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    threading.Thread(target=lambda: http.server.ThreadingHTTPServer(
        ('127.0.0.1', PORT), functools.partial(Quiet, directory=os.path.join(REPO, 'website'))).serve_forever(),
        daemon=True).start()
    os.makedirs(out, exist_ok=True)
    stub = three_stub()
    problems = []

    def open_page(b, path):
        pg = b.new_page(viewport={'width': 1300, 'height': 820})
        pg.on('pageerror', lambda e: problems.append(f'{path}: {str(e).splitlines()[0]}'))
        pg.route('https://unpkg.com/three@*/**', lambda r: r.fulfill(status=200, content_type='text/javascript', body=stub))
        pg.goto(f'http://127.0.0.1:{PORT}/{path}'); pg.wait_for_timeout(1000)
        return pg

    def shot(pg, name):
        pg.wait_for_timeout(150)
        pg.locator('#scene-canvas').screenshot(path=os.path.join(out, name + '.png'))

    with sync_playwright() as p:
        b = p.chromium.launch()
        if only in (None, 'chart'):
            pg = open_page(b, 'html/omni-scene.html')
            pg.evaluate(LAYER_SPY)
            for scene in CHART_SCENES:
                pg.evaluate("(s) => { const e = document.getElementById('sceneSelector'); e.value = s; e.dispatchEvent(new Event('change')); }", scene)
                pg.wait_for_timeout(1200)
                pg.evaluate("() => window.OmniControlPanel.render()"); pg.wait_for_timeout(300)
                base = pg.evaluate("() => ({ ...window.__goldenLayer.value.params })")
                presets = pg.evaluate("() => Object.keys(window.__goldenLayer.inst?.presets || {})")
                for name in presets:
                    pg.evaluate(APPLY, [base, name, 1])
                    shot(pg, f'{scene}__{name}')
                for name in ZOOMED_PRESETS:
                    pg.evaluate(APPLY, [base, name, 0.6])
                    shot(pg, f'{scene}__{name}@0.6')
            pg.close()
        if only in (None, 'grid'):
            pg = open_page(b, 'html/omni-grid.html')
            pg.evaluate(LAYER_SPY)
            for sample in GRID_SAMPLES:
                pg.evaluate("(s) => { const e = document.getElementById('sampleSelect'); e.value = s; e.dispatchEvent(new Event('change')); }", sample)
                pg.wait_for_timeout(600)
                pg.evaluate("() => window.OmniControlPanel.render()"); pg.wait_for_timeout(200)
                for z in GRID_ZOOMS:
                    pg.evaluate("(z) => { window.__goldenLayer.value.params.zoom = z; window.OmniControlPanel.render(); }", z)
                    shot(pg, f'grid-{sample}__zoom{z:g}')
            pg.close()
        b.close()
    n = len([f for f in os.listdir(out) if f.endswith('.png')])
    print(f'{n} images in {out}')
    for m in sorted(set(problems))[:20]: print('  page error:', m)


def compare(a, b, threshold):
    import numpy as np
    from PIL import Image
    na = {f for f in os.listdir(a) if f.endswith('.png')}
    nb = {f for f in os.listdir(b) if f.endswith('.png')}
    os.makedirs(os.path.join(b, 'diff'), exist_ok=True)
    rows = []
    for f in sorted(na & nb):
        x = np.asarray(Image.open(os.path.join(a, f)).convert('RGB')).astype(int)
        y = np.asarray(Image.open(os.path.join(b, f)).convert('RGB')).astype(int)
        if x.shape != y.shape:
            rows.append((1.0, 255, f + '  (size differs)')); continue
        d = np.abs(x - y).max(axis=2)
        changed = d > threshold
        share = changed.mean()
        rows.append((share, int(d.max()), f))
        if changed.any():
            img = (y * 0.35).astype(np.uint8)
            img[changed] = [255, 0, 255]
            Image.fromarray(img).save(os.path.join(b, 'diff', f))
    rows.sort(reverse=True)
    for share, mx, f in rows:
        try: print(f'{share * 100:7.3f}%  max {mx:3d}  {f}')
        except BrokenPipeError: sys.exit(0)
    same = sum(1 for r in rows if r[0] == 0)
    print(f'{same} of {len(rows)} identical (threshold {threshold})')
    for f in sorted(na - nb): print('only in', a, ':', f)
    for f in sorted(nb - na): print('only in', b, ':', f)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['capture'] and len(args) >= 2:
        only = args[args.index('--only') + 1] if '--only' in args else None
        capture(args[1], only)
    elif args[:1] == ['compare'] and len(args) >= 3:
        th = int(args[args.index('--threshold') + 1]) if '--threshold' in args else 24
        compare(args[1], args[2], th)
    else:
        print(__doc__); sys.exit(2)
