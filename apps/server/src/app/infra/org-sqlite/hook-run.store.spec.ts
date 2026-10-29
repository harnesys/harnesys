import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { HookRunStore } from './hook-run.store.ts';
import { CREATE_HOOK_RUNS_SQL } from './org-sql-hooks.ts';
import * as schema from './schema/index.ts';

function setup() {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_HOOK_RUNS_SQL);
  const db = drizzle(sqlite, { schema });
  return { store: new HookRunStore(db), close: () => sqlite.close() };
}

describe('HookRunStore', () => {
  test('records and lists runs of an agent', () => {
    const { store, close } = setup();
    try {
      store.record('org-1', {
        agentId: 'agent-1',
        hookId: 'hook-1',
        event: 'PreToolUse',
        handlerType: 'command',
        status: 'blocked',
        durationMs: 12,
        summary: 'denied',
        effects: [{ kind: 'block', reason: 'denied' }],
        runId: 'run-1',
        threadId: 'thread-1',
      });
      const runs = store.list('agent-1', 10);
      expect(runs).toHaveLength(1);
      expect(runs[0]?.event).toBe('PreToolUse');
      expect(runs[0]?.status).toBe('blocked');
      expect(runs[0]?.summary).toBe('denied');
      expect(runs[0]?.effects).toEqual([{ kind: 'block', reason: 'denied' }]);
    } finally {
      close();
    }
  });

  test('lists only runs of the requested agent', () => {
    const { store, close } = setup();
    try {
      store.record('org-1', {
        agentId: 'agent-1',
        hookId: 'hook-1',
        event: 'Stop',
        handlerType: 'prompt',
        status: 'ok',
        durationMs: 3,
        effects: [],
      });
      store.record('org-1', {
        agentId: 'agent-2',
        hookId: 'hook-2',
        event: 'Stop',
        handlerType: 'prompt',
        status: 'ok',
        durationMs: 4,
        effects: [],
      });
      expect(store.list('agent-1', 10)).toHaveLength(1);
      expect(store.list('agent-2', 10)).toHaveLength(1);
      expect(store.list('agent-3', 10)).toHaveLength(0);
    } finally {
      close();
    }
  });

  test('respects the limit', () => {
    const { store, close } = setup();
    try {
      for (let index = 0; index < 3; index += 1) {
        store.record('org-1', {
          agentId: 'agent-1',
          hookId: `hook-${index}`,
          event: 'Stop',
          handlerType: 'prompt',
          status: 'ok',
          durationMs: index,
          effects: [],
        });
      }
      expect(store.list('agent-1', 2)).toHaveLength(2);
    } finally {
      close();
    }
  });
});
