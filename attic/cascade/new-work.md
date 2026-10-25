```json
{ "role": "PROMPT"}
```
---

# New Work Items — Identified in Session

These emerged from discussion of the development process, the cascade tool, prefix instructions, occult API, markdown pipeline, and FastAPI patterns. Place each in the appropriate file (BOM, prompts, specs, algo-insights) as needed.

---

## Occult API — Coordinate Space Facade

## [ ] ctxMix.pushChildSpace / popChildSpace 
Facade that saves and restores W, H, box, contentScale, T, and applies ctx.translate + ctx.scale. Replaces the ad-hoc 15-line save-replace-restore in HandleFrameNode and similar containers. Parameters: origin, scaleX, scaleY. Handles both stretch (scale 1,1 with frame pixel W/H) and fit-to-natural-width (scale frameW/naturalW with natural W/H).

## [ ] ctxMix.pushShift / popShift
Simpler variant: translate ctx and shift T without changing W/H/box/contentScale. Replaces FrameNode's manual ctx.translate + T.shift + legacy panX/panY mutation.

## [ ] ctxMix.pushChildSpace hit-test 
The hit-test side of pushChildSpace: inverse-transforms hitPoint, pushes T, saves/restores. Mirrors the draw path so container nodes don't duplicate the inverse math.

## [ ] Audit 2D container nodes for coordinate
Scan HandleFrameNode, FrameNode, ZoomPanNode, BoxNode, NmFrameNode, NmBoxNode, UncenterNode and others for their save/restore patterns. Classify into pushShift vs pushChildSpace. Identify legacy panX/panY paths to retire.

## [ ] Remove legacy panX/panY mutation from container
Once pushShift exists and T is universal, the FrameNode pattern of mutating params.panX/panY in before_hit_test is dead code. Remove it.

---

## Markdown+ Pipeline

## [ ] Switch markdown-processor to new recursive grammar #markdown/migrate
Replace the Parser.createParserFromRule('Markdown') (old flat grammar in parser.js) with the new recursive grammar from markdown-grammar.js. Update the renderer to handle the new AST shape.

## [ ] Retire {Split} mechanism in favour of Markdown+ parsing #markdown/migrate
The # {Split} / ## {Split} / :type: {json} DSL in d-plus.html becomes a Markdown+ extension parsed by the PEG parser. The _transform method becomes: parse to AST, then runPhases.

## [ ] AST → mount() renderer for Markdown #markdown/mount
Replace the string-concatenation pretty() renderer with a walkPhase-based mount pass. Each grammar rule name maps to a registered node type that produces a DOM element. Uses the scene registry.

## [ ] GeSHi syntax colouring via PEG grammars #markdown/geshi
The md_fence widget reads the language tag, finds the matching grammar, parses the code body, and mounts that AST as coloured spans. Requires a generic AST → coloured-spans walker (see below).

## [ ] Generic AST → coloured spans walker #node/walkers/colorize
Takes an AST and a colour map keyed by rule name, produces DOM nodes (or canvas draw calls). Same walker works for every grammar. Multiplicative: every grammar gains syntax colouring for free.


---

## FastAPI Spec → Code Generation

## [ ] FastAPI endpoint spec format #dplus/fastapi
Define a spec format for endpoints: route, method, request schema, response schema. Could be a PEG grammar or structured JSON/YAML.

## [ ] Generate Python FastAPI endpoint from spec #dplus/fastapi/gen
Given an endpoint spec, emit a Python file with the FastAPI route decorator and handler skeleton. Let us have a small tool for this.

## [ ] Generate JavaScript accessor library from spec #dplus/fastapi/gen
Given an endpoint spec, emit a JS module with a typed fetch wrapper. Same spec, different output. Let us have a small tool for this.

## [ ] Generate browser-side mock from spec #dplus/fastapi/gen
Given an endpoint spec, emit a JS module that returns canned or procedurally generated data matching the response schema. Replaces the accessor library in-browser for testing.

## [x] Cursor on data #util/cursor
A cursor is akin to the 'tumbler' idea in Nelson's "Dream Machines". It's an array, like [3,4,9] that we can step on. There exists an implementation which is used in the multiscroller. It needs to be extracted and given a cleaner interface.

Of particular interest is how to convert between different shaped tumblers over the same data. For example a grid can have a two element cursor [ row, col ], but if the table is sorted, it can also be represented as a 'twig' path like [ 3, 4, 9 ] where the columns of the table are like Miller columns, and the length of the array says which column we are addressing. 

## [ ] Scroll API #dplus/fastapi/scroll USES #util/rr
A general purpose random replacement cache. Typically indexed by a utils/cursor.

## [ ] Chat API #dplus/fastapi/chat USES #dplus/fastapi/scroll
A general API for data for an infinite-scrolling panel. We should not have to know how big the virtual area of the panel is in real terms, neither in pixels, nor in items. Instead we should, given a cursor, be able to step to generate more in either direction.

Uses a random replacement cache to keep track of item values and on-screen sizes 

Uses a utils/cursor to track where it is.

If using sql, then this will often involve a query with a LIMIT so looking up to 100 items after or before some item in a column.  



---

## Cascade Tool Growth

## [ ] Extract cascade nuggets to separate modules #tools/cascade
Run spike_kit.py extract on work-cascade-tool.html. CascadeParse, CascadeTree, CascadeReport, CascadeBundle become importable .js files.

## [ ] FastAPI backend for file loading in any of the tools #tools/fastapi
Replace the File System Access API drag-and-drop with a FastAPI endpoint that serves work and other files. Enables the tool to run as a served page rather than a local-only file.

## [x] Multi-page cascade tool #tools/cascade USES #spike
Split the single-page tool into: tag browser, bundle builder, report dashboard. Shared nuggets, separate harness pages.

---

## AST and Grammar Infrastructure

## [ ] Verify round-trip via jref/jend for all grammars #node/walkers/roundtrip
Confirm that walking an AST depth-first and emitting input.slice(leaf.jref, leaf.jend) recovers the original input exactly. This is the serialisation half of the grammar/typedef isomorphism. Test on SMILES, FEN, PGN, JaTeX, Markdown, JSON, SQLite, SVG.

## [ ] astToString generic utility #node/walkers/serialize
Depth-first walk emitting source slices at leaves. Shared by all grammars. Enables the edit path: modify AST → re-serialise → valid source string.

---

## Process Items

## [ ] PromptCraft stnda template #spike/normalise
Define the stnda pattern for LLM-mediated transforms: text input area, structured prompt (the nugget), pre/post processors, "run" button, output display. Each PromptCraft script becomes this same shape.

## [ ] Cascade tool "send to llm endpoint" button #tools/fastapi
Sends the assembled bundle to a configurable LLM endpoint. Not testable within Claude web app; requires the FastAPI-served multi-page version.