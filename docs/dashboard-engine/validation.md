# Validation, gates and generated references

Owners: `apps/server/src/app/domain/dashboards/`,
`packages/harnesys/src/packs/dashboards/`,
`scripts/gen-widget-skill-refs.ts`, `.github/workflows/ci.yml`.

## Two layers

| Layer | Files | Checks |
|---|---|---|
| Contract schemas | `packages/contracts/src/dashboards/` | doc shape, rects on the 8 px grid, source fields, expression syntax, literal limits, `interval` only on external sources |
| Server guard | `domain/dashboards/widget-doc.guard.ts`, `widget-doc-item.ts`, `widget-doc-expr.ts`, `path-guard.ts` | props parse with the descriptor, event names exist, `bindings` keys are real props, every root/source/derived reference resolves, `derived` has no cycles, `tpl` tokens are refs, `rowBindings` keys resolve, `visibleWhen` refs resolve, every source/`callApi` path names the widget's org |

Failures are one `DashboardWidgetValidationException` carrying
`details.issues: [{ path, message }]`; the path is a dot path inside the doc.
The agent tools `dashboard_widgets_validate` and `dashboard_widgets_test` run the
same checks without writing.

Templates are additionally covered by `templates/templates.spec.ts` (contract
parse, grid, fit, descriptor props, event names, catalog paths).

## Generated skill references

Two skill references are generated from the contracts and must never be edited by
hand:

- `apps/server/assets/skills/widget-creator/references/primitives.md`
- `apps/server/assets/skills/widget-creator/references/org-api-catalog.md`

```sh
bun run skills:gen     # regenerate both
bun run skills:check   # exit non-zero when stale; runs in CI
```

The rest of the skill (`SKILL.md`, `workflow.md`, `doc-model.md`,
`data-flow.md`, `actions-events.md`, `external-sources.md`, `recipes.md`,
`troubleshooting.md`) is hand-written; every JSON example in it is expected to
pass the guard.

## Gates

| Command | Covers |
|---|---|
| `bun test packages/contracts/src/dashboards` | primitive registry, defaults parity, JSON schema conversion, templates, expressions |
| `bun test apps/server/src/app/domain/dashboards apps/server/src/app/application/dashboards` | guard invariants, doc fixtures, use-cases |
| `bun test apps/webui/src/features/dashboards` | grid math and expression engine |
| `bun run --cwd apps/webui typecheck` | registry completeness (`satisfies Record<PrimitiveId, …>`), contracts wiring |
| `bunx biome check .` | style and layer boundaries |
| `bun run skills:check` | generated references are current |
| server boot on a spare port | DI resolution after controller/module edits |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, the compiler check,
`skills:check`, the full `bun test`, and the build smoke steps.

## What the specs pin down

- `primitives/primitive-registry.spec.ts`: unique ids, complete descriptors,
  JSON schema conversion, `defaults` keys declared in `props`, `defaults` parse
  against `props`, `defaults` are JSON.
- `templates/templates.spec.ts`: every template parses; ids unique; source paths
  in the catalog; rects multiple of 8 and inside the widget; props parse;
  events declared.
- `widget-doc.guard.spec.ts` / `widget-doc-golden.spec.ts`: guard messages,
  expressions, bindings, paths, derived cycles, and a golden fixture shape.

## Boot check

After touching a controller, use-case, port, adapter or module, boot the server
once on a spare port with a temporary home, and confirm it logs
`server listening`:

```sh
cd apps/server
SERVER_PORT=47501 HARNESYS_HOME="$HOME/.harnesys/bootcheck" bun src/main.ts
```

Green types, lint and tests do not prove DI resolution: a type-only import of a
token class erases it from `design:paramtypes`. Remove the temporary home when
done.
