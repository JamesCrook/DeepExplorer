# BMesh

— half-edge mesh data structure and operations

deep: (Today at 09:00) Welcome to **#BMesh**. This channel covers Blender's half-edge mesh data structure — the core topology layer for mesh editing. Type `\help` for commands, `\ui` to show the dashboard, or just ask a question.

%%tags datastructures=ds; animation=anim; experimental=exp%%

deep: (Today at 09:00) **Idiolect highlights for #BMesh**

> [!card] BMLoop 60/32
> A *loop* in BMesh represents one corner of a face — vertex + edge + face.
> The connective tissue of half-edge topology. Each knows its vertex, edge,
> face, and can walk to the next loop around the same face or radially around
> the same edge. *A face's opinion of a vertex.*

> [!card] BMEdge 55/28
> An edge connecting two vertices. Carries a radial linked list of all loops
> (and therefore faces) that share it. The primary way to walk between
> adjacent faces.

> [!card|sparse] Mesh deformation by heat flow 12/2
> Solves heat diffusion over mesh surface for smooth skeleton binding weights.

→ 134 terms in full [idiolect](#)

deep: (Today at 09:00) **Linked specs & algorithms**

- DNA / RNA — Schema Evolution & Serialization 35/45 `spec ↔ code`
- Catmull-Clark Subdivision 55/40 `LaTeX + code`
- Mesh Deformation by Heat Flow 12/2 `stub` %%variant=sparse%%

deep: (Today at 09:00) **Explorable diagrams**

%%diagrams arch, flow%%

rkwright: (Yesterday at 16:42) Anyone know why `BM_face_kill` doesn't clean up the radial loop list? I keep getting dangling pointers when I delete faces in a specific order.

deep: (Yesterday at 16:42) It does — but only for loops it owns. If you're deleting faces that share edges, the radial list updates are order-dependent. You're asking about **BMLoop** radial walking — [BMLoop idiolect](#) · [radial loop diagram](#)

j_martinez: (Today at 08:15) The heat flow deformation docs are basically nonexistent. I spent two hours reading the raw Laplacian solver code. Can we get this documented?

deep: (Today at 08:15) You're right — that's currently at 12% docstring / 2% wiki coverage. Want to [file a documentation request](#)? I can pre-fill it with what I know about the Laplacian solver and the files involved.

k_tanaka: (Today at 10:30) Do meshes have to be quads? I'm trying to understand when BMesh tolerates n-gons vs when things break down.

deep: (Today at 10:30) BMesh supports arbitrary n-gons — triangles, quads, pentagons, anything. The **BMLoop** ring around a face has as many entries as the face has vertices. Where things get tricky is subdivision and rendering: Catmull-Clark assumes quads, and the GPU triangulates everything. — [Catmull-Clark explainer](#) · [BMFace idiolect](#)

%%input placeholder=Ask about BMesh, or type \help...%%
