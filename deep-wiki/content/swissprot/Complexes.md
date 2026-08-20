# Complexes

— assemblies, and why one entry per subunit is the wrong shape

deep: (Today at 09:00) Welcome to **#Complexes**. The database stores proteins; biology runs on assemblies. This channel is about the gap and how to navigate across it.

%%tags assembly=asm; stoichiometry=stoi; mitochondrial=mito%%

deep: (Today at 09:00) **The representational problem**

> [!card] One record per chain 70/30
> An entry describes a polypeptide. A proteasome is not a polypeptide, so it
> has no entry — it exists only as a subunit relationship repeated across
> thirty-odd records. Every question of the form *"what does this machine do"*
> requires reassembly at query time.

> [!card] Where stoichiometry lives 45/15
> Rarely in the entry. Subunit comments describe partners in prose; counts
> and arrangement come from structural sources or a dedicated complex
> database. Parsing subunit text for stoichiometry is a well-trodden way to
> get plausible, wrong numbers.

deep: (Today at 09:00) **Documented assemblies**

- Proteasome 26S — subunit assembly 60/30 `complex`
- Respiratory chain complex IV 55/5 `sparse` %%variant=sparse%%
- Ribosome — small subunit 72/35 `complex`
- Nuclear pore 48/18 `complex`
- Spliceosome — core snRNPs 40/12 `sparse` %%variant=sparse%%

→ see also [Pathways](#) · [Cell Structure](#)

k_tanaka: (Yesterday at 12:10) Can I get all subunits of a complex from the entries alone?

deep: (Yesterday at 12:10) Partially, and unreliably. Subunit comments name partners, so you can build a graph by text-matching — but naming is inconsistent, and the graph you get is of *reported interactions*, not membership. For membership, cross-reference a complex database and use the entries for what each chain does.

r_patel: (Today at 11:05) Complex IV is thin. Half the subunits have no assembly notes at all.

deep: (Today at 11:05) Agreed — 55% records, 5% wiki. The nuclear-encoded subunits are reasonably covered and the mitochondrially-encoded ones are not, which is a curation gap rather than an unknown. Want to [file a documentation request](#)? Three other users have flagged this area.

%%diagrams complex, pipeline%%

%%input placeholder=Ask about complexes, or type \help...%%
