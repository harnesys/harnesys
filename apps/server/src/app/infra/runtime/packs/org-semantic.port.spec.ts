import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { MemoryScopeId, SemanticProjectInput, SemanticProjectQueryInput } from 'harnesys';
import { decodeEmbedding, encodeEmbedding } from '../../knowledge/embedding-vec.ts';
import type { EmbeddingModelRef, EmbeddingsPort } from '../../knowledge/embeddings.ts';
import { CREATE_AGENT_MEMORY_SQL } from '../../org-sqlite/org-sql.ts';
import {
  migrateAgentMemoryConsolidationColumns,
  migrateAgentMemoryEmbeddingColumns,
} from '../../org-sqlite/org-sql-ensure.ts';
import { type MemoryFactInsert, memoryFactsTable } from '../../org-sqlite/schema/agent-memory.ts';
import * as schema from '../../org-sqlite/schema/index.ts';
import { OrgSemanticPort } from './org-semantic.port.ts';

const SCOPE: MemoryScopeId = { orgId: 'org-1', agentName: 'agent-1', threadId: 'thread-1' };

const OTHER_THREAD: MemoryScopeId = { orgId: 'org-1', agentName: 'agent-1', threadId: 'thread-2' };

const WINDOW_INPUT: SemanticProjectInput = {
  scopes: ['session', 'long'],
  limit: 20,
  budgetTokens: 10000,
};

const QUERY: SemanticProjectQueryInput = {
  query: 'kubernetes deployment',
  scopes: ['long'],
  topK: 2,
  budgetTokens: 10000,
  clipChars: 200,
  halfLifeDays: 30,
};

function setup(embeddings?: EmbeddingsPort) {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_AGENT_MEMORY_SQL);
  const exec = (sql: string) => sqlite.exec(sql);
  const all = (sql: string) => sqlite.prepare(sql).all() as { name: string }[];
  migrateAgentMemoryConsolidationColumns(exec, all);
  migrateAgentMemoryEmbeddingColumns(exec, all);
  const db = drizzle(sqlite, { schema });
  return { port: new OrgSemanticPort(db, embeddings), db, close: () => sqlite.close() };
}

class FakeEmbeddings implements EmbeddingsPort {
  embedCalls = 0;

  constructor(private readonly usable: boolean) {}

  available(): boolean {
    return this.usable;
  }
  resolvedModel(): EmbeddingModelRef {
    return { provider: 'fake', model: 'fake-embed' };
  }
  embed(texts: string[]): Promise<number[][]> {
    this.embedCalls += 1;
    const vector = (text: string): number[] => {
      if (text.includes('kubernetes')) {
        return [1, 0, 0];
      }
      return text.includes('postgres') ? [0, 1, 0] : [0, 0, 1];
    };
    return Promise.resolve(texts.map(vector));
  }
}

const LONG_SEED = { scope: 'long', embeddingModel: 'fake-embed' };

type SeedOverride = Partial<MemoryFactInsert>;

function vecSeed(text: string, updatedAt: string, vec: number[]) {
  return { text, updatedAt, ...LONG_SEED, embedding: encodeEmbedding(vec) };
}

function seedFacts(
  db: ReturnType<typeof drizzle<typeof schema>>,
  seeds: Array<{ text: string; scope: string; updatedAt: string } & SeedOverride>,
): void {
  let seq = 0;
  for (const seed of seeds) {
    seq += 1;
    db.insert(memoryFactsTable)
      .values({
        id: `fact-${seq}`,
        orgId: SCOPE.orgId,
        agentName: SCOPE.agentName,
        scope: seed.scope,
        text: seed.text,
        threadId: seed.threadId ?? null,
        source: 'agent',
        createdAt: seed.updatedAt,
        updatedAt: seed.updatedAt,
        importance: seed.importance ?? 5,
        supersededBy: seed.supersededBy ?? null,
        embedding: seed.embedding ?? null,
        embeddingModel: seed.embeddingModel ?? null,
      })
      .run();
  }
}

describe('OrgSemanticPort', () => {
  test('upsert list update remove roundtrip', async () => {
    const { port, close } = setup();
    try {
      const saved = await port.upsert(SCOPE, {
        scope: 'session',
        text: 'user prefers tabs',
        key: 'pref',
        threadId: SCOPE.threadId,
        source: 'agent',
      });
      expect(saved.id).not.toBe('');
      expect(saved.scope).toBe('session');
      expect(saved.text).toBe('user prefers tabs');
      expect(saved.key).toBe('pref');
      expect(saved.threadId).toBe('thread-1');
      expect(saved.source).toBe('agent');
      const listed = await port.list(SCOPE, { scope: 'session' });
      expect(listed.map((row) => row.id)).toEqual([saved.id]);
      const updated = await port.update(SCOPE, { id: saved.id, text: 'user prefers spaces' });
      expect(updated.id).toBe(saved.id);
      expect(updated.text).toBe('user prefers spaces');
      await port.remove(SCOPE, saved.id);
      await expect(port.list(SCOPE, {})).resolves.toEqual([]);
    } finally {
      close();
    }
  });

  test('upsert with the same key updates within scope', async () => {
    const { port, close } = setup();
    try {
      const first = await port.upsert(SCOPE, {
        scope: 'long',
        text: 'mission one',
        key: 'mission',
        source: 'agent',
      });
      const second = await port.upsert(OTHER_THREAD, {
        scope: 'long',
        text: 'mission two',
        key: 'mission',
        source: 'human',
      });
      expect(second.id).toBe(first.id);
      expect(second.text).toBe('mission two');
      expect(second.source).toBe('human');
      await expect(port.list(OTHER_THREAD, { scope: 'long' })).resolves.toEqual([second]);
    } finally {
      close();
    }
  });

  test('long facts are durable across threads and session facts are thread-bound', async () => {
    const { port, close } = setup();
    try {
      await port.upsert(SCOPE, {
        scope: 'long',
        text: 'team ships fridays',
        key: 'norm',
        source: 'agent',
      });
      await port.upsert(SCOPE, {
        scope: 'session',
        text: 'thread mood',
        key: 'mood',
        threadId: SCOPE.threadId,
        source: 'agent',
      });
      const fromOther = await port.list(OTHER_THREAD, {});
      expect(fromOther.map((row) => row.text)).toEqual(['team ships fridays']);
      const fromOwn = await port.list(SCOPE, {});
      expect(fromOwn.length).toBe(2);
    } finally {
      close();
    }
  });

  test('session upsert keys stay per thread', async () => {
    const { port, close } = setup();
    try {
      const first = await port.upsert(SCOPE, {
        scope: 'session',
        text: 'mood a',
        key: 'mood',
        threadId: SCOPE.threadId,
        source: 'agent',
      });
      const second = await port.upsert(OTHER_THREAD, {
        scope: 'session',
        text: 'mood b',
        key: 'mood',
        threadId: OTHER_THREAD.threadId,
        source: 'agent',
      });
      expect(second.id).not.toBe(first.id);
    } finally {
      close();
    }
  });

  test('update of a missing fact throws', async () => {
    const { port, close } = setup();
    try {
      await expect(port.update(SCOPE, { id: 'ghost', text: 'x' })).rejects.toThrow();
    } finally {
      close();
    }
  });

  test('list applies the query limit', async () => {
    const { port, close } = setup();
    try {
      await port.upsert(SCOPE, { scope: 'long', text: 'fact one', source: 'agent' });
      await port.upsert(SCOPE, { scope: 'long', text: 'fact two', source: 'agent' });
      await port.upsert(SCOPE, { scope: 'long', text: 'fact three', source: 'agent' });
      const limited = await port.list(SCOPE, { limit: 2 });
      expect(limited.length).toBe(2);
      const all = await port.list(SCOPE, {});
      expect(all.length).toBe(3);
    } finally {
      close();
    }
  });

  test('projectForWindow selects long and own session, hides superseded, fits budget', async () => {
    const { port, db, close } = setup();
    try {
      seedFacts(db, [
        { text: 'alpha beta', scope: 'long', importance: 9, updatedAt: '2026-01-05T00:00:00.000Z' },
        {
          text: 'gamma delta epsilon zeta eta theta',
          scope: 'session',
          threadId: SCOPE.threadId,
          updatedAt: '2026-01-04T00:00:00.000Z',
        },
        {
          text: 'foreign thread mood',
          scope: 'session',
          threadId: OTHER_THREAD.threadId,
          updatedAt: '2026-01-03T00:00:00.000Z',
        },
        {
          text: 'superseded fact',
          scope: 'long',
          supersededBy: 'newer-fact',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
          text: 'low value fact',
          scope: 'long',
          importance: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      const projected = await port.projectForWindow(SCOPE, WINDOW_INPUT);
      expect(projected).toContain('alpha beta');
      expect(projected).toContain('gamma delta epsilon zeta eta theta');
      expect(projected).not.toContain('foreign thread mood');
      expect(projected).not.toContain('superseded fact');
      const tight = await port.projectForWindow(SCOPE, { ...WINDOW_INPUT, budgetTokens: 3 });
      expect(tight).toBe('alpha beta');
    } finally {
      close();
    }
  });

  test('projectForWindow touches access counters', async () => {
    const { port, db, close } = setup();
    try {
      seedFacts(db, [
        { text: 'alpha beta', scope: 'long', importance: 9, updatedAt: '2026-01-05T00:00:00.000Z' },
        {
          text: 'gamma delta epsilon zeta eta theta',
          scope: 'session',
          threadId: SCOPE.threadId,
          updatedAt: '2026-01-04T00:00:00.000Z',
        },
        {
          text: 'superseded fact',
          scope: 'long',
          supersededBy: 'newer-fact',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ]);
      await port.projectForWindow(SCOPE, WINDOW_INPUT);
      const listed = await port.list(SCOPE, {});
      const byText = new Map(listed.map((row) => [row.text, row]));
      expect(byText.get('alpha beta')?.accessCount).toBe(1);
      expect(byText.get('alpha beta')?.lastAccessedAt).not.toBeNull();
      expect(byText.get('gamma delta epsilon zeta eta theta')?.accessCount).toBe(1);
      expect(byText.get('gamma delta epsilon zeta eta theta')?.lastAccessedAt).not.toBeNull();
      expect(byText.get('superseded fact')?.accessCount).toBe(0);
    } finally {
      close();
    }
  });

  test('upsert with embeddings writes decodable blob and embedding model', async () => {
    const embeddings = new FakeEmbeddings(true);
    const { port, db, close } = setup(embeddings);
    try {
      await port.upsert(SCOPE, { scope: 'long', text: 'kubernetes in prod', source: 'agent' });
      expect(embeddings.embedCalls).toBe(1);
      const row = db.select().from(memoryFactsTable).all()[0];
      expect(row?.embeddingModel).toBe('fake-embed');
      expect(decodeEmbedding(row?.embedding)).toEqual([1, 0, 0]);
    } finally {
      close();
    }
  });

  test('projectForQuery ranks vector match above fresh irrelevant fact', async () => {
    const { port, db, close } = setup(new FakeEmbeddings(true));
    try {
      seedFacts(db, [
        vecSeed('kubernetes cluster on bare metal', '2026-01-01T00:00:00.000Z', [1, 0, 0]),
        vecSeed('postgres by default', '2026-10-20T00:00:00.000Z', [0, 1, 0]),
      ]);
      const projected = await port.projectForQuery(SCOPE, QUERY);
      expect(projected.indexOf('kubernetes cluster')).toBeGreaterThanOrEqual(0);
      expect(projected.indexOf('kubernetes cluster')).toBeLessThan(
        projected.indexOf('postgres by default'),
      );
    } finally {
      close();
    }
  });

  test('projectForQuery without embeddings keeps hot order and skips embed calls', async () => {
    const embeddings = new FakeEmbeddings(false);
    const { port, db, close } = setup(embeddings);
    try {
      seedFacts(db, [
        { text: 'old note', scope: 'long', updatedAt: '2026-01-01T00:00:00.000Z' },
        { text: 'fresh note', scope: 'long', updatedAt: '2026-10-20T00:00:00.000Z' },
      ]);
      const projected = await port.projectForQuery(SCOPE, QUERY);
      expect(embeddings.embedCalls).toBe(0);
      expect(projected.indexOf('fresh note')).toBeLessThan(projected.indexOf('old note'));
      const rows = db.select().from(memoryFactsTable).all();
      expect(rows.every((row) => row.embedding === null && row.embeddingModel === null)).toBe(true);
    } finally {
      close();
    }
  });
});
