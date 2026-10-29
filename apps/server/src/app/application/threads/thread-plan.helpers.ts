import type { ThreadPlanRecord } from '@harnesys/studio-shared';
import type { PlanSnapshot } from 'harnesys';
import type { ThreadPlanRow } from '../../infra/org-sqlite/schema/thread-plans.ts';
import { toSnapshot } from '../../infra/runtime/packs/plan-snapshot.ts';

export function snapshotOfRow(row: ThreadPlanRow): ThreadPlanRecord | null {
  const snapshot: PlanSnapshot | null = toSnapshot(row);
  if (!snapshot) {
    return null;
  }
  const createdAt = row.createdAt || row.updatedAt;
  return {
    id: snapshot.id,
    threadId: row.threadId,
    status: snapshot.status,
    overview: snapshot.overview,
    items: snapshot.items.map((item) => ({
      ...item,
      planId: snapshot.id,
      createdAt,
      updatedAt: row.updatedAt,
    })),
    createdAt,
    updatedAt: row.updatedAt,
  };
}
