# Authoring UI

Owners: `apps/webui/src/features/dashboards/ui/`,
`apps/webui/src/features/dashboards/model/`.

## Board

`ui/board/board-canvas.tsx` renders widgets on the outer pixel grid. Edit mode
enables drag and resize through `render/grid/`; view mode is static but
primitives stay interactive. Widgets carry a drag handle, an add-primitive menu,
and actions for duplicate, export, import, refresh and delete.

Layout changes are committed separately from the doc through
`PUT /orgs/:orgId/dashboards/:dashboardId/layout` (`dashboard_widgets_move` in the
agent tools). A drag that overlaps another widget pushes it down; nothing
compacts upward. Narrow containers switch to a stacked layout; every other
width scales widget `x`/`w` from the authored width (see `doc-model.md`), so the
board fills the pane without horizontal scroll and saved rects never change on
resize.

## Inspector

The inspector is generated from the primitive descriptor; a new field appears
without webui edits.

| Control | Source | Editor |
|---|---|---|
| `text` | string | single-line input |
| `textarea` | string with `control: 'textarea'` | multiline input |
| `number` | number / numeric union | numeric input |
| `switch` | boolean | toggle |
| `select` | `enum` values | dropdown |
| `color` | string with `control: 'color'` | color picker |
| `list` | array of objects with properties, or scalars | repeatable rows with reorder |
| `record` | object with open values | name → expression rows |
| `json` | open object / array of open objects | JSON textarea |

`model/prop-fields.ts` derives labels, hints, required marks, defaults and
options from `z.toJSONSchema(descriptor.props)` plus `.meta()`. Without a
`control`, the control is derived from the JSON Schema type.

Other inspector sections:

- **State**: add, rename and remove keys; rename keeps `persistedState` in sync;
  the checkbox marks a key as persisted.
- **Sources**: kind, path/url, method, query/body expressions, refresh mode
  (interval only for external sources), topics for `onEvent`, external headers
  and secrets.
- **Bindings**: prop name → expression, with the binding path picker built from
  declared state, derived names and catalog response schemas
  (`model/binding-paths.ts`).
- **Events**: one editor per declared descriptor event; each action is edited
  field by field (`setState`, `callApi` with confirm/resultTo/nested handlers,
  `refetchSource`, `navigate`, `notify`, `sequence`, …).
- **Item layout**: rect fields and drag/resize on the inner grid; the add menu
  stamps descriptor defaults.

A raw JSON editor (`ui/widget-json-editor-dialog.tsx`) pastes a whole doc and
validates it against `WidgetDocSchema` before applying. Widgets can be exported
and imported as JSON files (`model/widget-transfer.ts`).

## Drafts and saving

Edits are buffered per widget in `model/inspector-store.ts` with undo/redo.
Nothing is written until Save:

- Save sends the doc with `baseUpdatedAt`. A concurrent save by someone else is
  reported and can be overwritten or discarded.
- Board layout writes are independent and immediate.
- A widget created by an agent is `draft`. A human activates it with
  `POST .../widgets/:widgetId/activate`; agents cannot activate.

## Templates

Seven templates in `packages/contracts/src/dashboards/templates/`: blank,
click-counter, kpi-threads, approvals-queue, agent-roster, spend-chart, notes.
`materializeWidgetTemplate(template, orgId)` substitutes the org id.

Templates use literal `w: 408` widget rects so 384-wide items fit the body, and
are authored as complete valid docs (state wiring, sources, columns, formats).
`templates.spec.ts` checks: the doc parses, ids are unique, source paths name
shipped catalog entries, every rect is on the 8 px grid and inside the widget,
every prop parses with its descriptor, and every declared event exists.

A new primitive gets no template automatically. A template must never use a
primitive or prop the guard would reject.
