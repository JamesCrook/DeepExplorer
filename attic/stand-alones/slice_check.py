#!/usr/bin/env python3
# slice_check — a model's closure from the declared imports, checked for unbound references
"""slice_check.py — compute a model's closure from the declared imports, and
verify that the resulting slice has no unbound references.

    python3 slice_check.py spike.html                 # report all models
    python3 slice_check.py spike.html climate seed    # closure for named models

The graph comes from the //>> import lines in the spike.  Nothing is hard-coded:
if a nugget's imports are wrong, the unbound-reference check says so.
"""
import re, sys
from collections import defaultdict

def parse(path):
    L = open(path).read().split('\n')
    mods, cur, inm = [], None, set()
    for i, l in enumerate(L, 1):
        m = re.match(r'^//-- file: (\S+) --', l)
        if m: cur = {'n': m.group(1), 's': i, 'imports': [], 'exports': []}
        elif l.startswith('//-- endfile') and cur:
            cur['e'] = i
            cur['body'] = '\n'.join(L[cur['s']:i-1])
            cur['bytes'] = sum(len(x) + 1 for x in L[cur['s']:i-1])
            mods.append(cur); inm |= set(range(cur['s'], i + 1)); cur = None
        elif cur is not None and l.startswith('//>>'):
            mo = re.match(r"//>> import (?:\{([^}]*)\} from )?'([^']+)'", l)
            if mo:
                syms = [x.strip() for x in (mo.group(1) or '').split(',') if x.strip()]
                cur['imports'].append((mo.group(2), syms))
            mo = re.match(r'//>> export \{([^}]*)\}', l)
            if mo: cur['exports'] = [x.strip() for x in mo.group(1).split(',') if x.strip()]
    harness = '\n'.join(L[i-1] for i in range(1, len(L) + 1) if i not in inm)
    return mods, harness, sum(len(L[i-1]) + 1 for i in range(1, len(L)+1) if i not in inm)

def strip(s):
    s = re.sub(r'/\*[\s\S]*?\*/', '', s)
    s = re.sub(r'^\s*//.*$', '', s, flags=re.M)
    s = re.sub(r"'(?:[^'\\]|\\.)*'", '""', s)
    s = re.sub(r'`(?:[^`\\]|\\.)*`', '""', s)
    return s

def closure(byname, entries):
    seen, q = set(), list(entries)
    while q:
        n = q.pop()
        if n in seen or n not in byname: continue
        seen.add(n)
        q += [d for d, _ in byname[n]['imports']]
    return seen

def unbound(byname, keep, harness, all_types):
    """Names a kept nugget imports that no kept nugget exports, plus type
    strings used by a kept nugget with no kept nugget registering them."""
    exported = set()
    for n in keep: exported |= set(byname[n]['exports'])
    missing = defaultdict(set)
    for n in keep:
        for src, syms in byname[n]['imports']:
            if src not in keep:
                missing[n].add(f'module {src}')
            for s in syms:
                if s not in exported: missing[n].add(s)
    registered = set()
    for n in keep:
        registered |= set(re.findall(r"registerNodeClass\('([\w-]+)'", byname[n]['body']))
    registered |= set(re.findall(r"registerNodeClass\('([\w-]+)'", harness))
    for n in keep:
        code = strip(byname[n]['body'])
        for t in re.findall(r"makeNode\('([\w-]+)'", byname[n]['body']):
            # A type registered nowhere in the spike is untyped by design and
            # falls through to the registry's default handler ('group').  Only
            # a type that exists but was sliced away is an error.
            if t in all_types and t not in registered: missing[n].add(f"type '{t}'")
    return missing

GLOBALS = set('''Math JSON Object Array String Number Boolean Set Map WeakMap Date RegExp
Promise Symbol Error TypeError Infinity NaN undefined null true false this super new
console window document performance requestAnimationFrame cancelAnimationFrame
setTimeout clearTimeout setInterval clearInterval ResizeObserver Image Path2D
Float32Array Uint8Array Uint16Array Uint32Array Int32Array ArrayBuffer DataView
parseInt parseFloat isNaN isFinite structuredClone globalThis fetch URL Blob
if else for while do return function class const let var import export from as
new typeof instanceof in of delete void yield await async try catch finally throw
switch case default break continue static get set extends'''.split())

def owner_map(mods):
    """Top-level names, and which nugget declares each."""
    own = {}
    for m in mods:
        for pat in (r'^class (\w+)', r'^(?:const|let|var)\s+([\w, ]+?)\s*[=;]',
                    r'^(?:async )?function\s+(\w+)'):
            for hit in re.findall(pat, m['body'], re.M):
                for n in re.split(r'\s*,\s*', hit.strip()):
                    if re.fullmatch(r'\w+', n): own.setdefault(n, m['n'])
    return own


def undeclared(m, own):
    """Names this nugget uses that another nugget declares, but which it has not
    imported.  This is the check that catches a symbol moving house."""
    code = strip(m['body'])
    bound = set()
    for pat in (r'\bclass\s+(\w+)', r'\b(?:const|let|var)\s+([\w, ]+?)\s*[=;]',
                r'\bfunction\s+(\w+)', r'\bcatch\s*\(\s*(\w+)'):
        for hit in re.findall(pat, code):
            for n in re.split(r'\s*,\s*', hit.strip()):
                if re.fullmatch(r'\w+', n): bound.add(n)
    for hit in re.findall(r'\(([^()]*)\)\s*(?:=>|\{)', code):
        bound |= set(re.findall(r'\b([a-zA-Z_]\w*)\b', hit))
    imported = set()
    for src, syms in m['imports']: imported |= set(syms)
    out = set()
    for name, o in own.items():
        if o == m['n'] or name in bound or name in imported: continue
        for mo in re.finditer(r'(?<![.\w$])' + re.escape(name) + r'\b', code):
            if re.match(r'\s*:', code[mo.end():mo.end()+2]): continue
            out.add(f'{name} (in {o})'); break
    return sorted(out)


def main():
    path = sys.argv[1]
    mods, harness, hbytes = parse(path)
    byname = {m['n']: m for m in mods}
    all_types = set(re.findall(r"registerNodeClass\('([\w-]+)'", open(path).read()))
    models = [m['n'] for m in mods if m['n'].endswith('-model.js')]
    SHELL = ['./app.js']   # every build boots through App; models self-register

    if len(sys.argv) > 2:
        want = []
        for a in sys.argv[2:]:
            hits = [m for m in models if a in m]
            if not hits: sys.exit(f'no model matching {a!r}')
            want += hits
        keep = closure(byname, want + SHELL)
        total = sum(byname[n]['bytes'] for n in keep)
        print(f'entries: {", ".join(want)}')
        print(f'{len(keep)} nuggets, {total} bytes + {hbytes} harness = {total+hbytes}\n')
        for n in sorted(keep, key=lambda n: -byname[n]['bytes']):
            print(f'  {byname[n]["bytes"]:6d}  {n}')
        miss = unbound(byname, keep, harness, all_types)
        print('\nunbound:', 'none' if not miss else '')
        for n, s in miss.items(): print(f'   {n}: {sorted(s)}')
        return

    own = owner_map(mods)
    gaps = {m['n']: u for m in mods if (u := undeclared(m, own))}
    if gaps:
        print('undeclared cross-nugget references:')
        for n, u in gaps.items(): print(f'   {n}: {u}')
    else:
        print('undeclared cross-nugget references: none')
    print()
    shell = closure(byname, SHELL)
    sbytes = sum(byname[x]['bytes'] for x in shell)
    print(f'shell: {len(shell)} nuggets, {sbytes} bytes, + {hbytes} outside nuggets')
    print(f'       every build pays this\n')
    print(f'{"total":>8} {"+shell":>8} {"nuggets":>8}  model')
    rows = []
    for n in models:
        keep = closure(byname, [n] + SHELL)
        b = sum(byname[x]['bytes'] for x in keep)
        miss = unbound(byname, keep, harness, all_types)
        rows.append((b - sbytes, b, len(keep), n, miss))
    for extra, b, k, n, miss in sorted(rows):
        flag = '' if not miss else '  UNBOUND: ' + str(dict((x, sorted(v)) for x, v in miss.items()))
        print(f'{b + hbytes:8d} {extra:8d} {k:8d}  {n}{flag}')

main()
