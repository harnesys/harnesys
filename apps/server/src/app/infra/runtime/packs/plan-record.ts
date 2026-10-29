import type { ThreadPlanRecord } from '@harnesys/studio-shared';
import type { PlanSnapshot } from 'harnesys';
import type { ThreadPlanRow } from '../../org-sqlite/schema/thread-plans.ts';

export function toRecord(
  threadId: string,
  snapshot: PlanSnapshot,
  row: ThreadPlanRow,
): ThreadPlanRecord {
  const createdAt = row.createdAt || row.updatedAt;
  return {
    id: snapshot.id,
    threadId,
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
