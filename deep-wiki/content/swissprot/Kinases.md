# Kinases

— the family that phosphorylates, and the reason half of pharma exists

deep: (Today at 09:00) Welcome to **#Kinases**. Around 518 protein kinases in the human genome, sharing one catalytic fold and an enormous amount of regulatory variety. Type `\help` for commands or ask about any family, domain, or inhibitor class.

%%tags druggable=drug; domains=dom; trans-membrane=tm; disease=dis%%

deep: (Today at 09:00) **What makes them one family**

> [!card] The catalytic domain 88/50
> A bilobal fold: a small N-lobe that grips ATP and a larger C-lobe that
> binds substrate, with the active site in the cleft between. The sequence
> varies enormously; the fold barely does. Conserved motifs — the glycine-rich
> loop, the catalytic lysine, the DFG triad — are what make a kinase
> recognisable from sequence alone.

> [!card] Active and inactive states 74/32
> The same protein adopts several ordered conformations, and inhibitors are
> classified by which one they bind. Type I binds the active state, type II
> reaches into a pocket exposed only when the DFG motif flips out. This is
> why two inhibitors of the same kinase can have completely different
> selectivity profiles.

> [!card|sparse] Pseudokinases 22/6
> Around one in ten lack a residue required for catalysis, yet many are
> essential. They work as scaffolds and allosteric regulators. Annotation
> here is thin and frequently wrong in older records.

deep: (Today at 09:00) **Groups by sequence similarity**

- Tyrosine kinases 85/42 `TK`
- CMGC — cyclin-dependent, MAPK, GSK 80/35 `CMGC`
- AGC — PKA, PKG, PKC 78/33 `AGC`
- CAMK — calcium/calmodulin dependent 72/28 `CAMK`
- Atypical and pseudokinases 22/6 `sparse` %%variant=sparse%%

→ 87 terms in full [idiolect](#)

j_martinez: (Yesterday at 16:20) How do I find every human kinase with a known disease association and an approved inhibitor?

deep: (Yesterday at 16:20) That is three filters: the protein kinase domain, an involvement-in-disease annotation, and a ChEMBL or DrugBank cross-reference. The [Protein Finder](#) can compose it — expect somewhere around seventy entries, heavily concentrated in tyrosine kinases.

k_tanaka: (Today at 11:15) Why is selectivity so hard if the sequences differ that much?

deep: (Today at 11:15) Because inhibitors bind the ATP pocket, and that is the most conserved part of the fold — the very thing that makes the family recognisable is the thing every drug has to discriminate within. Selectivity generally comes from residues lining the pocket rather than the pocket itself, which is why a single gatekeeper substitution can abolish binding.

%%diagrams pipeline, complex%%

%%input placeholder=Ask about kinases, or type \help...%%
