# Actions and events

Contract: `packages/contracts/src/dashboards/actions.ts`, `doc.ts` (`WidgetItem.on`), primitives in `packages/contracts/src/dashboards/primitives/`. Runtime: `apps/webui/src/features/dashboards/render/engine/action-runner.ts`.

Data goes into an item through `bindings`; user intent comes out through `on`. Nothing else triggers a side effect.

## Events

`on` is a map of event name to one action or an array of actions (at most 50). The event payload is available inside those actions as the `event` root.

| Primitive | Event | Payload |
|---|---|---|
| `button` | `click` | - |
| `input` | `change` | `event.value` (string) |
| `select` | `change` | `event.value` (string) |
| `switch` | `change` | `event.checked` (boolean) |
| `table` | `rowClick` | `event.row` (object), `event.index` |
| `list` | `itemClick` | `event.row` (object), `event.index` |
| `chart` | `pointClick` | `event.point` (object), `event.index` |

Every other primitive has no events; `references/primitives.md` is the generated authority and is regenerated from the same descriptors the guard validates against. An event name outside this table is rejected: `unknown event for table`.

A legacy item `action` fires on `click` when the item declares no `on.click`, so old docs keep working. New docs use `on`.

## Two-way state binding

`input`, `select` and `switch` accept `stateKey`: the primitive reads the live value from `state[stateKey]` and writes every user change back to it, in addition to emitting `change`. The key must be declared in `state`, otherwise the guard rejects the binding read.

| Primitive | Without `stateKey` | With `stateKey` |
|---|---|---|
| `input` | not allowed: `stateKey` is required (default `value`) | field text is the state value |
| `select` | `value` prop is the current selection | `state[stateKey]` wins, `value` is the fallback |
| `switch` | `checked` prop is the current value | `state[stateKey]` wins, `checked` is the fallback |

Binding a form control's value through `bindings` is unnecessary when `stateKey` is set: the runtime already reads the key. Use `on.change` only for side effects beyond storing the value (recompute a derived value, refetch a source).

## Actions

| `type` | Fields | Effect |
|---|---|---|
| `setState` | `key`, `value` (Expr) | write a state key |
| `incrementState` | `key`, `delta` (Expr) | numeric increment |
| `toggleState` | `key` | flip a boolean state key |
| `callApi` | below | call the org API with the viewer's session |
| `refetchSource` | `sourceId` | refetch a declared source now |
| `invokeExternal` | `sourceId`, `params` (Expr), `resultTo` | call an external source on demand |
| `navigate` | `to` (Expr) | go to an app route |
| `notify` | `message` (Expr), `level` (`info`, `success`, `error`, default `info`) | toast |
| `sequence` | `actions` (1-50) | run in order, stop on the first failure |

`callApi` fields:

| Field | Rule |
|---|---|
| `method` | `POST` (default), `GET`, `PUT`, `PATCH`; there is no `DELETE` |
| `path` | literal string or `tpl` starting with `/orgs/<your orgId>/` |
| `query` | Expr, stringified into the query string |
| `body` | Expr, sent as the JSON body |
| `confirm` | `true`, a string prompt, or `false` |
| `resultTo` | state key that receives the response |
| `successMessage` | toast shown after a successful call |
| `onSuccess` / `onError` | actions to run after the call, at most 20 each |

`method` defaults to `POST` inside `callApi`, so a read-only call must say `"method": "GET"` explicitly.

## Confirmation

`needsConfirm` decides whether the viewer is asked before a call:

- Only `callApi` can ask; every other action runs immediately.
- `confirm: false` never asks. Use it only when the user asked for a one-click action.
- `confirm: true` or a string always asks; the string is the prompt.
- With no `confirm` field, every method except `GET` asks.

The prompt names the method and the resolved path. When the path targets a privileged resource family (`vault`, `members`, `providers`, `accounts`, `permission-rules`, `permission-grants`, `addons`, `mcp`, `connect`, `secrets`, `fleet`) the prompt also says so. A declined prompt stops the action without an error.

## Paths

- `callApi.path`: a literal string or a `tpl` whose text before the first `{{` is already `/orgs/<your orgId>/...`. A `ref` or `fn` path is rejected (`the target org cannot be verified statically`), and so is a foreign org.
- `navigate.to`: an app route under `/o/<your orgId>`, for example `/o/<orgId>/inbox` or a `tpl` like `/o/{{org.id}}/thread/{{event.row.id}}`. No scheme, no `//` host, no whitespace, no `.`/`..` segments; anything else is rejected and the click does nothing visible.
- Sources follow the same org rule; see `references/data-flow.md`.

## Examples

Row click selecting an approval, and two buttons acting on it:

```json widget
{
  "schemaVersion": 1,
  "title": "Approval actions",
  "state": { "selected": "" },
  "sources": [
    {
      "kind": "orgApi",
      "id": "approvals",
      "method": "GET",
      "path": "/orgs/:orgId/approvals",
      "query": { "status": "pending" },
      "refresh": { "mode": "onEvent", "topics": ["approval"] }
    }
  ],
  "items": [
    {
      "id": "queue",
      "primitive": "table",
      "rect": { "x": 0, "y": 0, "w": 384, "h": 160 },
      "props": {
        "columns": [
          { "key": "kind", "label": "Kind" },
          { "key": "question", "label": "Question" }
        ]
      },
      "bindings": { "rows": { "ref": "sources.approvals.items" } },
      "on": { "rowClick": { "type": "setState", "key": "selected", "value": { "ref": "event.row.id" } } }
    },
    {
      "id": "approve",
      "primitive": "button",
      "rect": { "x": 0, "y": 160, "w": 192, "h": 32 },
      "props": { "label": "Approve" },
      "on": {
        "click": {
          "type": "callApi",
          "method": "POST",
          "path": { "tpl": "/orgs/:orgId/approvals/{{state.selected}}/decide" },
          "body": { "decision": "approve", "surface": "web" },
          "confirm": "Approve this request?",
          "onSuccess": [{ "type": "refetchSource", "sourceId": "approvals" }]
        }
      }
    }
  ]
}
```

The doc is complete apart from the org id: substitute your own id for `:orgId` before creating it. This example also shows why `confirm` matters - the call is a `POST` with the viewer's session, so leaving `confirm` unset or making it explicit keeps a human in the loop.
