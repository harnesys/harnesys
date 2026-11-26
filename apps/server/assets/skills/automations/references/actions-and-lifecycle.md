# Actions and lifecycle

## Instances

- **Create** — `automation_create`; `automation_kind_list` first. Defaults:
  `enabled: true`, calling thread and agent.
- **Pause/resume** — `automation_set_enabled`. Paused keeps config, target and
  scripts, clears the next run and fires nothing; resume re-arms from now.
- **Delete** — `automation_delete` with `confirm: true`. Removes the core instance,
  stops the add-on side, and drops pending post scripts.
- **Update** — `automation_update` merges config over the stored one and merges
  target fields, so `scripts` alone changes only scripts.

One instance per thread. A fire that lands on a busy thread is queued or
suppressed by the host (`busy`), never executed twice for the same run key.

## Actions

`automation_action` calls an operation declared by the kind. `input` is validated
against `inputSchema` and failures read `action input rejected: <path>: <reason>`.
Unknown ids produce `unknown action: <id>; available: <ids>`. Actions work on a
paused instance unless the action says otherwise; `test` on a paused webhook
returns `paused` and creates nothing.

Typical actions:

| add-on | action | returns |
| --- | --- | --- |
| webhook | `status` | token, endpointPath, auth, status, fires, lastFiredAt, lastError |
| webhook | `deliveries` | recent deliveries, `{ limit }` up to 200 |
| webhook | `test` | outcome and status of a synthetic delivery (origin `test`, bypasses dedupe and auth) |
| webhook | `rotate_url` | new token and endpointPath |
| webhook | `rotate_secret` | new signing secret, returned once |
| scheduler | `status` | cron, missPolicy, status, nextRunAt, lastFiredAt, lastError, target |
| scheduler | `check_cron` | `{ cron, timezone, valid, nextRunAt? }` |
| github | `status` | repo, filters, per-stream cursor (watermark, etag) and fire counters |
| github | `reset_watermark` | cleared streams; the next poll re-baselines silently |
| gmail | `status` | filters, per-account historyId watermark, pending count, fire counters |
| gmail | `reset_watermark` | cleared accounts; the next poll re-baselines to the current historyId |
| telegram feed | `status` | filters, per-channel watermark and stored post counts, fire counters |
| telegram feed | `reset_watermark` | cleared channels; first sight again, silent unless backfill is set |

`reset_watermark` never replays old events: the pollers re-baseline to the newest item. Use
it when a cursor is stuck or points at a deleted item, not to backfill history.

## Webhook ingress

The parsed request body is sent as the fire payload, so pre/post scripts receive it on
stdin. The public URL from `status.endpointPath` is served by the host's public add-on
route. `test` uses origin `test` and skips signature checks, dedupe and throttle —
use it to prove the fire path, and a real signed POST to prove ingress. Dedupe
(`dedupeWindowSec`), throttle (`throttleSec`) and `Idempotency-Key` handling apply
only to real deliveries, before the run is created, and are bounded by the kind's
`limits`.

## Troubleshooting

| symptom | cause |
| --- | --- |
| nothing fires | instance paused, gate unmatched, or the target thread kept a busy run |
| `test` returns `queued` | target thread busy; the run is dispatched when it frees |
| public URL 404s | the host must expose the public add-on route on its own base URL; `status` only returns the path |
| cron fires late | the scheduler ticks on an interval, so expect a delay up to the tick period |
