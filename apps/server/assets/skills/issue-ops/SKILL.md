---
name: issue-ops
description: Use when planning work on an issue board, dispatching agents through issues, or configuring board automation rules
when_to_use: "For issue board workflows: reading the dispatch cycle, wiring column automation with board_rule_save, and running issue-driven agent dispatch"
---

# Issue Board Operations

Reference for issue boards and board automation rules. All tools below belong to the issues pack.

## Dispatch cycle

Rules evaluate on `issue_created` and `status_entered` events, in `position` order:

| Aspect | Behavior |
|---|---|
| Trigger | `issue_created`, `status_entered` with a `statusKey`, or `run_settled` (the issue's execution finished or failed) |
| Conditions | AND of `has_label` / `has_not_label` (labelId), `has_priority` (priority), `has_type` (issueType), `has_open_blockers` (value); all must match |
| `assign_agent` | Last matching rule wins; rejected on `run_settled` rules (a settled execution must not re-dispatch itself) |
| `wake_agent` | Resume runs of that agent parked on this issue via `wait` with `signal: 'issue:<id>'` |
| `set_status` | Cascades; cap 5 transitions, repeats blocked within one cascade |
| `notify_owner` | UI toast to the owner |
| Fire condition | A run fires only when the entered status category is `started` |
| Blockers | Open blockers suppress agent firing on entry to started columns, including an explicit assignee; the move itself is allowed and the result carries `fireSuppressed` naming the open blocker issues |
| Override | Explicit `assigneeAgentId` on the move overrides rules for who is assigned — but that agent still does not fire while open blockers remain; the result carries `fireSuppressed` with the blocker ids/titles and states that no agent was fired |
| No match | Unassigned + no matching rule = no run |

## Worktree binding

- Issues bind a `sourceId` (repo) plus a `branch`.
- `worktreeOnStatus` on a column auto-creates a worktree on entering that status if the branch has none active.
- A run on a branch without a worktree is held until one exists.

## Tools

| Tool | Purpose |
|---|---|
| `board_create` | Create a board with columns/statuses |
| `board_update` | Edit board fields (name/description/color/icon); not rules |
| `board_delete` | Delete a board (irreversible, pass `confirm=true`) |
| `board_rule_save` | Create or update a column automation rule |
| `board_rule_delete` | Delete a rule (irreversible, pass `confirm=true`) |
| `issue_board_list` | List boards with columns and rules |
| `issue_create` | Create an issue with labels/assignee |
| `issue_move` | Move an issue to a status (may fire rules) |
| `issue_update` | Edit title/description/labels/assignee |
| `issue_nudge` | Nudge the assignee |
| `issue_get` | Read one issue |
| `issue_list` | List or filter issues |
| `issue_comment` | Add a comment |
| `issue_dependency` | Manage blockers/dependencies |
| `issue_attachment_add` | Attach a file |
| `label_list` | List labels (resolve `labelId` for rules) |
| `label_create` | Create a label |
| `label_delete` | Delete a label |

`board_rule_save` defaults:

- Create (no `ruleId`): appends at last `position`, `enabled: true`.
- Update without `position`/`enabled`: preserves the existing rule's values.
- `ruleId` must exist on that board; unknown ids fail instead of creating.
- Resolve `labelId` via `label_list`; agents and status keys via `issue_board_list`.

## Recipe: dev loop

Stage labels: `dev`, `qa`, `review`.

| Rule | Trigger | Condition | Action |
|---|---|---|---|
| Dispatch Coder | `status_entered` (`in_progress`) | `has_label: dev` | `assign_agent` → Coder |
| Dispatch QA | `status_entered` (`in_review`) | `has_label: qa` | `assign_agent` → QA |
| Notify owner | `status_entered` (`in_review`) | `has_label: review` | `notify_owner` |

Flow: create issues with the matching stage label → move into the work column → the rule assigns and the agent fires → move to review for QA.

## Recipe: setting up automation

1. `label_create` for the stage labels (`dev`, `qa`, `review`).
2. `board_rule_save` per column: trigger + condition + action.
3. Verify with `issue_board_list` (rules are visible there) before relying on them.

## Recipe: await a dispatched run

A coordinator that hands work to another agent parks on the issue signal instead of sleeping:

1. Dispatch as usual (rule fires or explicit assignee) — the executor's run starts.
2. `wait` with `signal: 'issue:<issueId>'` and an optional `timeoutMs` (default 30 min).
   The run parks immediately — no graph edits needed, the `wait` tool is core.
3. The run resumes within ~1 s of the executor's run settling (completed, failed or
   cancelled). On timeout it resumes with `timedOut: true`.
4. Read the tool result: `signal settled` → report the issue outcome (`issue_get`);
   `wait timed out` → the executor is still working, report the timeout.

Semantics: "settled" means the issue's latest execution is no longer active
(`reserved`/`active`/`handoff`). A re-dispatch keeps the wait pending; a question the executor
asks (`needs_input`) does not settle; an issue that was never dispatched waits for the timeout.
A board rule with `run_settled` → `wake_agent` resumes parked runs without an explicit wait.

`issue_get` shows the execution only while it is active — `null` can also mean the run
already finished; check `fireTrail` or the executor thread to distinguish that from
"never dispatched".

For keys that are not issue-bound, use the `signals` pack: agree on a key
(e.g. `deploy:done`), park with `wait({ signal: key })`, and the finishing agent calls
`signal_fire({ key })`.

## Common mistakes

| Mistake | Reality |
|---|---|
| Rule references a non-existent label or agent | Rule is skipped as dead-ref; warning in the server log |
| Expecting a fire on `finished`/`cancelled` columns | Only the `started` category fires |
| Duplicate `assign_agent` rules on one column | Last by `position` wins |
| Re-entering the same status to refire | Engine blocks repeats within one cascade |
| Editing rules with `board_update` | It edits board fields only; rules go through `board_rule_save` |
