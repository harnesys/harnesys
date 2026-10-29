import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { CREATE_MEMORY_CONSOLIDATIONS_SQL } from '../org-sqlite/org-sql.ts';
import * as schema from '../org-sqlite/schema/index.ts';
import { OrgMemoryConsolidationStore } from './org-memory-consolidation.store.ts';

function setup() {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_MEMORY_CONSOLIDATIONS_SQL);
  const db = drizzle(sqlite, { schema });
  return { store: new OrgMemoryConsolidationStore(db), close: () => sqlite.close() };
}

describe('OrgMemoryConsolidationStore', () => {
  test('find returns undefined without a saved cursor', () => {
    const { store, close } = setup();
    try {
      expect(store.find('org-1', 'agent-1', 'thread-1')).toBeUndefined();
    } finally {
      close();
    }
  });

  test('save then find roundtrips the cursor', () => {
    const { store, close } = setup();
    try {
      const cursor = {
        orgId: 'org-1',
        agentName: 'agent-1',
        threadId: 'thread-1',
        lastRunId: 'run-1',
        lastSeq: 42,
        updatedAt: '2026-10-23T00:00:00.000Z',
      };
      store.save(cursor);
      expect(store.find('org-1', 'agent-1', 'thread-1')).toEqual(cursor);
    } finally {
      close();
    }
  });

  test('second save overwrites lastSeq by primary key', () => {
    const { store, close } = setup();
    try {
      store.save({
        orgId: 'org-1',
        agentName: 'agent-1',
        threadId: 'thread-1',
        lastRunId: 'run-1',
        lastSeq: 10,
        updatedAt: '2026-10-23T00:00:00.000Z',
      });
      store.save({
        orgId: 'org-1',
        agentName: 'agent-1',
        threadId: 'thread-1',
        lastRunId: 'run-2',
        lastSeq: 99,
        updatedAt: '2026-10-23T01:00:00.000Z',
      });
      expect(store.find('org-1', 'agent-1', 'thread-1')).toEqual({
        orgId: 'org-1',
        agentName: 'agent-1',
        threadId: 'thread-1',
        lastRunId: 'run-2',
        lastSeq: 99,
        updatedAt: '2026-10-23T01:00:00.000Z',
      });
    } finally {
      close();
    }
  });
});
