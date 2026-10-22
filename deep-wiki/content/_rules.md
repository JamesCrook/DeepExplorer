# Rules

This file defines how markdown+ becomes widgets. It is ordinary markdown —
Obsidian shows the prose and folds the islands as code blocks.

Two conventions carry everything Obsidian shouldn't render, both using `%%`,
which is an Obsidian comment and therefore invisible in preview:

- **trailing** — `- B [[BMesh]] 58/30 %%active%%` attaches attributes to a line
- **standalone** — `%%tags datastructures=ds%%` is a widget with no prose

Everything else is real markdown: headings, lists, callouts, code fences,
wikilinks. A note that never touches an island still renders — anything no
rule claims falls through to the prose rules at the foot of this file.

## Four axes

An earlier draft collapsed these into one field called `zone`, which was
wrong in three different ways:

| field | question |
|---|---|
| `emit` | what widget to build |
| `where` | which documents the rule may match in — a **role**, not a column |
| `zoneOut` | which zone the widget mounts in |
| `nav` | what a click loads: `server`, `index` or `note` |

Roles are `servers`, `index`, `note` and `chat`. A document sets its own with
`%%doc role=chat%%`; otherwise `_servers.md` is `servers`, `_index.md` is
`index`, and everything else is `note`.

**A rule with `attr:` ignores `where` entirely.** That is the general
mechanism: `- 🦊 [[blender|Blender]] %%server%%` builds a server icon in any
document, in any column. The unmarked rules stay scoped so that a list item
in an index and a list item in a note can still mean different things.

## Cast

Speakers are matched by pattern, not registry. An unlisted name still parses:
`deriveSpeaker` takes initials for the avatar and hashes the name to a role,
so an imported chat log needs no cast at all. This island only refines the
handful we already know.

```omni type=cast
- id: deep
  name: Deep Explorer
  avatar: 深
  role: bot
- id: rkwright
  name: rkwright
  avatar: rk
  role: u1
- id: j_martinez
  name: j_martinez
  avatar: jm
  role: u2
- id: k_tanaka
  name: k_tanaka
  avatar: kt
  role: u3
- id: a_lindqvist
  name: a_lindqvist
  avatar: al
  role: u3
- id: r_patel
  name: r_patel
  avatar: rp
  role: u1
```

## Document configuration

```omni type=rules
- id: doc
  on: directive
  directive: doc
  emit: meta

- id: index-meta
  on: directive
  directive: index
  emit: meta
  provides: icon

- id: config
  on: directive
  directive: config
  emit: meta

- id: servers-title
  on: heading
  where: servers
  emit: meta

- id: servers-prose
  on: para
  where: servers
  emit: meta
```

## Setting values

A click does not have to load a document. `%%set=theme; to=midnight%%` on any
list item makes it a switch for a configuration key — and because the rule is
marked with `attr:`, it ignores `where` and works in any document, not just
the settings index.

The rule names neither the key nor the value: both come off the line, so one
rule covers themes, the default corpus, and anything else declared in a config
island.

```omni type=rules
- id: set-config
  on: item
  attr: set
  match: ^(?:(?<icon>\S+)\s+)?(?:\[\[(?<note>[^\]|]+)(?:\|(?<label>[^\]]+))?\]\]|(?<plain>.+?))\s*$
  emit: topic
  nav: config
  with: icon=$<icon>; label=$<label|note|plain>; key=$<set>; value=$<to>
```

## Servers

The marked rule comes first, so `%%server%%` wins wherever it appears. The
unmarked one keeps `_servers.md` terse.

`nav: server` loads two files — the folder's `_index.md` into col2 and its
default note into col3 — which is why navigation is a kind and not a column.

```omni type=rules
- id: server-marked
  on: item
  attr: server
  match: ^(?<icon>\S+)\s+\[\[(?<url>[^\]|]+)(?:\|(?<name>[^\]]+))?\]\]
  emit: server
  nav: server
  with: icon=$<icon>; id=$<url>; url=$<url>; name=$<name|url>

- id: server-pic
  on: item
  where: servers
  match: ^\s*\[!\[(?<alt>[^\]]+)\]\((?<pic>[^\)]+)\)\]\((?<url>[^\)]+)\)
  emit: server
  nav: server
  with: icon=Z; alt=$<alt>; pic=$<pic>; id=$<url>; url=$<url>; name=None

- id: server
  on: item
  where: servers
  match: ^(?<icon>\S+)\s+\[\[(?<url>[^\]|]+)\|(?<name>[^\]]+)\]\]
  emit: server
  nav: server
  with: icon=$<icon>; id=$<url>; url=$<url>; name=$<name>

- id: server-soon
  on: item
  where: servers
  match: ^(?<icon>\S+)\s+(?<name>.+)$
  emit: server
  with: icon=$<icon>; id=$<name>; name=$<name>

- id: separator
  on: hr
  where: servers
  emit: separator

- id: raw-html
  on: fence
  lang: html
  emit: html
  content: body
  raw: true
```

## Index — col2

A group heading hands its colours down to the topics beneath it, so the
33 repetitions of `bg` and `fg` in the old format collapse to four lines.

An icon, a wikilink, then either `58/30` for coverage or free text for meta.
A topic can override its destination with `%%nav=index%%`, which repoints the
sidebar without touching col3.

```omni type=rules
- id: index-title
  on: heading
  where: index
  level: 1
  emit: header
  inherits: icon
  zoneOut: col2.head
  content: $<title>
  match: ^(?<title>.+)$

- id: group
  on: heading
  where: index
  level: 2
  emit: group
  scalar: $<label>
  provides: bg,fg
  match: ^(?<label>.+)$

- id: index-banner
  on: item
  where: index
  match: ^\s*!!\[(?<alt>[^\]]+)\]\((?<pic>[^\)]+)\)
  emit: banner
  with: icon=V; alt=$<alt>; pic=$<pic>; id=none; url=none; name=None

- id: topic-coverage
  on: item
  where: index
  inherits: bg,fg
  match: ^(?<icon>\S+)\s+\[\[(?<note>[^\]|]+)(?:\|(?<label>[^\]]+))?\]\]\s+(?<doc>\d+)/(?<wiki>\d+)\s*$
  emit: topic
  nav: note
  with: icon=$<icon>; label=$<label|note>; note=$<note>; id=$<note>; doc=$<doc>; wiki=$<wiki>

- id: topic-meta
  on: item
  where: index
  inherits: bg,fg
  match: ^(?<icon>\S+)\s+\[\[(?<note>[^\]|]+)(?:\|(?<label>[^\]]+))?\]\](?:\s+(?<meta>.+?))?\s*$
  emit: topic
  nav: note
  with: icon=$<icon>; label=$<label|note>; note=$<note>; id=$<note>; meta=$<meta>

- id: legend
  on: directive
  directive: legend
  emit: legend

- id: controls
  on: fence
  lang: omni
  attr: type=controls
  emit: controls
  content: body
  raw: true
```

## Notes and chat — col3

The note's `# H1` is the channel header; an em-dash line beneath it is the
subtitle, which `fold=desc` hands to the header rather than drawing. The
index's `# H1` shows the corpus icon, which `%%index icon=…%%` provides and
the header rule inherits.

Two speaker rules. In a `chat` document any name works, because that is what
the file is. Elsewhere the name must be one the cast knows, so `Note:` and
`TODO:` in prose stay prose.

```omni type=rules
- id: chatheader
  on: heading
  where: note,chat
  level: 1
  emit: chatheader
  with: name=$<name>
  match: ^(?<name>.+)$

- id: subtitle
  on: para
  where: note,chat
  match: ^(?<desc>—\s.+)$
  emit: subtitle
  with: desc=$<desc>; fold=desc

- id: message-open
  on: para
  where: chat
  match: ^(?<who>[a-z][\w.-]{0,15}):[ \t]+(?:\((?<time>[^)]*)\)[ \t]*)?(?<body>[\s\S]+)$
  emit: message
  derive: who
  with: time=$<time>
  content: $<body>

- id: message
  on: para
  where: note
  requires: cast
  match: ^(?<who>[a-z][\w.-]{0,15}):[ \t]+(?:\((?<time>[^)]*)\)[ \t]*)?(?<body>[\s\S]+)$
  emit: message
  with: time=$<time>
  content: $<body>

- id: card
  on: callout
  callout: card
  variant:
  emit: card
  with: title=$<title>; doc=$<doc>; wiki=$<wiki>
  content: body
  match: ^(?<title>.+?)(?:\s+(?<doc>\d+)/(?<wiki>\d+))?\s*$

- id: card-sparse
  on: callout
  callout: card
  variant: sparse
  emit: card
  content: body
  with: title=$<title>; doc=$<doc>; wiki=$<wiki>; titleStyle=color:var(--text-3); textStyle=color:var(--text-3); barStyle=border-color:#4a3535; warn=⚠ Sparse coverage — mostly raw code.
  match: ^(?<title>.+?)(?:\s+(?<doc>\d+)/(?<wiki>\d+))?\s*$

- id: row-sparse
  on: item
  where: note,chat
  attr: variant=sparse
  match: ^(?<label>.+?)\s+(?<doc>\d+)/(?<wiki>\d+)(?:\s+`(?<badge>[^`]*)`)?\s*$
  emit: row
  with: label=$<label>; doc=$<doc>; wiki=$<wiki>; badge=$<badge>; labelStyle=color:var(--text-3); badgeStyle=color:#a06060; barStyle="outline:1px solid #4a3535;border-radius:3px"

- id: row
  on: item
  where: note,chat
  match: ^(?<label>.+?)\s+(?<doc>\d+)/(?<wiki>\d+)(?:\s+`(?<badge>[^`]*)`)?\s*$
  emit: row
  with: label=$<label>; doc=$<doc>; wiki=$<wiki>; badge=$<badge>

- id: link
  on: para
  where: note,chat
  match: ^(?<text>→\s[\s\S]+)$
  emit: arrow-link
  scalar: $<text>

- id: tags
  on: directive
  directive: tags
  emit: tags

- id: diagrams
  on: directive
  directive: diagrams
  emit: diagrams
  scalar: $<list>
  split: ,
  match: ^(?<list>.+)$

- id: stage
  on: directive
  directive: stage
  emit: stage

- id: code
  on: fence
  lang: json
  emit: code
  with: lang=json
  content: body
  raw: true

- id: input
  on: directive
  directive: input
  emit: input
  zoneOut: widgets
```

## Prose — the floor

Everything above is a special reading. These are the fallbacks, and they are last, because first match wins. The priority:-1000 makes them stay last, even when new rules are added.

Without them a line no rule recognised vanishes silently, which is wrong for
a viewer: most of a real note is ordinary prose that no widget claims, and it
still has to render.


```omni type=rules
- id: prose-heading
  on: heading
  emit: html
  content: $<text>
  wrap: <div class="md-h">$</div>
  match: ^(?<text>[\s\S]+)$
  priority: -1000

- id: prose-bullet
  on: item
  emit: html
  content: $<text>
  wrap: <div class="md-li">$</div>
  match: ^(?<text>[\s\S]+)$
  priority: -1000

- id: prose-para
  on: para
  emit: html
  content: $<text>
  wrap: <div class="md-p">$</div>
  match: ^(?<text>[\s\S]+)$
  priority: -1000

- id: prose-hr
  on: hr
  emit: html
  content: <hr class="md-hr">
  raw: true
  priority: -1000

- id: prose-fence
  on: fence
  emit: code
  with: lang=$<lang>
  content: body
  raw: true
  match: ^(?<lang>\S*)
  priority: -1000
```