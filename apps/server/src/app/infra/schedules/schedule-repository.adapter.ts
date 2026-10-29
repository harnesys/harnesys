import { Injectable } from '@harnesys/brix';
import type { ScheduleHistory, ScheduleMissPolicy, ScheduleStatus } from '@harnesys/contracts';
import { and, asc, desc, eq, isNotNull, lte } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  ScheduleNotFoundException,
  ScheduleValidationException,
} from '../../domain/schedule/schedule.error.ts';
import type {
  ScheduleFireRecord,
  ScheduleInsert,
  SchedulePatch,
  ScheduleRecord,
} from '../../domain/schedule/schedule.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  type ScheduleFireRow,
  type ScheduleRow,
  scheduleFiresTable,
  schedulesTable,
} from '../org-sqlite/schema/index.ts';

@Injectable()
export class ScheduleRepositoryAdapter extends ScheduleRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByOrg(orgId: string): ScheduleRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.select().from(schedulesTable).where(eq(schedulesTable.orgId, orgId)).all().map(toSchedule),
    );
  }

  listDue(orgId: string, nowIso: string): ScheduleRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(schedulesTable)
        .where(
          and(
            eq(schedulesTable.orgId, orgId),
            eq(schedulesTable.status, 'active'),
            isNotNull(schedulesTable.nextRunAt),
            lte(schedulesTable.nextRunAt, nowIso),
          ),
        )
        .orderBy(asc(schedulesTable.nextRunAt))
        .all()
        .map(toSchedule),
    );
  }

  findById(orgId: string, id: string): ScheduleRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(schedulesTable)
        .where(and(eq(schedulesTable.orgId, orgId), eq(schedulesTable.id, id)))
        .get();
      return row ? toSchedule(row) : undefined;
    });
  }

  findByThreadId(orgId: string, threadId: string): ScheduleRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(schedulesTable)
        .where(and(eq(schedulesTable.orgId, orgId), eq(schedulesTable.threadId, threadId)))
        .get();
      return row ? toSchedule(row) : undefined;
    });
  }

  listFiresBySchedule(orgId: string, scheduleId: string): ScheduleFireRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(scheduleFiresTable)
        .where(eq(scheduleFiresTable.scheduleId, scheduleId))
        .orderBy(desc(scheduleFiresTable.createdAt))
        .all()
        .map(toFire),
    );
  }

  insert(rec: ScheduleInsert): ScheduleRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      try {
        const row = db
          .insert(schedulesTable)
          .values({
            id: rec.id,
            orgId: rec.orgId,
            name: rec.name,
            status: rec.status,
            targetAgentId: rec.targetAgentId,
            detail: rec.detail,
            cron: rec.cron,
            modeId: rec.modeId,
            history: rec.history,
            historyLast: rec.historyLast,
            missPolicy: rec.missPolicy,
            threadId: rec.threadId,
            nextRunAt: rec.nextRunAt,
            lastFiredAt: rec.lastFiredAt,
            createdByUserId: rec.createdByUserId,
            createdAt: rec.createdAt,
            updatedAt: rec.updatedAt,
          })
          .returning()
          .get();
        return toSchedule(row);
      } catch (err) {
        throw mapScheduleSqliteError(err);
      }
    });
  }

  update(orgId: string, id: string, patch: SchedulePatch): ScheduleRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      try {
        const row = db
          .update(schedulesTable)
          .set(patch)
          .where(and(eq(schedulesTable.orgId, orgId), eq(schedulesTable.id, id)))
          .returning()
          .get();
        if (!row) {
          throw new ScheduleNotFoundException(id);
        }
        return toSchedule(row);
      } catch (err) {
        if (err instanceof ScheduleNotFoundException) {
          throw err;
        }
        throw mapScheduleSqliteError(err);
      }
    });
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(schedulesTable)
        .where(and(eq(schedulesTable.orgId, orgId), eq(schedulesTable.id, id)))
        .run();
    });
  }

  claimFire(orgId: string, fireId: string, scheduleId: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const inserted = db
        .insert(scheduleFiresTable)
        .values({
          fireId,
          scheduleId,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .returning({ fireId: scheduleFiresTable.fireId })
        .get();
      return inserted !== undefined;
    });
  }

  recordFireRun(orgId: string, fireId: string, runId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(scheduleFiresTable)
        .set({ runId })
        .where(eq(scheduleFiresTable.fireId, fireId))
        .run();
    });
  }

  releaseFire(orgId: string, fireId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(scheduleFiresTable).where(eq(scheduleFiresTable.fireId, fireId)).run();
    });
  }
}

function toSchedule(row: ScheduleRow): ScheduleRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    status: row.status as ScheduleStatus,
    targetAgentId: row.targetAgentId,
    detail: row.detail,
    cron: row.cron,
    modeId: row.modeId,
    history: (row.history || 'none') as ScheduleHistory,
    historyLast: row.historyLast > 0 ? row.historyLast : 1,
    missPolicy: (row.missPolicy || 'catch-up') as ScheduleMissPolicy,
    threadId: row.threadId,
    nextRunAt: row.nextRunAt,
    lastFiredAt: row.lastFiredAt,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toFire(row: ScheduleFireRow): ScheduleFireRecord {
  return {
    fireId: row.fireId,
    scheduleId: row.scheduleId,
    runId: row.runId,
    createdAt: row.createdAt,
  };
}

function mapScheduleSqliteError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('UNIQUE') && message.includes('thread')) {
    throw new ScheduleValidationException('thread already has a schedule');
  }
  if (message.includes('FOREIGN KEY') || message.includes('constraint')) {
    throw new ScheduleValidationException('invalid schedule reference');
  }
  throw err instanceof Error ? err : new Error(message);
}
