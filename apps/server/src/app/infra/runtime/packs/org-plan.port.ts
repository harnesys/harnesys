import { and, eq } from 'drizzle-orm';
import type {
  CapabilityScope,
  PlanItem,
  PlanItemStatus,
  PlanPort,
  PlanSaveItemInput,
  PlanSnapshot,
  PlanStatus,
} from 'harnesys';
import type { PlanEventsPort } from '../../../domain/plan/plan-events.port.ts';
import type { OrgSqliteDb } from '../../org-sqlite/org-sqlite-session.ts';
import { type ThreadPlanRow, threadPlansTable } from '../../org-sqlite/schema/thread-plans.ts';
import { toRecord } from './plan-record.ts';
import { toSnapshot } from './plan-snapshot.ts';

export class OrgPlanPort implements PlanPort {
  constructor(
    private readonly db: OrgSqliteDb,
    private readonly events?: PlanEventsPort,
  ) {}

  save(
    scope: CapabilityScope,
    input: { overview: string; items: PlanSaveItemInput[]; status?: PlanStatus },
  ): Promise<PlanSnapshot> {
    const now = new Date().toISOString();
    const snapshot: PlanSnapshot = {
      id: crypto.randomUUID(),
      status: input.status ?? 'draft',
      overview: input.overview,
      items: input.items.map((item, index) => toPlanItem(item, index)),
    };
    const snapshotJson = JSON.stringify(snapshot);
    this.db
      .insert(threadPlansTable)
      .values({
        orgId: scope.orgId,
        threadId: scope.threadId,
        snapshotJson,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: threadPlansTable.threadId,
        set: { orgId: scope.orgId, snapshotJson, updatedAt: now },
      })
      .run();
    this.emitSaved(scope, snapshot);
    return Promise.resolve(snapshot);
  }

  updateItem(
    scope: CapabilityScope,
    input: { planId: string; itemId: string; status: PlanItemStatus; resultNote?: string | null },
  ): Promise<PlanSnapshot> {
    const current = this.readSnapshot(scope);
    if (!current || current.id !== input.planId) {
      throw new Error(`plan not found for thread ${scope.threadId}`);
    }
    const target = current.items.find((item) => item.id === input.itemId);
    if (!target) {
      throw new Error(`plan item ${input.itemId} not found for thread ${scope.threadId}`);
    }
    const next: PlanSnapshot = {
      ...current,
      items: current.items.map((item) =>
        item.id === target.id
          ? {
              ...item,
              status: input.status,
              resultNote: input.resultNote === undefined ? item.resultNote : input.resultNote,
            }
          : item,
      ),
    };
    this.db
      .update(threadPlansTable)
      .set({ snapshotJson: JSON.stringify(next), updatedAt: new Date().toISOString() })
      .where(
        and(eq(threadPlansTable.orgId, scope.orgId), eq(threadPlansTable.threadId, scope.threadId)),
      )
      .run();
    this.emitSaved(scope, next);
    return Promise.resolve(next);
  }

  get(scope: CapabilityScope): Promise<PlanSnapshot | null> {
    return Promise.resolve(this.readSnapshot(scope));
  }

  delete(scope: CapabilityScope): Promise<{ deleted: boolean }> {
    const current = this.readSnapshot(scope);
    if (!current) {
      return Promise.resolve({ deleted: false });
    }
    this.db
      .delete(threadPlansTable)
      .where(
        and(eq(threadPlansTable.orgId, scope.orgId), eq(threadPlansTable.threadId, scope.threadId)),
      )
      .run();
    this.events?.emit(scope.orgId, { type: 'deleted', threadId: scope.threadId });
    return Promise.resolve({ deleted: true });
  }

  private emitSaved(scope: CapabilityScope, snapshot: PlanSnapshot): void {
    if (!this.events) {
      return;
    }
    const row = this.readRow(scope);
    if (!row) {
      return;
    }
    this.events.emit(scope.orgId, { type: 'saved', plan: toRecord(scope.threadId, snapshot, row) });
  }

  private readRow(scope: CapabilityScope): ThreadPlanRow | null {
    return (
      this.db
        .select()
        .from(threadPlansTable)
        .where(
          and(
            eq(threadPlansTable.orgId, scope.orgId),
            eq(threadPlansTable.threadId, scope.threadId),
          ),
        )
        .get() ?? null
    );
  }

  private readSnapshot(scope: CapabilityScope): PlanSnapshot | null {
    const row = this.readRow(scope);
    return row ? toSnapshot(row) : null;
  }
}

function toPlanItem(item: PlanSaveItemInput, index: number): PlanItem {
  return {
    id: crypto.randomUUID(),
    order: index,
    title: item.title,
    description: item.description,
    status: 'pending',
    subagentRole: item.subagentRole ?? null,
    resultNote: null,
  };
}
