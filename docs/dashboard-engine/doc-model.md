# Doc model and layout

Owners: `packages/contracts/src/dashboards/doc.ts`,
`packages/contracts/src/dashboards/interactions.ts`,
`packages/contracts/src/dashboards/row-bindings.ts`.

## WidgetDoc

`WidgetDocSchema` is the document contract. Top-level keys are not strict:
unknown keys are dropped silently, so proofread them.

| Field | Rule |
|---|---|
| `schemaVersion` | literal `1` |
| `title` | 1–120 characters |
| `state` | object of JSON values; keys become the `state` root |
| `persistedState` | up to 100 state keys that survive a reload |
| `sources` | up to 10 `WidgetSource` |
| `derived` | name → expression (names 1–64 characters) |
| `items` | up to 30 `WidgetItem` |
| `primitive`, `config`, `transform` | legacy single-primitive form only |

A doc with `items: []` renders the legacy form. New widgets always use `items`.

## WidgetItem

`WidgetItemSchema` is a strict object: an unknown key fails the whole doc.

| Field | Rule |
|---|---|
| `id` | 1–64 characters, unique in the doc |
| `primitive` | id from the primitive registry |
| `title` | optional, 1–120 characters; inspector label |
| `rect` | pixel box, every value a multiple of 8 |
| `props` | static JSON, validated by the primitive descriptor |
| `bindings` | prop name → expression; overrides `props` at render |
| `on` | event name → action or action list (max 50 actions) |
| `visibleWhen` | optional expression; falsy hides the item |
| `action` | legacy single action, fires on `click` when `on.click` is absent |

`visibleWhen` has no inspector control; it is authored in JSON or by an agent.

## Layout

Two grids share one pixel rule:

- `GRID_STEP = 8`: every widget and item rect stores integers that are multiples
  of 8. Enforced by `WidgetRectSchema`.
- `ITEM_GRID_STEP = 32`: authoring unit for primitive defaults and template
  helpers (`itemRect(col, row, w, h)`). Stored rects are still pixels.

The widget card spends space on chrome: about 18 px of width and 43 px of height
(border, 8 px padding, ~33 px header). A `408`-wide widget holds 384 px of items,
which is what the templates use. Keep item content inside `w - 24` by `h - 48`.
Taller content scrolls vertically inside the body; wider content scrolls
horizontally; drag and resize clamp to the visible width.

Interaction (`render/grid/use-slot-interaction.ts`, `grid-math.ts`): the active
box takes the requested rect, every overlapping box is pushed below the blocker
(`resolveCollisions`), and boxes never compact upward — empty space stays where
the user left it. The same behavior applies to widgets on the board and to items
inside a widget. Narrow containers switch to a stacked layout.

## State

Widget state is one reactive object shared by all items of a widget:
`runtime.state`, written by `setState`, read in expressions as `state.*`. A
binding may only read keys declared in `doc.state`.

Two-way controls (`input`, `select`, `switch`) bind through `stateKey`
(`STATE_KEY_PROP`). The rule lives in `useStateKeyProp`
(`render/primitives/use-state-key.ts`): when the runtime is present and the key is
set, the control reads the live value and writes every change back. Controls
still emit `change` for actions. A renderer must not read `runtime.state` for the
same purpose.

### persistedState

- Stored on the server per widget (`dashboard_widget_state`), not per viewer:
  every viewer sees the same values and the last write wins.
- On mount the widget loads stored values for the listed keys. Writes are
  debounced by 500 ms and sent as one `PUT
  /orgs/:orgId/dashboards/:id/widgets/:widgetId/state`.
- The server filters incoming keys against `persistedState` and publishes
  `dashboards.changed` with `reason: "widget.state"` plus `widgetId` and `state`.
  Clients apply that frame through `setQueryData`; it does not invalidate the
  dashboard detail. One interaction produces at most one PUT per debounce window,
  not a refetch storm.
- A key written by an action or control may be persisted, but it must also exist
  in `state` for the guard to accept bindings that read it.
