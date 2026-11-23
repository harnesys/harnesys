import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import {
  type ColumnInfo,
  migratePendingPlacementsEnvironmentColumn,
  migrateRunsEnvironmentColumn,
  migrateThreadsWorkspaceRefColumn,
} from './org-sql-migrations.ts';

const LEGACY_SCHEMA_SQL = `
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  title TEXT NOT NULL,
  run_directory TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_read_at TEXT NOT NULL
);
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE pending_placements (
  run_id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
INSERT INTO threads (id, org_id, title, run_directory, created_at, updated_at, last_read_at)
  VALUES ('t-1', 'org-1', 'Thread', '/srv/sources/api', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
INSERT INTO runs (run_id, thread_id, agent_name, status, created_at, updated_at)
  VALUES ('r-1', 't-1', 'Agent', 'queued', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
INSERT INTO pending_placements (run_id, thread_id, profile_id, payload_json)
  VALUES ('r-1', 't-1', 'profile-1', '{"agentId":"a-1","text":"hello"}');
`;

function migrate(sqlite: Database): void {
  const exec = (sql: string) => {
    sqlite.exec(sql);
  };
  const all = (sql: string) => sqlite.query(sql).all() as ColumnInfo[];
  migrateThreadsWorkspaceRefColumn(exec, all);
  migrateRunsEnvironmentColumn(exec, all);
  migratePendingPlacementsEnvironmentColumn(exec, all);
}

function columnNames(sqlite: Database, table: string): string[] {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

describe('workspace ref persistence migrations', () => {
  test('adds the new columns and keeps legacy rows', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(LEGACY_SCHEMA_SQL);

      migrate(sqlite);

      expect(columnNames(sqlite, 'threads')).toContain('workspace_ref');
      expect(columnNames(sqlite, 'runs')).toContain('environment');
      expect(columnNames(sqlite, 'pending_placements')).toContain('environment');

      const thread = sqlite
        .query(`SELECT id, run_directory, workspace_ref FROM threads WHERE id = 't-1'`)
        .get() as { id: string; run_directory: string | null; workspace_ref: string | null };
      expect(thread).toEqual({ id: 't-1', run_directory: '/srv/sources/api', workspace_ref: null });

      const run = sqlite
        .query(`SELECT run_id, status, environment FROM runs WHERE run_id = 'r-1'`)
        .get() as { run_id: string; status: string; environment: string | null };
      expect(run).toEqual({ run_id: 'r-1', status: 'queued', environment: null });

      const pending = sqlite
        .query(
          `SELECT run_id, payload_json, environment FROM pending_placements WHERE run_id = 'r-1'`,
        )
        .get() as { run_id: string; payload_json: string; environment: string | null };
      expect(pending).toEqual({
        run_id: 'r-1',
        payload_json: '{"agentId":"a-1","text":"hello"}',
        environment: null,
      });
    } finally {
      sqlite.close();
    }
  });

  test('is idempotent across repeated runs', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(LEGACY_SCHEMA_SQL);

      migrate(sqlite);
      migrate(sqlite);

      expect(
        columnNames(sqlite, 'threads').filter((name) => name === 'workspace_ref'),
      ).toHaveLength(1);
      expect(columnNames(sqlite, 'runs').filter((name) => name === 'environment')).toHaveLength(1);
      expect(
        columnNames(sqlite, 'pending_placements').filter((name) => name === 'environment'),
      ).toHaveLength(1);
      expect(
        sqlite.query(`SELECT COUNT(*) AS count FROM threads`).get() as { count: number },
      ).toEqual({ count: 1 });
    } finally {
      sqlite.close();
    }
  });

  test('does not throw when the tables are absent', () => {
    const sqlite = new Database(':memory:');
    try {
      expect(() => migrate(sqlite)).not.toThrow();
    } finally {
      sqlite.close();
    }
  });
});
