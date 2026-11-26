# Trigger scripts

Pre/post shell commands for add-on triggers, with an optional gate that decides whether a
fire starts a run. Host-owned: the add-on never sees or declares them.

## Config

Stored in `addon_trigger_instances.target_json` next to `threadId / agentId / modeId /
workspace`. Validated by `TriggerTargetSchema`
(`apps/server/src/app/application/addons/triggers/trigger-target.schema.ts`); the platform
contract stays `target: z.unknown()` so existing add-on descriptors keep parsing.

```ts
type TriggerScript = {
  command: string;
  args?: string[];        // argv form, command is the executable
  shell: 'bash' | 'zsh' | 'sh' | 'powershell'; // default bash
  timeoutS: number;       // 1..600, default 30
  env?: Record<string, string>; // keys matching ^[A-Z_][A-Z0-9_]*$
};

type TriggerGate =
  | { on: 'exit-code'; pass: number[] }
  | { on: 'stdout'; match: 'contains' | 'regex'; value: string }
  | { on: 'json'; path: string; op: 'truthy' | 'exists' | 'equals'; value?: unknown };

type TriggerPre = {
  script: TriggerScript;
  gate?: TriggerGate;
  onError: 'skip-run' | 'run-with-note' | 'ignore'; // default skip-run
  injectStdout: boolean;                          // default false
  onWorkspaceMissing: 'skip-run' | 'fail';        // default skip-run
};

type TriggerPost = { script: TriggerScript; when: 'always' | 'success' | 'failure' };

type TriggerScripts = { acknowledged: boolean; pre?: TriggerPre; post?: TriggerPost };
```

A non-empty `pre` or `post` requires `acknowledged: true`. The UI shows the checkbox; the
server rejects a save without it.

## Pre script

Runs inside `FireTriggerUseCase.execute`
(`apps/server/src/app/application/addons/triggers/fire-trigger.use-case.ts`) after the
trigger workspace is applied to the thread and before dispatch. Order:

```
disabled -> dedup -> no_target -> apply workspace -> pre script -> limits -> dispatch
```

A gate is checked before the fire limits on purpose: a per-minute condition trigger must
not burn the add-on's `perDay` while its condition is false.

| result | effect |
| --- | --- |
| exit 0, no gate | run |
| exit 0, gate matched | run |
| exit 0, gate unmatched | fire suppressed, reason `gate-unmatched` |
| exit 2 | fire suppressed, reason `script-blocked` |
| `exit-code` gate present | the pass list replaces the default exit rules |
| other exit | `onError` policy |
| timeout | `onError` policy, reason `script-timeout` |
| spawn failure | `onError` policy, reason `script-unavailable` |
| workspace missing | `onWorkspaceMissing`: quiet skip or `failed` audit row |

A suppressed pre script creates no run row. `run-with-note` starts the run and appends a
`<pre-run-failure>` block to the task text, so the agent can repair the checkout.
`injectStdout` appends `<pre-run-output>` on a successful pre script. When `run-with-note`
or `ignore` lets a failed pre script through, the audit row keeps the real outcome
(`failed`/`timeout`) with `summary: pre failed: onError=<policy>`, never `ok`.

The gate parser lives in `trigger-script-policy.ts` and is unit-tested; JSON paths are
dotted (`result.items.0.ready`), with `exists`, `truthy` and `equals` operators. Stdout is
trimmed before `contains` and `regex` matching, so `^CHANGES$` matches `echo CHANGES`.

## Post script

Registered when dispatch returns a run id and executed from `run.finished` / `run.failed`
through `ThreadEventsPort` (`trigger-post-scripts.service.ts`). The script config, the pinned
cwd and the trigger context are written to `addon_trigger_pending_posts` before dispatch
returns, so the post script never re-resolves a workspace that may have been rebound.

- `when: success` matches `completed`; `failure` matches `failed` and `cancelled`.
- The post exit code never changes the run status. Its own failure is recorded in the audit
  table and logged.
- If the trigger instance was deleted before the run finished, the pending row is dropped.
- v1 subscribes in-process. A server restart loses a pending post; an outbox drained on boot
  is the follow-up (same shape as `recover-orphaned-runs`).

## Agent mode

`scripts.agent` decides whether a fire starts an agent run at all. Absent means `always`
(the classic flow: pre script, then an agent run, post script on run termination).

- `never`: the pre script is the whole job. No agent run is dispatched and the fire returns
  `outcome: "script-only"`; the post script runs against the job result
  (`ok` -> `completed`, exit 2 -> `cancelled`, failure/timeout -> `failed`).
- `conditional`: an agent run starts only when `escalate` matches — `onFailure` (default true)
  on a failed, timed-out or unspawnable script, or `gate` (the same `TriggerGate` shape) passing
  against the script result; a passed gate escalates even on a non-zero exit, which lets a
  dedicated exit code mean "wake the agent". stdout/JSON gates keep requiring exit 0. Without
  escalation the fire behaves like `never`. The escalated run receives the trigger instructions
  plus a diagnostic note (`escalation-condition` for a passed gate, `pre-run-failure` for a
  failed script).
- A non-`always` mode requires a `pre` script; `escalate` must have at least one live rule.
- In both modes `pre.gate` and `pre.onError` do not apply: the script is the job, not a filter.
- `escalate` is valid only with `agent: conditional`; conditional requires it.

Compatibility: `script-only` is a new value of the `ctx.triggers.fire` result. Add-ons built
against `@harnesys/sdk` 1.3.1 and earlier reject it in the response schema, so an external
add-on must be rebuilt against an SDK containing this outcome before its trigger instances
are switched to a non-`always` agent mode.

## Working directory

Both stages run with `cwd` equal to the directory the run itself will use, produced by the
same code: `resolveRunEnvironment` + `resolveRuntimePrimary`
(`apps/server/src/app/infra/thread/run-cwd.adapter.ts`). Folder -> exact path, source ->
root + subpath, sandbox -> `<threadDir>/sandbox`. The resolved path is pinned on the pending
row; `pwd` inside the script is that directory. It never falls back to `$HOME` or to the
server working directory.

## Process environment

Child env is an allowlist, not the server environment:

- base: `PATH`, `HOME`, `LANG`, `TMPDIR` from the host process;
- declared `script.env`;
- harness facts, which win: `HARNESYS_STAGE`, `HARNESYS_WORKSPACE`,
  `HARNESYS_TRIGGER_ID`, and `HARNESYS_RUN_ID` for post scripts.

stdin is one JSON document:

```json
{
  "kind": "trigger-script",
  "stage": "pre",
  "workspace": "/absolute/cwd",
  "triggerId": "...",
  "threadId": "...",
  "agentId": "...",
  "firedAt": "2026-11-26T10:00:00.000Z",
  "payload": {},
  "run": { "id": "...", "status": "completed" }
}
```

`run` is present for post scripts only.

Process execution is shared with agent hooks: `runShellProcess`
(`packages/harnesys/src/application/hooks/shell-process.ts`) owns shell selection, stdin,
stdout/stderr capture, the timeout and the process-group kill. `runCommand` in
`command-run.ts` now delegates to it, so hooks and trigger scripts do not fork the executor.
`shell` is honoured as declared: `bash` resolves a bash binary from `PATH` (falling back to
`/bin/bash`), never the interactive `$SHELL`.

## Audit

- `addon_trigger_script_runs`: stage, status (`HookRunStatus`), exit code, duration, cwd,
  gate verdict, summary, last 2000 chars of stdout/stderr.
- Read: `GET /orgs/:orgId/addons/:addonId/triggers/:tid/script-runs`.
- Test: `POST /orgs/:orgId/addons/:addonId/triggers/:tid/scripts/test` runs the given
  script in the trigger's current workspace and returns status, exit code, duration and the
  gate verdict. It is available for saved triggers only. With a missing workspace it returns
  the `onWorkspaceMissing` verdict of the stored pre script (`skipped` or `failed`) instead of
  an error.

## Safety

- Trigger scripts are host processes. Container runs use same-path bind mounts, so the
  directory exists on the host, but the script executes on the host without container
  tooling. Containerized scripts are a later step, not a silent fallback.
- `acknowledged` is a per-trigger decision recorded in the target, not a global switch.
- `script.env` values are literal strings in v1. Vault references are a follow-up.
- The permission screenshot of the trigger UI states that commands run with the user's host
  permissions in the selected folder.

## Add-on contract

Scripts are part of the trigger target, so an add-on (and therefore an agent using its tools)
can arm them without a human:

- `AddonTriggerTarget` in `@harnesys/sdk` declares `scripts` (`pre`/`post`, gate, failure
  policy). `ctx.triggers.create` and `ctx.triggers.update` accept it; `ctx.triggers.get`
  returns the stored instance with its target, so an add-on can inspect and edit what it has.
- The host validates the full target on every write: non-empty command, compilable regex,
  timeout range, env key mask, enum values. Non-empty scripts require
  `scripts.acknowledged: true`; the core `automations` pack sets it automatically.
- `ctx.triggers.update` replaces `scripts` when the target carries them and keeps the stored
  ones when the target omits them, so a re-applied target does not wipe existing scripts.
- `trigger.start` keeps receiving only `threadId`, `agentId`, `modeId?`, `workspace?`: the
  scripts are executed by the host engine and are not needed by the add-on runtime.
- `TriggerDescriptor.standard.scripts` (`{ disabled?, label?, help? }`) relabels or hides the
  Scripts block in the trigger dialog; the same values stay editable through the API.

When designing a trigger, do not duplicate a preflight check inside the add-on if the host
can express it as a pre script: a "poll every minute, fire only when something changed"
trigger is a script with a stdout/JSON gate, not a reason to add a new scheduling mechanism.
Mention the Scripts block in the handoff so the operator knows the capability exists.

Admin/agent API for saved triggers:

```
GET  /api/orgs/:orgId/addons/:addonId/triggers/:tid/script-runs?limit=20
POST /api/orgs/:orgId/addons/:addonId/triggers/:tid/scripts/test
```

The test body is `{ script, gate? }` and runs in the trigger's current workspace; the response
is `{ status, exitCode, durationMs, cwd, gateVerdict, stdout, stderr }`. Both routes require an
org admin session.

## Agent access

The core `automations` pack exposes trigger management to agents without per-add-on tools:
`automation_kind_list` returns each installed kind with `configFields`, `connection` and
`standard`; `automation_create/update` write the instance config (validated against
`configFields`: required, type, select options, pattern, `visibleWhen`, nested groups), target
and scripts; `automation_list/get/set_enabled/delete` cover the rest; `automation_script_runs`
and `automation_script_test` read the audit and run a probe without firing. The pack rejects
`scripts` when `standard.scripts.disabled` is true.

The `automations` system skill (config fields, gate matrix, action table) is enabled per
agent in its `skills` list. Config fields are the add-on's own schema. An agent builds `config` from
`automation_kind_list` instead of guessing, which is why a trigger kind does not need custom
CRUD tools. Kind-specific operations are declared as `descriptor.actions` and invoked through
`automation_action` (status, test, deliveries, rotate, next-run state), so there is one agent
surface for both management and runtime operations.

## Relationship to notifications

Post scripts are the generic "after the run" seam, including `when: failure`. A future native
notification action can be implemented as a preset over that seam (a built-in post action
that posts to the notification transport) without adding a second lifecycle hook.
