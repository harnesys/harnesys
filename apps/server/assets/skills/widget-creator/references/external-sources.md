# External sources

Contract: `packages/contracts/src/dashboards/sources.ts` (`ExternalSourceSchema`). Server path: `apps/server/src/app/infra/dashboards/source-runner.adapter.ts`.

An `external` source makes one HTTP request from the server, not from the browser. The browser only receives the response body. Secrets stay on the server; egress is checked before the request leaves.

```json
{
  "kind": "external",
  "id": "weather",
  "method": "GET",
  "url": "https://api.example.com/v1/weather",
  "headers": { "Authorization": "Bearer {{vault:weather-key}}" },
  "secretRefs": ["weather-key"],
  "query": { "city": "{{param:city}}", "units": "metric" },
  "cacheTtlSeconds": 120,
  "refresh": { "mode": "interval", "intervalSeconds": 300 }
}
```

This block is a source, not a whole `WidgetDoc`; embed it in `doc.sources`.

## Fields

| Field | Rule |
|---|---|
| `kind` | `"external"` |
| `id` | 1-64 characters, unique in `doc.sources`, used by `sources.<id>` and `refetchSource` |
| `method` | `GET` (default), `POST`, `PUT`, `PATCH` |
| `url` | absolute URL; `{{param:name}}` is **not** allowed here |
| `headers` | string map; values may contain `{{vault:name}}`; `{{param:name}}` is not allowed |
| `query` | object of Expr values; the only place `{{param:name}}` may appear besides `body` |
| `body` | Expr sent as the JSON body; `{{param:name}}` allowed |
| `secretRefs` | vault entry names the headers reference |
| `cacheTtlSeconds` | `0`-`3600`; omitted means the server default of 60 s, `0` disables caching |
| `refresh` | `{ mode, intervalSeconds?, topics? }` |

## Vault references

- Write `{{vault:name}}` inside a header value and list the same name in `secretRefs`.
- The server substitutes the vault value before the request and never returns it to the client. A missing entry fails the call closed (`secret_ref_unresolved`); the widget shows an error, not an empty secret.
- Never put a key, token, cookie or password in `url`, `query`, `body` or `props`. `dashboard_widgets_test` reports the resolved request with the secret redacted.

## Parameters

`{{param:name}}` is a scalar injected at call time:

- Names match `[A-Za-z][A-Za-z0-9_-]{0,63}` and may appear only in `query` and `body`. A parameter in `url`, `headers` or `refresh.topics` is rejected with `params are only substitutable in query and body`.
- `orgApi` sources cannot use parameters at all (`params are external-only: orgApi sources cannot use {{param:name}}`); their `query`/`body` read `state` expressions instead.
- The runtime resolves a parameter from the widget state by name, so a `select` or `input` bound to the same key feeds it. A missing value fails the fetch with `External source parameter "city" is not set in widget state`.
- Only scalars pass through: string, number, boolean, null.

## Refresh, cache, egress

- `interval` with `intervalSeconds` 30-3600 is the only polling the platform sanctions, and it applies to `external` sources only.
- Responses are cached per widget id and substituted values, so a different `{{param:name}}` value is a different cache entry. Only successful responses are cached.
- The target URL passes the egress guard before the request; a blocked target fails with `egress_blocked` and the item shows an error. The request times out after 10 s and responses are capped at 2 MB.
- `dashboard_widgets_test` is the cheapest way to check a source: it runs the same resolution, egress check and cache path and returns the payload without saving anything.

## Binding the payload

`sources.<id>` holds the response JSON exactly as returned. Bind concrete paths, not the whole object, where the primitive expects a scalar:

| Primitive prop | Binding |
|---|---|
| `metric.value`, `gauge.value`, `progress.value` | `{ "ref": "sources.weather.current.temp" }` |
| `chart.data`, `table.rows`, `list.items` | the array itself, for example `{ "fn": "pick", "args": [{ "ref": "sources.weather" }, "hourly"] }` |
| `text.text`, `badge.value` | `{ "tpl": "{{sources.weather.current.temp}} C" }` |

A failed source leaves the argument undefined; the item keeps its empty state and `status.<id>.error` carries the reason.
