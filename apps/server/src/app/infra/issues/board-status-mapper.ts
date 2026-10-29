import type { BoardStatus, BoardStatusInput } from '@harnesys/contracts';
import { BoardValidationException } from '../../domain/issue/board.error.ts';
import type { BoardStatusRow } from '../org-sqlite/schema/index.ts';

export function toStatus(row: BoardStatusRow): BoardStatus {
  return {
    key: row.key,
    label: row.label,
    category: row.category,
    order: row.order,
    ...(row.color !== null ? { color: row.color } : {}),
    isEntry: row.isEntry,
  };
}

export function toStatusRow(boardId: string, status: BoardStatus) {
  return {
    id: crypto.randomUUID(),
    boardId,
    key: status.key,
    label: status.label,
    category: status.category,
    order: status.order,
    color: status.color ?? null,
    isEntry: status.isEntry,
  };
}

export function toStatusPatch(status: BoardStatus) {
  return {
    label: status.label,
    category: status.category,
    order: status.order,
    color: status.color ?? null,
    isEntry: status.isEntry,
  };
}

export function buildStatus(current: BoardStatus[], input: BoardStatusInput): BoardStatus {
  const key = requireStatusKey(input);
  const label = requireStatusLabel(input);
  assertUniqueKey(current, key);
  return {
    key,
    label,
    category: input.category ?? 'backlog',
    order: input.order ?? nextOrder(current),
    ...(input.color === undefined ? {} : { color: input.color }),
    isEntry: input.isEntry ?? false,
  };
}

export function requireStatus(current: BoardStatus[], key: string): BoardStatus {
  const existing = current.find((status) => status.key === key);
  if (!existing) {
    throw new BoardValidationException([{ field: 'statuses', code: 'unknown-key', key }]);
  }
  return existing;
}

export function assertImmutableKey(input: BoardStatusInput, key: string): void {
  if (input.key !== undefined && input.key !== key) {
    throw new BoardValidationException([{ field: 'statuses', code: 'immutable-key', key }]);
  }
}

export function mergeStatus(existing: BoardStatus, input: BoardStatusInput): BoardStatus {
  return {
    key: existing.key,
    label: input.label ?? existing.label,
    category: input.category ?? existing.category,
    order: input.order ?? existing.order,
    color: input.color ?? existing.color,
    isEntry: input.isEntry ?? existing.isEntry,
  };
}

export function entryKeyOf(status: BoardStatus): string | undefined {
  return status.isEntry ? status.key : undefined;
}

export function applyEntryExclusive(statuses: BoardStatus[], winnerKey?: string): BoardStatus[] {
  const winner =
    statuses.find((status) => status.key === winnerKey && status.isEntry) ??
    statuses.find((status) => status.isEntry);
  if (!winner) {
    return statuses;
  }
  return statuses.map((status) =>
    status.isEntry && status.key !== winner.key ? { ...status, isEntry: false } : status,
  );
}

export function nextOrder(statuses: BoardStatus[]): number {
  return statuses.reduce((max, status) => Math.max(max, status.order), -1) + 1;
}

function requireStatusKey(input: BoardStatusInput): string {
  if (!input.key) {
    throw new BoardValidationException([{ field: 'statuses', code: 'missing-key' }]);
  }
  return input.key;
}

function requireStatusLabel(input: BoardStatusInput): string {
  if (input.label === undefined) {
    throw new BoardValidationException([{ field: 'statuses', code: 'empty-label' }]);
  }
  return input.label;
}

function assertUniqueKey(current: BoardStatus[], key: string): void {
  if (current.some((status) => status.key === key)) {
    throw new BoardValidationException([{ field: 'statuses', code: 'dup-key', key }]);
  }
}
