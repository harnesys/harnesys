import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { backfillThreadsResponderMode, CREATE_THREADS_SQL } from './org-sql.ts';

function open(): Database {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_THREADS_SQL);
  return sqlite;
}

function policyOf(sqlite: Database, id: string): Record<string, unknown> {
  const row = sqlite.query('select policy from threads where id = ?').get(id) as {
    policy: string;
  };
  return JSON.parse(row.policy) as Record<string, unknown>;
}

describe('backfillThreadsResponderMode', () => {
  test('marks legacy rows auto and keeps explicit values untouched', () => {
    const sqlite = open();
    sqlite.exec(
      `insert into threads (id, org_id, title, kind, policy, created_at, updated_at, last_read_at)
       values ('g1', 'o', 'Legacy group', 'group', '{"version":2}', '2026-01-01', '2026-01-01', '2026-01-01'),
              ('g2', 'o', 'Explicit group', 'group', '{"version":2,"responderMode":"mention"}', '2026-01-01', '2026-01-01', '2026-01-01'),
              ('c1', 'o', 'Chat', 'chat', '{"version":1}', '2026-01-01', '2026-01-01', '2026-01-01')`,
    );
    backfillThreadsResponderMode((sql) => sqlite.exec(sql));
    expect(policyOf(sqlite, 'g1').responderMode).toBe('auto');
    expect(policyOf(sqlite, 'g2').responderMode).toBe('mention');
    expect(policyOf(sqlite, 'c1').responderMode).toBe('auto');
  });
});
