# Render runtime

Owners: `apps/webui/src/features/dashboards/render/`,
`apps/webui/src/features/dashboards/dashboards-queries.ts`.

## Item pipeline

`render/item-content.tsx` renders one item:

1. `visibleWhen` is evaluated against the roots; falsy renders nothing.
2. Items whose `derived`/`bindings` depend on a failed source render
   `WidgetErrorState` with retry; a loading dependency renders
   `WidgetLoadingState`.
3. `bindings` are evaluated and override the same keys of static `props`.
4. The descriptor's `props` schema parses the result. This applies schema
   `defaults`; invalid props render `WidgetPropsErrorState`.
5. Row-scoped props receive `exprRoots` so `withRowBindings` can evaluate each
   row; the component never sees the roots.
6. The component renders inside `ItemErrorBoundary`. In edit mode, binding
   diagnostics render above it instead of failing silently.
7. `emit(event, payload)` dispatches `item.on[event]`. A legacy `item.action`
   fires on `click` when no `click` handler exists.

`render/registry.tsx` maps each `PrimitiveId` to `{ icon, Component }` with
`satisfies Record<PrimitiveId, PrimitiveEntry>`, so a missing primitive fails
`tsc`.

## Expressions

Roots: `state`, `sources`, `status`, `derived`, `event`, `row`, `org`. Unknown
roots, undeclared source ids and undeclared state/derived names are rejected by
the guard.

Forms: literal value, `{ ref }`, `{ tpl }`, `{ fn, args }`, `{ lit }`. A binding
value may also be a bare ref string (`"state.count"`).

Evaluation order: source `query`/`body` (state and org only — a source cannot
read another source) → `derived` in dependency order (cycles rejected) → item
`bindings` → `visibleWhen` → `rowBindings`.

The function library (`count`, `filter`, `pluck`, `groupCount`, `format`, …) is
declared in `packages/contracts/src/dashboards/expr.ts`
(`EXPR_FN_SIGNATURES`) and implemented in `render/engine/fns/`. The agent-facing
signature table is `apps/server/assets/skills/widget-creator/references/data-flow.md`.

## Sources

`WidgetSourceSchema` in `packages/contracts/src/dashboards/sources.ts`:

| Kind | Fields |
|---|---|
| `orgApi` | `id`, `method` (GET default), `path` under `/orgs/<orgId>`, `query`, `body`, `refresh` |
| `external` | `id`, `method`, `url`, `headers` (vault refs), `query`, `body`, `secretRefs`, `cacheTtlSeconds`, `refresh` |

Refresh modes: `onMount` (default), `manual`, `onEvent` (push through
`events/watch`, 1 s trailing debounce), `interval` (external only, 30–3600 s; an
`orgApi` source with `interval` fails the contract schema).

`orgApi` sources are fetched by the browser with the viewer's session. The engine
never polls them. `external` sources are fetched by the server: egress guard,
vault substitution, 10 s timeout, 2 MB response cap, cache keyed by widget and
resolved parameters. `{{param:name}}` is external-only and only valid in
`query`/`body`. Deeper detail lives in the skill reference
`references/external-sources.md`.

The catalog (`packages/contracts/src/dashboards/catalog/`) declares method, path,
query schema, response schema and invalidation topics per endpoint; the binding
picker and the generated skill catalog are derived from it.

## Events and actions

Events come from the primitive descriptor:

| Primitive | Event | Payload |
|---|---|---|
| `button` | `click` | — |
| `input` | `change` | `{ value }` |
| `select` | `change` | `{ value }` |
| `switch` | `change` | `{ checked }` |
| `table` | `rowClick` | `{ row, index }` (original row and index) |
| `list` | `itemClick` | `{ row, index }` (original row and index) |
| `chart` | `pointClick` | `{ point, index }` |

Actions (`packages/contracts/src/dashboards/actions.ts`): `setState`,
`incrementState`, `toggleState`, `callApi`, `refetchSource`, `invokeExternal`,
`navigate`, `notify`, `sequence`. `on` accepts one action or an array;
`callApi.onSuccess`/`onError` accept up to 20 nested actions.

`callApi` defaults to `method: "POST"`; `GET` must be explicit. Paths are a
literal `/orgs/<orgId>/...` string or a `tpl` with a literal org prefix; refs and
foreign orgs are rejected. Non-GET calls ask the viewer unless `confirm: false`;
a string `confirm` is the prompt. `resultTo` writes the response into a state
key; `successMessage` toasts. `navigate.to` must be an app route under
`/o/<orgId>`.

## State push

The client keeps the dashboard detail in a React Query cache. `dashboards.changed`
frames are parsed in `shared/api/dashboards.ts` and handled in
`dashboards-queries.ts`:

- `reason: "widget.state"` with `widgetId` and `state` updates the cached widget
  state snapshot in place, no refetch.
- Any other frame invalidates the dashboard detail (and the list).
- Component state writes go through the widget runtime, are debounced for
  persistence, and never invalidate the dashboard query.
