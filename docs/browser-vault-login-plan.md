# Browser Vault Login

An agent logs into a website through the browser using a vault-stored credential, without
the plaintext ever entering the agent's context, its tool arguments, or any persisted log.

v7: implementation-aligned. Website credentials are their own entity (`browser_credentials`
+ a dedicated UI section) while the password material stays in the existing encrypted
vault. Credential delivery to agent-browser uses a per-login 0700 wrapper script over a
0600 unix socket (not an env token), because the plugin process inherits the daemon env,
not the command env. Manual sign-in and session import land as HITL attempts.

## 1. Goal and non-goals

**Goal.** An agent drives the browser into an authenticated site from a vault-stored
credential, with these invariants:

1. The password is never in the LLM context, never a tool argument, never in
   `run_events`, never in agent-browser output or dashboard events.
2. The agent has no command channel to the page while the password is in it.
3. The vault is the single source of truth for the password; rotation takes effect on the
   next login.
4. The authenticated session is ephemeral, domain-contained, and revocable.

**Non-goals.** Auto-solving captchas, a second copy of the secret at rest, headed/live
browser on server deployments, and runtime form guessing.

## 2. Verified facts (agent-browser 0.44.0, obscura 0.2.4)

- **Version drift:** the server runs `agent-browser` 0.44.0, but the repo pins
  `AGENT_BROWSER_VERSION = '0.39.2'` in `packages/harnesys/src/packs/web/browser/agent-browser-tool.ts`.
  This plan targets 0.44.0. The pin must be bumped: `AGENT_BROWSER_VERSION`, the tarball
  URL, and `AGENT_BROWSER_INTEGRITY_SHA512` =
  `sha512-OIrY/BlPwdg8XB9rzEbBuDva0S/lQmQBCW735y+B80kDvZ8CDQsuYV8i6hmUr70qIZeTyjd74aymlUzHKbvO4Q==`.
  0.44.0 no longer bundles platform binaries in the main tarball; they moved to
  `@agent-browser/cli-<target>` optional dependencies, which
  `materializeAgentBrowserPlatformBinary` already handles (`readPlatformDependency`).
- `agent-browser.plugin.v1` `credential.resolve` exists; plugin secrets are not saved.
  The stdin envelope is
  `{"capability":"credential.read","protocol":"agent-browser.plugin.v1","request":{"itemRef":"…","profileName":"…","url":"…"},"type":"credential.resolve"}`;
  the reply is `{"protocol":"agent-browser.plugin.v1","success":true,"credential":{"username","password","url"}}`.
- `AGENT_BROWSER_PLUGINS` (JSON registry env) works without touching `~/.agent-browser/config.json`,
  but the plugin child inherits the **daemon** env, not the per-command env. Verified:
  a token exported only on the `auth login` command is absent in the plugin process.
  Hence the token and socket path are baked into a per-login 0700 shell wrapper that is
  named as the plugin command; no secret travels through env or argv.
- `--action-policy <path>` and `--confirm-actions` exist and apply in place; the file is
  `{"default":"allow","deny":[…]}` (or `{"default":"deny","allow":[…]}`). Action names are
  per command/subcommand: `evaluate` (not `eval`), `cookies_get`, `cookies_set`,
  `state_save`, `storage_get`, `inputvalue`, `upload`, `download`, `network_route`, … .
  Policy is defense in depth only: `cookies get` is needed for success checks, and the
  hardened tool allowlist is the primary control.
- `cookies set --curl <file>` exists in 0.44.0 (file-based, no argv). Used only for the
  approved session-import fallback, with the cookie domain checked against the login host.
  Normal login handoff is rejected for SPA/localStorage, fingerprint, and revocation reasons.
- CDP is the engine sidecar on a plain `127.0.0.1:<port>` (`engine-sidecar.ts`), no auth.
  `connect <port|url>` is the only attach path.
- `--allowed-domains` is still rejected with CDP attach / `connect <port>` / profiles /
  restore, so it cannot be used. Containment is our own proxy (§7).
- **`--proxy` set on agent-browser is ignored for `--cdp`/connect sessions.** The proxy
  must be set on the engine process, not on agent-browser (§7.2).
- `--cdp-headers <json>` exists; not used now, it is the hook for authenticating CDP later.
- Obscura 0.2.4 exposes `--proxy <PROXY>` at the top level and in `serve`, and routes
  HTTPS as `CONNECT host:443` (verified on the wire, §15). It rejects proxy-bypass
  settings (`NO_PROXY`, `no_proxy`), so the sidecar spawn must not inherit them.
- Global flags that must never reach the agent's tool: `--session[=]`, `--cdp`,
  `--cdp-headers`, `--proxy`, `--executable-path`, `--args`, `--headers`, `--extension`,
  `--config`, `--profile`, `--state`, `--restore`, `--auto-connect`, `--provider`,
  `--namespace`.

## 3. Access gate for the login tool

The engine sidecar exposes an unauthenticated CDP port on `127.0.0.1`. Any same-uid
process — including an agent's `shell` tool — can read every browser page and cookie.
The login tools are available when the agent has at least one granted website credential,
regardless of the `process` permission, so a shell-capable agent can use them too. That
combination is explicitly insecure and is surfaced in the UI:

- `browser_login` / `browser_credentials` are registered for any agent with a granted
  credential on macOS/Linux (no Windows shell wrapper).
- Agent settings show `insecure · shell allowed` and the Website logins section explains
  that shell can read the browser profile, vault key, or credential socket.
- Setting the agent's `process` permission to `deny` switches the badge to
  `hardened · shell denied`; that is the recommended mode.
- A deployment that runs the sidecar under a separate uid/namespace can use shell safely
  without the gate, but Harnesys does not detect or verify that isolation.

## 4. Threat model → control

| Threat | Control |
|---|---|
| T1 password in LLM context | tool returns `{ ok, url }` only |
| T2 password in tool args / journal | not expressible as an arg; tool takes `secretRef` only |
| T3 agent reads the password from the DOM | login is atomic server code while the run is blocked; the field is gone after submit |
| T4 screenshot/video of the field | same as T3: no agent command runs while the field is filled |
| T5 network/HAR capture during login | `har`/`network`/`stream` not in the tool allowlist |
| T6 password in argv/env | `credential.resolve` plugin over a unix socket; only a single-use token in env |
| T7 second at-rest copy | password lives in the existing vault; the credential record holds no secret |
| T8 agent exfiltrates the session | command allowlist (no `eval`/`cookies`/`state`/`storage`/`get html\|value`) + egress proxy host allowlist, DNS-rebinding-safe |
| T9 replay / ask for another secret | single-use short-TTL token bound to `(orgId, agentId, credentialId)`; purpose-scoped grants |
| T10 target site sees the password | inherent to login |
| T11 fallback credential leaks via the resume value | dedicated endpoint + in-memory buffer; run resumes with `{provided:true}` |
| T12 prompt-injected account actions after login | approval gate on `browser_login`; egress proxy blocks foreign destinations; audit |
| T13 open redirect / lookalike login page | origin pinned to `loginUrl` (scheme+host+port), https required, post-navigation origin check |
| T14 same-uid process reads the CDP port / `/proc` | §3 access gate; sidecar killed on completion |
| T15 credentials in access logs / APM / Sentry / React state | no-store endpoints off the proxy, body capture disabled, `type=password` + `autocomplete=new-password`, no global store |

## 5. Architecture

The login runs in the **same session the agent's `browser` tool uses**, executed
atomically by server code between tool calls. The run is blocked on the tool result
while the credential is in the page. No second session, no cookie handoff, no second
CDP port. All browser traffic goes through a per-session filtering proxy.

```
agent (credentialId only; run blocked)
  └─ browser_login.execute (server code, same engine runtime)
       ├─ start egress proxy (credential host allowlist)
       ├─ open loginUrl; assert origin == credential origin (https)
       ├─ auth login <credential> --credential-provider harnesys --item <credentialId>
       │    └─ plugin ──unix socket──▶ resolve channel ──▶ vault (grant + audit)
       ├─ 2FA? → AskUserInterrupt; on resume continue (run blocked throughout)
       ├─ assert success markers (origin + path + cookie/selector)
       └─ return { ok, url }        (no secret)

Chrome/obscura ──CONNECT──▶ egress proxy (host allowlist, 443 only) ──▶ internet
```

After the tool returns, the agent drives the now-authenticated session through the
hardened `browser` tool. The password field is gone; `localStorage`/`sessionStorage`
persist naturally because it is the same browser.

## 6. Components

### 6.1 Data model: a website credential is its own entity

Website credentials are **not** vault entries. They are configuration with a lifecycle
(selectors, success markers, hosts, status, lockout) that the UI must list and query; the
vault is an encrypted KV store and does not fit that. The *password material* is still
stored by the existing vault; the credential record references it. No second secret store.

New table `browser_credentials` (org SQLite, no secret columns):

```
id            TEXT PK            -- stable id, survives rename
org_id        TEXT
name          TEXT              -- unique per org, shown in UI
login_url     TEXT              -- https only; origin is the pin
username      TEXT              -- not secret
username_selector TEXT
password_selector TEXT
submit_selector   TEXT
pre_login_selector TEXT NULL     -- clicked once before fill when visible (consent dialogs)
success_url_path_prefix TEXT
success_cookie_name     TEXT NULL
success_selector        TEXT NULL
challenge_code_selector TEXT NULL
challenge_submit_selector TEXT NULL
egress_hosts  TEXT              -- JSON array, explicit allowlist
status        TEXT              -- 'unverified' | 'ok' | 'failing' | 'locked'
failure_count INTEGER NOT NULL DEFAULT 0
locked_until  TEXT NULL
last_login_at TEXT NULL
created_at    TEXT
updated_at    TEXT
```

Secret material: `SecretStorePort` key `browser_login:<credentialId>` (password).
`domain/secret/vault-keys.ts` gains this prefix as a system key, so it is **not listed
in the generic Secrets UI** and is managed only through Website logins. Deleting the
credential deletes its vault key in the same use-case (cascade); renaming does not move
the key because the id is stable.

Contract: `packages/contracts/src/browser-credential.ts` —
`BrowserCredentialSchema`, `PutBrowserCredentialBodySchema` (includes `password`, write-only),
`BrowserCredentialListResponseSchema`.

REST: new routes on the existing browser controller (`orgs/:orgId/browser/credentials`),
not under `/vault`.

### 6.2 Purpose-scoped grants

A separate allowlist from `agent.secretNames`: `agent.browserLoginRefs`, holding
`browser_credentials.id` values. Usable only if the id is granted, the credential exists,
and its status is not `locked`. Grants are per-agent and live in the agent's web-pack
settings.

### 6.3 Resolve channel (new port)

`domain/browser/credential-resolve.port.ts` with `resolve`, `get`, `status`,
`listGranted`, and `resolveByToken`.

- Local adapter: read the `browser_credentials` row, check the grant and lockout, read
  `SecretStorePort.get(browser_login:<id>)` only on the token path, assemble the credential.
- Channel: one unix socket per org under `orgDataDir/browser/credential.sock`, mode
  `0600`; each connection is one JSON line `{token,item}`. The token is single-use, 5 min,
  and binds `(orgId, agentId, credentialId)`.
- Delivery: `resolve` writes a per-login `0700` shell wrapper into
  `~/.harnesys/tools/browser-plugins/` with the socket path and token baked in, and names
  that wrapper in `AGENT_BROWSER_PLUGINS` on the `auth login` command. The wrapper execs
  the Harnesys binary in `--harnesys-credential-plugin` mode (works in dev via Bun and in
  the compiled host), which speaks the socket protocol. The wrapper is deleted when the
  token is burned; stale ones are swept after 10 minutes.
- The fleet path is not wired; on a fleet node `browser_login` is not registered (§14).
- Windows is not supported for this plugin wrapper; the hardened profile is not enabled
  there.

### 6.4 Plugin

`infra/browser/harnesys-vault-plugin.ts` materializes the wrapper;
`infra/browser/credential-plugin-mode.ts` is the plugin process entered from `main.ts`.
It reads the `credential.resolve` envelope from stdin (`request.itemRef`), resolves over
the socket, writes `{ protocol, success, credential }` to stdout, never logs.

### 6.5 Login executor (`browser_login` tool)

`packs/web/browser/login-executor.ts` (server-side, shares the engine runtime):

1. Resolve the credential by id; fail closed if not granted, missing, or locked.
2. Ensure the proxy is running with the credential's host allowlist; a reused sidecar with
   a different proxy port is restarted, never silently reused.
3. `open <loginUrl>`; `get url`; abort unless origin (scheme+host+port) equals
   `loginUrl` and is https.
4. If `pre_login_selector` is set and visible, click it once (cookie-consent and similar
   interstitials) before filling credentials. The check reads the first match of the selector,
   so a site that renders a hidden preload copy of the button needs
   `:not([aria-hidden="true"])` (Facebook:
   `div[role="button"][aria-label="Allow all cookies"]:not([aria-hidden="true"])`).
5. `auth login <credential> --credential-provider harnesys --item <credentialId>
   --no-navigate --url <loginUrl>` with explicit selectors.
6. If success is not reached: park an attempt (§9) and offer code, manual
   username/password, or cookie import.
7. Assert success: origin + `success_url_path_prefix` + (`success_cookie_name` present
   **or** `success_selector`). On failure: bump `failure_count`, set `status`, no
   auto-retry, return a typed error.
8. On success: set `status = 'ok'`, `last_login_at`.
9. `sideEffect: 'credentialed'` and `gate: () => ({ decision: 'ask' })`.

Input schema: `{ credentialId: string }`.

### 6.6 Hardened `browser` tool (allowlist, not denylist)

`packs/web/browser/browser-tools.ts`:

- Command allowlist with per-command subcommand allowlist. Allowed: `open`, `snapshot`,
  `click`, `dblclick`, `type`, `fill`, `press`, `hover`, `focus`, `select`, `check`,
  `uncheck`, `scroll`, `scrollintoview`, `wait`, `back`, `forward`, `reload`, `tab`,
  `get title|text|url|count|isvisible`, `screenshot`, `close`.
  Denied: `eval`, `addscript`, `addinitscript`, `addstyle`, `expose`, `setcontent`,
  `cookies`, `storage`, `state`, `har`, `network`, `stream`, `flow`, `upload`,
  `download`, `auth`, `plugin`, `skills`, `doctor`, `set`, `batch`.
- Reject any token starting with `--` except a per-command flag allowlist (kills
  `--session=x`, `--proxy`, `--headers`, `--args`, `--executable-path`, `--extension`,
  `--cdp`, `--cdp-headers`, `--config`, `--profile`, `--state`, `--restore`,
  `--provider`).
- Static `--action-policy` as defense in depth: deny `eval`, `network`, `state`,
  `upload`, `download`.

The hardened profile is enabled for an agent once it has at least one granted credential;
agents without grants keep the current raw browser behaviour.

### 6.7 Ephemeral session and revocation

- No `--profile`, `--state`, `--restore`; the headless profile lives under
  `/tmp/harnesys-browser/profile-<port>` and is deleted when the sidecar stops; add a
  sweep.
- Session lifetime: `browser_close` and `releaseEngineSidecar` on thread end / idle TTL
  (already 10 min), plus an explicit max session TTL.
- Revocation: track `session → credentialId`; deleting the credential, locking it, or
  removing the grant kills matching sessions and, when a logout endpoint is configured,
  calls it.
- Concurrency: a per-credential login mutex serializes attempts and reuses a live
  session instead of re-authenticating.

## 7. Egress containment (option A, verified)

### 7.1 Proxy contract

- Listens on `127.0.0.1:<free port>`, one proxy per browser session, bound to that
  session's allowlist.
- `CONNECT host:port`: allow only port 443 (and 80 for an http origin); every other port
  is denied. Plain HTTP uses the absolute-form path with the same host check.
- Host matching: lowercase ASCII, strip trailing dot, **label-boundary** match
  (`*.example.com` matches `a.example.com`, never `example.com.evil.com`); exact host
  always allowed; reject IP literals and IPv6 unless explicitly listed.
- Resolve the hostname, deny if any resolved address is loopback/link-local/private,
  then connect to the resolved IP (pinned, no re-resolve) — blocks SSRF and DNS
  rebinding.
- On deny: `403` + audit `{ sessionKey, credentialId, host, port, decision }`. On allow:
  tunnel + audit `{ host, decision: 'allow' }`.

### 7.2 Engine launch changes

- Chromium family (`chromiumArgs`): `--proxy-server=http://127.0.0.1:<proxyPort>`,
  `--proxy-bypass-list="<-loopback>"` (removes Chrome's implicit localhost bypass),
  `--disable-quic` (HTTP/3 over UDP would bypass the proxy),
  `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` (WebRTC/STUN bypass).
- Obscura (`serveArgs`): `--proxy http://127.0.0.1:<proxyPort>` (verified flag and
  CONNECT behavior). Do not pass `--allow-private-network`.
- **The proxy is set on the engine, never on agent-browser**: agent-browser ignores
  `--proxy` for `--cdp`/connect sessions (0.44.0).
- **Attach is verified, not assumed**: `connectAgentBrowser` fails closed when
  `connect <port>` fails or `get cdp-url` reports a different port, so agent-browser can
  never silently fall back to its own unproxied browser. The CLI binary is resolved
  through the host layout (`browserToolsRoot(home)`), the same root the Settings page
  installs into, instead of `~/.harnesys/tools`.
- Proxy env hygiene: the sidecar child env clears `http_proxy`, `https_proxy`,
  `all_proxy`, `NO_PROXY`, `no_proxy` so only the explicit flag applies.
- DNS for proxied HTTPS is resolved by the proxy (CONNECT carries the hostname), so no
  local DNS-based bypass.

### 7.3 Engine capability

Add `egressProxy: boolean` to `EngineCapabilities` (`engine-catalog.ts`). Both shipped
engines support it (`chromium` via `--proxy-server`, `obscura` via `--proxy`), so both
get `egressProxy: true`; the flag keeps a future engine without a proxy from silently
running contained.

### 7.4 Fail-closed

The proxy is the only intended egress. At the container/namespace level, block all
outbound traffic except to the proxy port, so QUIC, WebRTC, or an engine bug fails
closed. The proxy is containment; the network rule is the backstop.

## 8. Success detection

Origin + pathname prefix plus a required second marker: a named cookie (checked
server-side with `cookies get`) or a selector that must be present. A login matching
neither is a failure. This avoids `/login?next=…` false positives and works for SPAs
that do not change the URL.

## 9. HITL (headless only)

No Xvfb and no `headed` in `apps/server/src`; human input never needs a visible browser.

**OTP / SMS / TOTP.** Detected deterministically (success not reached + configured
`challenge_code_selector`). The run parks via `AskUserInterrupt` (`source: 'ask_user'`).
The code flows WebUI → `/orgs/:orgId/browser/credentials/:id/attempt/:attemptId/input` →
in-memory attempt buffer → the parked executor → the browser. `ctx.resume` is only
`{ provided: true }`, never the code.

**Manual login (approved fallback).** The user enters username + password in the same
WebUI form; same endpoint and buffer. The pair is written to a `0600` file in a `0700`
temp dir, exposed to `auth login` through a one-shot file-backed plugin wrapper, and
deleted after submit. The password never enters argv, env, or logs.

**Import session (approved fallback).** The user logs in on their own device and pastes
the cookies JSON into the same form. The server checks every cookie domain against the
login host, writes a `0600` file in a `0700` temp dir, runs `cookies set --curl`, opens
the success URL, and re-checks the markers. The file is deleted immediately after.

Attempt lifecycle:

- attempt record in org SQLite (metadata only, never the secret), TTL 10 min;
- TOTP ~30 s: the UI shows a countdown and a submit after expiry fails with
  `browser_login_failed`;
- delegated runs cannot park: a login that needs a human fails with
  `browser_login_failed` instead of hanging;
- the active attempt is looked up by `(credentialId, threadId)`, so two runs with the
  same credential do not share a form; `attemptId` must match the credential; `POST`
  only; `Cache-Control: no-store`; `Referrer-Policy: no-referrer`.

## 10. Audit

Every resolve, login, and proxy decision emits an event mirroring `addon.accounts_access`:
`{ orgId, agentId, threadId, credentialId, targetOrigin, ok, denied, attemptId }` and
`{ sessionKey, credentialId, host, port, decision }`. No plaintext; denials and lockouts
are audited.

Lockout: the `browser_credentials` row carries `failure_count` / `locked_until`, a hard
cap, exponential backoff, no automatic retry after a failure; only a human reset
re-enables it.

## 11. UI

One concept, one home — no duplicate tables.

- **Settings → Browser:** engine infra (unchanged) plus a first-class **Website logins**
  section: the credential list (name, site, status, 2FA badge, egress hosts, last
  login), add/edit/delete/reset. Login activity is linked to Audit.
- **Thread HITL card:** when a login parks, the chat shows a dedicated card with the
  code field, manual username/password, and cookie import, plus a countdown and Cancel.
- **Settings → Secrets (Vault):** unchanged; `browser_login:` keys are system keys and do
  not appear here.
- **Agent config → web pack settings:** "Allowed website logins" multi-select (grants)
  and the "Credentialed browser (hardened)" indicator with the trade-off text.
- **Settings → Audit:** unchanged table plus a "Browser" filter over
  `browser_login` / `credential.resolve` / `egress.denied` events; columns include
  credential name, agent, result, run link. No secret values.

## 12. Files

New:

- `packages/contracts/src/browser-credential.ts`
- `apps/server/src/app/domain/browser/credential-repository.port.ts`
- `apps/server/src/app/infra/browser/credential-repository.adapter.ts`
- `apps/server/src/app/infra/org-sqlite/schema/browser-credentials.ts`
- `apps/server/src/app/infra/org-sqlite/schema/browser-login-attempts.ts`
- `apps/server/src/app/domain/browser/credential-resolve.port.ts`
- `apps/server/src/app/infra/browser/credential-resolve.adapter.ts`
- `apps/server/src/app/infra/browser/credential-socket.channel.ts`
- `apps/server/src/app/infra/browser/credential-plugin-mode.ts`
- `apps/server/src/app/domain/browser/browser-session-registry.port.ts`
- `apps/server/src/app/infra/browser/browser-session-registry.adapter.ts`
- `apps/server/src/app/domain/browser/egress-proxy.port.ts`
- `apps/server/src/app/infra/browser/egress-proxy.adapter.ts`
- `apps/server/src/app/domain/browser/host-allowlist.ts` (+ spec)
- `apps/server/src/app/domain/browser/lockout.ts` (+ spec)
- `apps/server/src/app/infra/browser/harnesys-vault-plugin.ts`
- `apps/server/src/app/infra/browser/browser-login-attempt.adapter.ts`
- `apps/server/src/app/application/browser-login/*.use-case.ts`
- `packages/harnesys/src/packs/web/browser/login-executor.ts`
- `packages/harnesys/src/packs/web/browser/login-steps.ts`
- `packages/harnesys/src/packs/web/browser/login-origin.ts`
- `packages/harnesys/src/packs/web/browser/browser-command-allowlist.ts`
- `packages/harnesys/src/packs/web/browser/credential-plugin-flags.ts`
- `apps/webui/src/features/manage-org-browser/website-logins-*.tsx`
- `apps/webui/src/features/send-message/ui/browser-login-card.tsx`

Changed:

- `packages/harnesys/src/packs/web/browser/agent-browser-tool.ts` (bump to 0.44.0 + integrity)- `packages/harnesys/src/packs/web/browser/engine-sidecar.ts` (proxy flags, env hygiene, QUIC/WebRTC off)
- `packages/harnesys/src/packs/web/browser/engine-catalog.ts` (`egressProxy` capability)
- `packages/harnesys/src/packs/web/browser/browser-tools.ts` (hardened profile, allowlist, session binding, revocation checks)
- `packages/harnesys/src/packs/web/index.ts` (`WebPackPorts*`, `browser_login` / `browser_credentials`, gate)
- `apps/server/src/app/infra/runtime/packs/org-pack-registrations.helpers.ts` (inject resolver/status/list, §3 gate)
- `apps/server/src/app/infra/runtime/runtime.module.ts` / `api.module.ts` (DI wiring)
- `apps/server/src/app/domain/secret/vault-keys.ts` (`browser_login:` system key prefix)
- `apps/server/src/app/api/rest/browser.controller.ts` (credential + attempt routes)
- `apps/server/src/main.ts` (credential plugin mode entry)
- `apps/webui/src/features/manage-org-browser/org-browser-pane.tsx`
- `apps/webui/src/features/manage-agent/ui/web-pack-settings.tsx`
- `apps/webui/src/features/send-message/ui/hitl-prompt.tsx` (browser login card)

## 13. Tests

Pure units in the repo:

- `host-allowlist.spec.ts`: label-boundary wildcard, lookalike hosts, IPv4/IPv6 private
  ranges, IPv4-mapped addresses.
- `lockout.spec.ts`: cap, exponential delay, unlock.
- `browser-command-allowlist.spec.ts`: allowlist surface, denied raw commands, `get value`
  / `get html`, global long and short flags, `--text` values starting with `-`.
- `login-origin`: same-origin / success-prefix matching (in the allowlist spec).

Manual verification recorded in §16: plugin envelope, wrapper → plugin mode → socket →
`auth login`, proxy allow/deny/localhost, socket mode `0600`, server boot with the new
DI graph.

Not automated (requires a real site and a user): password canary over `ps`/logs, 2FA
round-trip, cookie import round-trip, full WebUI flow.

## 14. Decisions

- Target `agent-browser` 0.44.0 (latest); bump the repo pin.
- Website credentials are a separate entity with a separate UI; the password stays in the
  existing vault (`browser_login:<id>`, a hidden system key).
- Same session, atomic server-driven login.
- Explicit selectors; no auto-detect.
- Purpose-scoped `browserLoginRefs` referencing credential ids.
- Plugin over a unix socket (no at-rest copy); the plugin process gets a per-login 0700
  wrapper with the 0600 socket path and a single-use 5 min token, because agent-browser
  gives the plugin the daemon env, not the command env.
- Egress containment: per-session filtering proxy set on the engine.
- `browser_login` is registered for granted credentials regardless of the `process`
  permission; shell + login is explicitly insecure and badged as such in the UI, with
  Shell = Deny as the hardened mode.
- Hardened profile is macOS/Linux only: the plugin wrapper is a `sh` script.

## 15. Out of scope — decided, fail with a typed error

- **Fleet nodes:** `browser_login` is not registered on a fleet worker (no browser host
  there); the tool is absent, not broken.
- **Multi-replica attempt delivery:** supported topology is single-node for
  browser-login; an `attempt_unsupported_topology` error is returned if the attempt
  buffer is not in the current process.
- **Windows:** hardened credential login is not enabled; the wrapper cannot be executed
  by the agent-browser plugin spawner without a shell.
- **Test-login dry run in Settings:** not shipped in this change; the first real login is
  audited and the UI shows status/failure count.
- **Multi-step/SSO/push-2FA/magic-link logins:** not modelled; `auth login` fails the
  success check and the run parks for manual input or a session import.

## 16. Verification log

- `agent-browser` 0.44.0: main tarball integrity
  `sha512-OIrY/BlPwdg8XB9rzEbBuDva0S/lQmQBCW735y+B80kDvZ8CDQsuYV8i6hmUr70qIZeTyjd74aymlUzHKbvO4Q==`;
  platform binary from `@agent-browser/cli-darwin-x64@0.44.0`
  (`sha512-Y/oun8VYYGqCjItCrXztwF2AZM4VvjYd8dnGjUl22QKr3+J0jqhWiOVkC+cpWvzyHoV9CypMwjwW8tuCGJzOiw==`).
  Ran `--version` (0.44.0), confirmed `plugin`/`credential.read`, `--action-policy`,
  `--confirm-actions`, `--cdp-headers`, that `--allowed-domains` still rejects CDP, that
  `--proxy` is ignored for connect sessions, and that `cookies set --curl` exists.
- Plugin protocol, on the 0.44.0 binary against a local form: the envelope is
  `request.itemRef`; the reply `{protocol, success, credential}` works; the plugin process
  does **not** see env set only on the `auth login` command. A wrapper that execs
  `harnesys-host --harnesys-credential-plugin <socket> <token>` logged in successfully,
  wrote the cookie, and navigated to the success URL.
- Credential socket channel: `Bun.listen({unix})` with per-connection `0600` mode (verified
  `srw-------`) answered the real plugin mode with the resolved credential.
- Egress proxy: live CONNECT to `example.com:443` tunneled `200`; `example.com:80`,
  `evil.com:443`, and `localhost:443` returned `403`; every decision emitted
  `browser.egress` audit rows.
- Server boot on a temp home: `200` on `/health/live`, all six credential/attempt routes
  mapped, DI graph resolved after restoring `BrowserHostPort`/`OrgSettingsPort` in
  `BrowserModule`.
- `obscura` 0.2.4 `macos-x86_64`: sha256 `91b1b5e1…` matched `engine-definitions.ts`;
  `--help`/`serve --help` expose `--proxy`; a live probe with
  `obscura fetch https://example.com --proxy http://127.0.0.1:<port>` produced
  `CONNECT example.com:443 HTTP/1.1` and failed closed when the proxy returned `403`.
