import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { migrateThreadsConnectorKind } from './org-sql.ts';

const CREATE_THREADS_WITHOUT_CONNECTOR_SQL = `
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  origin_agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'chat' CHECK(kind IN ('chat', 'schedule', 'webhook', 'issue')),
  parent_thread_id TEXT,
  fork_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  issue_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_read_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS threads_org_idx ON threads(org_id);
CREATE INDEX IF NOT EXISTS threads_agent_idx ON threads(agent_id);
CREATE INDEX IF NOT EXISTS threads_issue_idx ON threads(issue_id);
`;

describe('migrateThreadsConnectorKind', () => {
  test('rebuilds threads CHECK so connector kind inserts succeed', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY)`);
      sqlite.exec(`CREATE TABLE issues (id TEXT PRIMARY KEY)`);
      sqlite.run(`INSERT INTO agents (id) VALUES ('agent-1')`);
      sqlite.exec(CREATE_THREADS_WITHOUT_CONNECTOR_SQL);
      sqlite.run(
        `INSERT INTO threads (id, org_id, agent_id, origin_agent_id, title, kind, created_at, updated_at, last_read_at)
         VALUES ('t-chat', 'org-1', 'agent-1', 'agent-1', 'chat', 'chat', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      );

      migrateThreadsConnectorKind(
        (sql) => {
          sqlite.exec(sql);
        },
        (sql) => sqlite.query(sql).all() as Array<{ name: string }>,
      );

      sqlite.run(
        `INSERT INTO threads (id, org_id, agent_id, origin_agent_id, title, kind, created_at, updated_at, last_read_at)
         VALUES ('t-connector', 'org-1', 'agent-1', 'agent-1', 'connector', 'connector', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      );

      const rows = sqlite.query(`SELECT id, kind FROM threads ORDER BY id`).all() as Array<{
        id: string;
        kind: string;
      }>;
      expect(rows).toEqual([
        { id: 't-chat', kind: 'chat' },
        { id: 't-connector', kind: 'connector' },
      ]);
    } finally {
      sqlite.close();
    }
  });
});
