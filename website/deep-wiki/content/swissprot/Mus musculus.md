# Mus musculus

— 17,206 reviewed entries

deep: (Today at 09:00) Welcome to **#Mus musculus**. The reference mammalian model, and the organism most often compared against human. Type `\help` for commands or ask about any protein, complex, or pathway.

%%tags orthology=orth; knockout=ko; trans-membrane=tm; mitochondrial=mito%%

deep: (Today at 09:00) **Why this channel is mostly about comparison**

> [!card] Orthology 78/40
> Most mouse annotation exists to be read against human. An entry's value is
> often the *pair*: what the knockout does here, what the disease variant does
> there. Cross-references to the human ortholog are curated, not inferred,
> which is why they are trustworthy enough to navigate by.

> [!card] Evidence transfer 62/25
> An annotation can be experimental in one species and inferred by similarity
> in another. The evidence code says which. A mouse entry showing
> ECO:0000250 is telling you the claim was carried across from a homolog and
> not tested here.

deep: (Today at 09:00) **Coverage against human**

- Shared reviewed orthologs 84/45 `curated`
- Mouse-only entries 30/12 `sparse` %%variant=sparse%%
- Knockout phenotype cross-refs 70/28 `MGI`
- Strain-specific variants 40/10 `sparse` %%variant=sparse%%

→ compare with [Homo sapiens](#)

a_lindqvist: (Yesterday at 13:30) If an annotation is transferred by similarity, is it worth anything?

deep: (Yesterday at 13:30) It is worth exactly what the evidence code says and no more. Similarity-based annotation is a good prior and a bad citation — fine for narrowing a candidate list, not for claiming a function. The distinction matters most in enrichment analysis, where transferred annotations can make a term look supported by many independent observations when they trace back to one.

r_patel: (Today at 10:50) Is the mouse entry count growing, or is it basically static now?

deep: (Today at 10:50) Reviewed entries grow slowly and non-monotonically — curation adds records, but merges remove them when two accessions turn out to describe one protein. That is why an accession you cited last year can redirect today rather than 404. Demerges go the other way and are rarer.

%%diagrams pipeline, complex%%

%%input placeholder=Ask about mouse proteins, or type \help...%%
