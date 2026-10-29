"""cartographer-headless.py — run attic/tools/code-cartographer-tool.html over
website/ in headless Chromium and print what matters for the tidy-up.

    python3 docs/tests/cartographer-headless.py

Needs Python Playwright with Chromium.  Prints the scan summary, every type
name registered more than once (exit status 1 if any), and the groups of
functions whose bodies are identical once comments, whitespace and names are
normalised.  Many such groups differ only in string literals; read them as
leads, not as bugs.
"""
import json, os, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 8767

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

threading.Thread(target=lambda: http.server.ThreadingHTTPServer(
    ('127.0.0.1', PORT), functools.partial(Quiet, directory=REPO)).serve_forever(), daemon=True).start()

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{PORT}/attic/tools/code-cartographer-tool.html')
    page.wait_for_timeout(500)
    page.set_input_files('#fileInput', os.path.join(REPO, 'website'))
    page.wait_for_function("() => typeof DB !== 'undefined' && DB && DB.nodes", timeout=120000)
    page.wait_for_timeout(300)
    r = page.evaluate("""() => ({
      status: document.getElementById('status').textContent,
      types: DB.nodes.rows ? DB.nodes.rows.length : null,
      dupTypes: (DB.nodes.dupTypes || []).map(d => d.type + ': ' + d.rows.map(r => r.clsName + ' @ ' + r.file).join(' vs ')),
      identical: (DB.overlaps.identical || []).map(g => (g.fns || g).map(f => f.name + ' @ ' + f.file + ':' + f.line)),
    })""")
    browser.close()

print(r['status'])
print(f"{r['types']} node types registered; {len(r['dupTypes'])} registered more than once")
for d in r['dupTypes']: print('  DUP', d)
print(f"{len(r['identical'])} groups of identical bodies:")
for g in r['identical']: print('  ~', ' | '.join(g))
if errors: print('page errors:', errors)
sys.exit(1 if r['dupTypes'] or errors else 0)
