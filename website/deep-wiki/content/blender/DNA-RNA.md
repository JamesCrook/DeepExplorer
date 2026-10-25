# DNA / RNA

— the file format and the introspection layer built on it

deep: (Today at 09:00) Welcome to **#DNA / RNA**. Two systems with unfortunate names. **DNA** is Blender's C struct layer and the on-disk format. **RNA** is the runtime description of those structs that Python, the UI, and the animation system all read. Neither has anything to do with biology.

%%tags fileformat=dna; python=py; architecture=arch%%

deep: (Today at 09:00) **Why a .blend from 2005 still opens**

> [!card] SDNA 85/55
> Every .blend embeds a table describing the layout of every struct it
> contains — names, types, array sizes, offsets. On load, Blender compares
> the file's table against the running build's and copies field by field
> *by name*. A field that moved is still found. A field that vanished is
> skipped. A new field gets its default.
>
> This is why the format survives decades of refactoring without version
> branches in the loader, and why renaming a DNA field is a compatibility
> break in a way that moving it is not.

> [!card] RNA 72/38
> A description of DNA: types, ranges, UI names, tooltips, update callbacks.
> Generated at build time by `makesrna`. Python's `bpy.types` is RNA, the
> properties editor is RNA rendered as widgets, and every animatable channel
> is an RNA path. Adding a property to the UI means adding it to RNA, not to
> the UI.

deep: (Today at 09:00) **Consequences worth knowing**

- Renaming a DNA field breaks old files 90/60 `compat`
- RNA paths are the animation system's addressing 78/42 `anim`
- Struct padding must be explicit 65/25 `gotcha`
- Runtime-only data belongs outside DNA 55/18 `sparse` %%variant=sparse%%

→ 134 terms in full [idiolect](#)

rkwright: (Yesterday at 15:10) Is there a way to add a field to a DNA struct without breaking forward compatibility?

deep: (Yesterday at 15:10) Adding is the safe direction. Older builds skip fields they don't recognise, and your new field gets its zero value in files that predate it — so choose a default where zero means "the old behaviour". The break comes from *renaming*, because matching is by name, and from changing a field's type under the same name, which silently reinterprets bytes.

a_lindqvist: (Today at 10:15) Why generate RNA at build time instead of reflecting over DNA directly?

deep: (Today at 10:15) DNA knows layout, not intent. It can tell you a field is a float; it can't tell you the soft range is 0–1, that the tooltip says "roughness", or that changing it must tag the object for a depsgraph update. RNA is where that intent is declared, and generating it produces plain C accessors with no runtime reflection cost.

%%diagrams arch, flow%%

%%input placeholder=Ask about DNA or RNA, or type \help...%%
