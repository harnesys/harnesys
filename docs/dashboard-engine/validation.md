# Validation, gates and generated references

Owners: `packages/contracts/src/dashboards/widget-doc-check.ts`,
`apps/server/src/app/domain/dashboards/widget-doc.guard.ts`,
`packages/harnesys/src/packs/dashboards/validate-doc.ts`,
`scripts/gen-widget-skill-refs.ts`, `.github/workflows/ci.yml`.

## One check, three callers

The rules live once, in `checkWidgetDoc(orgId, doc)`:

| File | Responsibility |
|---|---|
| `packages/contracts/src/dashboards/doc.ts` | `WidgetDocSchema` (strict top level) and `WidgetItemSchema` (strict): shape, limits, 8 px rects, literal JSON |
| `packages/contracts/src/dashboards/sources.ts` | source kinds, `{{param:name}}` placement, `interval` only on `external` |
| `packages/contracts/src/dashboards/widget-doc-check.ts` | `checkWidgetDoc`: byte cap, schema parse, sources, derived, items; returns `{ ok, doc, issues }` |
| `packages/contracts/src/dashboards/widget-doc-expr.ts` | reference roots, fn names/arity/ops, `derived` cycles, template tokens, `rowBindings` refs |
| `packages/contracts/src/dashboards/widget-doc-item.ts` | props against the descriptor, event names, binding prop names, `callApi` org, legacy `actions` paths |
| `packages/contracts/src/dashboards/path-guard.ts` | traversal, encoding and org prefix of `/orgs/<orgId>/...` paths |

Callers:

- Server write path: `validateWidgetDoc` in
  `apps/server/src/app/domain/dashboards/widget-doc.guard.ts` calls
  `checkWidgetDoc`, then throws one `DashboardWidgetValidationException` with
  `details.issues: [{ path, message }]`. The REST filter renders that contract;
  `create-widget.use-case.ts` and `update-widget.use-case.ts` call it.
- Agent dry run: `dashboard_widgets_validate` calls the same `checkWidgetDoc`
  and returns `{ ok, issues }`. A doc that passes there is structurally accepted
  by create/update — there is no "stricter server guard" anymore.
- Templates: `templates/templates.spec.ts` runs the contract parse plus
  descriptor parity over every template.

Tool failures carry the exception details: `failureText` in
`packages/harnesys/src/application/tool-approve.ts` appends
`JSON.stringify(error.details)` after the message for every domain exception, so
`details.issues` reaches the agent instead of a bare reason string.

`visibleWhen`, `bindings`, source `query`/`body`, `derived`, `rowBindings` and
every action expression are walked for refs and fn calls. Roots are `state`,
`sources`, `status`, `derived`, `event`, `row`, `org`; `state.<key>` and
`derived.<name>` must be declared, `sources.<id>`/`status.<id>` must name a
declared source.

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
| `bun test packages/contracts/src/dashboards` | primitive registry, defaults parity, JSON schema conversion, templates, expressions, `checkWidgetDoc` |
| `bun test apps/server/src/app/domain/dashboards apps/server/src/app/application/dashboards` | exception wrapping, doc fixtures, use-cases |
| `bun test apps/webui/src/features/dashboards` | grid math, expression engine (including `where`) |
| `bun run --cwd apps/webui typecheck` | registry completeness (`satisfies Record<PrimitiveId, ...>`), contracts wiring |
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
- `widget-doc-check.spec.ts`: unknown event, invalid prop, unknown binding root,
  `derived` cycle, unverifiable `callApi` path, unknown top-level key, invalid
  `where` op.
- `apps/server/src/app/domain/dashboards/widget-doc.guard.spec.ts`: the check
  result is wrapped in the one exception contract.
- `apps/server/src/app/application/dashboards/widget-doc-golden.spec.ts`:
  golden fixture shape.
- `expr-fns.spec.ts`: every signature has an implementation; `where`
  comparisons, `contains`, `exists`/`missing` and the invalid-input fallback.
- `packages/harnesys/src/application/tool-approve.spec.ts`: domain error
  `details` survive into the tool error text.

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
