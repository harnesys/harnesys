Every schedule is a trigger instance bound to a thread. The planner ticks every minute, fires due schedules with run-level deduplication, and applies the missed-run policy:

- **Catch-up** — fires runs missed within the last hour.
- **Skip** — drops them.
- **Escalate** — drops them and opens an approval inbox item.

An invalid cron expression, or a thread that cannot run, marks the schedule as failed.

Pausing a schedule is a pause, not a delete: `trigger.stop` with `reason: 'paused'` keeps the row, sets `status = 'paused'` and clears `next_run_at`, so the schedule stays visible with its last fire time. Resuming (`trigger.start`) recomputes the next run and keeps `last_fired_at`. Only `reason: 'removed'` deletes the schedule rows. Agents manage the instance through the core `automations` pack (`automation_set_enabled`, `automation_action` with `status` / `check_cron`), so the add-on status never diverges from the instance state.
