import type { ThreadPlanRecord } from '@harnesys/studio-shared';
import type { PlanSnapshot } from 'harnesys';
import { toSnapshot } from '../../domain/threads/plan-snapshot.ts';
import type { ThreadPlanRow } from '../../domain/threads/thread-plan-row.ts';

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
