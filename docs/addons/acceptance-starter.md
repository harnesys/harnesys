# Acceptance run: starter add-on (§17.5)

Recorded against an isolated stand: `SERVER_PORT=47996`, `HARNESYS_HOME=$(mktemp -d)`, `bun run --cwd apps/server start`. The live stand was untouched. Add-on under test: `add-ons/harnesys.starter` at version 1.0.0 (final artifact; intermediate versions 1.0.1–1.1.1 existed only to isolate bugs during the run).

All commands below are verbatim `curl` sequences; responses are abridged to the relevant fields.

## Bootstrap: owner, session, org

```bash
B=http://127.0.0.1:47996
curl -s $B/api/session/owner/status                      # {"initialized":false}
curl -s -X POST $B/api/session/owner/init \
  -H 'content-type: application/json' \
  -d '{"login":"accept","name":"Acceptance","password":"accept-1234"}'
# {"userId":"cd8d1f48-…"}
TOKEN=$(curl -s -X POST $B/api/session/login \
  -H 'content-type: application/json' \
  -d '{"login":"accept","password":"accept-1234"}' | jq -r .accessToken)
ORGID=$(curl -s -X POST $B/api/orgs -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Acceptance Org"}' | jq -r .orgId)
# {"orgId":"b1072cd4-…","name":"Acceptance Org","role":"relay"}
```

Note: host-level endpoints read the caller's capabilities from the `X-Org-Id` membership; requests to `/api/…/addons/packages/*` must carry `-H "X-Org-Id: $ORGID"` (owner role carries `host.promote`), otherwise they fail with 403 `Host admin role required`.

## Install: plan → confirm

```bash
PLANID=$(curl -s -X POST $B/api/api/addons/packages/plan \
  -H "authorization: Bearer $TOKEN" -H "X-Org-Id: $ORGID" \
  -H 'content-type: application/json' \
  -d '{"source":"harnesys.starter"}' | jq -r .planId)
# plan: id=harnesys.starter version=1.0.0 trust=builtin warnings=[]
curl -s -X POST $B/api/api/addons/packages/plan/$PLANID/confirm \
  -H "authorization: Bearer $TOKEN" -H "X-Org-Id: $ORGID"   # 201
# installed at $HARNESYS_HOME/add-ons/harnesys.starter/1.0.0
# addons.lock.json: {id, version:"1.0.0", digest:"068dfea1…", source:"harnesys.starter", trust:"builtin"}
```

## Enable with grants

```bash
curl -s -X POST $B/api/orgs/$ORGID/addons/harnesys.starter/enable \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"grants":[
        {"id":"http.fetch","scope":{"hosts":["api.github.com"]}},
        {"id":"events.subscribe","scope":{"patterns":["thread.created"]}},
        {"id":"trigger"}]}'
# 201; grantsDigest=7cb7cd82…; baseline rights (db, config.read, secrets.own, log, events.emit.own) are implicit
```

## Config: non-sensitive + secret, no leak in read model

```bash
curl -s -X PUT $B/api/orgs/$ORGID/addons/harnesys.starter/config \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"values":{"default_github_login":"octocat","greeting":"hello from curl"},
       "secrets":{"api_note":"s3cret-note-value"}}'    # 200
curl -s $B/api/orgs/$ORGID/addons/harnesys.starter -H "authorization: Bearer $TOKEN"
# configValues: {"greeting":"hello from curl","default_github_login":"octocat"}  — secret not present
# connections: [{"connectionId":"github","accountIds":[],"needsSetup":true}]   — optional binding shows needs_setup
```

The secret value is stored via `SecretStorePort` and reachable only from the add-on through `secrets.get`; there is no REST path that returns it. The `github_user` tool reads `config.get` and `secrets.get` — tool invocation from REST does not exist yet (see gaps), so the roundtrip through a tool could not be exercised live.

## Routes: create, list, `:id`, 404, request schema

```bash
R=$B/api/orgs/$ORGID/addons/harnesys.starter/r
curl -s -X POST $R/items -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"text":"first item"}'    # 201 {"id":1}
curl -s -X POST $R/items … -d '{"text":"second item"}'              # 201 {"id":2}
curl -s $R/items -H "authorization: Bearer $TOKEN"
# 200 {"items":[{"id":1,"text":"first item","createdAt":"…"},{"id":2,…}]}
curl -s $R/items/1     # 200 {"id":1,"text":"first item","createdAt":"…"}
curl -s $R/items/999   # 404 {"error":"item not found: 999"}
curl -s -X POST $R/items -d '{"text":""}'
# 400 {"error":"text is required"}  (route requestSchema enforced)
```

## Job: schedule + on-demand run

```bash
curl -s -X POST $B/api/orgs/$ORGID/addons/harnesys.starter/jobs/heartbeat/run \
  -H "authorization: Bearer $TOKEN"
# 201 {"status":"ok"}
curl -s $B/api/orgs/$ORGID/addons/harnesys.starter/jobs -H "authorization: Bearer $TOKEN"
# {"jobId":"heartbeat","schedule":{"everySec":60},"enabled":true,
#  "nextRunAt":1794341580000,"lastRunAt":1794341520027,"lastStatus":"ok"}
```

Scheduled runs fired every 60 s without prompting (add-on log: `heartbeat {"at":"2026-11-10T20:16:00.007Z","inserted":1}`); the add-on writes one row per run into `heartbeat(at)`.

## Trigger: instance → fire → dedup on replay

```bash
TID=$(curl -s -X POST $B/api/orgs/$ORGID/addons/harnesys.starter/triggers \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"triggerId":"starter.tick","label":"Tick","config":{},
       "target":{"threadId":"'$THREADID'","agentId":"'$AGENTID'"},"enabled":true}' | jq -r .instanceId)
# 201; the host delivers trigger.start; the add-on fires:
#   log: trigger fired {"instanceId":"…","runKey":"<instanceId>:<startTs>","outcome":"busy"}
#   outcome was "failed" without a target (no thread/agent bound) and "busy" when the
#   test thread had a conflicting run — dispatch itself is reached and recorded.
ENC=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$TID', safe=''))")
curl -s -X POST $B/api/orgs/$ORGID/addons/harnesys.starter/triggers/$ENC/disable \
  -H "authorization: Bearer $TOKEN"   # 204; add-on log: trigger stopped
curl -s -X POST $B/api/orgs/$ORGID/addons/harnesys.starter/triggers/$ENC/enable \
  -H "authorization: Bearer $TOKEN"   # 204; trigger.start replayed (§8.7)
# add-on log: trigger start replay suppressed {"instanceId":"…","runKey":"<same runKey>"}
# — the add-on persists the run key per instance and re-firing is deduplicated.
```

The instance id embeds the org id (`<orgId>/<uuid>`) and must be URL-encoded in path segments.

## Hook: host event delivery

```bash
curl -s -X POST $B/api/orgs/$ORGID/threads -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"agentId":"'$AGENTID'","title":"Acceptance thread"}'
# 201 → host publishes thread.created → hook.deliver → add-on:
#   log: hook delivered {"hookId":"thread-created","event":"thread.created"}
#   and a hook_log row is written to the add-on db.
```

## Logs and metrics

```bash
curl -s $B/api/orgs/$ORGID/addons/harnesys.starter/logs -H "authorization: Bearer $TOKEN"
# {"items":[{seq, at, level, message, fields}…], "cursor":N}
curl -s $B/api/orgs/$ORGID/addons/harnesys.starter/metrics -H "authorization: Bearer $TOKEN"
# {"counters":[addons_instance_state=1(running), addons_instance_restarts_total=0,
#              addons_manifest_contributions=8]}
```

## Disable: cleanup

```bash
curl -s -X POST $B/api/orgs/$ORGID/addons/harnesys.starter/disable \
  -H "authorization: Bearer $TOKEN"    # 204
# detail: enabled=false, health=stopped, lastError=null
curl -s $R/items -H "authorization: Bearer $TOKEN"
# 500 {"errorCode":"not_found","message":"Addon route not found: GET /items"} — registrations removed
# a thread created after disable produced no hook delivery — subscription disposed
# instance stopped, no child process (in-process mode) and no pending calls
```

## Delete with data purge

```bash
curl -s -X DELETE "$B/api/orgs/$ORGID/addons/harnesys.starter?data=purge" \
  -H "authorization: Bearer $TOKEN"    # 204
# org addons list → {"items":[]}
# $HARNESYS_HOME/orgs/$ORGID/addons/ → removed (data.db, files, logs)
curl -s -X DELETE $B/api/api/addons/packages/harnesys.starter/1.1.1 \
  -H "authorization: Bearer $TOKEN" -H "X-Org-Id: $ORGID"   # 204, lock entry removed
curl -s -X POST $B/api/api/addons/packages/prune -H "authorization: Bearer $TOKEN" -H "X-Org-Id: $ORGID"
# 201 {"removed":[]} — nothing left to prune for the deleted id
```

## Result

The §17.5 scenario passes end-to-end on the final artifact: install → enable with grants → config (secret isolated) → db-backed routes with `:id` and schema validation → scheduled + on-demand job (`lastStatus: ok`) → trigger instance with fire, host dedup and add-on replay suppression → hook delivery → disable cleanup (routes, hook, process) → purge and package removal.

## Server-side gaps found during the run (reported, not fixed)

All in `apps/server` unless noted; none were patched by this task.

1. **`@harnesys/sdk` `process-entry.ts` — addon message loop deadlocked on host round-trips.** `startAddonProcess` awaited each stdin line serially (`await handleLine(...)`), so any handler making an addon→host call (`db.*`, `log.write`, `config.get`) blocked the loop that would have delivered the response — every such call hung, pings missed, instances restarted and quarantined. Fixed in the SDK (additive scope): lines are now dispatched concurrently (`void handleLine(...)`); `runtime.ts` also gained a fallback `CallMeta` for host requests that omit `params._meta`, and host→addon schemas treat `_meta` as optional, because **the host never sends `params._meta`** (zero occurrences in `apps/server`) although §6.3 requires it on every call. `packages/sdk/src/protocol/map.ts` + `runtime.ts` + `process-entry.ts`, `protocol.spec.ts` updated to the tolerant contract.

2. **Add-on migrations are never run.** `runAddonMigrations` (`infra/addons/storage/addon-migrations.ts`) has no production caller — not on enable, not on activation. The starter therefore self-bootstraps its schema with idempotent `create table if not exists` statements (`src/index.ts`, `ensureSchema`) on top of the shipped `migrations/0001_init.sql`. Expected: migrations applied on activation per §9.3.

3. **No boot-time contribution re-registration.** `registry.activate` is called only from `enable.use-case`; after a server restart enabled organizations have no registered contributions (routes 404, packs/triggers/hooks/jobs absent) until disable→enable. `enable` also short-circuits when the row is already enabled at the pinned version, so re-enable does not repair it. Expected per §8.2: on start the host reads `org_addons` and registers contributions as data.

4. **Version change does not restart the running instance.** `enable`/`update` re-pin the version but the supervisor keeps the old process; `POST /:id/restart` is needed (§8.6: version change → restart). `update` also failed with 500 `Addon package not installed: …@1.0.0` when computing the grant diff against a pinned version that the lock no longer contained (see next gap).

5. **`addons.lock.json` keeps only the newest version per add-on.** Each `confirm` replaces the previous entry for the id while the version directories remain on disk (`1.0.0`–`1.1.1` coexisted, the lock held one entry). §4.6 requires several versions side by side for pinning; `remove-package` for a non-locked version then fails with `not_found` and `prune` cannot reclaim the orphaned directories.

6. **Host addons controllers are double-prefixed.** `AddonsPackagesController` declares `@Controller('api/addons')` under the global `api` prefix and is mounted at `/api/api/addons/…` (`AddonPublicRoutesController` likewise). Every other controller omits the prefix. The acceptance used the effective `/api/api/...` paths.

7. **`LogSink` API mismatch.** `TransportFactory` and `InstanceRuntime` call `sink.write(orgId, addonId, line)` (6 sites) but `LogSink` declares only `append(entry)` and `AddonLogSinkAdapter` implements neither — every stderr line from an add-on would throw `TypeError` inside the transport, and the file/ring sink never receives transport-level lines. The logs endpoint works only for lines the add-on sends via `log.write`.

8. **Metrics endpoint does not expose dispatcher metrics.** `GET /orgs/:orgId/addons/:id/metrics` returns three hard-coded counters; `addons_host_call_total` / `addons_rpc_*` recorded by the `HostDispatcher` are invisible, which hampered diagnosis during this run.

9. **`computeAddonDigest` follows symlinks.** `addon-digest.ts` walks the staged copy with `statSync` and fails with ENOENT on the dangling `node_modules/.bin/*` symlinks a workspace-linked add-on carries. The starter keeps `node_modules` out of the package directory for this reason (build first, then `rm -rf node_modules` before `plan`). Expected: skip symlinks/dependency dirs during digest and staging.

10. **No REST path invokes add-on tools.** `tools.call` is reachable only from the agent runtime, so the acceptance could verify tool registration (via the manifest/contributions) but not execute `ping` / `github_user` over HTTP. A diagnostic-only route or a dedicated tool-invocation endpoint would close this.

Observations, lower severity: `host-events` warns `dropped event outside the host event catalog event=addon.state_changed` on every instance state change (the event is emitted but not catalogued); `TriggerFireService.fire` returns `failed` (not `suppressed`) when the target lacks `agentId`/`threadId`, which conflates misconfiguration with failure.
