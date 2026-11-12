# Unified thread context & trigger fields — corrected plan

Result of a breakage audit of the original plan. All decisions below were confirmed with the user; constraints discovered by the audit are integrated as hard requirements.

## Locked decisions

1. History settings live on the **thread** (`threads.policy`), not on the trigger. A trigger only sets the default policy when it creates a dedicated thread.
2. Policy applies to **every thread kind**. Defaults per kind: `chat → full`, `group → last`, `schedule/webhook → none`, `issue → full`.
3. Group's message-count window (`contextWindow`) migrates into run-count (`historyMode:'last'`).
4. Trigger part 1 (any trigger): name / agent / mode preset (overrides thread `runMode` per fire) / instructions.
5. Thread binding unified: any trigger → dedicated or existing thread (schedules/webhooks already allow it server-side; see audit fixes).
6. Composer in schedule/webhook/issue threads: hidden behind a "Continue" button; server already accepts sends.
7. Dead fields removed in one cascade: `schedules.history/historyLast` (values migrate into thread policy), `ScheduleHistoryFields` UI, `modeId` in addon `targetJson` → validated field, webhook hardcoded `mode:'ask'` → field.

## Mechanism spec

### Policy v2 (`packages/contracts/src/thread.ts` ThreadPolicySchema)

```ts
{ version: 2, historyMode: 'full' | 'none' | 'last', historyLast?: int(0..100), historyFromRunId?: string,
  mentionGating?: boolean, autoReplyAgentId?: string }  // contextWindow removed after migration
```

- `none` = "this tick only": seed carries no prior history except the newest compaction anchor.
- `last` = last N run boundaries included.
- `full` = current behavior (full replay).
- `historyFromRunId` = start history at a specific run; **hint with fallback**: if the run no longer exists (truncated/deleted), fall back to the kind default. Never seed empty, never error.
- Lockstep update of the mirror type `packages/studio-shared/src/thread.ts` (hand-written `ThreadPolicy`, `version: 1` literal).
- Old `{version:1}` rows must parse under the v2 schema (unknown/missing fields → kind-based defaults at seed time, not at parse time). `parseThreadPolicy`'s silent `EMPTY_THREAD_POLICY` fallback stays as last resort.

### Slicing algorithm (the core; constraints from audit — each is a real breakage if skipped)

Slicing is **local to `seedReplayState`**; all read-model consumers stay full-replay (thread UI feed, `threads_history`/`threads_tail` tools, memory consolidation, connector projections).

1. **Run boundary** = first event (by `thread_seq`) of a distinct non-null `run_id` group inside `run_events`. Never count rows of the `runs` table (empty runs would inflate "last N"). Never cut inside a run (orphan tool-call repair would silently mask corruption).
2. **Null-run user events are pseudo-boundaries.** `appendPeopleMessage` (`thread-transcript.store.ts:83-95`) inserts real user rows with `runId: null` in chat and group threads alike; a `run_id IS NOT NULL` filter would drop real user messages. Each null-run user event delimits its own turn.
3. **Active run is always included whole** (user event + all events); `rebuildThreadMessages` holds the active run's user message until its first delta — slicing that separates them silently deletes the user message.
4. **Newest compaction anchor is force-included** in every mode, even `none`, even if its run is old (manual compaction attaches the anchor to an old run). Dropping it loses the folded summary → context amnesia; keeping older runs without it un-folds context and blows up tokens.
5. **Exclusion markers** (`agent.spawned`, `map.item.*`) are computed on the full event list *before* slicing; a kept worker run must co-keep its parent marker run, or worker events replay as normal messages.
6. **Fork threads keep their own path**: inherited events are an atomic slice `[... forkAt-run-end]` of the parent (null-run events preserved); policy slicing applies only to the fork thread's own post-fork events. Own-event seeding for forks is currently absent — preserve current behavior in this change; extending it is a separate decision.
7. **Recompute the slice from the live journal at every seed.** No persisted offsets, no interaction with `truncateThreadHistory` (it deletes journal tail; the next seed just slices a shorter journal).
8. **`resolveCompactBoundary` must replay with the same slicing** as `compactThread`'s seed — otherwise `messageCount` mismatches and the compaction event loses `coveredUntilRunId/coveredUntilSeq` (silent metadata degradation).

### Group unification (audit findings — what actually breaks)

Good news: group reads the **same** `run_events` journal (`listConversationalBefore`), no separate store. Turns in group are delimited by `runId: null` user rows; runs are serialized per responder (queue drain), one mention often collapses into one run via steering.

Hard requirements:

- **Trigger-as-initialInput survives**: the per-agent trigger message comes from `thread_message_queue` (`latestDeliveredThreadMessage`, `thread-message-queue.store.ts:197-222`), pinned as `initialInput`, excluded from the window (`before = trigger.threadSeq`). The journal cannot supply this — the queue lookup stays as the initialInput source in the unified path.
- **Author attribution is preserved.** Today group history is flat `"Name: text"` prefixes (`group-window.ts:9-27`); `rebuildThreadMessages` builds full-shape assistant messages without name prefixes. The unified rebuild must add per-agent attribution (from `runs.agent_id` → agent name) for group threads, or every group agent loses speaker identity. Verified during implementation, not assumed.
- `groupChannelNote` ("window of the last N messages", `prepare-org-target.ts:188-195` + `group-note.ts`) is reworded to turns; `conversationCount` consumers reviewed.
- Migration mapping `contextWindow → historyLast` is a **documented decision**, not a silent heuristic (see open decisions).
- Group compaction anchors are **dropped today** (not `conversational=1`, so `seedGroupState` loses them on reseed) — unification incidentally fixes this; the force-include rule (constraint 4) is what fixes it.

## Trigger changes (exact seams from audit)

### Mode forwarding (repair; also fixes chat — the composer already sends `mode` per message and local runs silently ignore it)

Add `mode` through: `send-thread-dispatch.ts:64-79` → `SendLocalRunInput` (`local-executor.port.ts:20-40`) → `local-executor.adapter.ts:237-259` → `OrgRuntime.send` input (`org-runtime.types.ts:72-89`) → `org-runtime-runs.ts:17-36`. Override resolution in `prepare-org-target.ts:249-262`: per-run `mode ?? thread.metadata.runMode ?? agent.defaultModeId`. Two more seams: `modeShellSpecOf` in `place-pending-run.use-case.ts:148-152` and `issue-remote-run.use-case.ts:104-109` must use the run's mode, not `runModeOf(thread)`.

### Trigger fields

- **Webhook**: add `mode` field (replace hardcoded `'ask'` at `fire-webhook.use-case.ts:73`). `detail` is the instructions carrier (already used as task text fallback).
- **Addons**: `modeId` out of `targetJson` (`addon-trigger-config-dialog.tsx:186`) into a validated trigger-instance field; `TARGET_FIELDS`/`assertTarget` (`manage-instance.use-case.ts:33,167-182`) extended + **threadId validated** (existence, agent membership — today any UUID passes; no threads port is injected).
- **Schedules**: keep passing `modeId` (`fire-schedule.use-case.ts:69`); history fields die (see migration).

### Thread binding (mostly already safe — audit found no kind restrictions in `bind-schedule-thread.ts` / `bind-webhook-thread.ts`)

Audit fixes that must ship with it:

- **Rebind orphan leak**: `update-schedule.use-case.ts:141-166` rebinds `threadId` but never deletes the abandoned dedicated schedule-kind thread (webui removes it only from its local store). Server-side cascade deletion on rebind.
- **Orphaned addon instances**: `delete-thread.use-case.ts:50-63` detaches connector bindings only — trigger instances keep pointing at a deleted thread and fail forever with a warn log. Add trigger-instance detach to `detachBindings`.
- **Addon dedicated threads are created webui-side** (`trigger-target-field.tsx:17-31`) as plain `kind:'chat'` threads — they would get the chat default `full`, not `none`. Fix: explicit `policy.historyMode` accepted by `CreateThreadBody` → `create-thread.use-case.ts:67`; the addon dialog passes `'none'` explicitly. No kind-based heuristic.
- **Cross-trigger occupancy**: a thread can hold a schedule AND a webhook simultaneously (each table checks only itself). Decision needed (open decisions).

## Cascade deletion list (schedules history)

Server: `domain/schedule/schedule.ts:16-17,43-44`; `create-schedule.use-case.ts:46-47,90-91`; `update-schedule.use-case.ts:129-139`; `schedule.helpers.ts:15-16,42-43`; `schedule-repository.adapter.ts:103-104,194-195`; `schema/schedules.ts:29-32,50-53`; `org-sql.ts:700-722`; `org-scheduler.port.ts:117-118,211,272-283,295-296`; fakes (`wire-org-packs.fakes.ts`, `schedule.use-case.fakes.ts:41`, `create-team-from-preset.use-case.work-fakes.ts:216`, `automation-items.spec.ts:22`, `set-org-settings.use-case.spec.ts:27`).
Packages: `ports/scheduler.ts:13-14,27-28,38-39`; `domain/schedule.ts:5`; `packs/scheduler/create-schedule-tools.ts` (descriptions rewritten: history now lives on the thread); `packs/scheduler/index.ts:24`; `studio-shared/src/schedule.ts:16-17,46`, `types.ts:22`; `contracts/src/schedules.ts`.
Webui: `shared/api/schedules.ts`; `entities/schedule/model/schedule.ts:50-52,67-69`; `schedule.store.ts`; `manage-schedule` draft/create/update; `schedule-history-fields.tsx` (delete file); `schedule-config-dialog.tsx:229-231`.

## Migration

Pattern: per-table imperative migrators in `org-sql-migrations.ts` (DROP COLUMN precedent: `migrateAppsSecretFieldColumns:107`), invoked from `org-sql-ensure.ts`.

1. Backfill `threads.policy` for schedule threads: `{version:2, historyMode: <migrated schedule.history>, historyLast: <schedule.historyLast>}` (only where the thread has no explicit policy already).
2. Migrate group policies: `contextWindow: N` → `historyMode:'last', historyLast: mapping(N)`; drop `contextWindow`.
3. `ALTER TABLE schedules DROP COLUMN history / history_last` + drop the check constraint.

## UI

- Unified thread settings section (context: historyMode/historyLast/anchor) for **all** thread kinds, replacing the group-only popover (`thread-group-settings.tsx`).
- Trigger dialogs: name / agent / mode / instructions + thread binding (dedicated vs existing).
- "Continue" button in schedule/webhook/issue threads → composer appears (persisted per thread or per session — implementation detail, UI-only).

## Behavior changes to communicate (intended, not regressions)

- Schedule threads stop replaying full history at fire time (today's runtime ignores `history`; the new default `none` matches what the UI always promised).
- Group context window becomes run-based — effective context size changes per the migration mapping.
- Group model transcript shape becomes full-replay-shaped (tool calls, anchors visible) — required for anchor survival; verify attribution prefixes.
- Local runs start honoring the composer's per-message mode (previously silently ignored).

## Resolved decisions

1. `contextWindow → historyLast` migration mapping: one-shot `ceil(N/2)`; no legacy field remains.
2. Cross-trigger occupancy: **mutual exclusion** — one trigger of any type per thread. `bind-schedule-thread.ts`, `bind-webhook-thread.ts`, and addon `assertTarget` must check occupancy across schedule, webhook, and addon trigger instances; rebind counts as replace-after-unbind.
3. Legacy telegram automations keep their own `mode_id` and no instructions — gap accepted, legacy zone untouched.
