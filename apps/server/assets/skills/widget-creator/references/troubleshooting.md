# Troubleshooting

Every message below is thrown by the widget doc guard (`apps/server/src/app/domain/dashboards/widget-doc.guard.ts`, `widget-doc-item.ts`, `widget-doc-expr.ts`), by the contract schemas, or by the source runner. Issues arrive as `{ path, message }`; the path is a dot path inside the doc and tells you the exact field.

`dashboard_widgets_validate` reports the contract layer, so a doc that passes it can still be rejected by the create/update guard. Both use the same paths.

## Document and item shape

| Message | Cause | Fix |
|---|---|---|
| `schema mismatch` with a list of issues | The doc does not parse as `WidgetDocSchema` | Fix each listed path; check `schemaVersion` is the literal `1` |
| `items[0].rect.w` "Too big" / "expected number" / "multiple of 8" | Rect values are integers in pixels, multiples of 8: `x` and `y` 0 or more, `w` and `h` 8 or more | Snapping in the UI produces such values; round manually when composing JSON |
| `title` required | `title` must be 1-120 characters | Give the widget a title |
| A key you set disappeared | The doc is not strict, so unknown top-level keys are stripped | Only use the fields listed in `references/doc-model.md` |
| `items[0]` fails on an unknown key | `WidgetItemSchema` is strict | Remove the key; static data belongs in `props` |

## Data and expressions

| Message | Cause | Fix |
|---|---|---|
| `unknown binding root "x"` / `unknown reference root "x"` | Ref root is not one of `state`, `sources`, `status`, `derived`, `event`, `row`, `org` | Use a real root; `config` and `sources[0]` are not roots |
| `state key "x" is not declared in doc.state` | The binding reads a state key the doc never declares | Add the key to `doc.state` |
| `source "x" is not declared in doc.sources` | The binding, action or refetch names a source id that does not exist | Fix the id or add the source |
| `derived value "x" is not declared in doc.derived` | `derived.x` is read but never defined | Define it, or bind the source path directly |
| `duplicate widget item id "x"` | Two items share an id | Make ids unique |
| `unknown primitive "x"` | Primitive id typo | Use an id from `references/primitives.md` |
| `unknown event for <primitive>` | The item declares `on.<event>` for an event that primitive does not emit | Read the events table in `references/primitives.md` |
| `unknown prop "x" for <primitive>` | A `bindings` key is not a prop of that primitive | Remove it or bind a prop listed in `references/primitives.md` |
| `unknown expr fn "x"` | Function name typo or a function that does not exist | Use a name from the function table in `references/data-flow.md` |
| `fn "x" expects 1..2 arguments, received 3` | Wrong argument count | Match the signature table |
| `derived cycle: a -> b -> a` | `derived` values reference each other in a loop | Break the loop; `derived` is ordered by dependency, not by declaration |
| `object has marker key "ref" but is not a valid ref marker` | A data object carries `ref`, `tpl`, `fn`, `args` or `lit` but does not form a valid marker | Wrap the data: `{ "lit": { "ref": "..." } }` |
| `ref must be a dotted path such as a.b[0].c` | Path has quotes, spaces, `?` or an empty segment | Use `[A-Za-z0-9_$-]` segments and numeric indices |
| `template token "x" is not a reference path` | A `tpl` token is not a ref path, for example a function call | Interpolate paths only; compute values with `{ "fn": ... }` |
| `template braces are unbalanced` | A lone `{` or `}` in a `tpl` | Escape or remove the stray brace |
| `callApi path must be a string or a tpl template with a literal /orgs/<orgId> prefix` | The path is an `Expr` object, or a `ref`/`fn` | Use a literal path or a `tpl` that starts with the literal org path |

## Org paths

`orgApi` sources and `callApi` paths share `packages/contracts/src/dashboards/path-guard.ts`.

| Message tail | Cause | Fix |
|---|---|---|
| `path must start with /orgs/` | Relative path or another API root | Prefix with `/orgs/<your orgId>` |
| `path must name an org` | `/orgs/` alone | Name the org |
| `empty segment` | `//` or a trailing `/` in the middle | Clean the path |
| `path traversal segment` | `.` or `..` segment | Use the real resource path |
| `forbidden character` | Whitespace, `\`, `?`, `#`, a control character, or `%2e`/`%2f`/`%5c` | Pass query values through `query`, not the path |
| `foreign org` | The path names an org other than yours | Use your own org id; a widget cannot cross orgs |
| `callApi path template prefix "..." must start with /orgs/<orgId>/` | The `tpl` interpolates the org segment | Write the org id literally and interpolate only the tail |
| `callApi path is a ref: the target org cannot be verified statically` | The path is `{ "ref": ... }` | Inline the path with a `tpl` |

## External sources

| Message | Cause | Fix |
|---|---|---|
| `params are external-only: orgApi sources cannot use {{param:name}}` | An `orgApi` source uses a parameter | Read `state` in `query`/`body` instead |
| `params are only substitutable in query and body` | `{{param:name}}` in `url`, `headers` or `refresh.topics` | Move the value into `query` or `body` |
| `External source parameter "x" is not set in widget state` | The state key the parameter reads is empty at fetch time | Declare it in `doc.state` and bind a control to it |
| `secret_ref_unresolved` | A `{{vault:name}}` header names a vault entry that does not exist | Add the secret to the vault, or fix the name; values are never returned to the widget |
| `egress_blocked` | The target host is not allowed by the org egress rules | Ask the user to allow the host, or use an allowed endpoint |
| `External fetch failed (HTTP 404)` | The remote API rejected the request | Check `url`, `query` and the response shape with `dashboard_widgets_test` |
| `orgApi sources are fetched by the client natively` | An external invoke was attempted for an `orgApi` source | Use `refetchSource`, not `invokeExternal` |
| `source_not_found` | `refetchSource`/`invokeExternal` names a source id not in `doc.sources` | Fix the id |

## Action surprises

| Symptom | Cause | Fix |
|---|---|---|
| Nothing happens on click | The action is attached to an event the primitive does not emit, or the item `action` is legacy and the item has no `click` | Move the action to `on.<real event>` |
| A viewer prompt appears on a GET | A `confirm` string or `true` is set | Remove `confirm`; only non-GET asks by default |
| A mutation runs without asking | `confirm: false` | Remove it unless the user asked for a one-click action |
| Navigate does nothing | Target is not under `/o/<your orgId>`, contains `.`/`..`, a scheme or `//` | Use an in-app route |
| A row button acts on the wrong row | The action reads `state.selected` but `rowClick` was never wired | Add `on.rowClick` that writes `event.row.id` into state |

## Hand-off

- `404` on `dashboard_widgets_create`: the dashboard id is wrong; call `dashboards_list` first.
- The widget is invisible after create: it is a **draft**. Ask the user to open the dashboard and activate it; agents cannot activate widgets.
- Empty card with no error: the binding path does not match the payload. Check `references/org-api-catalog.md` (or `dashboard_widgets_test` for an external API) and bind an existing path.
- Error only in the card, the widget is fine: read `status.<sourceId>.error` with a `text` item while debugging, then remove it.
