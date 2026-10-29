import { eq, isNull, or } from 'drizzle-orm';
import type { MemoryRecord, MemoryRecordSource, MemoryScopeId, SemanticScope } from 'harnesys';
import { type MemoryFactRow, memoryFactsTable } from '../../org-sqlite/schema/agent-memory.ts';

export function threadOf(threadId: string | undefined) {
  return threadId === undefined
    ? isNull(memoryFactsTable.threadId)
    : eq(memoryFactsTable.threadId, threadId);
}

export function idOrder(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function visibilityOf(scopeId: MemoryScopeId) {
  return or(eq(memoryFactsTable.scope, 'long'), threadOf(scopeId.threadId));
}

export function toMemoryRecord(row: MemoryFactRow): MemoryRecord {
  return {
    id: row.id,
    scope: toSemanticScope(row.scope),
    text: row.text,
    key: row.key ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: toMemorySource(row.source),
    threadId: row.threadId ?? undefined,
    accessCount: row.accessCount,
    lastAccessedAt: row.lastAccessedAt,
  };
}

export function toSemanticScope(value: string): SemanticScope {
  return value === 'long' ? 'long' : 'session';
}

export function toMemorySource(value: string): MemoryRecordSource {
  return value === 'human' || value === 'compaction' ? value : 'agent';
}
