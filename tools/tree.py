#!/usr/bin/env python3
# ASCII file tree with each file's title line beside it, to read a project at a glance
"""ASCII file tree with each file's title line beside it, to read a project at a glance."""

# This is a command-line cousin of devsrv's Trees page. A file's title is the
# first line that says what it is: a .md file's first heading, an .html file's
# <title>, a code file's opening comment. Run it to see the project as a list of
# one-line explanations, and with --untitled to find the files that don't
# explain themselves yet.
#
#   python3 tools/tree.py website/js
#   python3 tools/tree.py website --depth 2 --date
#   python3 tools/tree.py website/js --untitled
#   python3 tools/tree.py . --rules ~/devsrv/config/files.md
#
# Code files are titled by their opening comment only: the comment block the
# file starts with, // or /* */ or #, first line with words in it. devsrv's
# files.md instead tries "first /* */ anywhere in 8K", then "first // line",
# and that lets a stray block comment far down the file (a commented-out line,
# a JSDoc on a method) stand in for a title. --rules reads a files.md and uses
# its table instead, to see exactly what the Trees page shows.

import argparse
import os
import re
import subprocess
import sys
import time

EXCLUDE = '.git, .DS_Store, node_modules, __pycache__, .venv, venv'
HEAD = 8192  # titles are looked for in the first 8K, as devsrv does

# Opening comments. The group is the whole block; tidy() picks its title line.
# In JS the import and export-list lines may come first: this repo puts them
# above the header comment. A trailing // note on an import line is skipped,
# and so is a commented-out import among them.
_IMPORT = r"""import\s*(?:[\w$*{}\s,]+?\s*from\s*)?['"][^'"\n]*['"][ \t]*;?"""
_EXPORT = r"""export\s*(?:\{[^}]*\}|\*(?:\s*as\s+[\w$]+)?)(?:\s*from\s*['"][^'"\n]*['"])?[ \t]*;?"""
_PREAMBLE = r"""(?:\s*(?:%s|%s|['"]use strict['"][ \t]*;?|//[ \t]*import\b[^\n]*)[ \t]*(?://[^\n]*)?)*""" % (_IMPORT, _EXPORT)
JS_OPENING = r'(?s)\A' + _PREAMBLE + r'\s*^[ \t]*(/\*.*?\*/|(?://[^\n]*(?:\n|\Z)[ \t]*)+)'
HASH_OPENING = r'(?s)\A(?:#![^\n]*\n)?\s*((?:#[^\n]*(?:\n|\Z)[ \t]*)+|""".*?"""|\'\'\'.*?\'\'\')'

# (extensions, from, pattern, skip), as rows of devsrv's files.md Titles table.
# The first rule for a file's extension that finds a title wins; a match that
# also matches skip is passed over and the search goes on.
RULES = [
    ('.md .markdown', 'front matter', r'title', ''),
    ('.md .markdown', 'text', r'^#\s+(.+?)\s*#*\s*$', r'^#\s+@'),
    ('.html .htm', 'text', r'(?is)<title[^>]*>(.*?)</title>', ''),
    ('.js .mjs .cjs .ts .css', 'text', JS_OPENING, ''),
    ('.py .sh', 'text', HASH_OPENING, ''),
]


def read_rules(path):
    """The Titles table of a devsrv files.md, as RULES."""
    rules, inside = [], False
    for line in open(path, encoding='utf-8'):
        if line.startswith('#'):
            inside = line.strip().lower() == '## titles'
            continue
        cells = [c.strip().strip('`') for c in line.strip().strip('|').split('|')]
        if inside and line.startswith('|') and len(cells) >= 3 and cells[1] in ('text', 'front matter'):
            rules.append((cells[0], cells[1], cells[2], cells[3] if len(cells) > 3 else ''))
    return rules or RULES


def compile_rules(rules):
    """By extension: a list of (from, compiled pattern, compiled skip)."""
    by_ext = {}
    for exts, frm, pat, skip in rules:
        p = re.compile(pat, re.M) if frm == 'text' else pat
        s = re.compile(skip, re.M) if skip else None
        for e in exts.split():
            by_ext.setdefault(e.lower(), []).append((frm, p, s))
    return by_ext


# Lines in an opening comment that are never its title: linter and tool directives,
# and commented-out imports.
DIRECTIVE = re.compile(r'^(@|global\b|import\b|export\b|eslint|jshint|jslint|@ts-|-\*-|type:|noqa|pylint|vim:)')


def tidy(t):
    """One line from a match that may span several: comment marks, tags and @fileoverview
    gone, directives and rules of ─── or === passed over, first line with words kept."""
    for line in t.splitlines():
        line = re.sub(r'<[^>]+>', '', line.strip().lstrip('/*#').strip())
        line = re.sub(r'(\*/|"""|\'\'\')$', '', line).strip()
        line = re.sub(r'^@(fileoverview|file|overview)\s*', '', line)
        if DIRECTIVE.match(line) or not re.search(r'[^\W_]', line):
            continue
        return re.sub(r'\s+', ' ', line.strip('"\' '))
    return ''


def front_matter(text, key):
    lines = text.split('\n')
    if not lines or lines[0].strip() != '---':
        return ''
    for line in lines[1:]:
        if line.strip() == '---':
            break
        k, _, v = line.partition(':')
        if k.strip() == key:
            return v.strip().strip('"\'')
    return ''


def title_of(path, by_ext):
    rules = by_ext.get(os.path.splitext(path)[1].lower())
    if not rules:
        return ''
    try:
        with open(path, 'rb') as f:
            text = f.read(HEAD).decode('utf-8', 'replace')
    except OSError:
        return ''
    for frm, pat, skip in rules:
        if frm == 'front matter':
            t = front_matter(text, pat)
            if t:
                return t
            continue
        for m in pat.finditer(text):
            if skip and skip.search(m.group(0)):
                continue
            t = tidy(m.group(1))
            if t:
                return t
    return ''


# ---- reading the tree ----

def git_files(root):
    """Files as git sees them (tracked, plus untracked not ignored), or None outside a repo."""
    try:
        out = subprocess.run(['git', '-C', root, 'ls-files', '-co', '--exclude-standard', '-z'],
                             capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    return [p for p in out.decode('utf-8', 'replace').split('\0') if p]


def walk_files(root, exclude):
    found = []
    for d, dirs, files in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in exclude)
        rel = os.path.relpath(d, root)
        for f in files:
            if f not in exclude:
                found.append(f if rel == '.' else os.path.join(rel, f).replace(os.sep, '/'))
    return found


def build(root, rels, exclude, by_ext, titles):
    tree = {'name': os.path.basename(os.path.abspath(root)), 'dir': True, 'kids': {}}
    for rel in rels:
        parts = rel.split('/')
        if any(p in exclude for p in parts):
            continue
        full = os.path.join(root, rel)
        if not os.path.isfile(full):
            continue          # deleted but still tracked, or a submodule
        node = tree
        for p in parts[:-1]:
            node = node['kids'].setdefault(p, {'name': p, 'dir': True, 'kids': {}})
        st = os.stat(full)
        node['kids'][parts[-1]] = {'name': parts[-1], 'dir': False, 'size': st.st_size,
                                   'mtime': st.st_mtime, 'path': rel,
                                   'title': title_of(full, by_ext) if titles else ''}
    return totals(tree)


def totals(n):
    if not n['dir']:
        n['files'] = 1
        return n
    kids = [totals(k) for k in n['kids'].values()]
    n['size'] = sum(k['size'] for k in kids)
    n['mtime'] = max((k['mtime'] for k in kids), default=0)
    n['files'] = sum(k['files'] for k in kids)
    return n


# ---- drawing ----

def lines_of(tree, label, a):
    out = []

    def order(kids):
        key = (lambda k: (not k['dir'], -k['mtime'], k['name'].lower())) if a.newest \
            else (lambda k: (not k['dir'], k['name'].lower()))
        return sorted(kids, key=key)

    def walk(n, prefix, last, depth, root):
        kids = order(n['kids'].values()) if n['dir'] else []
        if a.dirs_only:
            kids = [k for k in kids if k['dir']]
        files = [k for k in kids if not k['dir']]
        if a.cap and len(files) > a.cap:
            rest = files[a.cap:]
            kids = [k for k in kids if k not in rest]
            kids.append({'name': f'(+{len(rest)} more files)', 'dir': False, 'more': True,
                         'size': sum(k['size'] for k in rest), 'mtime': max(k['mtime'] for k in rest)})
        opened = n['dir'] and (not a.depth or depth < a.depth)
        name = label + '/' if root else n['name'] + ('/' if n['dir'] else '')
        if n['dir'] and not opened and kids:
            name += ' [...]'
        out.append((('' if root else prefix + ('└─ ' if last else '├─ ')) + name, n))
        if opened:
            pre = '' if root else prefix + ('   ' if last else '│  ')
            for i, k in enumerate(kids):
                walk(k, pre, i == len(kids) - 1, depth + 1, False)

    walk(tree, '', True, 0, True)
    return out


def hsize(b):
    if b < 1024:
        return f'{b}B'
    v = float(b)
    for u in 'KMGT':
        v /= 1024
        if v < 1024 or u == 'T':
            return f'{v:.1f}{u}' if v < 10 else f'{round(v)}{u}'


def render(blocks, a):
    width = max((len(t) for b in blocks for t, _ in b), default=0)
    text = []
    for b in blocks:
        rows = []
        for t, n in b:
            tail = n.get('title', '')
            if a.width and len(tail) > a.width:
                tail = tail[:a.width - 1] + '…'
            if not (a.date or a.size or tail):
                rows.append(t)
                continue
            s = t.ljust(width)
            if a.date:
                s += '  ' + time.strftime('%Y-%m-%d', time.localtime(n['mtime'])) if n['mtime'] else ' ' * 12
            if a.size:
                s += '  ' + hsize(n['size']).rjust(6)
            if tail:
                s += '   # ' + tail
            rows.append(s.rstrip())
        text.append('\n'.join(rows))
    return '\n\n'.join(text)


def each_file(n):
    if not n['dir']:
        yield n
    else:
        for k in n['kids'].values():
            yield from each_file(k)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('paths', nargs='*', default=['.'], help='folders to list (default: .)')
    ap.add_argument('--no-titles', dest='titles', action='store_false', help='leave out the title column')
    ap.add_argument('--date', action='store_true', help='last change (folders: newest file inside)')
    ap.add_argument('--size', action='store_true', help='size (folders: total)')
    ap.add_argument('--depth', type=int, default=0, help='levels to open; 0 for all')
    ap.add_argument('--cap', type=int, default=0, help='files listed per folder; the rest are counted')
    ap.add_argument('--dirs-only', action='store_true', help='folders only')
    ap.add_argument('--newest', action='store_true', help='newest first, not by name')
    ap.add_argument('--width', type=int, default=110, help='cut titles to this many characters; 0 for no cut')
    ap.add_argument('--exclude', default=EXCLUDE, help=f'names left out anywhere (default: {EXCLUDE})')
    ap.add_argument('--no-gitignore', dest='gitignore', action='store_false',
                    help='read the folders directly, not as git sees them')
    ap.add_argument('--rules', help="a devsrv files.md whose Titles table replaces the built-in rules")
    ap.add_argument('--untitled', action='store_true',
                    help='list only the files a rule covers that have no title, one path per line')
    ap.add_argument('-o', '--out', help='write here instead of stdout')
    a = ap.parse_args()

    by_ext = compile_rules(read_rules(a.rules) if a.rules else RULES)
    exclude = {x.strip() for x in a.exclude.split(',') if x.strip()}
    blocks, untitled = [], []
    for p in a.paths:
        root = p.rstrip('/') or '/'
        rels = git_files(root) if a.gitignore else None
        if rels is None:
            rels = walk_files(root, exclude)
        tree = build(root, rels, exclude, by_ext, a.titles or a.untitled)
        if a.untitled:
            untitled += [os.path.join(root, f['path']) for f in each_file(tree)
                         if not f['title'] and os.path.splitext(f['name'])[1].lower() in by_ext]
            continue
        label = os.path.normpath(p) if p not in ('.', './') else tree['name']
        blocks.append(lines_of(tree, label, a))

    text = '\n'.join(sorted(untitled)) if a.untitled else render(blocks, a)
    if a.out:
        with open(a.out, 'w', encoding='utf-8') as f:
            f.write(text + '\n')
    else:
        sys.stdout.write(text + '\n')


if __name__ == '__main__':
    main()
