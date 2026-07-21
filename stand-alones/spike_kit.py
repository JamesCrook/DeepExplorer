#!/usr/bin/env python3
"""
# ESSENTIALS

spike_kit.py — Extract, import, and remerge code nuggets from spike files.

A spike is a one-page HTML+JS app. Some of its code is reusable ("nuggets"),
the rest is throwaway harness. Markers delimit nugget regions:

    //<< import { Foo } from './foo.js';
    //-- file: ./foo.js --
    //>> import { registry } from './scene.js';
    //>> export { Foo };
    class Foo { ... }
    //-- endfile --

Marker reference:
    //-- file: PATH --   Nugget region start. PATH is relative to the spike file.
    //-- endfile --       Nugget region end.
    //>> CODE            Dormant in spike, active in extracted file (>> = "points out").
    //<< CODE            Active when nugget is imported as a file (<< = "points in").
                         Place << lines immediately before the file: marker.

Comment prefixes // # /* are all recognised. In extracted files, former >> lines
carry a trailing //>> (or #>> or /*>>*/) so remerge can re-comment them.

Three operations:
    extract   Read spike, write each nugget to its file path.
    import    Write a -imported copy of the spike with nuggets replaced by << lines.
    remerge   Read nugget files from disk, update spike with their current content.

Usage: python spike_kit.py <extract|import|remerge> <spike.html>
"""

import sys, re
from pathlib import Path

# ── Patterns ──────────────────────────────────────────────────────

FILE_START = re.compile(r'^(\s*)(//|#|/\*)\s*--\s*file:\s*(.+?)\s*--')
FILE_END   = re.compile(r'^\s*(//|#|/\*)\s*--\s*endfile\s*--')
LINE_OUT   = re.compile(r'^(\s*)(//|#|/\*)\s*>>\s?(.*?)(\s*\*/)?$')
LINE_IN    = re.compile(r'^(\s*)(//|#|/\*)\s*<<\s?(.*?)(\s*\*/)?$')
TRAIL_MARK = re.compile(r'\s*(//>>|#>>|/\*>>\*/)\s*$')

# ── Parsing ───────────────────────────────────────────────────────

def parse(text):
    """Yield ('harness', lines) or ('nugget', path, comment_prefix, body, imports)."""
    lines, buf, i = text.split('\n'), [], 0
    while i < len(lines):
        ms = FILE_START.match(lines[i])
        if ms:
            imports = []
            while buf and LINE_IN.match(buf[-1]):
                imports.insert(0, buf.pop())
            if buf: yield ('harness', buf); buf = []
            cp, path, body = ms.group(2), ms.group(3).strip(), []
            i += 1
            while i < len(lines) and not FILE_END.match(lines[i]):
                body.append(lines[i]); i += 1
            yield ('nugget', path, cp, body, imports)
            i += 1
        else:
            buf.append(lines[i]); i += 1
    if buf: yield ('harness', buf)

# ── Line transforms ──────────────────────────────────────────────

def activate(line):
    """Uncomment a >> or << line: //>> code → code"""
    for pat in (LINE_OUT, LINE_IN):
        m = pat.match(line)
        if m: return m.group(1) + m.group(3)
    return line

def tag_out(line, cp):
    """Activate a >> line and add trailing marker: //>> code → code //>>"""
    m = LINE_OUT.match(line)
    if not m: return line
    trail = ' /*>>*/' if cp == '/*' else f' {cp}>>'
    return m.group(1) + m.group(3) + trail

def untag_out(line, cp):
    """Re-comment a line with trailing >> marker: code //>> → //>> code"""
    m = TRAIL_MARK.search(line)
    if not m: return line
    indent = len(line) - len(line.lstrip())
    code = TRAIL_MARK.sub('', line).strip()
    close = ' */' if cp == '/*' else ''
    return ' ' * indent + cp + '>> ' + code + close

def marker(cp, kind, path=''):
    """Build a file:/endfile marker line."""
    close = ' */' if cp == '/*' else ''
    if kind == 'start': return f'{cp}-- file: {path} --{close}'
    return f'{cp}-- endfile --{close}'

# ── Operations ────────────────────────────────────────────────────

def do_extract(spike_path):
    spike = Path(spike_path)
    for seg in parse(spike.read_text()):
        if seg[0] != 'nugget': continue
        _, path, cp, body, _ = seg
        target = spike.parent / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('\n'.join(tag_out(l, cp) if LINE_OUT.match(l) else l for l in body))
        print(f'  wrote {target}')

def do_import(spike_path):
    spike = Path(spike_path)
    do_extract(spike_path)
    out = []
    for seg in parse(spike.read_text()):
        if seg[0] == 'harness': out.extend(seg[1])
        else: out.extend(activate(il) for il in seg[4])
    dest = spike.parent / (spike.stem + '-imported' + spike.suffix)
    dest.write_text('\n'.join(out))
    print(f'  wrote {dest}')

def do_remerge(spike_path):
    spike = Path(spike_path)
    out = []
    for seg in parse(spike.read_text()):
        if seg[0] == 'harness':
            out.extend(seg[1]); continue
        _, path, cp, _, imports = seg
        source = spike.parent / path
        out.extend(imports)
        out.append(marker(cp, 'start', path))
        if source.exists():
            for fl in source.read_text().split('\n'):
                out.append(untag_out(fl, cp) if TRAIL_MARK.search(fl) else fl)
        else:
            print(f'  WARNING: {source} not found, keeping old content')
            out.extend(seg[3])
        out.append(marker(cp, 'end'))
    spike.write_text('\n'.join(out))
    print(f'  updated {spike}')

# ── CLI ───────────────────────────────────────────────────────────

if __name__ == '__main__':
    ops = {'extract': do_extract, 'import': do_import, 'remerge': do_remerge}
    if len(sys.argv) < 3 or sys.argv[1] not in ops:
        print('Usage: spike_kit.py <extract|import|remerge> <spike.html>')
        sys.exit(1)
    print(f'{sys.argv[1]}: {sys.argv[2]}')
    ops[sys.argv[1]](sys.argv[2])
