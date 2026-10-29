import type {
  BoardRuleRecord,
  BoardRuleWrite,
  BoardStatus,
  BoardStatusInput,
  IssueBoardInsert,
  IssueBoardPatch,
  IssueBoardRecord,
} from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import type {
  IssueLabelInsert,
  IssueLabelPatch,
  IssueLabelRecord,
} from '../../domain/issue/label.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import type {
  ScheduleFireRecord,
  ScheduleInsert,
  ScheduleRecord,
} from '../../domain/schedule/schedule.ts';
import { ScheduleRepositoryPort } from '../../domain/schedule/schedule-repository.port.ts';
import type { ThreadActiveRun, ThreadInsert, ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export class FakeBoards extends IssueBoardRepositoryPort {
  readonly items = new Map<string, IssueBoardRecord>();
  readonly rules = new Map<string, BoardRuleRecord[]>();
  failInsert = false;

  listByOrg(orgId: string): IssueBoardRecord[] {
    return [...this.items.values()].filter((board) => board.orgId === orgId);
  }

  findById(orgId: string, id: string): IssueBoardRecord | undefined {
    return this.listByOrg(orgId).find((board) => board.id === id);
  }

  insert(rec: IssueBoardInsert): IssueBoardRecord {
    if (this.failInsert) {
      throw new Error('board insert failed');
    }
    const record: IssueBoardRecord = { ...rec, rules: [] };
    this.items.set(rec.id, record);
    return { ...record };
  }

  update(orgId: string, id: string, patch: IssueBoardPatch): IssueBoardRecord {
    const current = this.findById(orgId, id);
    if (!current) {
      throw new Error('board not found');
    }
    const next = { ...current, ...patch };
    this.items.set(id, next);
    return next;
  }

  delete(_orgId: string, id: string): void {
    this.items.delete(id);
    this.rules.delete(id);
  }

  addStatus(_orgId: string, boardId: string, input: BoardStatusInput): BoardStatus {
    const board = this.items.get(boardId);
    if (!board) {
      throw new Error('board not found');
    }
    const status: BoardStatus = {
      key: input.key ?? `status-${board.statuses.length}`,
      label: input.label ?? input.key ?? 'Status',
      category: input.category ?? 'backlog',
      order: input.order ?? board.statuses.length,
      ...(input.color !== undefined ? { color: input.color } : {}),
      isEntry: input.isEntry ?? false,
    };
    board.statuses = [...board.statuses, status];
    return status;
  }

  updateStatus(_orgId: string, boardId: string, key: string, input: BoardStatusInput): BoardStatus {
    const board = this.items.get(boardId);
    if (!board) {
      throw new Error('board not found');
    }
    const existing = board.statuses.find((status) => status.key === key);
    if (!existing) {
      throw new Error(`status not found: ${key}`);
    }
    const merged: BoardStatus = {
      key: existing.key,
      label: input.label ?? existing.label,
      category: input.category ?? existing.category,
      order: input.order ?? existing.order,
      color: input.color ?? existing.color,
      isEntry: input.isEntry ?? existing.isEntry,
    };
    board.statuses = board.statuses.map((status) => (status.key === key ? merged : status));
    return merged;
  }

  removeStatus(_orgId: string, boardId: string, key: string): void {
    const board = this.items.get(boardId);
    if (!board) {
      throw new Error('board not found');
    }
    board.statuses = board.statuses.filter((status) => status.key !== key);
  }

  reorderStatuses(_orgId: string, boardId: string, order: string[]): void {
    const board = this.items.get(boardId);
    if (!board) {
      throw new Error('board not found');
    }
    board.statuses = order.map((key, index) => {
      const status = board.statuses.find((item) => item.key === key);
      if (!status) {
        throw new Error(`status not found: ${key}`);
      }
      return { ...status, order: index };
    });
  }

  saveRule(_orgId: string, boardId: string, input: BoardRuleWrite): BoardRuleRecord {
    const current = this.rules.get(boardId) ?? [];
    const record: BoardRuleRecord = {
      id: input.id ?? crypto.randomUUID(),
      trigger: input.trigger,
      conditions: input.conditions,
      actions: input.actions,
      position: input.position,
      enabled: input.enabled,
      createdByUserId: input.createdByUserId ?? null,
    };
    const next = input.id
      ? current.map((rule) => (rule.id === input.id ? record : rule))
      : [...current, record];
    this.rules.set(boardId, next);
    const board = this.items.get(boardId);
    if (board) {
      board.rules = next;
    }
    return record;
  }

  removeRule(_orgId: string, boardId: string, ruleId: string): void {
    const board = this.items.get(boardId);
    const next = (this.rules.get(boardId) ?? []).filter((rule) => rule.id !== ruleId);
    this.rules.set(boardId, next);
    if (board) {
      board.rules = next;
    }
  }

  reorderRules(_orgId: string, boardId: string, order: string[]): void {
    const current = this.rules.get(boardId) ?? [];
    const next = order.map((id, index) => {
      const rule = current.find((item) => item.id === id);
      if (!rule) {
        throw new Error(`rule not found: ${id}`);
      }
      return { ...rule, position: index };
    });
    this.rules.set(boardId, next);
    const board = this.items.get(boardId);
    if (board) {
      board.rules = next;
    }
  }
}

export class FakeLabels extends IssueLabelRepositoryPort {
  listByOrg(): IssueLabelRecord[] {
    return [];
  }

  findById(): IssueLabelRecord | undefined {
    return undefined;
  }

  insert(_rec: IssueLabelInsert): IssueLabelRecord {
    throw new Error('not implemented');
  }

  update(_orgId: string, _id: string, _patch: IssueLabelPatch): IssueLabelRecord {
    throw new Error('not implemented');
  }

  delete(): void {}
}

export class FakeEvents extends IssueEventsPort {
  subscribe(): () => void {
    return () => {};
  }

  emit(): void {}
}

export class FakeSchedules extends ScheduleRepositoryPort {
  readonly items = new Map<string, ScheduleRecord>();

  listByOrg(): ScheduleRecord[] {
    return [...this.items.values()];
  }

  listDue(): ScheduleRecord[] {
    return [];
  }

  findById(_orgId: string, id: string): ScheduleRecord | undefined {
    return this.items.get(id);
  }

  findByThreadId(): ScheduleRecord | undefined {
    return undefined;
  }

  listFiresBySchedule(): ScheduleFireRecord[] {
    return [];
  }

  insert(rec: ScheduleInsert): ScheduleRecord {
    this.items.set(rec.id, rec);
    return rec;
  }

  update(): ScheduleRecord {
    throw new Error('not implemented');
  }

  delete(): void {}
  claimFire(): boolean {
    return false;
  }

  recordFireRun(): void {}
  releaseFire(): void {}
}

export class FakeThreads extends ThreadRepositoryPort {
  readonly items = new Map<string, ThreadRecord>();

  listByOrg(): ThreadRecord[] {
    return [...this.items.values()];
  }

  listActiveRuns(): ThreadActiveRun[] {
    return [];
  }

  findActiveRun(): ThreadActiveRun | undefined {
    return undefined;
  }

  findById(_orgId: string, id: string): ThreadRecord | undefined {
    return this.items.get(id);
  }

  insert(rec: ThreadInsert): ThreadRecord {
    this.items.set(rec.id, rec);
    return rec;
  }

  patch(): ThreadRecord {
    throw new Error('not implemented');
  }

  markRead(): ThreadRecord {
    throw new Error('not implemented');
  }

  updateTitle(): ThreadRecord {
    throw new Error('not implemented');
  }

  touch(): void {}
  delete(): void {}
  deleteByAgent(): void {}
  listByIssue(): ThreadRecord[] {
    return [];
  }

  findByIssueAndAgent(): ThreadRecord | undefined {
    return undefined;
  }

  threadIdsWithRuns(): Set<string> {
    return new Set();
  }
}
