# Dependency Graph

— what re-evaluates, in what order, and on which copy

deep: (Today at 09:00) Welcome to **#Dependency Graph**. The depsgraph decides what needs recomputing after a change and in what order. Every question of the form *"why didn't my update show up"* ends here.

%%tags architecture=arch; performance=perf; python=py%%

deep: (Today at 09:00) **Original and evaluated**

> [!card] The two IDs 82/45
> Every datablock exists twice during evaluation: the *original*, which is
> what the user edited and what gets saved, and the *evaluated* copy, which
> modifiers, constraints, and geometry nodes write into. Rendering and
> exporting read the evaluated copy.
>
> Python scripts reach the original by default. `obj.data.vertices` on a
> modified object gives you the cage, not the result — a constant source of
> bug reports that are not bugs.

> [!card] Tagging 68/30
> Nothing recomputes because a value changed; it recomputes because something
> *tagged* it. RNA update callbacks issue those tags. A property edited
> directly in memory, bypassing RNA, changes the value and updates nothing —
> which is exactly what happens when a script assigns to a struct field
> instead of going through the property.

deep: (Today at 09:00) **Getting the evaluated result from Python**

- Get the depsgraph from the context 75/40 `py`
- Ask the object for its evaluated copy 70/35 `py`
- Never hold the evaluated pointer across a frame 60/22 `gotcha`
- Tag for update, then let the depsgraph run 65/28 `py`

→ 134 terms in full [idiolect](#)

k_tanaka: (Yesterday at 14:05) My operator changes a modifier value and nothing happens until I nudge the viewport. What am I missing?

deep: (Yesterday at 14:05) The tag. Setting the value through RNA usually fires the update callback for you; setting it another way does not. Tag the object as updated explicitly and the depsgraph will pick it up on the next evaluation rather than waiting for an unrelated change to trigger one.

r_patel: (Today at 09:40) Is the evaluated copy a full duplicate? That sounds expensive for a heavy scene.

deep: (Today at 09:40) It is a copy, but a shallow one wherever it can be — large buffers are shared until something writes to them, so an unmodified mesh costs a header rather than its geometry. The expense shows up when a modifier writes, which is also when you would have paid for the result anyway.

j_martinez: (Today at 11:20) Does the depsgraph guarantee an order between two objects that don't reference each other?

deep: (Today at 11:20) No, and you should not rely on one. Independent branches may evaluate in any order and, in practice, in parallel. If B must see A's result, express that as an actual relation — a constraint, a modifier reference, a driver — rather than assuming evaluation order.

%%diagrams arch, flow%%

%%input placeholder=Ask about the depsgraph, or type \help...%%
