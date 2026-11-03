import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import {
  codedRunError,
  type PendingSessionEvent,
  type RunCreateInput,
  type RunLifecycleStatus,
  type RunLifecycleStore,
  type RunRecord,
  type RunTransitionPatch,
} from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runsTable } from '../org-sqlite/schema/index.ts';
import type { RunEventAppendWithinTx } from './run-append-context.ts';
import {
  assertTransitionAllowed,
  createRunInTx,
  maxSeqOf,
  rowToRecord,
} from './sqlite-run-records.ts';

interface RunIdRow {
  run_id: string;
}

const DEFAULT_LIST_LIMIT = 50;
const DEFAULT_STALE_RUN_GRACE_MS = 60_000;
const RUN_NON_TERMINAL: RunLifecycleStatus[] = ['queued', 'running', 'needs_input', 'waiting'];

export class SqliteRunLifecycleStore implements RunLifecycleStore {
  constructor(
    private readonly db: OrgSqliteDb,
    private readonly appendWithinTx: RunEventAppendWithinTx,
  ) {}

  create(run: RunCreateInput, events: PendingSessionEvent[] = []): Promise<RunRecord> {
    try {
      return Promise.resolve(
        this.db.transaction(
          (tx) => createRunInTx(tx as OrgSqliteDb, this.appendWithinTx, run, events),
          { behavior: 'immediate' },
        ),
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }

  get(runId: string): Promise<RunRecord | null> {
    const row = this.db.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
    return Promise.resolve(row ? rowToRecord(row) : null);
  }

  activeByThread(threadId: string): Promise<RunRecord | null> {
    const row = this.db
      .select()
      .from(runsTable)
      .where(
        and(
          eq(runsTable.threadId, threadId),
          isNull(runsTable.parentRunId),
          inArray(runsTable.status, [...RUN_NON_TERMINAL]),
        ),
      )
      .orderBy(desc(runsTable.createdAt))
      .limit(1)
      .get();
    return Promise.resolve(row ? rowToRecord(row) : null);
  }

  childrenByParent(parentRunId: string): Promise<RunRecord[]> {
    return Promise.resolve(
      this.db
        .select()
        .from(runsTable)
        .where(eq(runsTable.parentRunId, parentRunId))
        .orderBy(asc(runsTable.createdAt))
        .all()
        .map(rowToRecord),
    );
  }

  claim(runId: string, instanceId: string, ttlMs: number): Promise<RunRecord | null> {
    const row = this.db
      .update(runsTable)
      .set({
        status: 'running',
        leaseInstanceId: instanceId,
        leaseExpiresAt: Date.now() + ttlMs,
        leaseEpoch: sql`lease_epoch + 1`,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(runsTable.runId, runId), eq(runsTable.status, 'queued')))
      .returning()
      .get();
    return Promise.resolve(row ? rowToRecord(row) : null);
  }

  transition(runId: string, expectedEpoch: number, patch: RunTransitionPatch): Promise<RunRecord> {
    return Promise.resolve(
      this.db.transaction(
        (tx) => {
          const current = tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
          if (!current) {
            throw codedRunError('unknown_run', `run ${runId} not found`);
          }
          const record = rowToRecord(current);
          assertTransitionAllowed(record, expectedEpoch, patch);
          const stored = this.appendWithinTx(
            tx as OrgSqliteDb,
            runId,
            record.threadId,
            patch.events ?? [],
            { park: patch.to === 'needs_input' },
          );
          const lastSeq = maxSeqOf(stored, record.lastSeq);
          let waitFireAt: number | null = record.waitFireAt ?? null;
          if (patch.waitFireAt === null) {
            waitFireAt = null;
          } else if (patch.waitFireAt !== undefined) {
            waitFireAt = patch.waitFireAt;
          }
          tx.update(runsTable)
            .set({
              status: patch.to,
              interruptId:
                patch.interruptId === null
                  ? null
                  : (patch.interruptId ?? record.interruptId ?? null),
              waitFireAt,
              attempt: patch.advanceAttempt ? record.attempt + 1 : record.attempt,
              leaseInstanceId: null,
              leaseExpiresAt: null,
              leaseEpoch: record.leaseEpoch + 1,
              lastSeq,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(runsTable.runId, runId))
            .run();
          const row = tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
          if (!row) {
            throw codedRunError('unknown_run', `run ${runId} not found`);
          }
          return rowToRecord(row);
        },
        { behavior: 'immediate' },
      ),
    );
  }

  renewLease(runId: string, instanceId: string, ttlMs: number): Promise<boolean> {
    const row = this.db.get<RunIdRow>(
      sql`UPDATE runs SET lease_expires_at = ${Date.now() + ttlMs}, updated_at = ${new Date().toISOString()} WHERE run_id = ${runId} AND lease_instance_id = ${instanceId} AND lease_epoch = (SELECT lease_epoch FROM runs WHERE run_id = ${runId}) RETURNING run_id`,
    );
    return Promise.resolve(row !== undefined);
  }

  listClaimable(opts?: { limit?: number; before?: string }): Promise<RunRecord[]> {
    const conditions = [eq(runsTable.status, 'queued'), isNull(runsTable.parentRunId)];
    if (opts?.before !== undefined) {
      conditions.push(gt(runsTable.createdAt, opts.before));
    }
    return Promise.resolve(
      this.db
        .select()
        .from(runsTable)
        .where(and(...conditions))
        .orderBy(asc(runsTable.createdAt))
        .limit(opts?.limit ?? DEFAULT_LIST_LIMIT)
        .all()
        .map(rowToRecord),
    );
  }

  listDueTimers(opts?: { limit?: number; now?: number }): Promise<RunRecord[]> {
    const now = opts?.now ?? Date.now();
    return Promise.resolve(
      this.db
        .select()
        .from(runsTable)
        .where(
          and(
            eq(runsTable.status, 'waiting'),
            sql`${runsTable.waitFireAt} IS NOT NULL`,
            lte(runsTable.waitFireAt, now),
          ),
        )
        .orderBy(asc(runsTable.waitFireAt))
        .limit(opts?.limit ?? DEFAULT_LIST_LIMIT)
        .all()
        .map(rowToRecord),
    );
  }

  listStaleRunning(opts?: {
    limit?: number;
    now?: number;
    graceMs?: number;
  }): Promise<RunRecord[]> {
    const now = opts?.now ?? Date.now();
    const grace = opts?.graceMs ?? DEFAULT_STALE_RUN_GRACE_MS;
    const cutoffIso = new Date(now - grace).toISOString();
    return Promise.resolve(
      this.db
        .select()
        .from(runsTable)
        .where(
          and(
            eq(runsTable.status, 'running'),
            isNull(runsTable.parentRunId),
            sql`(${runsTable.leaseExpiresAt} IS NULL OR ${runsTable.leaseExpiresAt} < ${now - grace})`,
            lt(runsTable.updatedAt, cutoffIso),
          ),
        )
        .orderBy(asc(runsTable.updatedAt))
        .limit(opts?.limit ?? DEFAULT_LIST_LIMIT)
        .all()
        .map(rowToRecord),
    );
  }
}
