#!/usr/bin/env python3
"""
# ESSENTIALS

library_nuggets.py — copy nuggets from a spike into the library, or report drift.

Some nuggets in a spike are library code: the HTML node types and the HTML
harness in widget-stnda.html are what d-plus.html runs on.  The spike keeps
its own sys.js (with its own SceneRegistry), the library has
js/omni-support/sys.js (around the one sceneRegistry in scene.js), so the
two copies differ only in their import lines.  They are the same text in two
dialects; this keeps them in step.

    python library_nuggets.py widget-stnda.html          copy into the library
    python library_nuggets.py widget-stnda.html --check  report drift, write nothing
    python library_nuggets.py widget-stnda.html --mark   record the dialect pairs as in step

--check compares bodies with import/export lines set aside, so a change made
on either side shows.  Edit the spike and copy, or edit the library file and
carry the change back into the spike by hand (or with spike_kit remerge from a
copy whose import lines are the spike's).

Dialect pairs are files that say the same thing differently and so cannot be
copied: the spike's scene-registry.js and the library's scene.js (one has
prototype-method scanning, the other abortPhase), and the two sys.js.  For
these, --mark records a fingerprint of both sides in library_nuggets.lock.json
once you have brought them into step by hand, and --check then says which side
has changed since.  A change to one side is the reminder to look at the other.
"""

import os, sys, re, json, difflib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import spike_kit  # noqa: E402

# spike nugget path -> library path (relative to the repo root)
MAP = {
    './html-nodes.js':          'js/nodes-html/html-nodes.js',
    './html-template-node.js':  'js/nodes-html/html-template-node.js',
    './html-repeat-node.js':    'js/nodes-html/html-repeat-node.js',
    './html-host-node.js':      'js/nodes-html/html-host-node.js',
    './actions.js':             'js/nodes-html/actions.js',
    './prepasses.js':           'js/nodes-html/prepasses.js',
    './demo-harness-html.js':   'js/omni-support/demo-harness-html.js',
    './formats.js':             'js/omni-support/formats.js',
    './values.js':              'js/omni-support/values.js',
    './morph-slider-widget.js': 'js/omni-support/morph-slider-widget.js',
}

# spike nugget path -> library file that says the same thing in its own dialect
PAIRS = {
    './scene-registry.js': 'js/omni-support/scene.js',
    './sys.js':            'js/omni-support/sys.js',
}
LOCK = Path(__file__).with_name('library_nuggets.lock.json')

def fingerprint(text):
    import hashlib
    return hashlib.sha1('\n'.join(l.rstrip() for l in text.split('\n') if l.strip()).encode()).hexdigest()[:12]

def import_path(spike_rel, lib_path):
    """Rewrite a spike-relative import specifier for a library file."""
    if spike_rel == './sys.js':
        target = 'js/omni-support/sys.js'
    elif spike_rel in MAP:
        target = MAP[spike_rel]
    else:
        return None                     # a spike-only module: not allowed here
    out = os.path.relpath(target, os.path.dirname(lib_path))
    return out if out.startswith('.') else './' + out

IMPORT = re.compile(r"""^(\s*(?:import|export)\b[^'"]*['"])(\.[^'"]+)(['"].*)$""")

def library_text(body, spike_path, lib_path):
    out = []
    for line in body:
        line = spike_kit.TRAIL_MARK.sub('', spike_kit.activate(line)) if spike_kit.LINE_OUT.match(line) else line
        m = IMPORT.match(line)
        if m:
            p = import_path(m.group(2), lib_path)
            if p is None:
                raise SystemExit(f'{spike_path} imports {m.group(2)}, which is not in the library')
            line = m.group(1) + p + m.group(3)
        out.append(line)
    return '\n'.join(out).rstrip('\n') + '\n'

def bodies(text):
    return [l for l in text.split('\n') if not re.match(r'\s*(import|export)\b', l)]

def main():
    if len(sys.argv) < 2:
        print(__doc__); return
    spike = Path(sys.argv[1])
    check, mark = '--check' in sys.argv, '--mark' in sys.argv
    root = spike.resolve().parent.parent
    drift = 0
    lock = json.loads(LOCK.read_text()) if LOCK.exists() else {}
    for kind, *rest in spike_kit.parse(spike.read_text()):
        if kind != 'nugget':
            continue
        path, _cp, body, _imports = rest
        if path in PAIRS:
            lib = root / PAIRS[path]
            now = {'spike': fingerprint('\n'.join(body)), 'library': fingerprint(lib.read_text())}
            key = f'{spike.name}:{path}'
            if mark:
                lock[key] = now
                print(f'  marked {path} ~ {PAIRS[path]}')
            elif check:
                was = lock.get(key)
                if not was:
                    print(f'  ?     {path} ~ {PAIRS[path]}: never marked')
                else:
                    moved = [side for side in ('spike', 'library') if was[side] != now[side]]
                    if moved:
                        drift += 1
                        print(f'  DRIFT {path} ~ {PAIRS[path]}: {" and ".join(moved)} changed since marked')
                    else:
                        print(f'  same  {path} ~ {PAIRS[path]} (dialect pair)')
            continue
        if path not in MAP or mark:
            continue
        lib = root / MAP[path]
        text = library_text(body, path, MAP[path])
        if check:
            old = lib.read_text() if lib.exists() else ''
            d = list(difflib.unified_diff(bodies(old), bodies(text), MAP[path] + ' (library)', path + ' (spike)', lineterm=''))
            if d:
                drift += 1
                print('\n'.join(d[:40]))
            else:
                print(f'  same  {MAP[path]}')
        else:
            lib.parent.mkdir(parents=True, exist_ok=True)
            lib.write_text(text)
            print(f'  wrote {MAP[path]}')
    if mark:
        LOCK.write_text(json.dumps(lock, indent=1) + '\n')
    if check and drift:
        sys.exit(1)

if __name__ == '__main__':
    main()
