import type { PlanItem, PlanItemStatus, PlanSnapshot, PlanStatus, SubagentRole } from 'harnesys';
import { PLAN_ITEM_STATUSES, PLAN_STATUSES } from 'harnesys';
import type { ThreadPlanRow } from '../../org-sqlite/schema/thread-plans.ts';

export function toSnapshot(row: ThreadPlanRow): PlanSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.snapshotJson) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.overview !== 'string') {
    return null;
  }
  if (!isPlanStatus(record.status) || !Array.isArray(record.items)) {
    return null;
  }
  const items: PlanItem[] = [];
  for (const entry of record.items) {
    const item = toPlanItemOrNull(entry);
    if (!item) {
      return null;
    }
    items.push(item);
  }
  return { id: record.id, status: record.status, overview: record.overview, items };
}

function toPlanItemOrNull(entry: unknown): PlanItem | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.order !== 'number' ||
    typeof record.title !== 'string' ||
    typeof record.description !== 'string' ||
    !isPlanItemStatus(record.status)
  ) {
    return null;
  }
  return {
    id: record.id,
    order: record.order,
    title: record.title,
    description: record.description,
    status: record.status,
    subagentRole: toSubagentRole(record.subagentRole),
    resultNote: typeof record.resultNote === 'string' ? record.resultNote : null,
  };
}

function toSubagentRole(value: unknown): SubagentRole | null {
  return value === 'explore' || value === 'coder' || value === 'verifier' || value === 'general'
    ? value
    : null;
}

function isPlanStatus(value: unknown): value is PlanStatus {
  return typeof value === 'string' && (PLAN_STATUSES as readonly string[]).includes(value);
}

function isPlanItemStatus(value: unknown): value is PlanItemStatus {
  return typeof value === 'string' && (PLAN_ITEM_STATUSES as readonly string[]).includes(value);
}
