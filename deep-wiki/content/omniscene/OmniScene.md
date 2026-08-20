# OmniScene

— live scene graph in a chat

deep: Welcome to **#OmniScene**. These stage cards hold **real** scenes — each one is an `OmniSceneApp` with its own `scene-root`, layer tree and canvas, mounted into the card. The sidebar above the topic links is the actual `OmniControlPanel`, shared between all three cards. Whichever card is pinned to the top is *live*, and drives it.

nemo: I don't actually have an identity on this server...

deep: **Click a card to engage it**, then drag and scroll-to-zoom as you would in OmniScene. Until you do, the wheel scrolls the chat rather than zooming the scene — otherwise the pinned card would swallow every scroll, since it sits exactly where your cursor rests.

%%stage id=st-heat; scene=heatmap; badge=O; label=Body Heatmap; height=520%%

deep: That is the heatmap scene — `phases: ['draw2d']`, `hasLayers: false`. Its blur, opacity, sparkle and region sliders in the sidebar are built by `layer.inst.buildUI(layer)`, exactly as in omni-scene. The presets morph through `OmniParamEngine`.

deep: The same scene's controls can also be written as pure JSON and compiled with `setContextFromSpec()`. The island below is validated by the real `OmniControlPanel.validateSpec()` as it renders — no local copy of the rules:

deep: (11:02) Two things in a live scene resist JSON, and the spec shows the fix for each. `format: v => Math.round(v) + '%'` is a function — here it is `"format": "percent"`. The colormap select's `onChange` closure becomes `"bind": "cmap"`. Names `formatValue` already knows — `int`, `deg`, `degRad`, `degInt` — pass straight through.

%%stage id=st-chart; scene=chart-sales; badge=O; label=Product Sales; height=520%%

deep: Stage 2 is a chart scene — `phases: ['measure','layout','draw2d']`, seventeen presets, and a CSV drop target in its Load Data group. Scrolling here re-pointed the shared panel at this card's layer tree, and the **Scenes** list followed.

deep: Cards that scroll out of view go dormant: their anim loop stops and nothing redraws. The last frame simply stays on the canvas until the card returns.

> [!card] Where this stands 70/0
> Real scenes, real panel, real presets. Not yet: dragging a layer from one
> card to another, and a card that is interactive while a *different* card is
> live. Both need a broker above the apps and a coordinate mapping between
> scenes — the AST half already exists, since the layers widget can already
> move a layer between parents via `onReceive`.

deep: **Roadmap**

- omni-control-panel — topic links + JSON spec source 100/0 `done`
- omni-scene-app — injectable shell + shared panel 100/0 `done`
- cross-card layer drag 0/100 `next`

%%stage id=st-canvas; scene=canvas; badge=O; label=Canvas; height=520%%

deep: Stage 3 is the Canvas scene — `hasLayers: true`, so the sidebar gains an add bar and a layers list. Add a heatmap or a chart to it and they arrive as resizable handle-frames.

deep: Being last, this card needs room beneath it to reach the top at all — the chat scroller carries bottom padding so a final stage behaves like any other.

deep: Type `\scenes` to list every registered scene id.

deep: A `%%server%%` marker builds a server icon anywhere — including here, in col3:

- 🧬 [[swissprot|SwissProt]] %%server; bg=#8b2240%%

nemo: An unknown speaker in a `note` stays prose. In a `chat` document it would become a message.

- 🐙 Deep Sea %%bg=#2c3e6b%%

%%input placeholder=Ask about the scene graph, or type \scenes...%%
