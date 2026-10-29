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
| Trigger | `issue_created`, or `status_entered` with a `statusKey` |
| Conditions | AND of `has_label`; all must match |
| `assign_agent` | Last matching rule wins |
| `set_status` | Cascades; cap 5 transitions, repeats blocked within one cascade |
| `notify_owner` | UI toast to the owner |
| Fire condition | A run fires only when the entered status category is `started` |
| Blockers | Open blockers suppress firing |
| Override | Explicit `assigneeAgentId` on the move overrides rules |
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

## Common mistakes

| Mistake | Reality |
|---|---|
| Rule references a non-existent label or agent | Rule is skipped as dead-ref; warning in the server log |
| Expecting a fire on `finished`/`cancelled` columns | Only the `started` category fires |
| Duplicate `assign_agent` rules on one column | Last by `position` wins |
| Re-entering the same status to refire | Engine blocks repeats within one cascade |
| Editing rules with `board_update` | It edits board fields only; rules go through `board_rule_save` |
