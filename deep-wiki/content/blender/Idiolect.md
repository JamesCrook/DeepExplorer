# Idiolect

— words this codebase uses in its own way

deep: (Today at 09:00) Welcome to **#Idiolect**. Terms whose Blender meaning differs from their general one. Reading the source without these costs hours.

%%tags datastructures=ds; architecture=arch; fileformat=dna%%

deep: (Today at 09:00) **Topology**

> [!card] Loop 60/32
> Not a control-flow loop. One corner of a face: a vertex, an edge, and the
> face they belong to. A quad has four. Per-corner data — UVs, vertex colours,
> split normals — hangs off loops, which is why a seam stores two UVs at one
> position. *A face's opinion of a vertex.*

> [!card] Radial 58/26
> The ring of loops around a single edge, one per face using it. Walking it
> is how you cross from a face to its neighbour. An edge with no radial
> entries is wire; with one, a boundary; with three or more, non-manifold.

> [!card] Cage 45/15
> The pre-modifier geometry shown as an overlay in Edit Mode. Edits apply to
> the cage; the display shows the evaluated result. Every *"why can't I click
> the vertex I can see"* question is about this gap.

deep: (Today at 09:00) **Architecture**

> [!card] ID 70/40
> Any datablock that can be named, linked, and reference-counted: meshes,
> objects, materials, scenes. The header every one of them starts with is
> literally `ID`. "Has an ID" means "appears in the outliner and can be
> shared between files".

> [!card] Operator 65/30
> A user-invokable action with poll, execute, and optionally modal phases.
> Everything in a menu is one. `poll` decides whether it is greyed out, and
> a slow poll makes the whole UI feel sluggish because it runs on redraw.

> [!card|sparse] Runtime 30/8
> The scratch fields on a datablock that are never written to disk — caches,
> evaluated pointers, temporary flags. Cleared on load. Anything expensive to
> compute and cheap to recompute belongs here rather than in DNA.

→ back to [Architecture](#) · [DNA / RNA](#)

%%input placeholder=Ask about a term, or type \help...%%
