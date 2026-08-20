# Idiolect

— what the flat file means by its own words

deep: (Today at 09:00) Welcome to **#Idiolect**. Terms that look self-explanatory and are not. Most confusion about this database is vocabulary, not biology.

%%tags annotation=ann; evidence=evi; schema=sch%%

deep: (Today at 09:00) **Identity**

> [!card] Accession 88/45
> The stable identifier — P04637. Never reused for a different protein, but
> not permanent either: two accessions can be merged when curation decides
> they describe one protein, leaving the older one as a secondary that
> redirects. Cite accessions, not entry names.

> [!card] Entry name 70/28
> The mnemonic — P53_HUMAN. Readable, and unstable by design: it changes when
> nomenclature changes. Convenient in a paper, wrong in a database key.

deep: (Today at 09:00) **Annotation**

> [!card] Evidence code 80/35
> A qualifier on every annotation asserting *how we know this*. Ranges from
> direct experimental assay through sequence similarity to purely
> computational prediction. Two entries can carry identical text and mean
> entirely different things depending on this field.

> [!card] Feature key 75/28
> A typed annotation pinned to a residue range — DOMAIN, TRANSMEM, BINDING,
> VARIANT. The vocabulary of what can be said about a stretch of sequence.
> Positions are 1-based and inclusive, which is a classic off-by-one against
> most programming conventions.

> [!card] Keyword 65/22
> A controlled-vocabulary tag on the whole entry. Useful for coarse filtering,
> misleading for fine analysis: presence means someone asserted it, absence
> means nothing was asserted, not that it is false.

> [!card|sparse] Protein existence 35/10
> A five-level scale from evidence at protein level down to predicted. Widely
> ignored, and it should not be — a level-4 entry is a gene model with a
> hopeful name attached.

deep: (Today at 09:00) **Reviewed and unreviewed**

- Swiss-Prot — manually curated 90/50 `reviewed`
- TrEMBL — automatic annotation 45/12 `unreviewed`
- Proteome — one organism's set 70/25 `set`
- Reference proteome — the chosen representative 65/20 `set`

→ back to [Homo sapiens](#) · [Schema Mappings](#)

%%input placeholder=Ask about a term, or type \help...%%
