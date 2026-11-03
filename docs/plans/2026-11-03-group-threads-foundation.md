# Group threads foundation: phased plan

Status: agreed (2026-11-03).
Branch: `feat/group-threads-foundation`, cut from `main` (`8ed3e6c`, v0.7.9).
Model: `../GROUP_THREADS_MODEL.md`.
Reference to cherry-pick from: `feat/telegram-group-threads` (not merged).
Migrations: no production data yet, org databases are recreated, no backfill, no compatibility shims.

Three phases. Each phase ships on its own and leaves the app in a working state. Schema changes land only where a consumer exists in that phase.

## Phase 1. Decouple the agent from the thread, no behavior change

Goal: remove the inverted `thread -> agent` reference. A thread still has exactly one agent that answers, and observable behavior stays as on `main`.

### Schema

- `threads`: drop `agent_id` and `origin_agent_id`. No new columns in this phase.
- `thread_agents(thread_id, agent_id, created_at)`, PK `(thread_id, agent_id)`, both columns `ON DELETE CASCADE`, plus an index on `(agent_id)` for `listThreadIdsByAgent` / `listByAgent`. No backfill: there is no org data, so no "give every existing thread a row".
- `runs`: add `agent_id TEXT NULL REFERENCES agents(id) ON DELETE SET NULL` and `agent_name TEXT NOT NULL`.
- Runtime write transactions take `{ behavior: 'immediate' }` (Drizzle defaults to deferred; `withOrgSqlite` opens a fresh connection per call). Adopt here, not in Phase 2: it also closes an existing race in run transitions.

### Code

- `ThreadRecord` loses `agentId`/`originAgentId`.
- Ports: add `ThreadAgentRepositoryPort` (`listByThread`, `ensure`, `remove`, `listThreadIdsByAgent`). One adapter over `thread_agents`.
- `RunCreateInput.agentId` becomes **required**; the run is created with the resolved agent and its `agent_name` snapshot. No implicit default in the store — that would recreate `thread -> agent`. Callers resolve it: `session.ts:177`, `graph-run.ts:41`, `run-engine.ts:125`, fleet-hub `work-executor.resume`/`forwarder`, `issue-remote-run`, `issue-waiting-run`, `create-schedule`, `create-webhook`, `fire-issue`. Only `send-thread-run.use-case.ts` maps "the responder" to the thread's sole member.
- `prepare-org-target.ts` resolves the agent from `run.agentId`, dropping `thread.agentId` (`prepare-org-target.ts:116`).
- `thread-repository.adapter.ts`: `listByAgent` becomes a join over `thread_agents`. Remove `agentId` / `originAgentId` writes and mapping.
- Contract shape is unchanged: `ThreadSummary.agentId`, `agentName`, `originAgentId` are derived server-side from the sole member, so `packages/studio-shared` and `apps/webui` keep working.
- `send-thread-run.use-case.ts` keeps the implicit single-member responder and the thread-wide busy check (`activeByThread`). No `activeByThreadAgent`.
- `delete-agent.use-case.ts`: fence and cancel the agent's live runs, then delete its threads and remove its membership. No thread is a `group` yet, so this equals today's cascade; the `kind` split arrives in Phase 2.

### Acceptance

- `bun run typecheck`, `biome check`, `bun test` green; server boots (DI tokens resolve).
- Manual matrix identical to `main`: create a DM thread, send, agent answers; schedule fires; webhook fires; issue run starts; fork works; delete an agent removes its threads; connector DM still works.
- `grep` for `thread.agentId` and `threadsTable.agentId` returns only the migration/rebuild SQL.

## Phase 2. Group threads in the app

Goal: create group threads in the app with several agents and several org users, and the context model from `GROUP_THREADS_MODEL.md` section 6.

### Schema

- `threads`: add `group` to `kind` (keep `connector`), `auto_reply_agent_id`, `policy` (Zod-validated, versioned), `last_thread_seq INTEGER NOT NULL DEFAULT 0`, `conversation_count INTEGER NOT NULL DEFAULT 0` (the `M` for the note).
- `thread_participants(id, org_id, thread_id, provider, provider_user_id, display_name, username, role, first_seen_at, last_seen_at, created_at, updated_at)`, unique `(thread_id, provider, provider_user_id)`. Org users are `provider = 'app'`, `provider_user_id = users.id`; no foreign key (separate database).
- `run_events` becomes thread-scoped: PK `(thread_id, thread_seq)`, `run_id TEXT NULL REFERENCES runs(run_id) ON DELETE CASCADE`, `seq INTEGER NULL`, `conversational INTEGER NOT NULL DEFAULT 0`, unique `(run_id, seq) WHERE run_id IS NOT NULL AND seq IS NOT NULL`, unique `(thread_id, client_event_id) WHERE conversational = 1 AND client_event_id IS NOT NULL`, plus a partial index `(thread_id, thread_seq) WHERE conversational = 1` for the window. Retention: conversational rows are never pruned; telemetry (deltas, tool, usage) is prunable.
- `thread_message_queue`: replace the `text`/`attachments`/`origin` copies and the global unique `client_event_id` with `(thread_id, thread_seq)` referencing `run_events(thread_id, thread_seq) ON DELETE CASCADE` and `target_agent_id NOT NULL`, unique `(thread_id, thread_seq, target_agent_id)`.

### Responder policy

- `resolveResponders({ text, explicitAgentId, repliedToAgentId, members, autoReplyAgentId, allowMentions })` in the domain, one pure function. `chat` is a group of one with `auto_reply_agent_id` set, so there is no branch.
- Invariant `chat => exactly one agent`: the add-agent use-case rejects a second agent on a `chat`; a `group` is created instead. Enforced in the use-case and covered by acceptance.
- `create-thread.use-case.ts` sets `auto_reply_agent_id` to the creating agent; removing an agent from `thread_agents` clears the slot in the same use-case.
- Thread settings: `auto_reply_agent_id`, mention gating, `policy.contextWindow`. Human blocking is `thread_participants.role = 'blocked'` only.
- Contract: replace `agentId`/`originAgentId` with a member list (`members: { id, name }[]`) and update `apps/webui` in one pass.

### Runtime

- Transcript order switches to `thread_seq` in every reader (`listByThread`, feed, truncate, seeding); truncate orders by `thread_seq`. `thread_seq` comes from `threads.last_thread_seq`, incremented under `BEGIN IMMEDIATE`.
- Inbound is atomic: append the people-message row and insert the per-responder queue rows in one transaction.
- A run seeds from its queued trigger (excluded from the window by `thread_seq`) plus the last N `conversational = 1` messages, N default 6, per-thread override, no pinned own-turns. Window only for `kind = 'group'`; `chat` and automation keep full-history-plus-compaction seeding.
- `conversational` is set on the people message at append and on `run.completed.text` (fallback: last text `model.usage`) in the terminal transition, never on intermediate step answers. Live feed and usage stay attached to the run.
- `thread_history(before_seq, limit)` is required; `thread_search` is offered only when `embedModelIdOf` is set. Scoped to org and thread.
- Steering is disabled for `kind = 'group'`; queued addressed messages start the target's run when the thread is free.
- Queue delivery per `target_agent_id`; runs stay serialized per thread.
- `TargetCache` and `org-run-stores.ts:50` (`targetCache.get`) key on `(thread_id, agent_id)`.
- Unread: for a `group`, compare each participant's `last_seen_at`; `threads.last_read_at` stays for 1:1.
- Conversational count (`M`) is incremented on append and decremented on `delete-thread-event`/truncate; an undelivered queue row for a deleted event is dropped.
- Forking a `group` thread is rejected with a readable error.
- Deleting an agent removes only its membership in a `group` thread and leaves the transcript intact (labels from `agent_name` and `metadata.author`); every other kind is deleted.
- `threadSessions` (`org-runtime.ts:70`) keys the **handle** on `(thread_id, agent_id)`; `seededThreadState` stays per thread. Otherwise the second agent reuses the first agent's session — its model, permissions, skills, packs.
- The window uses a dedicated builder, not `rebuildThreadMessages`: that replay (`replay-thread-history.ts`) silently drops `run.completed`, which now carries the final answer. People rows come from `metadata.author`; answers from `run.completed` joined to `runs.agent_name`.
- The `RunEventStore` port and the REST delete/truncate (`threads.controller.ts:117`, `sqlite-thread-truncate.ts`) address events by `thread_seq`, not `(runId, seq)`, so a `run_id NULL` people row can be deleted and truncated.
- `enqueue` = append the people row plus the queue rows in one transaction; the queue API keeps returning `text`/`attachments` via join. Deleting a queue item removes the delivery row only; the message stays in the transcript.
- Group runs execute locally in v1 (explicit limitation): the fleet worker creates its own `user` event from `envelope.inputText` and has no seed (`work-executor.forwarder.ts`), so remote group execution needs the envelope to carry trigger and window. Revisit, do not inherit silently.
- Notes compose into one slot: `channelNote` is a single string (`llm.ts:306`, `llm-request-plan.ts:50`), so the group note and the Telegram channel note must not overwrite each other.
- A `group` with zero agents after a deletion renders its history read-only; no responder.
- In-app group messages have no SSE (`events-watch` is lifecycle-only); the transcript refreshes on action, not by polling.

### UI

- Create a group thread; add and remove agents and org users.
- Authorship labels on messages in a group thread.
- Thread inspector: context window N, auto-reply agent.
- Group rows in the sidebar; per-participant unread.

### Acceptance

- Create a group thread with two agents and two org users; unaddressed message with no auto-reply starts no run; a mention starts only the mentioned agent; a mention of two agents runs them in order; a second message while an agent runs queues.
- A queued message for agent B is not folded into agent A's run and starts B's run when the thread frees.
- Adding a second agent to a `chat` is rejected.
- Unread is per participant; `M` does not drift after `delete-thread-event`.
- The window shows the last N conversational messages; `thread_history` reaches older ones; a 2M-token thread still seeds a small context.
- Chat and automation flows unchanged.

## Phase 3. Group threads in Telegram

Goal: extend the connector machine that already exists on `main` so a Telegram group or topic mirrors one app thread; several bots and agents serve it; DMs stay as they are. This is not a fresh port.

### Transport (extend `main`)

- `connector_bindings`: drop the `chat_type IN ('private')` CHECK so `group`/`supergroup`/`channel` and topics bind; keep `external_chat_id`/`external_topic_id`; fold `participant_policy` into `threads.policy`; `thread_id` becomes nullable so a binding can outlive its thread.
- `connectors`: drop `agentId`; add `connector_agents(connector_id, agent_id)` (PK, both `ON DELETE CASCADE`) as the agent set a bot serves.
- `thread_participants` gains `provider = 'telegram'` identities from inbound authors.
- `runs.origin_connector_id` is added and set from the triggering message, so `deliver(runId)` routes through the bot that received it; outbound reuses `connector_deliveries`.
- Inbound reuses `connector_inbox` update dedup, then normalizes to `{ text, author, addressedAgentIds?, replyToExternalMessageId?, originConnectorId }` and hands off to `resolveResponders`, intersected with `connector_agents`.
- Echo suppression reads `metadata.originConnectorId` on the people-message event.
- Pairing rules: a new binding's `auto_reply_agent_id` is the connector's sole agent when `connector_agents` has one, otherwise the user picks at binding time. Before pairing, the connector exists with `status = 'awaiting_pair'`, no thread, and the UI shows the bot and its pair code — a `chat` thread is created only on the first inbound after pairing.
- Capabilities: `getMe` parses `can_read_all_group_messages`; add `getChatMember`. Assigning an auto-reply agent in a group requires the capability or bot admin, otherwise a readable error; capability drift surfaces as a warning on the binding.

### Do not port

These live only on `feat/telegram-group-threads` and must not be recreated: `respond_mode` (column, DDL, contracts, web copy), `route-conflict.ts` / `assertBindingFree`, `telegram-shared-topic.ts` / `DEMOTE_SHARED_BINDINGS_SQL`, the duplicate `selectBinding`, `thread_agents.role`, `agent_groups` / `threads.group_id`, and the branch's table families (`telegram-bots`, `telegram-chats`, `telegram-topics`, `org-sql-group-threads.ts`, `agent-groups.ts`). Verify with `git grep <symbol> main`, which is empty.

### Rewrite (the `kind === 'connector'` seam)

Removing the `connector` kind silently stops Telegram mirroring, so every consumer must move in the same change:

- `maybeProjectRun` (`project-connector-events.use-case.ts:71`, early return on `kind !== 'connector'`) becomes "is there a binding for this thread".
- `routeForThread` (`project-connector-events.use-case.ts:233`, first active binding) routes by `runs.origin_connector_id`.
- `toProjectEvent` carries `metadata.originConnectorId` for echo suppression.
- Full site list: `packages/contracts/src/thread.ts:5`, `packages/studio-shared/src/thread.ts:12`, `prepare-runtime-input.ts:8`, `pending-placement.ts:3`, `send-thread-run.use-case.ts:54`, `prepare-org-target.ts:179`, `connector.helpers.ts:48`, `apply-telegram-actions.ts:300`, `upsert-telegram-connector.use-case.ts:109`, `telegram-connector-actions.use-case.ts:139`, `org-sql.ts:408/435/461/518`, `schema/threads.ts:18/39`, `execution-profile.ts:100`, `issue-waiting-run.use-case.ts:18`, `apps/webui` `thread-kind-icon.tsx:19/35`, `ide-content.tsx:135`, `shared/api/threads.ts:24`, `agents-display.store.ts:11`.

### Acceptance

- Two agents in one Telegram topic share one app thread and one roster; no conflict error; a new topic does not exist until someone assigns an agent.
- Group messages appear in the app thread with authorship; the app thread is visible in Telegram; DM pairing and help unchanged.
- Removing the bot's group-read permission surfaces a warning, policy unchanged.

## Cross-cutting

- High risk under `docs/HARNESS_CHANGE_CRITERIA.md` (context, prompts, pointers, permissions, persistence). Phase 2 needs the pre-work questionnaire, a measured tool re-read rate, pointer reachability checks for `thread_history` / `thread_search`, and a rollback.
- Testing budget: pure specs where a contract changes (responder policy, context window, conversational stamping, `thread_seq` monotonicity, route mapping). No e2e, no HTTP tests. `bun run typecheck` plus the single relevant spec during work; the manual matrix is the phase acceptance.
- Rollback: phases are separate commits; the branch is isolated from `main`; org databases are disposable.
- Stop signals (if any appears in the implementation, the model has drifted): a session cached by thread; the window filtered by event type instead of `conversational`; the `thread_seq` counter kept in process memory; a `run_id NULL` final answer; `RunCreateInput.agentId` optional again.
