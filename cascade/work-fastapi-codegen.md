```json
{ "role": "PROMPT"}
```
---

# [ ] FastAPI Spec → Code Generation — Elicited Insights

SWIG-like code generation from JavaScript interface definitions. One input file produces three outputs: a Python FastAPI server, a JavaScript accessor library, and a browser-side mock. All three are AST walks over the same parsed interface, with different emitters.

## Input Format #dplus/fastapi

The interface definition is **valid JavaScript**. It can be loaded and instantiated. Each class defines a group of related endpoints. Methods define individual routes.

```js
class SQLiteEndpoint {
  tables() { return new Array(); }                        // TableInfo[]
  columns(tableName) { return new Array(); }              // ColumnInfo[]
  query(sql, params = []) { return new Array(); }         // Row[]
  execute(sql, params = []) { return new Result(); }      // { changes, lastInsertRowid }
  transaction(statements) { return new Array(); }         // Result[]
}

class ChatEndpoint {
  messages(channelId, before = null, limit = 50) { return new Array(); } // Message[]
  send(channelId, content) { return new Message(); }
  edit(messageId, content) { return new Message(); }
  delete(messageId) { return new Ok(); }
}
```

### Conventions

**Route path:** derived mechanically from names. Class name minus `Endpoint` suffix → route prefix, method name → route suffix. `SQLiteEndpoint.query` → `/sqlite/query`. Prefix is lowercased.

**HTTP method:** determined by signature, no annotation needed.
- No parameters → `GET`
- Has parameters → `POST`, parameters sent as JSON request body

**Return type:** inferred from the `return new X()` statement in the method body. The constructor name (`Array`, `Result`, `Message`, `Ok`) is the response type. This is mechanically extractable from the AST — find the `js_ident` inside the `return` expression's `new` call.

**Trailing comments:** optional documentation. `// Row[]` after a method is for human readers and can be extracted as a doc string for the generated endpoint. Not required by the codegen.

**Default parameter values:** carried through to the generated code. `limit = 50` becomes an optional field with default in the Pydantic model and an optional parameter in the JS accessor.

**Type aliases:** defined as classes or comments elsewhere in the same file or in a companion types file. For the initial implementation, the codegen uses the type name as-is and generates skeleton type definitions. Fleshing out the type bodies is a manual step — or a future enhancement where the types file is also parsed.

```js
// Type sketches — inform the generated Pydantic models and JSDoc
class Message { constructor() { this.id = ''; this.channelId = ''; this.content = ''; this.timestamp = 0; } }
class Result { constructor() { this.changes = 0; this.lastInsertRowid = 0; } }
class Ok { constructor() { this.ok = true; } }
```

These are valid JS, parseable by the same grammar, and give field names and default-value types for the generated schemas.


## Grammar #dplus/fastapi/grammar

The interface format is valid JavaScript, so the existing `javascript-grammar.js` parses it directly. No new grammar is needed. The codegen walks the AST produced by parsing with the `JavaScript` rule.

The relevant AST structure (what the walk looks for):

- **`js_class`** — contains class name (`js_ident`) and body (`js_class_body`)
- **`js_class_member`** — each method. The JS grammar parses methods as expression-statements: the method name, parameter list (`js_paren_group`), and body (`js_block`) are all captured.
- **`js_paren_group` → `js_comma_list`** — parameter names and defaults
- **`js_block`** — method body, containing the `return new X()` statement
- **`js_line_comment`** — trailing doc comments

The walk does not need to understand full JavaScript semantics. It extracts a structural skeleton: class names, method names, parameter lists, return type names, and comments. Everything else in the AST is ignored.


## AST Walk → Endpoint Descriptor #dplus/fastapi

The first walk produces a neutral intermediate representation — an array of endpoint descriptors. All three emitters consume this, not the raw AST. This separates parsing concerns from output formatting.

```js
// Endpoint descriptor (output of the AST walk)
{
  prefix: 'sqlite',              // from class name
  className: 'SQLiteEndpoint',
  methods: [
    {
      name: 'query',
      route: '/sqlite/query',
      httpMethod: 'POST',        // has params → POST
      params: [
        { name: 'sql', default: null, required: true },
        { name: 'params', default: '[]', required: false }
      ],
      returnType: 'Array',       // from return new Array()
      doc: 'Row[]'               // from trailing comment
    },
    // ...
  ]
}
```

### Extraction Logic

**Class name → prefix:** strip `Endpoint` suffix if present, lowercase. `ChatEndpoint` → `chat`.

**Method detection:** within `js_class_body`, find `js_class_member` nodes that contain a `js_paren_group` followed by a `js_block`. The identifier immediately before the paren group is the method name.

**Parameter extraction:** walk the `js_comma_list` inside the paren group. Each element is an identifier, possibly followed by `=` and a default value expression. Default values are serialised back to source text via `input.slice(node.jref, node.jend)`.

**Return type extraction:** inside the method's `js_block`, find an expression containing `new` followed by `js_ident`. That identifier is the return type. If no `new` expression is found, return type is `null` (void endpoint).

**Comment extraction:** `js_line_comment` nodes appearing as the last child of a `js_class_member` (or immediately after the method in the class body) are doc comments. Strip the `//` prefix and trim.

**Type class extraction:** classes that are not suffixed with `Endpoint` are treated as type definitions. Walk their constructor body for `this.fieldName = defaultValue` assignments to extract field names and infer types from default values (`''` → string, `0` → number, `true` → boolean, `[]` → array, `{}` → object).


## Emitter 1: Python FastAPI Server #dplus/fastapi/gen

Walks the endpoint descriptors and emits a Python file per class.

```python
# generated: sqlite_endpoint.py
from fastapi import APIRouter, FastAPI
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/sqlite")

class QueryRequest(BaseModel):
    sql: str
    params: Optional[list] = []

class Row(BaseModel):
    pass  # TODO: populate fields

@router.post("/query")
async def query(req: QueryRequest) -> List[Row]:
    raise NotImplementedError

# GET endpoints (no params):
@router.get("/tables")
async def tables() -> List[TableInfo]:
    raise NotImplementedError
```

### Generation rules

- Each class produces one `APIRouter` with the prefix.
- POST methods get a `XxxRequest` Pydantic model generated from params.
- GET methods have no request model.
- Return types reference generated Pydantic models (from type classes) or `dict` if unknown.
- All handlers raise `NotImplementedError` — they are stubs to fill in.
- Default values carry through: `Optional[list] = []`.
- A `main.py` is generated that imports and includes all routers.

### Type mapping (default value → Python type)

| JS default | Python type |
|-----------|------------|
| `''` or `"..."` | `str` |
| `0`, `50` | `int` |
| `0.5` | `float` |
| `true` / `false` | `bool` |
| `[]` | `list` |
| `{}` | `dict` |
| `null` | `Optional[Any]` |
| `new X()` | `X` (reference) |
| no default | required field, type inferred from name or left as `Any` |


## Emitter 2: JavaScript Accessor Library #dplus/fastapi/gen

Walks the same descriptors and emits a JS module with typed fetch wrappers.

```js
// generated: sqlite-api.js
const BASE = '';

export async function query(sql, params = []) {
  const res = await fetch(`${BASE}/sqlite/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params })
  });
  return res.json(); // Array<Row>
}

export async function tables() {
  const res = await fetch(`${BASE}/sqlite/tables`);
  return res.json(); // TableInfo[]
}
```

### Generation rules

- One exported async function per method.
- POST: parameters assembled into a JSON body.
- GET: no body (parameters could go to query string if we ever need them, but currently GET means no params).
- `BASE` is a module-level constant, empty string by default (same-origin), configurable.
- JSDoc comment from the trailing doc comment, if present.
- The accessor library is the only file the browser code imports — it hides fetch mechanics.


## Emitter 3: Browser-Side Mock #dplus/fastapi/gen

Walks the same descriptors and emits a JS module with the same function signatures, returning canned data.

```js
// generated: sqlite-mock.js
export async function query(sql, params = []) {
  return [
    { id: 1, name: 'example' },
  ];
}

export async function tables() {
  return [
    { name: 'users', sql: 'CREATE TABLE users (...)' },
  ];
}
```

### Generation rules

- Same function signatures as the accessor library. Drop-in replacement — swap import path to switch between real and mock.
- Return values are procedurally generated from the type class fields if available. One example row for arrays, populated fields for objects.
- If type class is not available, returns an empty array or empty object as appropriate.
- Functions are `async` to match the accessor signature (returns a Promise).
- The mock is useful for browser-only development before the server exists.


## Build Order #dplus/fastapi

1. **AST walk → endpoint descriptors.** Parse interface file with existing JS grammar. Walk the AST extracting classes, methods, params, return types. Output the neutral descriptor format. Test with the SQLite and Chat examples above. This is the core; everything else is templating.

2. **Python FastAPI emitter.** String templates, one file per class plus a main.py. Test by running the generated server (should start, routes should 404 with NotImplementedError).

3. **JS accessor emitter.** String templates, one file per class. Test by importing and calling against the running stub server.

4. **JS mock emitter.** String templates, same shape. Test by importing in browser, verifying return shapes.

5. **Type class extraction.** Walk constructor bodies for `this.x = default` patterns, produce Pydantic models and mock data from them.

Steps 1–3 are the minimum viable pipeline. Step 4 adds browser-only development. Step 5 enriches the generated schemas.


## [ ] Stnda Shape #dplus/fastapi
Split panel: interface JS on the left (editable textarea), tabbed output on the right (Descriptors / Python / JS Accessor / JS Mock). Editing the input re-parses and regenerates all outputs live. The generated code is syntax-highlighted using the AST→coloured-spans walker from `node/walkers/colorize` (if available) or displayed in `<pre>` blocks.

The descriptor tab shows the intermediate JSON for debugging the extraction walk.


## Integration with Existing Endpoints #dplus/fastapi

The BOM lists several specific endpoints to build: infinite scroll, chat, SQLite. Each of these will be authored as an interface JS file following the conventions above. The codegen produces the FastAPI stubs; the implementation fills in the handlers.

The existing `[x] FastAPI tool to coordinate running of the various scripts, tools/fastapi` is a separate concern — it runs build scripts. The generated endpoints are served by a separate FastAPI app.

