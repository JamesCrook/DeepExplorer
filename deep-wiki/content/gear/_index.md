%%index default=Settings; icon=⚙%%

# Settings

## Typography

```omni type=controls
- label: Message font size
  var: --msg-font-size
  min: 11
  max: 22
  value: 13.5
  step: 0.5
  unit: px
```

## Server Strip

```omni type=controls
- label: Button size
  var: --srv-btn-size
  min: 28
  max: 64
  value: 44
  suffix: px
- label: Icon scale
  var: --srv-icon-pct
  min: 10
  max: 100
  value: 75
  suffix: %
- label: Dormant saturation
  var: --srv-dormant-sat
  min: 0
  max: 1
  value: 0.33
  step: 0.01
- label: Dormant brightness
  var: --srv-dormant-bri
  min: 0.2
  max: 1
  value: 0.66
  step: 0.01
```

## Slider Geometry

```omni type=controls
- label: Track height
  var: --ms-track-h
  min: 1
  max: 32
  value: 24
- label: Track radius
  var: --ms-track-r
  min: 0
  max: 16
  value: 4
- label: Pip height
  var: --ms-pip-h
  min: 4
  max: 32
  value: 28
- label: Pip width
  var: --ms-pip-w
  min: 2
  max: 24
  value: 3
- label: Fill opacity
  var: --ms-fill-op
  min: 0
  max: 0.5
  value: 0.18
  step: 0.01
- label: Text offset Y
  var: --ms-text-y
  min: -16
  max: 16
  value: 0
- label: Pip brightness
  var: --ms-pip-bri
  min: 0.2
  max: 2
  value: 1.4
  step: 0.05
- label: Label inset
  var: --ms-label-inset
  min: 0
  max: 16
  value: 8
```

## Spacing

```omni type=controls
- label: Sidebar width
  var: --col2-width
  min: 180
  max: 420
  value: 260
  unit: px
```

## Theme %%bg=#3a3a50; fg=#9098d0%%

- ◑ Dark %%set=theme; to=dark%%
- ◐ Midnight %%set=theme; to=midnight%%
- ☀ Slate %%set=theme; to=slate%%

## Opens With %%bg=#3a5050; fg=#80b8b0%%

- 🦊 Blender %%set=default-corpus; to=blender%%
- 🧬 SwissProt %%set=default-corpus; to=swissprot%%
- 🎨 OmniScene %%set=default-corpus; to=omniscene%%
- ⚙ Settings %%set=default-corpus; to=gear%%

## Settings File

```html
<div class="cfg-actions">
  <button data-cfg-act="save">Keep</button>
  <button data-cfg-act="revert">Revert</button>
  <button data-cfg-act="download">Download</button>
  <button data-cfg-act="clear">Discard</button>
  <span class="cfg-status" data-cfg-count></span>
</div>
```
