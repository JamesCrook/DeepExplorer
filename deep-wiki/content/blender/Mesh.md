# Mesh

— the stored mesh: flat attribute arrays, not topology

deep: (Today at 09:00) Welcome to **#Mesh**. This is the *stored* form — what lives in the .blend file and what the depsgraph hands to modifiers. **BMesh** is the *editable* form. Conflating the two is the single most common source of confusion in mesh code.

%%tags datastructures=ds; fileformat=dna; performance=perf%%

deep: (Today at 09:00) **The distinction**

> [!card] Mesh vs BMesh 62/40
> `Mesh` is a struct-of-arrays: positions in one contiguous buffer, corner
> indices in another. Cache-friendly, cheap to serialise, and it answers
> *"where is vertex 400"* instantly. It cannot answer *"which faces touch
> this edge"* without building an index.
>
> `BMesh` is a pointer graph with radial loops. It answers adjacency in O(1)
> and costs an allocation per element. Entering Edit Mode converts one to the
> other; leaving converts back. That conversion is why Edit Mode on a dense
> mesh has a visible pause.

> [!card] Attribute domains 70/35
> Every attribute lives on exactly one domain: *point*, *edge*, *corner*, or
> *face*. UVs are corner attributes, so a vertex on a seam holds two of them.
> Material index is a face attribute. Interpolating between domains is a
> lossy, explicit operation — never implicit.

deep: (Today at 09:00) **What moved, and when**

The modern layout replaced named structs with generic attributes over several releases. Code written against the old names does not compile, and tutorials predating 3.5 describe fields that no longer exist.

- MVert → `position` attribute 80/50 `3.5`
- MPoly / MLoop → offset indices + corner arrays 75/40 `3.6`
- MEdge → `.edge_verts` 70/35 `4.0`
- Normals → computed and cached, not stored 65/20 `lazy`

→ full attribute reference in [idiolect](#)

j_martinez: (Yesterday at 11:40) I'm reading modifier code and I can't find where the normals are stored on the Mesh. Am I looking at an old branch?

deep: (Yesterday at 11:40) No — they aren't stored. Normals are computed on demand and cached on the mesh, invalidated whenever positions or topology change. Ask for them through the accessor rather than reaching for a field; the accessor is what triggers the recompute. — [Dependency Graph](#) covers when that invalidation fires.

k_tanaka: (Today at 08:55) Why is `position` a generic attribute rather than a dedicated array? It's on every mesh that ever exists.

deep: (Today at 08:55) Uniformity buys more than the special case saves. One code path copies, interpolates, and serialises every attribute, so geometry nodes can treat position exactly like any custom float3 field — which is what makes *set position* an ordinary node rather than a built-in. The dedicated array would have needed parallel handling in every one of those places.

%%diagrams arch, flow%%

%%input placeholder=Ask about Mesh, or type \help...%%
