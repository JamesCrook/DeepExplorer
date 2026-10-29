#!/usr/bin/env python3
# Check that devsrv's Trees page shows each code file's intended title, and fix the files where it does not
"""Check that devsrv's Trees page shows each code file's intended title, and fix the files where it does not.

    python3 tools/titles.py --rules ~/devsrv/config/files.md website attic
    python3 tools/titles.py --rules ~/devsrv/config/files.md website attic --fix

The intended title is the one tools/tree.py finds: the earliest match among the
rules, tidied (comment marks, rule lines, directives and tags passed over).
What devsrv shows is simulated from the same files.md: the first rule that
matches wins, and its match is shown as it is, whitespace collapsed. Where the
two differ the file is listed, and with --fix the intended title becomes a
single-line comment that devsrv's rules find first:

    .js .mjs .cjs   // title    after the import lines, or at the very top if a
                                // line comes before them; an identical // line
                                lower down is removed, so the title moves
    .py .sh         # title     after the #! line; an identical # line is removed
    .css            /* title */ at the very top (CSS has no other comment)

For .js the // row must come before the /* */ row in files.md's Titles table,
or any block comment in the first 8K wins. Files whose intended title looks
wrong (none, a bare file name, ESSENTIALS) are listed and left alone: give
those a title line by hand.
"""
import argparse
import importlib.util
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('tree', os.path.join(HERE, 'tree.py'))
tree = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tree)

CODE = ('.js', '.mjs', '.cjs', '.css', '.py', '.sh')


def shown_by_devsrv(path, by_ext):
    """The title as devsrv's first-rule order shows it: the raw match, whitespace collapsed."""
    rules = by_ext.get(os.path.splitext(path)[1].lower())
    if not rules:
        return ''
    text = open(path, 'rb').read(tree.HEAD).decode('utf-8', 'replace')
    for frm, pat, skip in rules:
        if frm == 'front matter':
            t = tree.front_matter(text, pat)
            if t:
                return t
            continue
        for m in pat.finditer(text):
            if skip and skip.search(m.group(0)):
                continue
            return re.sub(r'\s+', ' ', m.group(1)).strip()
    return ''


def doubtful(path, title):
    base = os.path.basename(path)
    stem = os.path.splitext(base)[0]
    return (not title or title.upper() == 'ESSENTIALS'
            or re.sub(r'[\s—:-]+$', '', title) in (base, stem))


def import_end(lines):
    """Index of the first line after the leading import/export statements (and blank lines)."""
    i, n = 0, len(lines)
    while i < n:
        s = lines[i].strip()
        if not s or re.match(r'//\s*import\b', s) or s in ("'use strict';", '"use strict";'):
            i += 1
            continue
        if (re.match(r'(import|export)\s*[{*\'"]|import\s+[\w$]', s)
                and not re.match(r'export\s+(class|function|const|let|default|async)', s)):
            while i < n and not re.search(r"""(['"][^'"]*['"]\s*;?\s*(//.*)?$)|;\s*(//.*)?$""", lines[i]):
                i += 1
            i += 1
            continue
        break
    while i > 0 and not lines[i - 1].strip():
        i -= 1
    return i


RULE = re.compile(r'^\s*(//|#)\s*[─═=*#-]{4,}\s*$')


def drop_line(lines, own):
    """lines without the old copy of the title; a banner of rule lines that held only it goes too."""
    out = list(lines)
    for k in [i for i, l in enumerate(out) if l.strip() == own][::-1]:
        if 0 < k < len(out) - 1 and RULE.match(out[k - 1]) and RULE.match(out[k + 1]):
            del out[k - 1:k + 2]
            if 0 < k - 1 < len(out) and not out[k - 1].strip() and not out[k - 2].strip():
                del out[k - 1]
        else:
            del out[k]
    return out


def fix(path, title):
    ext = os.path.splitext(path)[1].lower()
    lines = open(path, encoding='utf-8').read().split('\n')
    if ext == '.css':
        new = ['/* %s */' % title, ''] + lines
    elif ext in ('.py', '.sh'):
        own = '# ' + title
        lines = drop_line(lines, own)
        at = 1 if lines and lines[0].startswith('#!') else 0
        new = lines[:at] + [own] + lines[at:]
    else:
        own = '// ' + title
        lines = drop_line(lines, own)
        end = import_end(lines)
        if end == 0 or any(l.lstrip().startswith('//') for l in lines[:end]):
            new = [own] + ([''] if lines and lines[0].strip() else []) + lines
        else:
            rest = lines[end:]
            while rest and not rest[0].strip():
                rest = rest[1:]
            new = lines[:end] + ['', own, ''] + rest
    open(path, 'w', encoding='utf-8').write('\n'.join(new))


def files_under(paths):
    for p in paths:
        try:
            out = subprocess.run(['git', '-C', p, 'ls-files', '-co', '--exclude-standard'],
                                 capture_output=True, check=True, text=True).stdout.split('\n')
            yield from (os.path.join(p, f) for f in out if f.endswith(CODE))
        except (OSError, subprocess.CalledProcessError):
            for d, dirs, fs in os.walk(p):
                dirs[:] = [x for x in dirs if x not in ('.git', 'node_modules', '__pycache__')]
                yield from (os.path.join(d, f) for f in fs if f.endswith(CODE))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('paths', nargs='*', default=['.'])
    ap.add_argument('--rules', help="devsrv's config/files.md (default: tree.py's built-in rows)")
    ap.add_argument('--fix', action='store_true', help='rewrite the files so devsrv shows the intended title')
    a = ap.parse_args()

    rules = tree.read_rules(a.rules) if a.rules else tree.RULES
    by_ext = tree.compile_rules(rules)
    wrong, unsure, fixed = [], [], 0
    for path in sorted(set(files_under(a.paths))):
        if not os.path.isfile(path):
            continue
        want = tree.title_of(path, by_ext)
        if doubtful(path, want):
            unsure.append((path, want))
            continue
        got = shown_by_devsrv(path, by_ext)
        if got == want or re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', got)).strip() == want:
            continue   # (tree.py drops <name> as if it were an HTML tag)
        wrong.append((path, got, want))
        if a.fix:
            fix(path, want)
            if shown_by_devsrv(path, by_ext) == want:
                fixed += 1
            else:
                print(f'STILL WRONG {path}: {shown_by_devsrv(path, by_ext)[:80]}')

    for path, got, want in wrong:
        print(f'{path}\n    shows  {got[:100]}\n    title  {want}')
    if unsure:
        print('\nNo good title to use — give these a title line by hand:')
        for path, want in unsure:
            print(f'    {path}   ({want or "none"})')
    print(f'\n{len(wrong)} shown wrongly' + (f', {fixed} fixed' if a.fix else '') + f', {len(unsure)} need a title')


if __name__ == '__main__':
    main()
