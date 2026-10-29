import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { MemoryScopeId } from 'harnesys';
import { CREATE_AGENT_MEMORY_SQL } from '../../org-sqlite/org-sql.ts';
import type { OrgSqliteDb } from '../../org-sqlite/org-sqlite-session.ts';
import * as schema from '../../org-sqlite/schema/index.ts';
import { OrgPinPort } from './org-pin.port.ts';

const SCOPE: MemoryScopeId = {
  orgId: 'org-1',
  agentName: 'agent-1',
  threadId: 'thread-1',
};

const OLDER_STAMP = '2026-01-01T00:00:00.000Z';
const NEWER_STAMP = '2026-01-02T00:00:00.000Z';

function setup() {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_AGENT_MEMORY_SQL);
  const db = drizzle(sqlite, { schema });
  return { port: new OrgPinPort(db), db, close: () => sqlite.close() };
}

function setUpdatedAt(db: OrgSqliteDb, key: string, updatedAt: string): void {
  db.update(schema.memoryPinsTable)
    .set({ updatedAt })
    .where(eq(schema.memoryPinsTable.key, key))
    .run();
}

describe('OrgPinPort', () => {
  test('upsert list remove roundtrip', async () => {
    const { port, close } = setup();
    try {
      const saved = await port.upsert(SCOPE, {
        key: 'rule',
        text: 'always run tests',
        source: 'agent',
      });
      expect(saved.key).toBe('rule');
      expect(saved.text).toBe('always run tests');
      expect(saved.source).toBe('agent');
      expect(saved.updatedAt).not.toBe('');
      await expect(port.list(SCOPE)).resolves.toEqual([saved]);
      await port.remove(SCOPE, 'rule');
      await expect(port.list(SCOPE)).resolves.toEqual([]);
    } finally {
      close();
    }
  });

  test('upsert with the same key updates the pin in place', async () => {
    const { port, close } = setup();
    try {
      await port.upsert(SCOPE, { key: 'rule', text: 'first', source: 'agent' });
      const saved = await port.upsert(SCOPE, { key: 'rule', text: 'second', source: 'human' });
      expect(saved.text).toBe('second');
      expect(saved.source).toBe('human');
      await expect(port.list(SCOPE)).resolves.toEqual([saved]);
    } finally {
      close();
    }
  });

  test('list is scoped to org and agent', async () => {
    const { port, close } = setup();
    try {
      await port.upsert(SCOPE, { key: 'rule', text: 'mine', source: 'agent' });
      await port.upsert(
        { orgId: 'org-2', agentName: 'agent-1' },
        { key: 'rule', text: 'other org', source: 'agent' },
      );
      await port.upsert(
        { orgId: 'org-1', agentName: 'agent-2' },
        { key: 'rule', text: 'other agent', source: 'agent' },
      );
      const pins = await port.list(SCOPE);
      expect(pins.map((pin) => pin.text)).toEqual(['mine']);
    } finally {
      close();
    }
  });

  test('remove ignores unknown keys', async () => {
    const { port, close } = setup();
    try {
      await port.remove(SCOPE, 'ghost');
      await expect(port.list(SCOPE)).resolves.toEqual([]);
    } finally {
      close();
    }
  });

  test('projectForWindow fits pins into the token budget', async () => {
    const { port, db, close } = setup();
    try {
      await port.upsert(SCOPE, { key: 'a', text: 'alpha rule', source: 'agent' });
      await port.upsert(SCOPE, { key: 'b', text: 'beta rule', source: 'agent' });
      setUpdatedAt(db, 'a', OLDER_STAMP);
      setUpdatedAt(db, 'b', NEWER_STAMP);
      await expect(port.projectForWindow(SCOPE, 1000)).resolves.toBe('beta rule\nalpha rule');
      await expect(port.projectForWindow(SCOPE, 3)).resolves.toBe('beta rule');
      await expect(port.projectForWindow(SCOPE, 0)).resolves.toBe('');
    } finally {
      close();
    }
  });

  test('list breaks updatedAt ties by key ascending', async () => {
    const { port, db, close } = setup();
    try {
      await port.upsert(SCOPE, { key: 'b', text: 'beta rule', source: 'agent' });
      await port.upsert(SCOPE, { key: 'a', text: 'alpha rule', source: 'agent' });
      setUpdatedAt(db, 'a', OLDER_STAMP);
      setUpdatedAt(db, 'b', OLDER_STAMP);
      const pins = await port.list(SCOPE);
      expect(pins.map((pin) => pin.key)).toEqual(['a', 'b']);
    } finally {
      close();
    }
  });
});
