# Doc model

Contract: `packages/contracts/src/dashboards/doc.ts`. Schemas: `WidgetDocSchema`, `WidgetItemSchema`, `WidgetRectSchema`.

## Container

| Field | Type / rule | Default |
|---|---|---|
| `schemaVersion` | literal `1` | required |
| `title` | string, 1-120 characters | required |
| `state` | object of JSON values; keys become the `state` root | `{}` |
| `persistedState` | array of up to 100 state keys, 1-64 characters each | absent |
| `sources` | array of `WidgetSource`, at most 10 | `[]` |
| `derived` | object of name to `Expr`, names 1-64 characters | `{}` |
| `items` | array of `WidgetItem`, at most 30 | `[]` |
| `primitive` | primitive id, used only by the legacy single-primitive form | `custom` |
| `config` | object of JSON values, used only by the legacy form | `{}` |
| `transform` | JS source string, at most 32000 characters, legacy form only | absent |

`persistedState` is live: on mount the widget loads the stored values for those keys and writes them back after a 500 ms debounce. Only keys listed there survive a reload; every other key lives for the lifetime of the view. A key written by an action or a primitive may be persisted, but it must also exist in `state` for the guard to accept bindings that read it.

`persistedState` values are stored on the server per widget, not per viewer: anyone who opens the dashboard sees the same values, and the last write wins. Persist a key only when that shared behavior is what the user asked for; counters, drafts and filters that differ per person should stay in plain `state`.

A doc with `items: []` renders in the legacy single-primitive form (`primitive` + `config` + optional `transform`). New widgets always use `items`.

## Grid

The canvas is a free pixel grid: every box is stored in CSS pixels and snapped to an 8 px step. There are no columns and no row units.

Widget rect (`WidgetRectSchema`):

| Field | Rule |
|---|---|
| `x` | integer 0 or more, multiple of 8 |
| `y` | integer 0 or more, multiple of 8 |
| `w` | integer 8 or more, multiple of 8 |
| `h` | integer 8 or more, multiple of 8 |

## Item subgrid

An item is a rect on the same pixel grid inside the widget body: `x`, `y`, `w`, `h` in pixels, all multiples of 8. The body scrolls when items extend past its height, so a tall layout stays reachable. Items do not compact or push each other around by themselves; two items on the same rect overlap and the later one wins visually. Lay them out explicitly with `x`/`y`/`w`/`h`.

The item area is smaller than the widget rect: the card border, 8 px padding and the ~33 px header leave about `w - 18` by `h - 43` px for items. Keep content inside `w - 24` by `h - 48` to stay clear of the edges; a taller layout scrolls vertically inside the body, a wider one scrolls horizontally. A widget `w: 408` therefore holds items up to `384` wide, which is the width the templates use.

Descriptor default sizes are in `references/primitives.md`; start from them and widen the item that holds a table or chart.

## Item

`WidgetItemSchema` is a **strict object**: a key outside this list makes the whole doc fail validation.

| Field | Type / rule |
|---|---|
| `id` | string, 1-64 characters, unique inside the doc |
| `primitive` | primitive id from `references/primitives.md` |
| `title` | optional string, 1-120 characters |
| `rect` | `WidgetRect` (pixels, 8 px step) |
| `props` | static data, validated against the primitive's props schema; default `{}` |
| `bindings` | prop name to `Expr`; overrides `props` at render time; default `{}` |
| `on` | event name to one action or an array of actions; default `{}` |
| `visibleWhen` | optional `Expr`; falsy hides the item |
| `action` | optional single action, legacy form; fires on `click` when no `on.click` exists |

Item keys are checked strictly; the doc itself is not, so a misspelled top-level key is silently dropped instead of rejected. Proofread the top-level keys.

## Example skeleton

```json widget
{
  "schemaVersion": 1,
  "title": "Two tiles",
  "state": { "selected": "" },
  "sources": [],
  "derived": {},
  "items": [
    {
      "id": "left",
      "primitive": "metric",
      "title": "Left",
      "rect": { "x": 0, "y": 0, "w": 192, "h": 64 },
      "props": { "label": "Left" },
      "bindings": { "value": 1 }
    },
    {
      "id": "right",
      "primitive": "text",
      "rect": { "x": 192, "y": 0, "w": 192, "h": 64 },
      "props": { "text": "Right" }
    }
  ]
}
```
