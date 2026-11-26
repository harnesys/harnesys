# Config fields

`automation_kind_list` returns `configFields` per kind. The host validates
`config` against them; the same schema drives the UI form.

## Shape

```json
{
  "key": "auth",
  "type": "select",
  "label": "Auth",
  "required": true,
  "default": "none",
  "help": "…",
  "options": [{ "value": "none", "label": "None" }],
  "visibleWhen": { "key": "mode", "equals": "custom" },
  "pattern": { "regex": "^[a-z]+$", "hint": "lowercase only" }
}
```

| Field | Meaning |
| --- | --- |
| `key` | property name in `config` |
| `type` | text, textarea, number, boolean, select, group |
| `required` | value must be present and non-empty |
| `default` | applied on create and update before validation |
| `options` | allowed values for `select`; `multi: true` means a comma-separated list |
| `optionsFrom` | dynamic options (e.g. `addonRoute/connections`); still a string field |
| `pattern` | regex + human hint |
| `visibleWhen` | `{ key, equals }` or `{ key, oneOf }`; hidden fields are not validated |
| `fields` | nested fields of a `group` |

## Validation

- numbers may arrive as numeric strings and are coerced; booleans may be
  `true`/`false`;
- groups are presentation: send their children nested under the group key
  (`{"payload":{"textPath":"issue.title"}}`) or flat (`{"textPath":"issue.title"}`);
  the host stores the flat form, so `automation_get` returns flat keys, and required
  children are reported with a dotted path (`payload.textPath: required`);
- an empty string counts as missing, so `required` fields need a value;
- errors are joined into one message: `config rejected: auth: must be one of none,
  hmac, apiKey; payload.textPath: required`. Fix exactly what the path names.

## Update semantics

`automation_update` merges `config` over the stored config, so pass only the
fields you change. Defaults not present in either stay as declared. A hidden
field keeps its stored value but stops being validated. Send `null` for a field
to remove it (for a group, `{"payload": null}` clears every child).

## Limits and connection

`limits` (when present) are add-on-owned: bursts, burst windows, per-minute caps.
They are enforced by the add-on on its own ingress path and cannot be changed
through this pack. `connection` names the account store a kind needs; create fails
until an account is connected in the add-on UI.

## Examples

Scheduler (`harnesys.scheduler`/`scheduler.cron`): `{ "cron": "0 9 * * 1-5",
"timezone": "UTC", "miss_policy": "skip" }`.

Webhook (`harnesys.webhook`/`webhook.http`): start from `{ "auth": "hmac",
"signatureHeader": "x-hub-signature-256" }` and add `payload`/`noise`/`response`
groups only when needed — `visibleWhen` hides the irrelevant ones.
