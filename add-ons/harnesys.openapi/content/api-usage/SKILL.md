---
name: api-usage
description: How to call external APIs through the api_* tool pack (list, docs, get/post/put/patch/delete)
whenToUse: Use whenever the agent needs to call an external API managed by the OpenAPI Gateway addon, or when an api_* tool result mentions grants or operations.
---

# Calling external APIs

This host has an OpenAPI Gateway: admin-defined projects, each backed by an OpenAPI
specification, a base URL and credentials. You never construct URLs or use fetch —
everything goes through the `api_*` tools.

## Flow

1. `api_list` — see which projects and operations are granted to you. This list is your
   whole world: anything not in it is not granted.
2. `api_docs` — read the schema of the operation you want: parameter names, locations
   (path/query/header), the JSON body shape, documented responses. Do this before the
   first call to any non-trivial operation.
3. Call with the verb tool that matches the operation's method: `api_get`, `api_post`,
   `api_put`, `api_patch`, `api_delete`.

## Call shape

`{"project": "acme", "operation": "get_users_id", "params": {"id": "42"}}`

- `params` is one flat object. The gateway routes each key to path, query or header
  based on the stored spec — do not prefix or reshape keys yourself.
- `body` (only `api_post`/`api_put`/`api_patch` and only when `api_docs` shows a body):
  the JSON object exactly as the schema describes. Pass it as a structured value —
  never as a pre-serialized JSON string; a quoted string that parses as JSON is
  unwrapped, and a string that does not parse is sent as a JSON string.
- Unknown or missing parameters return `invalid_params` listing what is expected.

## Results and errors

- A call returns `{status, contentType, responseHeaders, body}`. Non-2xx `status` is a
  normal result: read the body, adapt, retry if the API documents it. The call itself
  only fails on addon-level problems.
- `permission_denied` with a "granted:" list — the operation is not granted to you;
  pick another operation from the list or tell the user which grant is missing.
- `account_failed` — the project token is not set; an admin must add it on the addon page.
- `not_found` / `unsupported` — the operation is not imported or is disabled; re-check
  `api_list`.

## Limits

- Response bodies larger than 256 KB are truncated (a marker at the end says so); use
  query parameters to narrow results instead of reading huge lists.
- `api_delete` is destructive and may require user approval — state the consequence
  before calling it.
