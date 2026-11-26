# Scripts and gates

Scripts are part of the trigger `target`, executed by the host in the target
thread's workspace.

```json
{
  "pre": {
    "script": { "command": "make check", "shell": "bash", "timeoutS": 120 },
    "gate": { "on": "stdout", "match": "regex", "value": "^CHANGES$" },
    "onError": "skip-run",
    "injectStdout": true,
    "onWorkspaceMissing": "skip-run"
  },
  "post": { "script": { "command": "make notify" }, "when": "always" }
}
```

`acknowledged` is set by the pack; send it only if you build the object yourself.
`scripts: {}` clears both stages.

## Script

`command` (1..8000 chars) plus optional `args` (executed as argv, no shell), or a
shell line when `args` is omitted. `shell` is honoured as declared (bash, zsh,
sh, powershell) and defaults to bash. `timeoutS` is 1..600, default 30; on timeout
the whole process group is killed. `env` adds uppercase variables on top of a
minimal allowlist (PATH, HOME, LANG, TMPDIR); host secrets are never exported.

## stdin

The script receives one JSON document on stdin:

```json
{
  "kind": "trigger-script",
  "stage": "pre",
  "triggerId": "webhook.http",
  "threadId": "…",
  "agentId": "…",
  "workspace": "/path/to/workspace",
  "firedAt": "2026-01-01T00:00:00.000Z",
  "payload": { },
  "run": { "id": "…", "status": "completed" },
  "test": true
}
```

`payload` is the fire payload (post stage only for `run`; `run` is absent in pre).
`test: true` appears only for `automation_script_test`, so a script can tell a
dry run from a real fire. `HARNESYS_STAGE`, `HARNESYS_WORKSPACE`,
`HARNESYS_TRIGGER_ID` and (`post`) `HARNESYS_RUN_ID` are also exported.

## Pre exit codes

| exit | meaning |
| --- | --- |
| 0 | pass; gate decides |
| 2 | block: no run |
| other | failure, handled by `onError` |

`onError`:

| value | failed pre produces |
| --- | --- |
| `skip-run` (default) | no run, audit `failed` |
| `run-with-note` | run with a `<pre-run-failure>` note: stderr, stdout, fix hint |
| `ignore` | plain run, no note |

`injectStdout: true` adds `<pre-run-output>` with the trimmed stdout to the run text.

`onWorkspaceMissing`: `skip-run` records `skipped`, `fail` records `failed`; no
script runs. The same verdict is returned by `automation_script_test`.

## Gates

| gate | passes when |
| --- | --- |
| `{ on: "exit-code", pass: [0] }` | exit code is in `pass`; an exit-code gate is evaluated first and suppresses on mismatch |
| `{ on: "stdout", match: "contains", value }` | stdout contains `value` (stdout is trimmed) |
| `{ on: "stdout", match: "regex", value }` | regex matches trimmed stdout |
| `{ on: "json", path, op: "truthy" }` | value at dotted `path` is truthy |
| `{ on: "json", path, op: "exists" }` | path resolves |
| `{ on: "json", path, op: "equals", value }` | path deep-equals `value` |

A stdout/json gate only applies on exit 0; a non-zero exit is a failure first.
An unmatched gate suppresses the run (`skipped`, verdict `unmatched`). Non-JSON
stdout makes a json gate `unmatched` without further diagnostics — print one JSON
document and nothing else.

## Post

`when`: `always`, `success` (`completed`), `failure` (`failed`/`cancelled`). A
failing or timing-out post script never changes the run status and never surfaces
as a thread error; it is recorded as `failed`/`timeout` in
`automation_script_runs`. Post scripts are skipped when the instance was deleted
before the run finished.

## Testing

`automation_script_test` runs one script + gate in the instance workspace without
creating a run or an audit row, and returns `status`, `exitCode`, `durationMs`,
`cwd`, `gateVerdict`, `stdout`, `stderr`. Use it before arming a trigger: it is
the cheapest way to prove the command, cwd, shell and gate behave.

## Audit statuses

`automation_script_runs` returns `status` (ok, blocked, failed, timeout, skipped,
denied), `exitCode`, `gateVerdict` (passed, unmatched, not-applied), `summary`,
and output tails. A pre row with `status: failed` and a `runId` means the run went
ahead under `run-with-note` or `ignore`; `status: ok` always means exit 0.

## Troubleshooting

| symptom | cause |
| --- | --- |
| gate never matches an anchored regex | trailing newline in the command output — stdout is trimmed, so check the pattern itself |
| `failed` with exit 127 | command not found in the workspace or PATH |
| `timeout` with exit 137 | `timeoutS` reached, process group killed |
| script silently does nothing | `bash -c` vs your interactive shell aliases; use explicit paths |
| `cwd` differs by a symlink prefix | the host reports the resolved workspace path |
