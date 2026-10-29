import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import {
  CREATE_RUN_EVENTS_SQL,
  CREATE_RUNS_SQL,
  CREATE_THREADS_SQL,
} from '../../org-sqlite/org-sql.ts';
import * as schema from '../../org-sqlite/schema/index.ts';
import { OrgEpisodicPort } from './org-episodic.port.ts';

function setup() {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_THREADS_SQL);
  sqlite.exec(CREATE_RUNS_SQL);
  sqlite.exec(CREATE_RUN_EVENTS_SQL);
  const db = drizzle(sqlite, { schema });
  return { sqlite, port: new OrgEpisodicPort(db), close: () => sqlite.close() };
}

function seedThread(sqlite: Database, threadId: string, orgId: string): void {
  sqlite.run(
    `INSERT INTO threads (id, org_id, agent_id, origin_agent_id, title, created_at, updated_at, last_read_at)
     VALUES (?, ?, 'agent-1', 'agent-1', 't', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    [threadId, orgId],
  );
  sqlite.run(
    `INSERT INTO runs (run_id, thread_id, status, created_at, updated_at)
     VALUES (?, ?, 'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    [`${threadId}-run`, threadId],
  );
}

function seedEvent(sqlite: Database, threadId: string, seq: number, text: string): void {
  sqlite.run(
    `INSERT INTO run_events (run_id, seq, thread_id, type, timestamp, metadata)
     VALUES (?, ?, ?, 'message', ?, ?)`,
    [`${threadId}-run`, seq, threadId, seq, JSON.stringify({ type: 'message', text })],
  );
}

describe('OrgEpisodicPort', () => {
  test('search finds seeded run_events text by org', async () => {
    const { sqlite, port, close } = setup();
    try {
      seedThread(sqlite, 'thread-1', 'org-1');
      seedEvent(sqlite, 'thread-1', 1, 'the invoice is shipped');
      seedEvent(sqlite, 'thread-1', 2, 'unrelated note');
      const hits = await port.search({ orgId: 'org-1', query: 'invoice' });
      expect(hits.length).toBe(1);
      expect(hits[0]?.threadId).toBe('thread-1');
      expect(hits[0]?.seq).toBe(1);
      expect(hits[0]?.text).toBe('the invoice is shipped');
    } finally {
      close();
    }
  });

  test('search filters by threadId when present', async () => {
    const { sqlite, port, close } = setup();
    try {
      seedThread(sqlite, 'thread-1', 'org-1');
      seedThread(sqlite, 'thread-2', 'org-1');
      seedEvent(sqlite, 'thread-1', 1, 'deploy checklist');
      seedEvent(sqlite, 'thread-2', 1, 'deploy checklist');
      const hits = await port.search({ orgId: 'org-1', query: 'deploy', threadId: 'thread-1' });
      expect(hits.map((hit) => hit.threadId)).toEqual(['thread-1']);
    } finally {
      close();
    }
  });

  test('search stays inside the org', async () => {
    const { sqlite, port, close } = setup();
    try {
      seedThread(sqlite, 'thread-1', 'org-1');
      seedThread(sqlite, 'thread-9', 'org-9');
      seedEvent(sqlite, 'thread-1', 1, 'budget approved');
      seedEvent(sqlite, 'thread-9', 1, 'budget approved');
      const hits = await port.search({ orgId: 'org-1', query: 'budget' });
      expect(hits.map((hit) => hit.threadId)).toEqual(['thread-1']);
    } finally {
      close();
    }
  });

  test('empty limit defaults to 20', async () => {
    const { sqlite, port, close } = setup();
    try {
      seedThread(sqlite, 'thread-1', 'org-1');
      for (let seq = 1; seq <= 25; seq += 1) {
        seedEvent(sqlite, 'thread-1', seq, `recall entry ${seq}`);
      }
      const hits = await port.search({ orgId: 'org-1', query: 'recall' });
      expect(hits.length).toBe(20);
      expect(hits[0]?.seq).toBe(25);
      const limited = await port.search({ orgId: 'org-1', query: 'recall', limit: 5 });
      expect(limited.length).toBe(5);
    } finally {
      close();
    }
  });

  test('index is a no-op over stored events', async () => {
    const { sqlite, port, close } = setup();
    try {
      seedThread(sqlite, 'thread-1', 'org-1');
      seedEvent(sqlite, 'thread-1', 1, 'keep me');
      await expect(
        port.index?.({ orgId: 'org-1', threadId: 'thread-1', fromSeq: 0, toSeq: 1 }),
      ).resolves.toBeUndefined();
      const hits = await port.search({ orgId: 'org-1', query: 'keep me' });
      expect(hits.length).toBe(1);
    } finally {
      close();
    }
  });
});
