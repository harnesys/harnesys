import { and, inArray, isNull, sql } from 'drizzle-orm';
import type { RunLifecycleStore, RunRecord } from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runsTable } from '../org-sqlite/schema/index.ts';

export interface RecoverOrphanedRunsDeps {
  db: OrgSqliteDb;
  lifecycle: RunLifecycleStore;
}

const ORPHAN_STATUSES = ['running'] as const;
const CHILD_NON_TERMINAL = ['queued', 'running', 'needs_input', 'waiting'];
const RECOVERY_LIMIT = 500;
const RESUME_EVENT = {
  type: 'run.resumed',
  message: 'server restarted; resuming from last checkpoint',
} as const;

export function isOrphanedParentStatus(status: string): boolean {
  return status === 'running';
}

export async function recoverOrphanedRuns(deps: RecoverOrphanedRunsDeps): Promise<number> {
  sweepTerminalSnapshots(deps.db);
  const rows = deps.db
    .select({ runId: runsTable.runId, threadId: runsTable.threadId })
    .from(runsTable)
    .where(and(isNull(runsTable.parentRunId), inArray(runsTable.status, ORPHAN_STATUSES)))
    .limit(RECOVERY_LIMIT)
    .all();
  let resumed = 0;
  for (const row of rows) {
    resumed += await resumeOrphan(deps, row.runId, row.threadId);
  }
  return resumed;
}

function sweepTerminalSnapshots(db: OrgSqliteDb): void {
  db.run(
    sql`DELETE FROM run_snapshots WHERE run_id IN (SELECT run_id FROM runs WHERE status IN ('completed', 'failed', 'cancelled'))`,
  );
}

async function resumeOrphan(
  deps: RecoverOrphanedRunsDeps,
  runId: string,
  threadId: string,
): Promise<number> {
  try {
    const rec = await deps.lifecycle.get(runId);
    if (!rec || rec.parentRunId || rec.status !== 'running') {
      return 0;
    }
    const active = await deps.lifecycle.activeByThread(threadId);
    if (active && active.runId !== rec.runId) {
      await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
        from: rec.status,
        to: 'failed',
        interruptId: null,
        waitFireAt: null,
        events: [
          {
            type: 'run.failed',
            message: 'superseded by newer run',
          },
        ],
      });
      await failChildren(deps, rec.runId, 'superseded by newer run');
      return 0;
    }
    await requeue(deps, rec);
    await failChildren(deps, rec.runId, 'superseded by respawn');
    return 1;
  } catch {
    return 0;
  }
}

async function requeue(deps: RecoverOrphanedRunsDeps, rec: RunRecord): Promise<void> {
  await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
    from: rec.status,
    to: 'queued',
    advanceAttempt: true,
    interruptId: null,
    waitFireAt: null,
    events: [RESUME_EVENT],
  });
}

async function failChildren(
  deps: RecoverOrphanedRunsDeps,
  parentRunId: string,
  reason: string,
): Promise<void> {
  const children = await deps.lifecycle.childrenByParent(parentRunId).catch(() => []);
  for (const child of children) {
    if (!CHILD_NON_TERMINAL.includes(child.status)) {
      continue;
    }
    await deps.lifecycle
      .transition(child.runId, child.leaseEpoch, {
        from: child.status,
        to: 'failed',
        interruptId: null,
        waitFireAt: null,
        events: [
          {
            type: 'run.failed',
            message: reason,
          },
        ],
      })
      .catch(() => null);
  }
}
