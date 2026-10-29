"""pages-smoke.py — open every page under website/ in headless Chromium and list its errors.

    python3 docs/tests/pages-smoke.py [repo-root]

Needs Python Playwright with Chromium. For each .html page it reports
uncaught exceptions, console errors and local files that failed to load
(a moved module shows up here as a 404). Run it before and after a move:
the two lists should match. Errors from CDN libraries the sandbox cannot
reach are reported too, so compare, don't expect zero.

three.js comes from unpkg. Where that is out of reach, --stub-three answers
with a stand-in module that exports every name the repo imports from three
(each a do-anything proxy), so the module graph still loads: a missing file
or a missing export still shows, though anything three draws will throw.
"""
import os, re, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith('--')]
STUB = '--stub-three' in sys.argv
REPO = os.path.abspath(args[0] if args else os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 8768

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=REPO))
threading.Thread(target=server.serve_forever, daemon=True).start()

pages = []
for d, dirs, files in os.walk(os.path.join(REPO, 'website')):
    dirs[:] = sorted(x for x in dirs if x != 'content')
    pages += sorted(os.path.relpath(os.path.join(d, f), REPO) for f in files if f.endswith('.html'))

def three_stub():
    """A module exporting every name the repo takes from three, each a proxy that accepts anything."""
    names = set()
    for d, _, files in os.walk(os.path.join(REPO, 'website')):
        for f in files:
            if f.endswith(('.js', '.html')):
                t = open(os.path.join(d, f), encoding='utf-8', errors='replace').read()
                for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*['\"](?:three|https://unpkg[^'\"]*three)[^'\"]*['\"]", t):
                    names |= {n.split(' as ')[0].strip() for n in m.group(1).split(',') if n.strip()}
                names |= set(re.findall(r'\bTHREE\.([A-Za-z_]\w*)', t))
    body = ("const mk = () => new Proxy(function () {}, { get: (t, k) => k === 'then' ? undefined : "
            "k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? [][Symbol.iterator] : mk(), "
            "construct: () => mk(), apply: () => mk(), set: () => true });\n")
    body += ''.join(f'export const {n} = mk();\n' for n in sorted(names) if n.isidentifier())
    return body + 'export default mk();\n'

with sync_playwright() as p:
    browser = p.chromium.launch()
    stub = three_stub() if STUB else None
    for rel in pages:
        page = browser.new_page()
        if stub:
            page.route('https://unpkg.com/three@*/**', lambda r: r.fulfill(
                status=200, content_type='text/javascript', body=stub))
        found = []
        page.on('pageerror', lambda e: found.append('exception: ' + str(e).split('\n')[0]))
        page.on('console', lambda m: m.type == 'error' and found.append('console: ' + m.text[:160]))
        page.on('response', lambda r: r.status >= 400 and f'127.0.0.1:{PORT}' in r.url
                and found.append(f'{r.status}: ' + r.url.split(str(PORT), 1)[1]))
        try:
            page.goto(f'http://127.0.0.1:{PORT}/{rel}', wait_until='load', timeout=20000)
            page.wait_for_timeout(1500)
        except Exception as e:
            found.append('load: ' + str(e).split('\n')[0])
        page.close()
        print(rel)
        for f in sorted(set(found)):
            print('   ', f)
    browser.close()
server.shutdown()
