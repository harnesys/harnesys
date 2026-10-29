import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { MemoryScopeId, SemanticProjectQueryInput } from 'harnesys';
import { CREATE_AGENT_MEMORY_SQL } from '../../org-sqlite/org-sql.ts';
import {
  migrateAgentMemoryConsolidationColumns,
  migrateAgentMemoryEmbeddingColumns,
} from '../../org-sqlite/org-sql-ensure.ts';
import * as schema from '../../org-sqlite/schema/index.ts';
import { OrgSemanticPort } from './org-semantic.port.ts';

const SCOPE: MemoryScopeId = { orgId: 'org-1', agentName: 'agent-1', threadId: 'thread-1' };

const INPUT: SemanticProjectQueryInput = {
  query: 'kubernetes deployment',
  scopes: ['long'],
  topK: 10,
  budgetTokens: 100,
  clipChars: 100,
  halfLifeDays: 30,
};

function setup() {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_AGENT_MEMORY_SQL);
  const exec = (sql: string) => sqlite.exec(sql);
  const all = (sql: string) => sqlite.prepare(sql).all() as { name: string }[];
  migrateAgentMemoryConsolidationColumns(exec, all);
  migrateAgentMemoryEmbeddingColumns(exec, all);
  const db = drizzle(sqlite, { schema });
  return { port: new OrgSemanticPort(db), close: () => sqlite.close() };
}

describe('OrgSemanticPort projection budget', () => {
  test('budget counts clipped lines and fills multiple facts', async () => {
    const { port, close } = setup();
    try {
      await port.upsert(SCOPE, { scope: 'long', text: 'x'.repeat(10_000), source: 'agent' });
      await port.upsert(SCOPE, { scope: 'long', text: 'small fact one', source: 'agent' });
      await port.upsert(SCOPE, { scope: 'long', text: 'small fact two', source: 'agent' });
      await port.upsert(SCOPE, { scope: 'long', text: 'small fact three', source: 'agent' });
      const projected = await port.projectForQuery(SCOPE, INPUT);
      expect(projected).toContain('x'.repeat(50));
      expect(projected).toContain('small fact one');
      expect(projected).toContain('small fact two');
      expect(projected).toContain('small fact three');
    } finally {
      close();
    }
  });
});
