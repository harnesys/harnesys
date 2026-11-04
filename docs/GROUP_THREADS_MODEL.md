# Group threads: foundation model

Status: agreed (2026-11-03).
Branch: `feat/group-threads-foundation`, cut from `main` (`8ed3e6c`, v0.7.9).
Supersedes the model of `docs/design/group-threads.md` and `docs/plans/2026-11-03-group-threads.md` (both on the unmerged reference branch).
Reference to cherry-pick from: `feat/telegram-group-threads` (not merged).

## 1. Principle

A thread is a conversation: a transcript plus a membership plus a policy. An agent does not own a thread; it takes part in one. The reference direction is `run -> (thread, agent)`, never `thread -> agent`.

Everything owned by an agent (model, memory, permissions, skills, execution profile) lives on the agent and is resolved in the context of a run. The working directory and workspace are thread-scoped (`prepare-org-target.ts` resolves `cwd` from `resolveRuntimePrimary(threadId)`), so a conversation carries one workspace and its runs are serialized.

## 2. Entities

`threads` is the conversation. `kind` is the single explicit type and the only thing that decides how a thread behaves. Drop `agent_id` and `origin_agent_id`.

```
threads:
  id, org_id, title,
  kind            chat | group | schedule | webhook | issue
  auto_reply_agent_id  TEXT NULL REFERENCES agents(id) ON DELETE SET NULL
  policy          TEXT NOT NULL  (Zod-validated JSON, versioned)
  last_thread_seq INTEGER NOT NULL DEFAULT 0
  conversation_count INTEGER NOT NULL DEFAULT 0
  metadata, issue_id, inherited_event_count,
  parent_thread_id, fork_at,
  run_directory, run_profile_id,
  created_at, updated_at, last_read_at
```

- `chat` is a 1:1 conversation, in-app or a paired transport DM.
- `group` is a multi-party conversation.
- `schedule`, `webhook`, `issue` are automation threads.
- `connector` is not a kind. Pairing state lives on `connectors.status`, transport identity on `connector_bindings`. `main` flips a `connector` thread to `chat` on pairing (`telegram-connector-actions.use-case.ts:139`); that flip disappears when the connector is reshaped.

`kind` decides exactly three things: the deletion rule (section 5), whether the context window applies (section 6), and whether the group runtime note is emitted.

`policy` holds only behavioral knobs (`contextWindow`, mention gating, later rate limits and moderation). It is Zod-validated and carries a `version`; human blocking is never duplicated into it.

`thread_agents` is the agent membership. No roles. **Invariant: `kind = 'chat'` has exactly one row.** Adding a second agent to a `chat` is rejected by the use-case; a `group` is created instead.

```
thread_agents(thread_id, agent_id, created_at)
  PK(thread_id, agent_id), both columns ON DELETE CASCADE
```

`thread_participants` is the human membership. The app has global `users` with per-org `memberships` (`identity-sqlite`), so an in-app group thread has human members with accounts. An in-app user is `provider = 'app'`, `provider_user_id = users.id`; a transport identity uses its provider name. Identity lives in a separate database, so `provider_user_id` is a plain string like `runs.started_by_user_id`, not a foreign key. `provider` is an open string, no CHECK, no enum. Per-participant unread is `last_seen_at`; `threads.last_read_at` remains only for 1:1.

```
thread_participants:
  id, org_id, thread_id,
  provider, provider_user_id,
  display_name, username,
  role member | blocked,
  first_seen_at, last_seen_at, created_at, updated_at
  UNIQUE(thread_id, provider, provider_user_id)
```

`runs` references both sides. `agent_id` is nullable so a shared thread survives an agent deletion; `agent_name` snapshots the label. `origin_connector_id` records the bot that delivered the trigger, so `deliver(runId)` resolves one route when several bots serve a thread.

```
runs: thread_id NOT NULL,
      agent_id TEXT NULL REFERENCES agents(id) ON DELETE SET NULL,
      agent_name TEXT NOT NULL,
      origin_connector_id TEXT NULL,
      ... (rest unchanged)
```

`run_events` is the thread-scoped transcript. `run_id` is nullable: a people message is thread-level (`run_id NULL`, written once, so fan-out to two agents does not duplicate it); every run-produced event keeps its `run_id` and cascades with the run. `seq` is the run-local order and is `NULL` for thread-level events. `conversational` is set by the writer, so readers never filter by a list of event types.

```
run_events:
  thread_id NOT NULL, thread_seq INTEGER NOT NULL,
  run_id TEXT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  seq INTEGER NULL,
  conversational INTEGER NOT NULL DEFAULT 0,
  type, metadata, timestamp, client_event_id,
  PK(thread_id, thread_seq)                 -- thread_seq from threads.last_thread_seq
  UNIQUE(run_id, seq) WHERE run_id IS NOT NULL AND seq IS NOT NULL
  UNIQUE(thread_id, client_event_id) WHERE conversational = 1 AND client_event_id IS NOT NULL
```

- The PK orders by `(thread_id, thread_seq)`. A partial index `(thread_id, thread_seq) WHERE conversational = 1` serves the window in O(N) without scanning the delta tail; it is not a duplicate of the PK.
- Retention: conversational rows are never pruned; telemetry (deltas, tool, usage) is prunable. A large thread must not keep its deltas forever.
- `thread_seq` comes from `threads.last_thread_seq`, incremented in the same transaction, never from an in-memory map.
- A **people message** is one thread-level row with `conversational = 1`, `run_id NULL`, and `metadata.author = { provider, provider_user_id, display_name }` plus `metadata.originConnectorId` for echo suppression.
- A **final answer** is `run.completed.text` (fallback: the last text `model.usage` of the run), which is a run event with its `run_id`, flagged `conversational = 1` in the terminal transition. Intermediate step answers stay `0`. The live feed (`tail(runId)`) and usage stay attached to the run.
- A run never re-reads its own trigger from the window: the seed excludes the trigger `thread_seq`.

`connectors` and bindings are the transport machine that already exists on `main`; the model extends it, it does not replace it.

```
connectors:
  id, org_id, provider, secret_ref, status awaiting_pair | active | paused | error,
  bot_user_id, bot_username, pair_code_hash, pair_code_expires_at,
  stream_mode, policy, mode_override, leases, timestamps
  -- agentId is dropped; the agent set moves to connector_agents

connector_agents(connector_id, agent_id) PK, both ON DELETE CASCADE
connector_bindings:
  id, connector_id, org_id,
  external_chat_id, external_topic_id, chat_type,
  thread_id NULL, status
  -- participant_policy folded into threads.policy
connector_inbox, connector_deliveries: unchanged (update dedup, draft/streamed outbound)
  -- connector_routes is dropped: delivery routes by runs.origin_connector_id and connector_bindings.thread_id
```

A binding outlives its thread (`thread_id NULL`): deleting an agent removes a `chat` thread but must not unpair the external user.

## 3. Responder policy

One function, one code path for every kind:

```
resolveResponders({ text, explicitAgentId, repliedToAgentId,
                    members, autoReplyAgentId, allowMentions })
```

1. addressed set = `explicitAgentId` + mentioned agents + the author of the replied-to message, intersected with `members`, and with `connector_agents` when the message arrives from a transport.
2. if empty, `autoReplyAgentId`, if it is a member.
3. otherwise no responders, and the send is a no-op.

A `chat` is a group of one with `auto_reply_agent_id` set to its member, so it uses the same resolver with no branch. `auto_reply_agent_id` must always be a member: removing an agent from `thread_agents` clears the slot in the same use-case. Removed as a class: `connector_bindings.respond_mode`, `thread_agents.role` and its unique index, the `thread.agent_id` fallback, `agent_groups.default_agent_id`, `route-conflict` / `assertBindingFree`, peer demotion. None of these symbols exist on `main`; they are not ported from the reference branch.

## 4. Transport contract

The connector machine on `main` (poller, `connector_inbox` dedup, `connector_deliveries` drafting/streaming, leases, pair codes, HITL) stays. The group work extends it with two seams:

```ts
interface ChannelCapabilities {
  canReadUnmentioned: boolean;
  supportsTopics: boolean;
  supportsReplyTargets: boolean;
  canEditMessages: boolean;
  maxMessageLength: number;
  streaming: boolean;
}
```

Rules:

- Transport identity is `(provider, external_chat_id, external_topic_id)` on `connector_bindings`; `chat_type` is no longer restricted to `private`.
- Inbound normalizes to `{ text, author, addressedAgentIds?, replyToExternalMessageId?, originConnectorId }` and hands off to `resolveResponders`. Nothing about policy crosses the boundary.
- `deliver(runId, payload)` routes by `runs.origin_connector_id` and reuses `connector_deliveries`, so one conversation can hold several agents and several bots. A run started from the app has no origin connector and is never mirrored back.
- `connector_routes` is gone. Outbound needs no route table: the run carries its origin connector, the binding carries its thread. Echo suppression reads `metadata.originConnectorId`.
- Pairing is two-step: a group or topic message with no binding claims it as an `unpaired` binding, and an admin connects it from the agent's connector pane. A direct message pairs by code, then its first inbound message opens the thread.
- `provider` is a string everywhere in the core. No `platform !== 'telegram'` whitelist, no `IN ('telegram','web')` CHECK. Adding Discord touches no core schema.

Cardinality (decided): one bot serves many agents. A bot has no default agent. An org connects several bots, each with its own agent set (`connector_agents`). A binding maps a chat or topic to a thread. Responders are intersected with the connector's agent set, so a bot never delivers for an agent it does not serve.

## 5. Runtime invariants

- The transcript is thread-scoped. Every append goes through one point that takes the SQLite write lock and increments `threads.last_thread_seq`; it is never reused. Write transactions use `{ behavior: 'immediate' }`: Drizzle defaults to deferred and `withOrgSqlite` opens a fresh connection per call, so a read-then-write would otherwise fail with `SQLITE_BUSY_SNAPSHOT`.
- One live root run per thread is already enforced by `runs_active_root_idx` (`org-sql.ts:642`); serialization rides on that constraint.
- One inbound message is one atomic unit: append its people-message row and insert one `thread_message_queue` row per responder in the same transaction.
- A run's trigger is its queued item (`thread_message_queue` references the people-message row). The run is always seeded with that message by `thread_seq`; the window is supplementary, so a mention cannot be pushed out of view by newer traffic.
- A run records the triggering human in `runs.started_by_user_id`, an app user id or an external identity, as today.
- One live run per thread. The workspace and `cwd` are shared by every agent, so runs are serialized; `activeByThread` stays the busy check. Parallel answers would require a workspace per `(thread, agent)` and are out of scope.
- Steering is a 1:1 feature and is disabled for `kind = 'group'`. Addressed messages wait in the queue and start the target's run when the thread is free; a message for agent B is never folded into agent A's run.
- Maintenance (compaction, truncate, recovery) has one writer and runs only when the thread is quiescent. Serialized runs make this structural. Deleting an event adjusts the conversational count and drops any undelivered queue row that referenced it.
- Idempotency: `(thread_id, client_event_id)` dedupes conversational events inside one thread; transports additionally dedupe by `connector_inbox.updateId`.
- Deleting an agent: `kind = 'group'` keeps the transcript, drops the agent's membership, and leaves its runs and events rendered from the `agent_name` snapshot; every other kind is the agent's own thread and is deleted. Live runs are fenced and cancelled before the membership is removed.
- Only conversational events are visible to a run that did not produce them: people messages plus final answers. Deltas, mid-run messages, and tool steps of a foreign run are never read.

## 6. Context in group threads

A run seeds from its trigger plus a clean window of the last N conversational messages of the thread. Tool steps and stream deltas are `conversational = 0` and neither count nor shrink the window.

- The window applies only to `kind = 'group'`. `chat` and automation threads keep full-history-plus-compaction seeding, so DM behavior does not change.
- N defaults to 6 and is configurable per thread (`threads.policy.contextWindow`).
- Ordering and the window boundary come from `thread_seq`. The trigger row is excluded from the window (it is already the run input) and fan-out seeds every target by the trigger's `thread_seq`.
- The window is built by a dedicated builder, not `rebuildThreadMessages`: that replay (`replay-thread-history.ts`) handles `user`/`text-delta`/`model.usage`/`tool`/`compaction` and silently drops `run.completed`, which now carries the final answer. People rows come from `metadata.author`; answers come from `run.completed` joined to `runs.agent_name`.
- `threads_history(before_seq, limit)` is the required tool: a deterministic, paginated read of conversational rows before the window. It does not depend on any configured model.
- `threads_search(query, scope)` is a keyword search over the transcript: `scope=thread` reads the current thread, `scope=org` searches every thread in the project. Neither mode depends on a configured embedding model.
- A runtime note tells the agent it is in a group thread, that it sees the last N of M messages, that the window can be off-topic, and that `threads_history` (and `threads_search`) exist when the window is not enough. The wording is conditional.
- `M` is a conversational counter maintained on append and on event deletion, not a `COUNT` over a large transcript.
- Compaction leaves the seeding critical path for groups: the seed is bounded by N. A single long run still compacts its own context, and manual compaction stays a user tool. No per-agent context table, no cursor, no digest.
- Forking a `group` thread is rejected in v1: `seedForkState` seeds full history and would bypass the window. Revisit later.

The note is prompt text, so it is a behavior policy change under `docs/HARNESS_CHANGE_CRITERIA.md`: conditional phrasing only, the tools must resolve, and the change needs the pre-work questionnaire with a measured re-read rate.

## 7. Migrations

The product has no production data yet. Org databases may be deleted and rebuilt; identity lives in a separate database and survives. No compatibility shims, no data backfill. Schema changes land as a fresh `CREATE` path plus an explicit "delete the org database and restart" guard for stale files, the way `assertIssuesStatusKey` (`org-sql-ensure.ts`) already fails on legacy schemas.

## 8. Cherry-pick from `feat/telegram-group-threads`

Port, by idea (the branch holds the group behavior that `main` lacks):

- Group and topic inbound handling: mention parsing, mention routing, reply-to-author resolution, topic routing.
- `thread_participants` and the authorship fields on the user event (`author`, `groupChat`), with `provider` as an open string.
- `agent_id` on `runs` plus the `agent_name` snapshot.

Do not port, do not recreate:

- The branch's own table families (`telegram-bots`, `telegram-chats`, `telegram-topics`, `org-sql-group-threads.ts`, `agent-groups.ts`). `main` already has `connectors`, `connector_bindings`, `connector_inbox`, `connector_deliveries`; `connector_routes` is dropped in v1.
- `respond_mode`, `route-conflict.ts` / `assertBindingFree`, `telegram-shared-topic.ts` / `DEMOTE_SHARED_BINDINGS_SQL`, the duplicate `selectBinding`, `thread_agents.role`, `agent_groups` and `threads.group_id`.

Rewrite rather than port — the `kind === 'connector'` seam silently stops mirroring once the kind is removed:

- `project-connector-events.use-case.ts:71` (`maybeProjectRun` returns early on `kind !== 'connector'`) becomes "is there a binding for this thread".
- `routeForThread` (`project-connector-events.use-case.ts:233`) picks the first active binding; route by `runs.origin_connector_id` instead.
- `toProjectEvent` carries `metadata.originConnectorId` for echo suppression.
- Every `kind === 'connector'` site must move with the reshape: `packages/contracts/src/thread.ts:5`, `packages/studio-shared/src/thread.ts:12`, `prepare-runtime-input.ts:8`, `pending-placement.ts:3`, `send-thread-run.use-case.ts:54`, `prepare-org-target.ts:179`, `connector.helpers.ts:48`, `apply-telegram-actions.ts:300`, `upsert-telegram-connector.use-case.ts:109`, `telegram-connector-actions.use-case.ts:139`, `org-sql.ts:408/435/461/518`, `schema/threads.ts:18/39`, `execution-profile.ts:100`, `issue-waiting-run.use-case.ts:18`, and in `apps/webui`: `thread-kind-icon.tsx:19/35`, `ide-content.tsx:135`, `shared/api/threads.ts:24`, `agents-display.store.ts:11`.

Rebuild rather than port: responder policy, membership, workspace resolution, capabilities, context assembly, the queue.

## 9. Open items

- Remote group runs are not supported in v1: a group thread executes on the local node only.
- Cleaning `thread_participants` when an org user is deleted.
- Per-agent run profile: `run_profile_id` / `runModeOf(thread)` stay thread-scoped in v1, so one preset applies to every agent in a group.
- Binding lifecycle independent of the thread: a binding may outlive its thread (`thread_id NULL`).
- Per-group policy fields beyond the first set (rate limits, moderation).
- `threads_history` / `threads_search` limits and the `scope=org` page size.
