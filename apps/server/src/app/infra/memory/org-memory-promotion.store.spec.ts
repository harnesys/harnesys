import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { promotionEntryOf } from 'harnesys';
import {
  CREATE_AGENT_MEMORY_SQL,
  CREATE_AGENTS_SQL,
  CREATE_MEMORY_PROMOTIONS_SQL,
} from '../org-sqlite/org-sql.ts';
import * as schema from '../org-sqlite/schema/index.ts';
import { OrgMemoryPromotionStore } from './org-memory-promotion.store.ts';

function setup() {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_AGENTS_SQL);
  sqlite.exec(CREATE_AGENT_MEMORY_SQL);
  sqlite.exec(CREATE_MEMORY_PROMOTIONS_SQL);
  const db = drizzle(sqlite, { schema });
  db.insert(schema.memoryFactsTable)
    .values({
      id: 'fact-1',
      orgId: 'org-1',
      agentName: 'agent-1',
      scope: 'long',
      text: 'Ships deploys on Tuesdays.',
      source: 'agent',
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    })
    .run();
  db.insert(schema.agentsTable)
    .values({
      id: 'agent-1',
      orgId: 'org-1',
      name: 'agent-1',
      role: 'worker',
      instructions: 'Base instructions.',
      model: 'model-1',
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    })
    .run();
  const store = new OrgMemoryPromotionStore(db);
  return { db, store, close: () => sqlite.close() };
}

function insertPending(
  store: OrgMemoryPromotionStore,
  id: string,
  factId: string,
  createdAt: string,
): void {
  store.insertPending({ id, orgId: 'org-1', agentName: 'agent-1', factId, createdAt });
}

describe('OrgMemoryPromotionStore', () => {
  test('insertPending duplicate fact does not create a second pending row', () => {
    const { store, close } = setup();
    try {
      insertPending(store, 'promo-1', 'fact-1', '2026-10-24T01:00:00.000Z');
      insertPending(store, 'promo-2', 'fact-1', '2026-10-24T01:00:00.000Z');
      const pending = store.pendingOf('org-1', 'agent-1');
      expect(pending).toHaveLength(1);
      expect(pending[0]?.id).toBe('promo-1');
      expect(pending[0]?.factId).toBe('fact-1');
      expect(pending[0]?.text).toBe('Ships deploys on Tuesdays.');
    } finally {
      close();
    }
  });

  test('deletePendingByFact removes only that fact pending rows', () => {
    const { db, store, close } = setup();
    try {
      db.insert(schema.memoryFactsTable)
        .values({
          id: 'fact-2',
          orgId: 'org-1',
          agentName: 'agent-1',
          scope: 'long',
          text: 'Prefers short pull requests.',
          source: 'agent',
          createdAt: '2026-10-24T00:00:00.000Z',
          updatedAt: '2026-10-24T00:00:00.000Z',
        })
        .run();
      insertPending(store, 'promo-1', 'fact-1', '2026-10-24T01:00:00.000Z');
      insertPending(store, 'promo-2', 'fact-2', '2026-10-24T02:00:00.000Z');
      store.deletePendingByFact('org-1', 'agent-1', 'fact-1');
      const pending = store.pendingOf('org-1', 'agent-1');
      expect(pending.map((row) => row.id)).toEqual(['promo-2']);
    } finally {
      close();
    }
  });

  test('appendInstructionBlock appends once and repeats as no-op', () => {
    const { db, store, close } = setup();
    try {
      const block = promotionEntryOf({
        id: 'promo-1',
        date: '2026-10-24',
        text: 'Ships deploys on Tuesdays.',
      });
      expect(store.appendInstructionBlock('org-1', 'agent-1', block)).toBe(true);
      const appended = `Base instructions.\n\n${block}`;
      expect(db.select().from(schema.agentsTable).get()?.instructions).toBe(appended);
      expect(store.appendInstructionBlock('org-1', 'agent-1', block)).toBe(false);
      expect(db.select().from(schema.agentsTable).get()?.instructions).toBe(appended);
    } finally {
      close();
    }
  });
});
