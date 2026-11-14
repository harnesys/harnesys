Every schedule is a trigger instance bound to a thread. The planner ticks every minute, fires due schedules with run-level deduplication, and applies the missed-run policy:

- **Catch-up** — fires runs missed within the last hour.
- **Skip** — drops them.
- **Escalate** — drops them and opens an approval inbox item.

An invalid cron expression, or a thread that cannot run, marks the schedule as failed.
