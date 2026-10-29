import { describe, expect, test } from 'bun:test';
import type { UsageMemberAggregateRow, UsageMemberNameRow } from './usage-port.ts';
import { byMemberOf } from './usage-port.ts';

const EMPTY_TOKENS = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
};

function memberRow(userId: string | null, costUsd: number): UsageMemberAggregateRow {
  return {
    startedByUserId: userId,
    ...EMPTY_TOKENS,
    inputTokens: 100,
    costUsd,
    runs: 2,
  };
}

describe('byMemberOf', () => {
  const names: UsageMemberNameRow[] = [
    { userId: 'u1', name: 'Alice' },
    { userId: 'u2', name: 'Bob' },
  ];

  test('maps display names and sorts by cost descending', () => {
    const rows = byMemberOf([memberRow('u2', 5), memberRow('u1', 12)], names);
    expect(rows.map((row) => row.name)).toEqual(['Alice', 'Bob']);
    expect(rows[0]?.costUsd).toBe(12);
    expect(rows[0]?.runs).toBe(2);
  });

  test('keeps unattributed runs with null userId and null name', () => {
    const rows = byMemberOf([memberRow('u1', 1), memberRow(null, 4)], names);
    expect(rows[0]?.userId).toBeNull();
    expect(rows[0]?.name).toBeNull();
  });

  test('leaves name null for users outside the org roster', () => {
    const rows = byMemberOf([memberRow('u9', 3)], names);
    expect(rows[0]?.userId).toBe('u9');
    expect(rows[0]?.name).toBeNull();
  });
});
