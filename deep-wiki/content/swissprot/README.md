# New content

Drop these into `content/blender/` and `content/swissprot/`, replacing the two
`_index.md` files. Every file transforms with zero unmatched blocks against the
current `_rules.md`.

## One bug fixed in the Blender index

`[[DNA / RNA]]` cannot work. `_loadNote` builds the path as
`${server}/${name}.md`, so that link resolves to `blender/DNA / RNA.md` — the
slash is a path separator and the fetch looks for a `DNA ` directory. The link
is now `[[DNA-RNA|DNA / RNA]]`: the file is `DNA-RNA.md`, the label is
unchanged, and the sidebar looks identical.

Worth deciding at the rule level rather than per link. Any wikilink target
containing `/` has the same problem, and a note whose title naturally contains
a slash is not unusual — the alias form is the workaround, not the fix.

## Still stubs

Both indexes link to notes that do not exist yet. Clicking one logs a warning
and leaves col3 as it was, which is a reasonable failure but not an obvious one.

- **blender** — Curves, 3D Viewport, UV Editor, Node Editor, Architecture,
  Data Flow, Files & Classes
- **swissprot** — E. coli (K-12), S. cerevisiae, A. thaliana, GPCRs,
  Immunoglobulins, P00533, P68871, Pathways, Cell Structure, Schema Mappings,
  Protein Finder

## What each file is for

| file | what it exercises |
|---|---|
| `blender/Mesh.md` | the prose floor — one bare paragraph renders as `.md-p` |
| `blender/DNA-RNA.md` | long callout bodies, sparse variant rows |
| `blender/Dependency Graph.md` | four-speaker conversation, cast lookup |
| `blender/Idiolect.md` | card-dense page, no diagrams, no rows |
| `swissprot/Mus musculus.md` | organism channel with comparison framing |
| `swissprot/Kinases.md` | family channel, `card|sparse` variant |
| `swissprot/P04637.md` | **entry page** — the DB-shaped note |
| `swissprot/Idiolect.md` | six cards, two row groups |
| `swissprot/Complexes.md` | cross-channel navigation |
