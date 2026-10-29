import type { ScheduleMissPolicy } from './schedule.ts';

export type DueAction = 'fire' | 'miss_stale' | 'miss_offline' | 'wait';

export interface DueDecision {
  action: DueAction;
  fireId?: string;
  needsInbox?: boolean;
}

export interface DecideDueInput {
  now: Date;
  nextDueAt: Date;
  catchupWindowSec: number;
  nodeOnline: boolean;
  missPolicy?: ScheduleMissPolicy;
  scheduleId?: string;
}

export function scheduleFireId(scheduleId: string, scheduledFor: Date): string {
  return `schedule:${scheduleId}:${scheduledFor.toISOString()}`;
}

export function decideDue(input: DecideDueInput): DueDecision {
  if (input.nextDueAt.getTime() > input.now.getTime()) {
    return { action: 'wait' };
  }
  const policy = input.missPolicy ?? 'catch-up';
  const windowSec = policy === 'catch-up' ? input.catchupWindowSec : 0;
  if (input.now.getTime() - input.nextDueAt.getTime() > windowSec * 1000) {
    return {
      action: 'miss_stale',
      needsInbox: policy === 'escalate',
    };
  }
  if (!input.nodeOnline) {
    if (policy === 'catch-up') {
      return {
        action: 'fire',
        fireId: input.scheduleId ? scheduleFireId(input.scheduleId, input.nextDueAt) : undefined,
      };
    }
    return {
      action: 'miss_offline',
      needsInbox: policy === 'escalate',
    };
  }
  return {
    action: 'fire',
    fireId: input.scheduleId ? scheduleFireId(input.scheduleId, input.nextDueAt) : undefined,
  };
}

export interface PlannedDue<Row> {
  row: Row;
  decision: DueDecision;
}

export interface PlanDueBatchInput<Row> {
  now: Date;
  catchupWindowSec: number;
  catchupBatch: number;
  dueAtOf(row: Row): Date;
  onlineOf(row: Row): boolean;
  missPolicyOf?(row: Row): ScheduleMissPolicy;
  scheduleIdOf?(row: Row): string;
}

export interface PlannedBatch<Row> {
  planned: PlannedDue<Row>[];
  remainder: number;
}

export function planDueBatch<Row>(rows: Row[], input: PlanDueBatchInput<Row>): PlannedBatch<Row> {
  const planned: PlannedDue<Row>[] = [];
  let fires = 0;
  for (const row of rows) {
    const decision = decideDue({
      now: input.now,
      nextDueAt: input.dueAtOf(row),
      catchupWindowSec: input.catchupWindowSec,
      nodeOnline: input.onlineOf(row),
      missPolicy: input.missPolicyOf?.(row) ?? 'catch-up',
      scheduleId: input.scheduleIdOf?.(row),
    });
    if (decision.action === 'fire') {
      if (fires >= input.catchupBatch) {
        break;
      }
      fires += 1;
    }
    planned.push({ row, decision });
  }
  return { planned, remainder: rows.length - planned.length };
}
