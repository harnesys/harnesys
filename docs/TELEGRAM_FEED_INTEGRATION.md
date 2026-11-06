# Telegram Feed Integration

The first consumer of `docs/INTEGRATION_ADDON_MODEL.md`. Package `packages/integration-telegram`, id `telegram`, contributes one automation kind `telegram.feed`: watch channels, groups, and forum topics over an MTProto user session, store publications, gate them by filter, start an agent run in a bound thread.

Risk class per `docs/HARNESS_CHANGE_CRITERIA.md` §5: high (secrets, background workers, automatic agent actions).

## Transport (measured)

Spike in `temp/mtproto-spike/` on Bun 1.3.14 with `teleproto@1.232.1`:

| Check | Result |
| --- | --- |
| install + load | ok, `crypto: native` |
| TCP to DC2 `149.154.167.40:443` / `149.154.167.51:80` | ok, `layer 232`, 1840 ms |
| `help.GetAppConfig` on anonymous session | returned `help.AppConfig` |
| `channels.GetFullChannel` on anonymous session | `AuthKeyUnregisteredError` |
| `connection: 'tcp'` string | rejected, pass the class `telegram.ConnectionTCP` |
| named export `StringSession` from `'teleproto'` | missing under Bun, import from `'teleproto/sessions'` |

- The Bot API cannot read foreign channels: `channel_post` reaches a bot only where it is an administrator. The connector token is not usable here.
- Reading needs an authorized user account: `api_id`, `api_hash` from my.telegram.org, a phone, a login code, optional 2FA password. A spare account, a personal one risks restrictions.
- Push latency is 1–5 s. Public channels the reader has not joined do not push, so joining is the default and a history poll is the fallback.
- `t.me/s/<username>` HTML preview works without any account (`curl` returned 200 and `data-post="durov/552"`), 10–30 s behind. Kept as a second transport behind the same port, phase 4.
- The RSA public key from the my.telegram.org page is not needed, teleproto ships the production server keys.

## Credentials

Per org, entered in the integration settings UI, the same contract as Google. No environment variables, no `application.yml` entry, no shared host-level app identity: every org owner brings their own `api_id`/`api_hash`.

| value | where |
| --- | --- |
| `api_id` | `readers` table in the add-on db (an application identifier, not a secret) |
| `api_hash` | `ctx.secrets`, key `integration:telegram:reader:<id>:api_hash` |
| MTProto session string | `ctx.secrets`, key `integration:telegram:reader:<id>:session` |
| login code, 2FA password | memory only, TTL 10 min, never persisted |

`api_hash` and the session string never leave the server: responses expose `apiId`, masked phone, status, dc, error, timestamps. Deleting a reader deletes both secret keys and its data rows.

## Add-on database

`orgDataDir(orgId)/integrations/telegram/data.db`, DDL owned by this package, `CREATE TABLE IF NOT EXISTS` in `setup()`.

| table | key columns |
| --- | --- |
| `readers` | `id`, `label`, `status`, `api_id`, `phone_masked`, `dc_id`, `lease_owner`, `lease_until`, `last_error`, `last_seen_at` |
| `sources` | `id`, `reader_id`, `peer_kind` (`channel`/`group`/`supergroup`), `peer_id`, `access_hash`, `username`, `title`, `joined`, `watch_topics`, `last_post_id`; unique `(reader_id, peer_id)` |
| `rules` | `id`, `name`, `status`, `agent_id`, `thread_id`, `filter_json`, `history`, `history_last`, `max_runs_per_day`, `throttle_sec`, `runs_date`, `runs_today`, `last_fired_at` |
| `rule_sources` | `(rule_id, source_id)` PK, so one rule watches many channels |
| `posts` | `id`, `source_id`, `post_id`, `topic_id`, `author_title`, `text`, `media_json`, `published_at`, `received_at`, `outcome`, `fire_count`; unique `(source_id, post_id)` |
| `fires` | `fire_id` PK `feed:<postId>:<ruleId>`, `rule_id`, `post_id`, `run_id` |

`posts` is the queue the user described: every publication lands there, `outcome` says what happened to it (`new`, `filtered`, `fired`, `throttled`, `over_limit`, `error`), and the UI browses it without starting a single agent.

Retention: `prune` keeps the newest 500 rows per source and rows younger than 30 days, whichever set is smaller, once per hour in the worker.

## Pipeline

```
MTProto updates ──► collector worker (per reader, lease) ──► posts (dedupe)
                                                              │
                                          rules subscribed to that source
                                                              │
                                                    matchesFilter(stages, post)
                                                              │ pass
                                                    claimFire(fire_id)
                                                              │
                                                ctx.runs.dispatch(threadId, agentId,
                                                  trigger { kind: 'connector', id: fire_id })
```

- `telegram/client.ts` wraps teleproto behind a narrow `ClientHandle` (`resolve`, `join`, `joinInvite`, `history`, `onPost`, `close`) and `telegram/runtime.ts` caches one handle per reader. No other module in the package imports teleproto types.
- The collector runs through the host's worker registry (`ctx.workers.register`), one loop per authorized reader, lease-backed single ownership, 30 s tick, hourly prune. A worker is registered when the host boots an authorized reader and again the moment a login completes, so a freshly connected account starts streaming without a restart.
- `filter_json` is an ordered stage list, all stages must pass, an empty list fires on everything. Phase 1 ships one stage:

```ts
interface FeedKeywordsStage {
  type: 'keywords';
  config: { terms: string[]; match: 'any' | 'all'; exclude: string[] };
}
```

Matching is case-insensitive substring over `text` plus `author_title`. A later `semantic` stage (threshold over `StudioEmbeddings`) is one new case in `matchesFilter` plus one UI block.

- Run text: source title, post number, topic, publish time, link `https://t.me/<username>/<postId>`, media kinds, up to 4000 chars of body, then the rule `detail` as the instruction. Longer bodies stay in `posts` and are reachable through the integration's own list endpoint.
- Backfill on request: `history(limit)` for the newest N posts through the same ingest path, so rules fire over history when the user asked for it.

## HTTP surface

Everything under the integration namespace, proxied by the host: `ALL /api/orgs/:orgId/integrations/telegram/*`.

```
POST   /reader                 {label, apiId, apiHash, phone}   → sendCode, status awaiting_code
POST   /reader/authorize       {code, password?}                → session stored, status authorized
DELETE /reader
GET    /reader
POST   /sources                {peer, invite?, watchTopics?}
GET    /sources                DELETE /sources/:id              POST /sources/:id/refresh
GET    /posts?sourceId&outcome&limit
POST   /sources/:id/backfill   {limit}
GET    /rules                  POST /rules (201)                PATCH /rules/:id              DELETE /rules/:id (204)
```

## Automations contribution

```ts
automations: {
  kinds: [{
    kind: 'telegram.feed',
    label: 'Telegram feed',
    description: 'New Telegram posts, filtered',
    icon: 'send',
    requiresConnection: true,
  }],
  list(ctx): AutomationItem[],
  create(ctx, body): AutomationItem,
  update(ctx, id, body): AutomationItem,
  remove(ctx, id): void,
}
```

`connection.connected` comes from `connection(ctx)`, true when a reader is `authorized`. While it is false the read-model contributes no `telegram.feed` kind, so the picker shows no card. The connect form lives on the Telegram integration page as a "Telegram account" section next to the bot, which is where the user goes to enable it.

Rule config UI (dialog): name, agent, thread (new or existing), sources multi-select with add-by-`@username`, keyword stage editor, history `none`/`last` with count, `maxRunsPerDay`, `throttleSec`. Posts browser is a second surface on the same automation tab: list with outcome badge, click opens the full text.

## Guards

| Guard | Value | Mechanism |
| --- | --- | --- |
| Dedupe | unique `(source_id, post_id)` | insert returns duplicate, pipeline stops |
| Idempotent fire | `claimFire` on `feed:<postId>:<ruleId>` | second attempt returns `already_fired` |
| Daily run cap | `max_runs_per_day`, default 50 | excess posts stored `over_limit`, no run |
| Min gap | `throttle_sec`, default 0 | `throttled`, retried on the next update |
| Single owner | lease per reader, TTL 15 s, renew 5 s | no duplicate collectors across nodes |
| Table growth | 500 rows per source and 30 days | hourly prune |
| Session health | status `error` + backoff, `session_revoked` → reconnect prompt | no silent auth loop |

## Pre-change questionnaire (§6.1)

1. Problem: agents cannot see foreign Telegram publications, the user reads and routes them by hand.
2. Bad scenario today: no inbound path for channels at all, and the Bot API cannot provide one.
3. Success: a publication reaches `posts` within 5 s, a matching post starts exactly one agent run, a non-matching post starts none, a repeated update starts none, and an org without a connected reader sees no Telegram trigger card.
4. Improved: moves and user attention (external event to agent run with no manual paste), task success (data no tool reaches), plus the integration seam itself, which hundreds of integrations will reuse.
5. Degraded: tokens (unattended runs), one new secret class, one new background loop, one new file per org on disk.
6. Why it is worth it: every run passes `claimFire`, `max_runs_per_day`, `throttle_sec`, and an explicit filter, default cap 50 runs per rule per day, and the queue is browsable without any run.
7. Criteria: C3 (post link and `post_id` readable back), C4 (run text is plain markdown under 4000 chars), C6 (hash and session in `SecretStore` only, masked phone in logs), C7 (dedupe, prune, caps), C8 (rule and status round-trip UI → API → add-on db → worker → UI).
8. Offloads/pointers: text inline up to 4000 chars, longer bodies stay in the add-on db, no file spill.
9. Expected re-read rate: low, most posts are short. Not measured yet.
10. Measurement: ingest logs `outcome`, `textLength`, `truncated`; the posts endpoint is counted per day.
11. Pointer path: run text → `post_id` → `GET /integrations/telegram/posts` → `text`.
12. Tests: `filter.spec.ts` (keyword policy), `store.spec.ts` (dedupe, fire-claim, prune over an in-memory sqlite), `normalize.spec.ts` (MTProto message → post), `text.spec.ts` (run text under the limit), `records.spec.ts` (caps and throttle). Pure logic only, `bun test`, no network in tests. Server boot proves DI, and the token-import rule from `AGENTS.md` applies to every new port.

## Phases

1. **Seam.** Done: `harnesys/integration` contract, `IntegrationHost`, `AddonDatabasePort`, `installed-integrations.ts`, automations read-model, forwarder routes, `automations-changed` SSE frame, picker and sidebar rows render from the read-model.
2. **Reader and queue.** Server side done: `packages/integration-telegram`, teleproto client, `readers`/`sources`/`posts`, collector worker with lease, login state machine behind `POST /reader` and `POST /reader/authorize`. UI in progress.
3. **Rule and gate.** Server side done: `rules`/`rule_sources`/`fires`, `telegram.feed` contribution, keyword stage, `ctx.runs.dispatch` with `trigger.kind = 'connector'`.
4. **Backfill, retention, polish.** `POST /sources/:id/backfill` and the hourly prune exist; the rule dialog and the posts browser are the remaining UI work.
5. **Extensions.** `semantic` filter stage, digest mode (N posts per run), HTML-poller transport behind the same client port.

Verified on a real boot: `~/.harnesys/data/orgs/<orgId>/integrations/telegram/data.db` contains `readers`, `sources`, `rules`, `rule_sources`, `posts`, `fires` plus the host's `addon_leases`, and `org.db` contains no feed table. 21 package tests cover keyword policy, media mapping, run text truncation, daily cap, throttle, and the add-on store contract including fire-claim idempotency and prune.

## Unknowns

- Telegram restrictions on an account that joins many channels. Measure on a spare account first.
- Private channels need an invite hash; `invite` is accepted, expired and approval-gated invites are untested.
- Forum topics (`watch_topics`, `topic_id`) per teleproto docs, unverified here.
- `teleproto` inside `bun build --compile` for the desktop host is untested; the spike ran in dev mode only.
- Whether the seam should expose `ctx.http` as real mounted routes or one forwarder (see the add-on model doc).
