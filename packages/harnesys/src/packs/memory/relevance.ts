import type { MemoryRecordSource } from '../../ports/memory.ts';

export interface ScoredFact {
  importance: number;
  updatedAt: string;
  accessCount: number;
}

const MS_PER_DAY = 86_400_000;

export function relevanceScore(fact: ScoredFact, nowMs: number, halfLifeDays: number): number {
  const parsed = Date.parse(fact.updatedAt);
  const ageDays = Number.isNaN(parsed) ? 0 : Math.max(0, (nowMs - parsed) / MS_PER_DAY);
  return fact.importance * 0.5 ** (ageDays / halfLifeDays) * (1 + Math.log(1 + fact.accessCount));
}

export function formatFactLine(
  record: { text: string; source: MemoryRecordSource },
  clipChars: number,
): string {
  const label = record.source === 'compaction' ? '[system]' : `[${record.source}]`;
  const text = record.text.length > clipChars ? `${record.text.slice(0, clipChars)}…` : record.text;
  return `${label} ${text}`;
}
