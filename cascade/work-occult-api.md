```json
{ "role": "SPEC"}
```
---

# Occult APIs: The Negotiating Facade

## The Problem

An occult API is an implicit contract that multiple implementations may satisfy differently. The situation arises often where the order in which steps are taken can vary, where units are not defined, or where a value should be sourced from can differ.

## The Solution

We define an interface that makes the contract explicit and legible. We centralise the logic that can vary as a function call. The name of the function makes clear what convention is being used, when several conventions are possible.

* scaledCtx() / directCtx() - the context object has/has-not already had transforms applied to it.
* weightInKg() / weightInLbs() - units specified in the function call. 
* getColour() - the function decides how to find the colour, not the caller.

These functions may wrap seemingly trivial functions. The point is to capture the pattern so it is clear what the consumer is expecting. 

---

## 1. Child Coordinate space #node

Composition order of pan, zoom, rotate, scale can vary, with different results in how objects move when panning zooming. Also zooming may or may not affect text size and line widths scales or not, how separately-authored leaves and child nodes interpret raw transform state.

* scaledCtx / directCtx()
* toLocal(point) / toScreen(point)

The convention about what x,y mean is explicit

Many nodes need to know what the bounding box they should be drawn inside is. 
* ctxMix.getBigBox() gets the largest box, even if it may stretch/distort 
* ctxMix.getAspectedBox() gets a box that retains the desired aspect ratio
* ctxMix.getSmallBox() gets a box that was determined by measure and layout

The convention about the kind of box is explicit.

---

## 2. Node Rendering (node2d / node3d / nodehtml) #node

Here the interface is on each node, saying what it supplies. 

* for 2d: measure, layout, draw2d, 
* for 3d: build, update, teardown, 
* for dom: mount. 

Each of these additionally can have a before_ and after_ method. Nodes may not require all the different operations, and only provide some. The order of operations is externally defined, and once.


---

## 3. Do / Undo / Redo #editor


There are multiple implementations possible of do, undo, redo.

The interface on each operation states what it supplies.
* cheapInverse - No need to store.
* compressibleInverse - Inverse is cheaper to store than stroing the state

---

## 4. Select / Mod-Selection / Edit #editor

**What's occult:** what "selected" looks like for different node types, and what operations a node supports — which varies wildly (text nodes support character-range selection and insertion; shape nodes support handle-dragging; groups support child reordering).

**Offers:** each node declares:

- **Selection geometry** — how it appears when selected (character highlight, bounding box, control handles).
- **Edit affordances** — what can be done to it (insert text, drag handle, reorder children, resize, rotate).

**Facade interface:** the selection renderer asks "how do I highlight this?" and gets geometry back, regardless of node type. The edit system asks "what operations are available?" and gets a structured affordance list. The consumer builds UI (handles, menus, cursors) from the affordance list without knowing the node type.

**Key property:** the facade mediates both read (selection appearance) and write (available edits). Edit affordances are declarations, not raw methods — the system can inspect them to build contextual UI, filter by permissions, or record them as commands for undo.

