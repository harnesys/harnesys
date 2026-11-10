# APPS_PLAN deviations

`docs/APPS_PLAN.md` is the source of truth. This file records where the implementation differs
from it and why. No change to the plan itself was made.

## Backend

1. **Egress checks the hostname, not a pinned IP.** `provider-http.adapter.ts` resolves the
   hostname under `EgressPolicy` and blocks private ranges before the request, but the request is
   then sent by hostname. A DNS answer that changes between the check and the connection is not
   pinned. Reason: Bun's `fetch` has no supported connect-by-IP hook without a custom dispatcher;
   pinning would add a transport dependency the plan does not include. Trade-off: the window is
   narrowed, not closed.
2. **Webhook routes are explicit method handlers.** `apps-hook.controller.ts` declares
   `POST`, `GET`, `PUT`, `PATCH` and `DELETE` for both target levels instead of a single `ANY`
   route, because the brix router has no `ANY` decorator. The paths are exactly the plan's; other
   methods return 404.
3. **App setup receives `webhookUrl: null`.** A new App has no id before creation, so the setup
   context cannot build `…/apps/<appId>`. The GitHub manifest therefore omits `hook_attributes`.
   Providers that need a webhook URL for setup must receive it after creation; the App view
   exposes the final URL.
4. **Generated fields are materialized at session start.** `resolveInputs` fills
   `generated: true` fields with a random token before the provider handler runs. Without this,
   Telegram's generated `secretToken` could never reach `connect`/`directConnect`. The value is
   stored only when the connection completes.
5. **`ConnectSessionStorePort` gained `watch()`.** The port was extended additively to let the SSE
   controller subscribe to session changes; the store is in-memory, so the subscription is
   process-local. The first SSE frame is the full session snapshot, which makes `EventSource`
   reconnection safe.
6. **`ConnectSession` gained `launchFormHosts`.** The one-time HTML launch page needs an explicit
   `form-action` allowlist in its CSP. Hosts come from the provider's `Launch.html`, so they are
   stored on the session instead of being hardcoded in the controller.
7. **Account webhooks read the union of app and account secret keys.** `handle-webhook` builds the
   account secret reader with `[...accountKind.secrets, ...appKind.secrets]`. Scope is still keyed
   by the `app:`/`account:` prefix in the scoped store, so the extra keys cannot read another
   record. Reason: providers such as GitHub sign app-level payloads with an App secret while the
   hook is delivered on an Account path.
8. **T1 tables are recreated.** `org-sql-apps.ts` drops `app_accounts` and `apps` when the old
   T1 schema (no `metadata_json`) is found. T1 data is not migrated. This follows assumption 4 of
   the plan.
9. **Error envelope scope.** New routes return `{ error, fields?, holders? }` for
   `AppsException`. Guard failures (`401`/`403`) and Zod body/query validation keep the core
   `ErrorResponse` contract. Reason: the plan specifies the new format, not a replacement of the
   global filter.
10. **Secret removal.** `PATCH /apps/:appId` accepts `secrets: { key: null }`. Optional secrets are
    removed; a required secret removal yields `422 invalid_fields` with `required`.
11. **Account edits are descriptor-limited.** `PATCH /accounts/:accountId` only accepts `label` and
    non-secret fields marked `editable`. Other keys are rejected; secrets are not edited through
    this route.
12. **Multi-kind account pickers filter in the client.** `GET /accounts` supports one `kind` plus
    `scopes`. `AccountPicker` accepts several kinds and therefore loads the org account list and
    filters eligibility locally. The server-side filter remains the authority for single-kind
    callers.
13. **Catalog is org-scoped.** `GET /orgs/:orgId/apps/catalog` sits behind `OrgAccessGuard`, like
    every other private route, instead of being a global registry dump.

## Additive growth (§5.4)

Server-driven logins: `Launch` kind `form`, `POST …/connect/sessions/:id/resume`,
optional `ProviderError.meta.retryAfterSec`, optional `ProviderCtx.mtproto`.

1. **Form launch rules are enforced at application points, not in the registry.**
   `Launch` values are runtime handler results, so `provider-validation.ts` cannot statically
   reject a form field with a secret type. `applyWaitLaunch` runs `assertFormLaunchFields`
   (fields only `text`/`number`, not `generated`, no secret) wherever a provider result is
   applied to a session (start, resume, poll) and throws `ProviderError('invalid_response')`.
   The pure predicate is `form-launch.ts`, covered by `form-launch.spec.ts`.
2. **Every submit counts toward the resume cap.** `ResumeFormConnectUseCase` increments
   `resumeCount` before validating inputs, so 422-invalid submissions also consume the 25-slot
   budget. This keeps validation errors from being farmed for side channels; the counter
   decrements only when the session is replaced.
3. **Expired-but-pending sessions fail, they do not 404.** A form resume on a session past
   `expiresAt` marks it `failed error=session_expired` (120 s keep-alive) and returns that event,
   instead of the 404 a missing/foreign/terminal session gets. The client can show the expiry.
4. **Executor extraction instead of plan's inline resume.** The resume path lives in
   `ConnectResumeExecutor` behind `ConnectContextPort`/`ConnectFinalizePort` (brix ports; a port
   token must never be `import type`-ed — `design:paramtypes` needs the value). The OAuth
   callback reuses the same engine, so both call sites share wait/retry/failure semantics.
5. **Form resumes reply inline, not over SSE.** The SSE channel carries only status, so the
   response itself returns `{ session, launch? }` for the next form step; the UI re-renders the
   launch from the response. `retryAfterSec` is attached both to the failed `SessionEvent` and
   to the stored session.
6. **`FormLaunch.fields` is a mutable `FieldSpec[]`** so `Equal<Contracts.LaunchView, LaunchView>`
   passes (zod infers mutable arrays); the view copies with `[...fields]`.
7. **`MtprotoLoginPort` is optional and always present in the resolved context.**
   `ConnectContextFactory` injects the teleproto-backed adapter unconditionally; `ProviderCtx.mtproto`
   stays optional, so providers without MTProto simply never read it. Flood errors map to
   `rate_limited` with the runtime `seconds` value surfaced as `retryAfterSec`.
8. **`FormLaunch`/form `LaunchView` gained display-only `text`.** `text` is a plain optional
   string, passthrough in both `launchView` mappers (start and resume executors); the form launch
   validator still checks fields only.
9. **`MtprotoLoginPort` grew `connect`, `me` and `probeSession`** — the port is one session old and
   unused by providers, so the evolution is additive and free. `TeleprotoMtprotoAdapter` implements
   `me()` via `Api.users.GetUsers`/`InputUserSelf` and `probeSession()` by reconnecting with the
   session string and the App's real `apiId`/`apiHash` (the provider supplies them in the verify
   context; no placeholder credentials). The failure mapper is a pure `mtprotoFailure(family, text, seconds)` function:
   flood → `rate_limited` (`retryAfterSec` when seconds are a positive integer), unauthorized and
   `AUTH_KEY/AUTHORIZED/SESSION_*` texts → `invalid_credentials`, bad request → `invalid_input`,
   anything else → `invalid_response`; the adapter maps teleproto error instances onto the family
   argument before calling it.
10. **Verify use-cases inject `MtprotoLoginPort`** so `AppVerifyCtx`/`AccountVerifyCtx` carry
   `mtproto` too — connect contexts already did; without this the app/account verify handlers
   would see an unset optional port.


## Frontend

1. **UI file consolidation.** `ProviderCard` renders the provider, its Apps and its Accounts in one
   component instead of separate `AppList`/`AccountList`; `FieldRenderer` contains the closed set
   of field controls in one file. The public API remains `AppsPane` and `AccountPicker` from
   `features/manage-apps`.
2. **Endpoints appear after creation.** `EndpointsHelp` is rendered on saved Apps. The wizard's
   App step shows a note instead, because redirect URI and webhook URL contain the App id.
3. **Launch window and fallback.** A `redirect`/`page` launch is opened once with `window.open`;
   the `LaunchPanel` always keeps a normal link for popup-blocked browsers.
4. **Delete confirmation uses the shared Dialog**, not `window.confirm` (`noAlert`).
5. **No provider literals.** The UI reads labels, fields, scopes, icons and help from the catalog.
   The planned `check-no-provider-names` script and generated fixture were not added; the unit
   spec covers `planConnect`, `connectReducer` and `buildValidator` with a synthetic descriptor.
6. **App kind secrets in setup.** The automatic setup button sends both non-secret values and
   entered secrets through `connect/start.inputs`, because setup context exposes only `inputs`.
   Manual creation keeps `values` and `secrets` separate.
7. **Reconnect behavior.** Reconnect opens the same wizard with `target: 'account'`, the existing
   `accountId` and granted scopes locked; `planConnect` returns only the `connect` step.

## Verification

- `bun run lint`: 0 errors, 12 warnings (controllers with more than five parameters).
- `bunx tsc --noEmit`: server, webui and contracts pass.
- `bun test`: 1912 pass, 0 fail across 380 files; the new model spec adds 8 of them.
- Isolated boot: `SERVER_PORT=47999 DEV_HARNEYSYS_HOME=$(mktemp -d) bun src/main.ts` reached
  `[server listening] port=47999`, `/health/live` returned 200, and the process was stopped after
  the check. All apps, accounts, connect, callback, launch and hook routes were mapped.
- `git diff` for every path in §14.1 is empty.

## Not covered

- IP pinning for egress.
- Automatic provider-side webhook registration/rotation (Telegram `setWebhook`, GitHub manifest
  hook). The URLs are exposed, but registration remains an operator step.
- The §14.3 CI gates/scripts (`check-no-provider-names`, fixture drift check) are absent; the
  catalog-driven UI and the model spec cover the same intent by construction.
- Dedicated server unit specs for field validation, status mapping and provider conformance were
  not added in this pass; the frontend model spec covers `planConnect`, the reducer and
  `buildValidator` only.
