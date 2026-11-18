# Dashboard engine

Contributor documentation for the dashboard widget engine: the document model,
the render runtime, the authoring UI, validation, and how to add a primitive.
Each page names the files that own the behavior; if this documentation and the
code disagree, the code wins and this page is the bug.

## Mental model

A dashboard holds widgets. A widget is one `WidgetDoc` (a JSON document) plus a
pixel rect on the board and a status (`draft` or `active`). The doc contains
`items`; each item is one primitive on an inner pixel grid with static `props`,
data `bindings`, event handlers `on`, and optional `visibleWhen`.

```
dashboard_widget (rect, status) -> WidgetDoc
                                    ├─ state / persistedState
                                    ├─ sources  (orgApi | external)
                                    ├─ derived  (expressions)
                                    └─ items[]  -> primitive + rect + props + bindings + on
```

Data reaches a primitive only through `props` and `bindings`. User intent leaves
only through events and actions. A primitive never fetches, never reads the doc
and never talks to a source directly.

## Pages

| Page | Read when |
|---|---|
| [doc-model.md](doc-model.md) | Changing the doc schema, item layout, state or persistence |
| [runtime.md](runtime.md) | Changing rendering, expressions, sources, events or actions |
| [authoring-ui.md](authoring-ui.md) | Changing the board, inspector, drafts or templates |
| [validation.md](validation.md) | Changing the guard, tests, CI gates or generated references |
| [adding-a-primitive.md](adding-a-primitive.md) | Adding or changing a widget primitive |

## Where things live

| Layer | Location |
|---|---|
| Contracts (schemas, expressions, primitives, templates) | `packages/contracts/src/dashboards/` |
| Server validation guard | `apps/server/src/app/domain/dashboards/` |
| Persistence (org SQLite) | `apps/server/src/app/infra/dashboards/`, `apps/server/src/app/infra/org-sqlite/` |
| REST API | `apps/server/src/app/api/rest/dashboards.controller.ts` |
| Server use-cases | `apps/server/src/app/application/dashboards/` |
| Render engine | `apps/webui/src/features/dashboards/render/` |
| Board and inspector UI | `apps/webui/src/features/dashboards/ui/` |
| Client data and SSE | `apps/webui/src/features/dashboards/dashboards-queries.ts`, `apps/webui/src/shared/api/dashboards.ts` |
| Agent tools | `packages/harnesys/src/packs/dashboards/` |
| Authoring skill | `apps/server/assets/skills/widget-creator/` |
| Generated skill references | `scripts/gen-widget-skill-refs.ts` |

## Gates

| Command | Covers |
|---|---|
| `bun test packages/contracts/src/dashboards` | registry, defaults parity, JSON schema conversion, templates, expressions |
| `bun test apps/server/src/app/domain/dashboards apps/server/src/app/application/dashboards` | guard invariants, doc fixtures, use-cases |
| `bun test apps/webui/src/features/dashboards` | grid math and expression engine |
| `bun run --cwd apps/webui typecheck` | primitive registry completeness, contracts wiring |
| `bunx biome check .` | style and architecture boundaries |
| `bun run skills:check` | generated skill references are current (CI) |
| server boot on a spare port | DI resolution after controller/module edits |

## Legacy surface

`actions` and `custom` are legacy primitives: renderable for existing docs,
hidden from the palette, and not a base for new work. A doc with `items: []`
renders through the legacy single-primitive path (`primitive` + `config` +
optional `transform` JS). New widgets always use `items`.

## Known limits

- Event payload schemas document the contract but are not validated at runtime
  and not typed per event; the guard checks event names only.
- `rowBindings` and `stateKey` are shared prop names handled by shared helpers,
  not descriptor metadata.
- The inspector has no UI for `visibleWhen`, `transform`, or the legacy
  `primitive`/`config` form; those are JSON/agent-only.
- `persistedState` is shared per widget, not per viewer.
- Wide item layouts scroll horizontally; there is no automatic reflow beyond the
  drag collision rule.
- Generated skill references cover props, defaults and events, not renderer
  quirks; quirks belong in the descriptor `hint`.
