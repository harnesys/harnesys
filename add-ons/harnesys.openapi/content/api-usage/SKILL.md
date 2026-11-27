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

## Authentication

Authentication is already handled: the administrator configures each project's
credentials on the addon page, and the gateway injects them into every call.
Never supply `Authorization` headers, API keys, tokens or auth-related query
parameters — even if the API's documentation or schemas mention them. Just pass
the business parameters from `api_docs`; `api_docs` also shows an `auth` line
describing what is injected for the project.

## Call shape

`{"project": "acme", "operation": "get_users_id", "params": {"id": "42"}}`

- `params` is one flat object. The gateway routes each key to path, query or header
  based on the stored spec — do not prefix or reshape keys yourself.
- `body` (only `api_post`/`api_put`/`api_patch` and only when `api_docs` shows a body):
  the JSON object exactly as the schema describes. Pass it as a structured value —
  never as a pre-serialized JSON string; a quoted string that parses as JSON is
  unwrapped, and a string that does not parse is sent as a JSON string.
- `files` (only `api_post`/`api_put`/`api_patch` and only when `api_docs` shows
  `body: {kind: "multipart"}`): array of `{name, path | content | contentBase64}` —
  exactly one source per file. **Prefer `path`**: an absolute host path to the file,
  e.g. `/Users/me/pics/photo.jpg` — any file the host can read, including thread
  attachments (`.../threads/<id>/attachments/<id>/<file>`) and issue attachments.
  The host reads the bytes itself — never read a file into your context to paste
  base64 into the call. Files inside the thread (sandbox scratch, attachments,
  tool-outputs) are addressed the same way, by their absolute paths under the
  thread directory shown in the runtime notes. `content` is file text;
  `contentBase64` is inline base64 (small files only). Form fields go in `body` as
  a flat object. JSON operations ignore `files`.
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

## Response shaping

Large directory reads should not go through your context. Every verb tool accepts:

- `fields: ["id","slug","name"]` — projects the objects inside arrays of the JSON
  response to only these keys; envelope keys (`total`, `page`, nesting) stay intact.
  The inline `body` comes back already projected.
- `saveToFile: true` — writes the full raw response body to
  `<threadDir>/tool-outputs/<operation>-<timestamp>.json` and returns
  `{savedTo, bytes, records, recordsAt, preview}` (`savedTo` is the absolute path)
  instead of the body: `preview` holds
  the first `previewLimit` records (default 3, max 10). `read_file`/`grep` the saved
  file afterwards when you need more. Requires a thread session.
- Both together: the file keeps the full raw body, `preview` is projected — this is the
  cheap pattern for building id/slug maps over hundreds of records.

## Missing grants (escalation)

`permission_denied` means the operation is not granted to that agent. Admins manage grants on
the addon page, but the pack also exposes self-service tools for orchestrators — each mutation
surfaces a user approval card and is written to the addon grant audit log:

- `api_grants_list {project?, agent?}` — who currently can call what.
- `api_grants_grant {agent, project, operation}` — grant one operation to one agent
  (agent: id or exact name). Idempotent: re-granting returns `already: true`.
- `api_grants_revoke {agent, project, operation}` — remove the grant.

Typical wave pattern: a researcher hits `permission_denied`, reports the missing
`project + operation`; the orchestrator calls `api_grants_grant`, the user approves, the
researcher retries the same call.

## Limits

- Inline response bodies larger than 256 KB are truncated (a marker at the end says
  so); prefer `saveToFile` or narrow with query parameters and `fields` instead of
  reading huge lists.
- `api_delete` is destructive and may require user approval — state the consequence
  before calling it.
