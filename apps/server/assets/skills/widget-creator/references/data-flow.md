# Data flow

Contract: `packages/contracts/src/dashboards/expr.ts` and `sources.ts`. Runtime reference roots: `apps/webui/src/features/dashboards/render/engine/expr-eval.ts`.

A widget has four inputs (`sources`, `state`, `derived`, and the `event` payload of a fired action) and one output (item `bindings` plus static `props`). Nothing reaches a primitive except through `props`, `bindings` and row bindings.

## Roots

| Root | What it holds | Guard rule |
|---|---|---|
| `state` | `doc.state` plus keys written by actions | the key must be declared in `doc.state` |
| `sources` | resolved payload per source id, exactly as the endpoint returned it | the id must be declared in `doc.sources` |
| `status` | per source id `{ loading, error }` | the id must be a declared source |
| `derived` | evaluated `doc.derived` values | the name must be declared in `doc.derived` |
| `event` | payload of the event that fired the action (`event.row`, `event.value`, ...) | always allowed |
| `row` | current row inside `rowBindings` | always allowed |
| `org` | `{ id }` of the widget's org | always allowed |

Any other root is rejected: `unknown binding root "x"`.

## Order of evaluation

1. Sources run according to their `refresh` policy. A source `query`/`body` expression is evaluated with `state` and `org` only - a source cannot read another source's payload.
2. `derived` is evaluated in dependency order, so `derived.total` may read `derived.count`. A cycle is rejected (`derived cycle: a -> b -> a`).
3. Item `props` are static; `bindings` are evaluated against the full roots and override the same key in `props`.
4. `visibleWhen` is evaluated per item; falsy hides the item.
5. `rowBindings` on `table` and `list` are evaluated once per row with that row as the `row` root.

## Expr forms

An expression is JSON. A plain value is a literal, plain arrays and objects are walked; four marker objects carry the logic:

| Form | Example | Meaning |
|---|---|---|
| ref | `{ "ref": "sources.threads.items" }` | read a path from the roots |
| tpl | `{ "tpl": "/o/{{org.id}}/thread/{{event.row.id}}" }` | interpolate `{{path}}` tokens; no logic, no nested markers |
| fn | `{ "fn": "count", "args": [{ "ref": "sources.threads.items" }] }` | call a function from the table below |
| lit | `{ "lit": { "a": 1 } }` | force a literal where a marker-shaped object would be misread |

Rules the guard enforces:

- Ref paths are dotted, with optional numeric indices: `sources.usage.rows[0].costUsd`. Segments match `[A-Za-z0-9_$-]+`; anything else (quotes, spaces, `?`) is rejected.
- A plain object that carries one of the keys `ref`, `tpl`, `fn`, `args`, `lit` must be that marker: `object has marker key "ref" but is not a valid ref marker`. To pass such a key as data, wrap it: `{ "lit": { "ref": "not a ref" } }`.
- A `tpl` fails the whole template when a token is missing or malformed instead of producing a path with a hole. Token bodies are ref paths (`{{state.city}}`), never function calls.
- Every `{ fn }` name is checked against the signature table and the argument count is validated: `fn "sort" expects 1..2 arguments, received 3`.
- `bindings` values may be a bare string ref (`"state.count"`); every other value is an Expr.

## Functions

| Function | Args | Result |
|---|---|---|
| `count` | 1 | entries of a list, characters of a string, or keys of an object |
| `length` | 1 | same as `count` |
| `sum` | 1 | sum of the numbers in a list |
| `avg` | 1 | mean of the numbers in a list |
| `min` / `max` | 1 | smallest / largest number in a list |
| `first` / `last` | 1 | first / last entry of a list, first / last character of a string |
| `pluck` | 2 | values at a path across a list of objects; missing entries become `null` so indexes stay aligned |
| `filter` | 2 | entries whose value at a path is truthy (no lambdas; the second argument is the path) |
| `where` | 3-4 | entries whose value at a path matches `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `exists` or `missing`; the fourth argument is the comparison value (`exists`/`missing` ignore it). Use it for "only in_review" or "older than X": `{ "fn": "where", "args": [{ "ref": "sources.issues.items" }, "status", "eq", "in_review"] }`. A literal unknown op is rejected by the guard |
| `sort` | 1-2 | ascending copy; with a path, ordered by that value |
| `limit` | 2 | first `n` entries |
| `groupCount` | 1-2 | `[{ key, count }]` grouped by a path or by the entry itself, ordered count desc then key asc - shaped for a `chart` with `xKey: "key"`, `yKey: "count"` |
| `concat` | 1+ | arrays joined into one array, non-array values appended |
| `join` | 1-2 | list entries as text, second argument is the separator (default `", "`) |
| `format` | 1-2 | human text: `number`, `percent` (0..1 fraction), `currency`, `date`, `relative`, or an options object `{ kind, currency, digits, locale }` |
| `eq` / `neq` | 2 | deep equality, `null` equals `null` |
| `gt` / `gte` / `lt` / `lte` | 2 | ordering; `null` when the pair is not comparable |
| `and` / `or` | 1+ | truthiness across all arguments |
| `not` | 1 | negation |
| `if` | 2-3 | `if(condition, then, else)`, else defaults to `null` |
| `coalesce` | 1+ | first non-null argument |
| `pick` | 2 | read a path inside a value: `pick(sources.x, "a.b")` |

`if`, `and`, `or` and `coalesce` evaluate their arguments lazily.

## Sources

| Field | `orgApi` | `external` |
|---|---|---|
| `kind` | `"orgApi"` | `"external"` |
| `id` | 1-64 characters, unique in the doc | same |
| `method` | `GET` (default), `POST`, `PUT`, `PATCH` | same |
| `path` | starts with `/orgs/<your orgId>` | - |
| `url` | - | absolute URL |
| `headers` | - | string map; values may hold `{{vault:name}}` |
| `query` | object of Expr values | object of Expr values; `{{param:name}}` allowed |
| `body` | Expr; `{{param:name}}` rejected | Expr; `{{param:name}}` allowed |
| `secretRefs` | - | vault names the headers reference |
| `cacheTtlSeconds` | - | `0`-`3600`; `0` disables caching |
| `refresh` | below | below |

`refresh` is `{ mode, intervalSeconds?, topics? }`:

| Mode | Behavior |
|---|---|
| `onMount` | fetch once when the widget appears; this is the default |
| `manual` | fetch only on `refetchSource`, a retry, or an external invoke |
| `interval` | external sources only, `intervalSeconds` 30-3600; the server rejects `interval` on an `orgApi` source |
| `onEvent` | refetch when one of `topics` arrives on `events/watch`, with a 1 s trailing debounce; allowed on both source kinds |

Topics worth subscribing to: `desk`, `approval`, `terminal`, `fleet-changed`, `automations-changed`, `source-change`, `git-summary`, `git-file-status`, `thread-error`, `skills-changed`, `dashboards.changed`. The catalog lists the topics that invalidate each entry.

## Worked example

Open threads count plus an unread tile from one source:

```json widget
{
  "schemaVersion": 1,
  "title": "Thread KPIs",
  "state": {},
  "sources": [
    {
      "kind": "orgApi",
      "id": "threads",
      "method": "GET",
      "path": "/orgs/:orgId/threads",
      "refresh": { "mode": "onEvent", "topics": ["desk"] }
    }
  ],
  "derived": {
    "total": { "fn": "count", "args": [{ "ref": "sources.threads.items" }] },
    "unread": {
      "fn": "count",
      "args": [{ "fn": "filter", "args": [{ "ref": "sources.threads.items" }, "unread"] }]
    }
  },
  "items": [
    {
      "id": "total",
      "primitive": "metric",
      "rect": { "x": 0, "y": 0, "w": 192, "h": 64 },
      "props": { "label": "Threads" },
      "bindings": { "value": { "ref": "derived.total" } }
    },
    {
      "id": "unread",
      "primitive": "metric",
      "rect": { "x": 192, "y": 0, "w": 192, "h": 64 },
      "props": { "label": "Unread" },
      "bindings": { "value": { "ref": "derived.unread" } }
    }
  ]
}
```

`:orgId` in the example stands for your own org id; substitute it before creating the widget.
