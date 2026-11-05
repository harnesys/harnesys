import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { SessionEvent } from 'harnesys';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import * as schema from '../org-sqlite/schema/index.ts';
import { threadsTable } from '../org-sqlite/schema/index.ts';
import { observeThreadErrors } from './observe-thread-errors.ts';

function setup(): OrgSqliteDb {
  const sqlite = new Database(':memory:');
  ensureOrgSchema((sql) => sqlite.exec(sql));
  const db = drizzle(sqlite, { schema });
  db.insert(threadsTable)
    .values({
      id: 'thread-1',
      orgId: 'org-1',
      title: 't',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    })
    .run();
  return db;
}

describe('observeThreadErrors', () => {
  test('surfaces every recognized event in a batch, not only the first', () => {
    const db = setup();
    const events = [
      { type: 'run.failed', runId: 'run-1', seq: 1, message: 'boom' },
      { type: 'done', runId: 'run-1', seq: 2 },
    ] as SessionEvent[];
    const observed = observeThreadErrors(db, 'thread-1', 'run-1', events);
    expect(observed.map((event) => event.type)).toEqual(['failed', 'finished']);
  });

  test('records lastError for a failed run', () => {
    const db = setup();
    observeThreadErrors(db, 'thread-1', 'run-1', [
      { type: 'run.failed', runId: 'run-1', seq: 1, message: 'boom' },
    ] as SessionEvent[]);
    const row = db.select().from(threadsTable).get();
    expect(row?.metadata).toContain('"message":"boom"');
  });
});
