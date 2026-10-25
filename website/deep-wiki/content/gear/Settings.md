# Settings

— customise your workspace

deep: Use the controls in the sidebar to adjust how Deep Explorer looks and feels. Changes take effect immediately.

deep: **Your settings** — Slider changes are live but provisional. The buttons at the foot of the sidebar decide what happens to them: *Keep* writes to the browser layer, *Download* turns that into a `_local.md` you can put in the vault to make it permanent and portable, *Discard* throws the browser copy away so the vault's own values surface again.

deep: Type `\config` for the layer sequence, `\config col2-width` to see which layer a value came from, or `\config vars` to check which theme variables your stylesheets actually read.

deep: **Server Strip** — Button size and icon scale control the server column. Dormant saturation and brightness control how inactive servers fade — hover any dormant icon to see it wake, or click to switch.

deep: **Slider Geometry** — These controls morph *all* sliders in the app — including the ones you're dragging right now. Try track height → 2, pip → 8×8, fill → 0, text offset → −8 for a minimal dot look.

deep: **JSON** — Parked here is the JSON GeSHi formatting example. It specs a diagram and its controls.

```json title=heatmap scene — control spec
{
  "scene": "heatmap",
  "sections": [
    {
      "group": "Heatmap",
      "abbrev": "Heat",
      "sliders": [
        { "id": "blur",    "label": "Blur radius", "min": 0, "max": 60,  "step": 1, "default": 18 },
        { "id": "opacity", "label": "Opacity",     "min": 0, "max": 100, "step": 1, "default": 70, "format": "percent" }
      ]
    },
    {
      "group": "Sparkles",
      "abbrev": "Sprk",
      "sliders": [
        { "id": "sparkleCount", "label": "Count", "min": 0,   "max": 3000, "step": 50,  "default": 500 },
        { "id": "sparkleSize",  "label": "Size",  "min": 0.5, "max": 5,    "step": 0.5, "default": 1.5 },
        {
          "id": "sparkleStyle", "label": "Style", "type": "button-row", "default": "dot",
          "options": [
            { "value": "dot", "label": "•" }, { "value": "plus",  "label": "+" },
            { "value": "cross", "label": "×" }, { "value": "ring", "label": "○" }
          ]
        }
      ]
    },
    {
      "group": "Colormap", "abbrev": "Cmap", "type": "select", "bind": "cmap",
      "options": [
        { "value": "inferno", "label": "Inferno" }, { "value": "viridis", "label": "Viridis" },
        { "value": "magma",   "label": "Magma" }
      ]
    },
    {
      "group": "Explore", "abbrev": "Exp", "type": "topics",
      "topics": [
        { "id": "sc-heatmap", "label": "Body Heatmap", "icon": "H", "scene": "heatmap" },
        { "id": "sc-chart",   "label": "Product Sales", "icon": "◫", "scene": "chart-sales" }
      ]
    }
  ],
  "presets": {
    "Default": { "blur": 18, "opacity": 70, "sparkleCount": 500,  "sparkleSize": 1.5 },
    "Sharp":   { "blur": 4,  "opacity": 85, "sparkleCount": 200,  "sparkleSize": 1.0 },
    "Diffuse": { "blur": 45, "opacity": 50, "sparkleCount": 1000, "sparkleSize": 2.0 },
    "Minimal": { "blur": 20, "opacity": 40, "sparkleCount": 0,    "sparkleSize": 1.5 }
  }
}
```

%%input placeholder=Settings are adjusted via the sidebar controls...%%
