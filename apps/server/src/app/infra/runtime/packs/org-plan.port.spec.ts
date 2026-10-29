import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { CapabilityScope } from 'harnesys';
import { CREATE_THREAD_PLANS_SQL } from '../../org-sqlite/org-sql.ts';
import * as schema from '../../org-sqlite/schema/index.ts';
import { OrgPlanPort } from './org-plan.port.ts';

const SCOPE: CapabilityScope = {
  orgId: 'org-1',
  agentId: 'agent-1',
  threadId: 'thread-1',
  sourceIds: [],
};

function setup(scope: CapabilityScope = SCOPE) {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_THREAD_PLANS_SQL);
  const db = drizzle(sqlite, { schema });
  const port = new OrgPlanPort(db);
  return { port, scope, close: () => sqlite.close() };
}

describe('OrgPlanPort', () => {
  test('get returns null when no plan exists', async () => {
    const { port, scope, close } = setup();
    try {
      await expect(port.get(scope)).resolves.toBeNull();
    } finally {
      close();
    }
  });

  test('save roundtrips through get', async () => {
    const { port, scope, close } = setup();
    try {
      const saved = await port.save(scope, {
        overview: 'ship the feature',
        items: [
          { title: 'design', description: 'write the design' },
          { title: 'build', description: 'implement it', subagentRole: 'coder' },
        ],
      });
      expect(saved.id).not.toBe('');
      expect(saved.status).toBe('draft');
      expect(saved.overview).toBe('ship the feature');
      expect(saved.items.map((item) => item.order)).toEqual([0, 1]);
      expect(saved.items.map((item) => item.status)).toEqual(['pending', 'pending']);
      const loaded = await port.get(scope);
      expect(loaded).toEqual(saved);
    } finally {
      close();
    }
  });

  test('save overwrites the thread snapshot', async () => {
    const { port, scope, close } = setup();
    try {
      const first = await port.save(scope, {
        overview: 'first',
        items: [{ title: 'one', description: 'first item' }],
      });
      const second = await port.save(scope, {
        overview: 'second',
        items: [{ title: 'two', description: 'second item' }],
      });
      expect(second.id).not.toBe(first.id);
      const loaded = await port.get(scope);
      expect(loaded?.id).toBe(second.id);
      expect(loaded?.overview).toBe('second');
      expect(loaded?.items.map((item) => item.title)).toEqual(['two']);
    } finally {
      close();
    }
  });

  test('updateItem without a plan throws', async () => {
    const { port, scope, close } = setup();
    try {
      await expect(
        Promise.resolve().then(() =>
          port.updateItem(scope, { planId: 'ghost', itemId: 'ghost', status: 'completed' }),
        ),
      ).rejects.toThrow();
    } finally {
      close();
    }
  });

  test('updateItem updates status and result note', async () => {
    const { port, scope, close } = setup();
    try {
      const saved = await port.save(scope, {
        overview: 'work',
        items: [{ title: 'task', description: 'do it' }],
      });
      const itemId = saved.items[0]?.id ?? '';
      const updated = await port.updateItem(scope, {
        planId: saved.id,
        itemId,
        status: 'in_progress',
        resultNote: 'started',
      });
      expect(updated.items[0]?.status).toBe('in_progress');
      expect(updated.items[0]?.resultNote).toBe('started');
      expect((await port.get(scope))?.items[0]?.status).toBe('in_progress');
    } finally {
      close();
    }
  });

  test('delete removes the plan', async () => {
    const { port, scope, close } = setup();
    try {
      await port.save(scope, {
        overview: 'work',
        items: [{ title: 'task', description: 'do it' }],
      });
      await expect(port.delete(scope)).resolves.toEqual({ deleted: true });
      await expect(port.get(scope)).resolves.toBeNull();
      await expect(port.delete(scope)).resolves.toEqual({ deleted: false });
    } finally {
      close();
    }
  });
});
