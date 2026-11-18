# Workflow

1. **Inspect the dashboard.** `dashboards_list` to find the id, then `dashboards_get` for the widgets, their rects and their status. Do not create a second dashboard when one already fits; `dashboard_widgets_update` edits an existing widget and keeps it in draft. Only when the org has no dashboard for this purpose, create one with `dashboards_create` (`name`, plus optional `color` and `icon`, named for the question it answers), and rename with `dashboards_update` instead of creating another.
2. **Read the data you need.** `dashboard_catalog_get` returns every Org API entry with its method, path template, query JSON Schema, response JSON Schema and the `events/watch` topics that invalidate it. For anything outside the catalog, the same `/orgs/<orgId>/...` rule applies, but you get no typed response - keep such paths rare and documented to the user.
3. **Pick a template or compose.** `dashboard_templates_list`, then `dashboard_templates_get` for the full doc of the closest one. Templates come back with `:orgId` already replaced by your org id. Compose from scratch only when no template is close: `references/doc-model.md` for layout, `references/primitives.md` for primitives, `references/data-flow.md` for bindings.
4. **Validate.** `dashboard_widgets_validate` with the doc. It answers `{ ok, issues: [{ path, message }] }` and never writes. Fix every issue; `references/troubleshooting.md` maps messages to fixes. For an external source, `dashboard_widgets_test` fetches once and shows the real payload (vault resolution included) before you embed it.
5. **Create.** `dashboard_widgets_create` with `{ dashboardId, rect, doc }`. The canvas is a free pixel grid; `rect` is `{ x, y, w, h }` in pixels on an 8 px step. If the server rejects the doc, the error carries `details.issues` in the same `{ path, message }` shape.
6. **Place the widget on the board.** Widget rects are independent boxes on the same 8 px grid; they do not compact and they may overlap, so pick free space: read the occupied bottom edge from `dashboards_get` (max `y + h`) and place the new rect below it, or use `dashboard_widgets_move` to batch-move several widgets into a clean layout. Keep the rect big enough for the content: the card spends about 18 px of width and 48 px of height on its border, header and padding.
7. **Hand off for approval.** A created widget is stored as `status: "draft"`; a doc change to an agent-created widget goes back to draft. Tell the user which dashboard and which widget to review, and that activation happens in the dashboard UI. An agent cannot activate a widget.

## Choosing the shape

| Situation | Shape |
|---|---|
| One number or one list from one call | One source, one item |
| Several tiles from several calls | One source per call, one item each, shared `derived` for counts |
| Filter that changes a query | `select` or `input` with `stateKey` (it reads and writes that state key), source `query` reading the same key, `refetchSource` on change |
| Row action | Table `rowClick` writes the row into `state`, buttons read `state` and call the API |
| Live list | `orgApi` source with `refresh: { mode: "onEvent", topics: [...] }` |
| External API | `external` source, vault refs for headers, `interval` at 30 s or more |
| Legacy widget written before the composite form | `primitive` + `config` + optional `transform`; do not copy this shape for new docs |

## Rules that save a round trip

- Item `props` are static data; a value that comes from data belongs in `bindings`, not in `props`.
- Every `state` key you read must be declared in `doc.state`; every `sources.<id>` / `status.<id>` you read must name a declared source; every `derived.<name>` must be declared. The guard rejects unknown roots.
- `derived` may not have cycles; it evaluates in dependency order so one value can read another.
- `{{param:name}}` is external-only and lives in `query`/`body`; an `orgApi` source that uses it is rejected.
- `transform` JS is an escape hatch for shapes the declarative layer cannot express. Prefer `derived`, `bindings` and `rowBindings`; every transform is reviewed by a human in the approval dialog.
- Item ids are unique within a doc and at most 64 characters.
