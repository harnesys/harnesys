---
name: automations
description: "Manage add-on triggers through the automations pack: kinds and config fields, target threads and workspaces, pre/post scripts with gates, kind actions, and runtime verification."
when_to_use: "Use when creating, editing, pausing or debugging an automation (cron schedule, webhook, repository event) for any installed add-on."
---

# Automations: triggers of every add-on

Use the `automation_*` tools whenever a user asks to react to something: a cron
schedule, an incoming webhook, a repository event, or any other add-on trigger.

References load with `load_skill` `{ "name": "automations", "file":
"references/<name>.md" }`: `config-fields`, `scripts-gates`, `actions-and-lifecycle`.

## Flow

1. `automation_kind_list` — read the installed kinds. Each item carries
   `addonId`, `kind`, `configFields`, `connection`, `limits` and `actions`.
   Never guess config keys: build `config` from `configFields`.
2. Check the target thread. One instance per thread is allowed, and a fire lands
   in that thread, so pick a thread whose agent should do the work. Defaults are
   the calling thread and agent; pass `threadId`/`agentId` to target another.
3. `automation_create` with `addonId`, `kind`, `label`, `config`, optional
   `instructions`, `workspace` and `scripts`.
4. `automation_get` — confirm what the host stored (config defaults are filled in).
5. `automation_script_test` — run the pre-script and its gate without firing.
6. Fire for real with `automation_action` (`test` on webhook-like kinds) or wait
   for the natural trigger, then read `automation_script_runs` and the thread.

## Config

`configFields` is the contract: `type` (text, textarea, number, boolean, select,
group, …), `required`, `default`, `options`, `pattern`, `visibleWhen`, nested
`fields` for groups. Defaults are applied on create and on update; a field hidden
by `visibleWhen` is not validated. Invalid input comes back as
`config rejected: <path>: <reason>` — fix the field named in the path.

A kind with `connection` needs a connected account of that service before it can
be created: without one the host answers
`requires connection <id>; connect the account first`. Connecting an account is a
human action on the add-on page, never something to work around.

See `references/config-fields.md` for every field type, `visibleWhen` and limits.

## Target

`threadId` + `agentId` are the run destination; `modeId` optionally pins an agent
mode. `workspace` binds the thread's working directory for fired runs:
`inherit` keeps the thread default, `folder { path }` points at an existing
directory (protected system roots are refused), `thread`/`source`/`worktree`
pick the matching thread workspace. Only chat threads accept a workspace.

`instructions` are appended to every fired run; the trigger's text is the event
body. Keep instructions short and task-shaped. A fire into a chat thread that still
has the default title renames it after the trigger title.

## Scripts

`scripts` is part of the target: `{ pre?, post? }`. A pre script runs before the
fire limits and can suppress the run; a post script runs after the run reaches a
terminal status. `acknowledged` is set by this pack; `scripts: {}` clears both.

- pre: `script`, optional `gate`, `onError` (skip-run | run-with-note | ignore),
  `injectStdout`, `onWorkspaceMissing` (skip-run | fail).
- post: `script`, `when` (always | success | failure).
- script: `command`, optional `args`, `shell` (bash | zsh | sh | powershell),
  `timeoutS` (1..600, default 30), `env`.

Pre exit codes: `0` fire, `2` block, anything else is a failure handled by
`onError`. A gate turns the script into a condition: `on: exit-code` with `pass`,
`on: stdout` with `match: contains|regex` and `value`, `on: json` with `path`,
`op` (truthy | exists | equals) and `value`. An unmatched gate suppresses the run.

Never use scripts to poll: scripts run once per fire, not on a timer. Arm a cron
kind for recurring work.

See `references/scripts-gates.md` for the full matrix, stdin/stdout contract and
audit statuses.

## Actions and verification

Operations owned by the add-on are declared as actions: `automation_action` with
`instanceId`, `action` and optional `input`, validated against the action's
`inputSchema`. Typical actions: `status`, `test`, `deliveries`, `rotate_url`,
`rotate_secret`, `check_cron`. When an action is missing the error lists the
available ids.

Verify with evidence: `automation_get` (stored config and target),
`automation_script_runs` (stage, status, exit code, gate verdict, output tails),
`automation_action` returns, and the target thread's own runs. A paused instance
keeps config, target and scripts and fires nothing; prefer
`automation_set_enabled` over `automation_delete`, which needs `confirm: true`.

See `references/actions-and-lifecycle.md` for action semantics, paused instances,
delivery dedupe and troubleshooting.
