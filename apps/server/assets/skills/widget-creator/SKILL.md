---
name: widget-creator
description: Author dashboard widgets as JSON - the WidgetDoc contract, Org API catalog, expressions, events and actions, external sources with vault secrets, and ready-made recipes. Use when asked to build, change, or debug a dashboard widget.
when_to_use: "Before calling dashboard_widgets_create / dashboard_widgets_update, when a widget shows no data or the wrong data, when wiring a source, an event or an external API into a card, or when the server rejects a widget doc with a validation issue."
---

# Widget Creator

A widget is one JSON document (`WidgetDoc`, `schemaVersion: 1`) that an agent or a human assembles into a dashboard card from data (Org API or external APIs), local state, and primitives wired together. You write the document; a human approves it.

Start with `references/workflow.md` - it is the path from an empty dashboard to an approved widget.

## How to use this skill

| File | Contents | Load when |
|---|---|---|
| `references/workflow.md` | Inspect dashboard, read catalog, pick template or compose, validate, create, hand off for approval | Starting any widget task |
| `references/doc-model.md` | Container, pixel rects, item subgrid, `state`, limits (30 items, 10 sources) | Laying out items or hitting a limit |
| `references/data-flow.md` | Sources, `derived`, `state`, expression roots, `bindings`, every Expr form and function | Making a value appear in a primitive |
| `references/actions-events.md` | Event names per primitive, action types, confirm rules, allowed paths | A button, row, select or toggle must do something |
| `references/primitives.md` | Generated: every primitive id, its props schema, events, defaults | Choosing a primitive or checking a prop name |
| `references/org-api-catalog.md` | Generated: catalog paths, query fields, response paths, refresh topics | Binding an Org API source |
| `references/external-sources.md` | Vault refs, `{{param:name}}`, egress, intervals, cache TTL | Calling an API outside the org |
| `references/recipes.md` | Valid complete docs for the common widgets | You need a working starting point |
| `references/troubleshooting.md` | Validation messages and their fixes | A create/update call was rejected |

`references/primitives.md` and `references/org-api-catalog.md` are generated from the contracts by `scripts/gen-widget-skill-refs.ts`; everything else is hand-written against the same files. When a doc and the contract disagree, the contract wins - `load_skill` with `{ "name": "widget-creator", "file": "references/<name>.md" }` reads a single file.

## Ground rules

- **Draft, then approval.** `dashboard_widgets_create` always stores the widget as `status: "draft"`, and a doc change to an agent-created widget sends it back to draft. Only a human activates it in the dashboard UI. Say so when you hand the widget back; never claim the widget is live.
- **Validate before create.** Run `dashboard_widgets_validate` on the doc and fix every issue it returns before calling `dashboard_widgets_create`: the tool runs the same guard as create/update, so a clean result means the doc will be accepted. A rejected create answers with `details` including `issues: [{ path, message }]`; fix those fields instead of rewriting the whole doc.
- **Vault only, never inline secrets.** Header values reference secrets as `{{vault:name}}` and the names are listed in `secretRefs`. A literal API key, token or password in a doc is a defect even if it works.
- **Org paths stay in your org.** Every `orgApi` source path and every `callApi` path starts with `/orgs/<your orgId>`; the guard rejects traversal, encoded separators and foreign orgs.
- **`confirm` stays on for mutations.** Non-GET `callApi` actions ask the viewer before running. Only drop it with `confirm: false` when the user asked for a one-click action.
- **No invented fields.** Every key in this skill exists in `packages/contracts/src/dashboards/`. If you need a key that is not documented, the widget cannot express it yet - say that instead of guessing.
- **Delete only on request.** `dashboards_delete` and `dashboard_widgets_delete` are destructive and cannot be undone; call them only when the user explicitly asked to remove that dashboard or widget, and name what will disappear first.
- **Read the catalog before binding.** Response paths come from `dashboard_catalog_get`; a binding to a guessed field shows an empty card, not an error.
