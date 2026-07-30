```json
{ "role": "PROMPT"}
```
---

# Markdown+ Mount Pipeline — Elicited Insights

Replaces the legacy `MarkdownProcessor` (string-concatenation `pretty()` renderer) with a DOM-mounting pipeline driven by the scene graph walker. The grammar (`markdown-grammar.js`) already produces a full AST. This work turns that AST into DOM elements via `runPhases` with a `mount` phase.

## Architecture #markdown/mount

The walker already exists: `SceneRegistry.walkPhase` recurses into `node.subtree` and dispatches `(phase, nodeType)` pairs. The mount pipeline registers handlers for the `mount` phase keyed by grammar token name (`md_heading_atx`, `md_paragraph`, etc.). Most handlers are generated from a declarative template table. Non-trivial cases get custom mount functions.

**No new walker, no new framework.** This is wiring existing mechanisms to a new phase.


## Pre-Passes over the AST #markdown/mount

Two pre-passes run on the AST before the mount phase. Both are ad-hoc recursive functions, not walker phases — they mutate the AST in place.

### 1. Emphasis Pairing #markdown/mount

The grammar emits `md_emph_marker` nodes with `.value` of `*`, `**`, `***`, `_`, `__`, `___`, `~~`. The pairer walks each node's subtree, matches openers to closers using a stack (innermost-first via `findLastIndex`), and renames `.type`:

- `*` or `_` → `md_em_start` / `md_em_end`
- `**` or `__` → `md_strong_start` / `md_strong_end`
- `***` or `___` → `md_strongem_start` / `md_strongem_end`
- `~~` → `md_del_start` / `md_del_end`

Unclosed openers get a synthetic closing node appended to the end of the subtree (bold-to-end-of-container — reasonable degradation for malformed input).

### 2. Link Reference Collection #markdown/mount

Walks the AST collecting `md_link_def` nodes into a map keyed by normalised label (lowercase, trimmed). Attaches the map to the AST root as `root.linkDefs`. The link mount handler reads from it when resolving `md_link_ref` and `md_link_collapsed` nodes.


## ctxMix Shape for DOM Mounting #markdown/mount

The mount phase uses ctxMix to thread the current DOM parent through recursion:

```js
ctxMix.parentEl   // current DOM element to append into
ctxMix.linkDefs   // reference map from pre-pass, set once at entry
ctxMix.tableAlign // alignment array, set by table mount, read by cell mount
```

**Entry point:** a function that creates a container element, populates ctxMix, runs the pre-passes, then calls `registry.runPhases(ctxMix, root, params, ['mount'])`. Returns the container.

```js
function mountMarkdown(registry, ast, params = {}) {
  pairEmphasisMarkers(ast);
  collectLinkDefs(ast);

  const container = document.createElement('div');
  container.className = 'md-root';

  const ctxMix = {
    parentEl: container,
    linkDefs: ast.linkDefs || {},
    tableAlign: null,
    iterators: [],
    flyweight: {}
  };

  registry.runPhases(ctxMix, ast, params, ['mount']);
  return container;
}
```


## Template Table #markdown/mount

Most grammar tokens map to a trivial DOM pattern. One class — `MdMountNode` — is registered as the handler for all template-driven tokens. The template table:

```js
const MD_TEMPLATES = {
  // Block containers
  md_paragraph:      { tag: 'p' },
  md_blockquote:     { tag: 'blockquote' },
  md_list_ul:        { tag: 'ul' },
  md_list_ol:        { tag: 'ol' },
  md_item_ul:        { tag: 'li' },
  md_item_ol:        { tag: 'li' },
  md_item_body:      { tag: 'span', className: 'md-item-body' },
  md_table:          { tag: 'table' },
  md_table_header:   { tag: 'thead' },
  md_table_rows:     { tag: 'tbody' },
  md_table_row:      { tag: 'tr' },

  // Self-closing
  md_hr:             { tag: 'hr', selfClosing: true },
  md_hard_break:     { tag: 'br', selfClosing: true },

  // Inline wrappers
  md_code_span:      { tag: 'code' },
  md_autolink:       { tag: 'a', hrefFromValue: true },

  // Emphasis (after pairing pre-pass)
  md_em_start:       { tag: 'em', open: true },
  md_em_end:         { close: 'em' },
  md_strong_start:   { tag: 'strong', open: true },
  md_strong_end:     { close: 'strong' },
  md_strongem_start: { tags: ['strong', 'em'], open: true },
  md_strongem_end:   { close: ['em', 'strong'] },
  md_del_start:      { tag: 'del', open: true },
  md_del_end:        { close: 'del' },

  // Structural (skip, no DOM output)
  md_blank_line:     { skip: true },
  md_link_def:       { skip: true },
  md_table_sep:      { skip: true },

  // Transparent (just recurse, no wrapper element)
  Markdown:          { transparent: true },
  md_block:          { transparent: true },
  md_inline:         { transparent: true },
  md_inline_element: { transparent: true },
  md_para_line:      { transparent: true },
  md_para_cont:      { transparent: true },
  md_bq_rest:        { transparent: true },
  md_bq_cont:        { transparent: true },
  md_bq_line:        { transparent: true },
  md_bq_line_content:{ transparent: true },
  md_bq_inline:      { transparent: true },
  md_bq_blank:       { skip: true },
  md_item_rest:      { transparent: true },
  md_item_cont:      { transparent: true },
  md_item_sub:       { transparent: true },
  md_item_blank_then_block: { transparent: true },
  md_item_block:     { transparent: true },
  md_link_tail:      { transparent: true },
  md_link_inline:    { transparent: true },
  md_table_cells:    { transparent: true },
};
```

### MdMountNode Handler Logic

The `before_mount` handler does:

1. Look up the token in `MD_TEMPLATES`.
2. If `skip`: prevent recursion (replace the subtree iterator with a null iterator).
3. If `transparent`: do nothing, let children mount into the current parentEl.
4. If `selfClosing`: create element, append to parentEl, done. No children.
5. If `open`: create element, append to parentEl, push parentEl, set new parentEl.
6. If `close`: pop parentEl back to the matching opener.
7. Normal `tag`: create element, append to parentEl, push parentEl.
8. If no template and no custom handler: treat as transparent (safe fallback).

The `after_mount` handler pops parentEl for any normal `tag` entry.

The open/close pattern for emphasis is different from the container pattern. Containers push in `before_mount` and pop in `after_mount` — their children are structurally nested in the AST. Emphasis markers are siblings of the content they wrap — the opener pushes a new element, subsequent siblings mount inside it, the closer pops it. This means emphasis open/close manipulates a stack on ctxMix rather than relying on the walker's structural recursion.

```js
// In before_mount:
if (template.open) {
  const tags = template.tags || [template.tag];
  for (const tag of tags) {
    const el = document.createElement(tag);
    ctxMix.parentEl.appendChild(el);
    ctxMix.emphStack.push(ctxMix.parentEl);
    ctxMix.parentEl = el;
  }
}
if (template.close) {
  const tags = Array.isArray(template.close) ? template.close : [template.close];
  for (const _ of tags) {
    ctxMix.parentEl = ctxMix.emphStack.pop();
  }
}
```


## Custom Mount Handlers #markdown/mount

These tokens need logic beyond the template table. Registered as individual handlers on the scene registry, they take priority over the template fallback.

### md_heading_atx #markdown/mount

Reads `.value` (the captured `#` string), counts length to determine level. Creates `<h1>` through `<h6>`. Children (the inline content) mount inside.

```js
// value is e.g. '###'
const level = Math.min(node.value.length, 6);
const el = document.createElement('h' + level);
```

### md_heading_setext #markdown/mount

Inline content is in the first child. The marker (`===` or `---`) is in `.value` of the second child or the seq's captured regex. `=` → h1, `-` → h2.

### md_text #markdown/mount

Creates a `document.createTextNode(node.value)` and appends to parentEl. No element wrapper. No children.

### md_escape #markdown/mount

Creates a text node of the escaped character (the captured value, which is the character after the backslash). Appends to parentEl.

### md_link #markdown/mount

Creates `<a>`. The href comes from the link tail:

- `md_link_inline` → child `md_link_dest` has `.value` with the URL. Optional title from `md_link_title`.
- `md_link_ref` → look up `md_link_label` value in `ctxMix.linkDefs`.
- `md_link_collapsed` → look up the link's own text content in `ctxMix.linkDefs`.

The inline children (between `[` and `]`) are the display text; they mount inside the `<a>`.

### md_image #markdown/mount

Creates `<img>`. Same URL resolution as links. The inline children become the `alt` attribute (extract text content, don't mount as DOM). Self-closing.

### md_table_cell #markdown/mount

Creates `<th>` if inside `md_table_header`, `<td>` otherwise. Reads alignment from `ctxMix.tableAlign[cellIndex]` to set `style.textAlign`. Cell index is the position among siblings.

The table mount handler parses `md_table_sep` value to extract alignment and stores it on `ctxMix.tableAlign` before children mount.

### md_fence #markdown/mount #markdown/geshi

Creates `<pre><code>`. The language tag is from the first regex capture (e.g. `json`, `javascript`, `python`).

If a PEG grammar is registered for that language:
1. Parse the fence body with that grammar.
2. Mount the resulting AST as coloured spans using the generic AST→coloured-spans walker.

If no grammar found: insert body as a text node inside `<code>`. Still gets `<pre>` wrapping.

The `className` on `<code>` includes the language: `language-javascript`.

### md_bq_fence #markdown/mount

Same as `md_fence` but the body lines have already had `>` prefixes stripped by the grammar.

### md_html_inline / md_html_block #markdown/mount

For now: set `innerHTML` on a container element. Security hardening is deferred (`#tools/harden`).

### md_widget #markdown/mount

New grammar production (see below). Mount handler calls `parseDslValue` on the value, calls `createWidget` from omni-widget, mounts the returned element into parentEl.


## Grammar Addition: md_widget #markdown/grammar

Add to `markdown-grammar.js`, in the `md_block` alternatives list (before `md_paragraph`, which is the catch-all):

```js
.addSeq('md_widget', [/^:([a-z][\w-]*):[ \t]*([^\n]*)/ ])
```

This captures the type name and value as regex groups. The mount handler reads type from the first capture, value from the second, and calls `parseDslValue` on the value string.

The `md_widget` production is added to the `md_block` or-list, and also to `md_bq_line_content` and `md_item_block` so widgets work inside blockquotes and list items.


## AST → Coloured Spans Walker #node/walkers/colorize

A generic function, not Markdown-specific. Takes an AST from any grammar parse and a colour map, produces DOM nodes with coloured spans.

```js
function mountColouredAst(ast, colourMap, parentEl) {
  // leaf: create a <span> with colour from colourMap[ast.token], text from source slice
  // container: recurse into subtree
}
```

The colour map is keyed by token name:

```js
const JS_COLOURS = {
  js_string:  'var(--green)',
  js_number:  'var(--orange)',
  js_keyword: 'var(--purple)',
  js_comment: 'var(--text-muted)',
  // ...
};
```

Each grammar ships its own colour map. The fence mount handler looks up both the grammar and the colour map by language tag. This is the multiplicative payoff: every grammar with a colour map gets syntax colouring in fences for free.

Source text reconstruction at leaves uses `input.slice(leaf.jref, leaf.jend)` — the parser already stores these positions. The input string must be threaded through (passed as a parameter or stored on the AST root).


## Build Order #markdown/mount

1. **Emphasis pairer** — standalone function, no dependencies. Test on raw AST output from the grammar.
2. **Link reference collector** — standalone function, no dependencies.
3. **Template table + MdMountNode** — the bulk of the work. Register all template-driven tokens. Test with simple markdown (paragraphs, headings, lists, blockquotes).
4. **Custom handlers** — links, images, headings, tables, text, escape, html passthrough. Each is a small function registered on the scene registry.
5. **`md_widget` grammar production** — add to markdown-grammar.js. Mount handler bridges to `createWidget`.
6. **AST → coloured spans walker** — separate nugget (`#node/walkers/colorize`). Then wire into the fence mount handler.
7. **`mountMarkdown` entry point** — ties everything together.

Steps 1–4 produce a working pipeline for standard markdown. Step 5 retires `{Split}`. Step 6 adds GeSHi. Each step is testable independently.


## Stnda Shape #markdown/mount

The stnda is a split-panel layout: textarea on the left, mounted DOM output on the right. Typing parses, runs pre-passes, mounts, replaces the output. A toggle switches between mounted DOM view and raw AST tree view (for debugging). The harness registers the MdMountNode and custom handlers on a local `SceneRegistry` instance, same as other stnda files.

The emphasis pairer and link collector can have their own test displays (before/after AST token names) within the same stnda, shown below the main preview.

