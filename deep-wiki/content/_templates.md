# Templates

The markup of D+'s widgets. Rules (`_rules.md`) say which widget a line of
markdown becomes and with what fields; this file says what each widget looks
like. Each fence is one template, and each template is a node type of the
same name, so `emit: message` in a rule means the `message` fence below.

Plain markdown shows the fences as code. A vault may change any of them, or
add its own: a template pushed later replaces one of the same name.

## How a fence reads

````
```html template=<name> sticky with=<function>
<div class="embed"> … {title} … {!body} … </div>
```
````

- `{key}` is a field of the node, escaped; `{!key}` is markup, for text the
  markdown pipeline has already rendered.
- `<slot>` is where the node's children go, if it has any.
- Words after the name are attributes of the type:
  - `sticky` — pins while the chat scrolls under it, with everything after
    it until the next sticky widget.
  - `opens=scroller` — everything after this widget scrolls in a box of class
    `scrollerClass`.
  - `activeClass`, `inactiveClass` — the classes a widget gets when it is, or
    is not, the active member of its group (the open note, the open server,
    the live stage).
  - `with=name` — fields computed in code (`template.name` in
    `js/nodes-html/chat-nodes.js`), for what markup cannot say: a coverage
    bar from two numbers, a picture or an icon.

Clicks are not here. A rule's `nav:` says what clicking a widget does; inside
markup, `data-on="…"` says it for one element.

## Servers — col1

```html template=server with=server activeClass=active inactiveClass=dormant
<div class="srv" data-server-id="{id}" data-url="{url}" style="{srvStyle}">{!face}<div class="tip">{name}</div></div>
```

```html template=separator
<div class="srv-sep"></div>
```

## Index — col2

```html template=header with=header
<div class="ch-hdr"><span class="domain">{domain}</span> {!body} <span class="stage-track" style="color:var(--text-3);font-weight:400;font-size:11px"></span></div>
```

```html template=banner
<img src="./content/{pic}" style="width:100%">
```

```html template=group
<div class="ch-group">{text}</div>
```

```html template=topic with=topic activeClass=active
<div class="ch" data-ch="{id}"><div class="ch-ico" style="{icoStyle}">{icon}</div><div class="ch-lbl" style="{labelStyle}">{label}</div>{!right}</div>
```

```html template=legend
<div class="legend"><span><span class="legend-sw" style="background:var(--docstring)"></span>{doc}</span><span><span class="legend-sw" style="background:var(--wiki)"></span>{wiki}</span><span><span class="legend-sw" style="background:var(--surface-2)"></span>{gap}</span></div>
```

## Notes and chat — col3

```html template=chatheader with=chatheader opens=scroller scrollerClass=chat-msgs
<div class="chat-hdr"><span class="hash">#</span> {name}{!descHtml}</div>
```

```html template=message
<div class="msg"><div class="msg-in role-{role}"><div class="msg-av">{avatar}</div><div class="msg-bd"><div class="msg-hd"><span class="msg-nm">{name}</span><span class="msg-tm">{time}</span></div><div class="msg-tx">{!body}</div></div></div></div>
```

```html template=card sticky with=card
<div class="embed"><div class="embed-title" style="{titleStyle}">{title} {!bar}</div><div class="embed-text" style="{textStyle}">{!body}</div>{!warnHtml}</div>
```

```html template=row sticky with=row
<div class="embed-row"><div class="embed-row-lbl" style="{labelStyle}">{label}</div>{!bar}<div class="embed-row-badge" style="{badgeStyle}">{badge}</div></div>
```

```html template=arrow-link sticky
<div class="embed-link">{!text}</div>
```

## Stage — an OmniScene in the chat

The frame round a `stage`: a host (`js/nodes-html/html-host-node.js`) running
an OmniSceneApp (`host-omni-scene.js`). The scene goes where the slot is.

```html template=stage-frame
<div class="scene-stage" data-stage-id="{id}" data-stage-scene="{scene}" style="height:{height}px"><div class="stage-mount"><slot></slot></div><div class="stage-bar"><div class="stage-badge">{badge}</div><div class="stage-name">{label}</div><div class="stage-live">live</div></div><div class="stage-hint">click to engage · scroll passes through until you do</div></div>
```

## Input — below col3

The send button and the Enter key raise `send`, which d-plus handles.

```html template=input
<div class="chat-input-bar"><div class="chat-input-wrap"><input class="chat-input" placeholder="{placeholder}" data-on-keydown-enter="emit send"><button class="chat-send" data-on="emit send">→</button></div></div>
```
