# Deep Explorer

The corpora this project browses, and where configuration is read from.

%%config layers=_project.md, _local.md, local:_settings.md; writes=local:_settings.md%%

Precedence is positional — later layers win, per key. A layer may extend the
sequence but never reorder it, and there is no way for a file to declare that
it outranks the ones after it. A key that genuinely must not be overridden
says so itself with `locked: true`.

Three layers, each with a different writer:

| layer | written by | lives in |
|---|---|---|
| `_project.md` | the project author, by hand | the vault |
| `_local.md` | you, by hand — or pasted from a download | the vault |
| `local:_settings.md` | the app, when you press Keep | the browser |

The browser layer is a LAYER, not a replacement: it does not shadow either
vault file, so an edit to `_local.md` still reaches every key you have not
personally set. Personal settings win because they come last, not because they
hide anything.

None need exist — a missing layer is an empty layer. Download the browser
layer to make it portable, paste it into `_local.md` to make it permanent,
then discard the browser copy. All three actions are buttons on the Settings
page.

## Corpora

- ⚙ [[gear|Settings]] %%bg=#3a3d4d%%

---
-    [![TheImage](images/s-server-streams.png)](streams) %%bg=#d4700a%%
-    [![TheImage](images/s-server-garden.png)](garden) %%bg=#8b2240%%
-    [![TheImage](images/s-server-library.png)](library) %%bg=#5865f2%%
---
-    [![Blender](images/blender-logo.png)](blender) %%bg=#f0f0d0%%
- 🧬 [[swissprot|SwissProt]] %%bg=#8b2240%%
- 🌋 [[omniscene|OmniScene]] %%bg=#5865f2%%

```html
<div class="srv-sep"></div>
<div class="srv" style="font-size:calc(var(--srv-btn-size) * 0.45 * 1px);color:var(--text-3);background:transparent">+<div class="tip">Add domain</div></div>
```

## Defaults

An island here is project scope. The same island in `_local.md` is personal
scope — nothing about the syntax says which, only where it sits.

`var` is optional: it says a key also mirrors to a CSS custom property. The
resolver's output is a map, and CSS is a projection of it rather than the
storage, so keys CSS cannot hold live here too.

```omni type=config
- key: default-corpus
  value: omniscene
- key: theme
  value: midnight
- key: col2-width
  var: --col2-width
  value: 260
  min: 180
  max: 420
  unit: px
```

## Themes

A theme is a named set of key → value at app scope — the same object as the
`presets` in a scene spec, which is a named set at scene scope. So it reuses
the config island rather than inventing a format, and `theme` is an ordinary
config key: choosing one persists through exactly the same machinery as any
slider.

Themes sit between the layers and the session. A declared value is the floor,
the theme repaints it, and anything you then adjust by hand wins over both —
so switching theme never discards your tweaks.

Two kinds of entry. A `key`/`var` pair drives a custom property. A
`sel`/`prop`/`value` triple writes a declaration directly, which is the only
way to reach a value a stylesheet hardcoded rather than reading from a
variable — `.servers` here, whose background omni-scene.css sets literally.

The variable names below are the palette omni-scene.css declares in its
`:root`, plus the slider geometry it declares alongside — a theme that only
recolours is a weaker thing than one that also changes the shape of every
control. `--srv-bg` is deliberately absent: it is set per server from
`%%bg=…%%`, so a theme claiming it would flatten the strip.

`\config vars` re-checks all of this against whatever is actually loaded:
anything listed *inert* is a theme entry driving nothing.

```omni type=theme; id=dark
- key: bg
  var: --bg
  value: #14151e
- key: surface
  var: --surface
  value: #1c1d2b
- key: surface-2
  var: --surface-2
  value: #242536
- key: surface-hover
  var: --surface-hover
  value: #2a2c3e
- key: border
  var: --border
  value: #2e3048
- key: text-1
  var: --text-1
  value: #d8dae5
- key: text-2
  var: --text-2
  value: #8789a3
- key: text-3
  var: --text-3
  value: #5c5e78
- key: accent
  var: --accent
  value: #6e9ef7
- key: accent-dim
  var: --accent-dim
  value: #6e9ef733
- key: wiki
  var: --wiki
  value: #dba06a
- key: docstring
  var: --docstring
  value: #6b7a8d
- key: channel-active
  var: --channel-active
  value: #2e3050
# omni-scene.css hardcodes the server strip; no variable reaches it.
- sel: .servers
  prop: background
  value: #111118
- sel: .servers
  prop: border-right-color
  value: #1a1b24
```

```omni type=theme; id=midnight
- key: bg
  var: --bg
  value: #080a12
- key: surface
  var: --surface
  value: #0e1019
- key: surface-2
  var: --surface-2
  value: #151827
- key: surface-hover
  var: --surface-hover
  value: #1c2033
- key: border
  var: --border
  value: #1e2338
- key: text-1
  var: --text-1
  value: #dfe4f2
- key: text-2
  var: --text-2
  value: #8890ac
- key: text-3
  var: --text-3
  value: #525a74
- key: accent
  var: --accent
  value: #7b8cff
- key: accent-dim
  var: --accent-dim
  value: #7b8cff33
- key: wiki
  var: --wiki
  value: #d8a878
- key: docstring
  var: --docstring
  value: #66748a
- key: channel-active
  var: --channel-active
  value: #232a4a
# omni-scene.css hardcodes the server strip; no variable reaches it.
- sel: .servers
  prop: background
  value: #05060c
- sel: .servers
  prop: border-right-color
  value: #12141f
```

```omni type=theme; id=slate
- key: bg
  var: --bg
  value: #1b1e22
- key: surface
  var: --surface
  value: #24282e
- key: surface-2
  var: --surface-2
  value: #2c3138
- key: surface-hover
  var: --surface-hover
  value: #353b44
- key: border
  var: --border
  value: #3a4049
- key: text-1
  var: --text-1
  value: #eceef1
- key: text-2
  var: --text-2
  value: #9aa3ae
- key: text-3
  var: --text-3
  value: #6d7681
- key: accent
  var: --accent
  value: #4f9d8c
- key: accent-dim
  var: --accent-dim
  value: #4f9d8c33
- key: wiki
  var: --wiki
  value: #c2a878
- key: docstring
  var: --docstring
  value: #7a8590
- key: channel-active
  var: --channel-active
  value: #314340
# omni-scene.css hardcodes the server strip; no variable reaches it.
- sel: .servers
  prop: background
  value: #141619
- sel: .servers
  prop: border-right-color
  value: #242830
```
