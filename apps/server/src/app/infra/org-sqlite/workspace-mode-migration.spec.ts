import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import {
  type ColumnInfo,
  migrateWorkspaceModeSandboxToThread,
  rewriteSandboxModeJson,
} from './org-sql-migrations.ts';

const SCHEMA_SQL = `
CREATE TABLE threads (id TEXT PRIMARY KEY, workspace_ref TEXT);
CREATE TABLE agents (id TEXT PRIMARY KEY, config TEXT NOT NULL DEFAULT '{}');
CREATE TABLE runs (run_id TEXT PRIMARY KEY, environment TEXT);
CREATE TABLE pending_placements (run_id TEXT PRIMARY KEY, environment TEXT);
CREATE TABLE addon_trigger_instances (id TEXT PRIMARY KEY, target_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE org_execution_replica (org_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL);
INSERT INTO threads (id, workspace_ref) VALUES
  ('t-1', '{"kind":"sandbox"}'),
  ('t-2', '{"kind":"source","sourceId":"src-api"}'),
  ('t-3', NULL);
INSERT INTO agents (id, config) VALUES
  ('a-1', '{"defaultWorkspaceRef":{"kind":"sandbox"},"model":"m"}'),
  ('a-2', '{"defaultWorkspaceRef":{"kind":"folder","path":"/srv/app/sandbox"},"defaultRunDirectory":"/srv/app/sandbox"}');
INSERT INTO runs (run_id, environment) VALUES
  ('r-1', '{"anchor":null,"cwd":"sandbox","provenance":"thread"}'),
  ('r-2', '{"anchor":{"kind":"folder","path":"/srv/app"},"cwd":"anchor","provenance":"agent"}');
INSERT INTO pending_placements (run_id, environment) VALUES
  ('r-1', '{"anchor":{"kind":"source","sourceId":"src-api"},"cwd":"sandbox","provenance":"run"}');
INSERT INTO addon_trigger_instances (id, target_json) VALUES
  ('i-1', '{"threadId":"t-1","agentId":"a-1","workspace":{"kind":"sandbox"}}'),
  ('i-2', '{"threadId":"t-2","agentId":"a-2"}');
INSERT INTO org_execution_replica (org_id, payload_json) VALUES
  ('org-1', '{"schemaVersion":1,"revision":3,"agents":[{"id":"a-1","defaultWorkspaceRef":{"kind":"sandbox"}}],"notes":"the sandbox folder stays"}');
`;

function migrate(sqlite: Database): void {
  const exec = (sql: string) => {
    sqlite.exec(sql);
  };
  const all = (sql: string) => sqlite.query(sql).all() as ColumnInfo[];
  migrateWorkspaceModeSandboxToThread(exec, all);
}

function readColumn(
  sqlite: Database,
  table: string,
  keyColumn: string,
  key: string,
  column: string,
): string | null {
  const row = sqlite
    .query(`SELECT ${column} AS value FROM ${table} WHERE ${keyColumn} = ?`)
    .get(key) as { value: string | null } | null;
  return row?.value ?? null;
}

describe('workspace mode sandbox-to-thread migration', () => {
  test('rewrites stored kind and cwd values, leaves other rows untouched', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(SCHEMA_SQL);
      migrate(sqlite);

      expect(readColumn(sqlite, 'threads', 'id', 't-1', 'workspace_ref')).toBe('{"kind":"thread"}');
      expect(readColumn(sqlite, 'threads', 'id', 't-2', 'workspace_ref')).toBe(
        '{"kind":"source","sourceId":"src-api"}',
      );
      expect(JSON.parse(readColumn(sqlite, 'agents', 'id', 'a-1', 'config') ?? '{}')).toEqual({
        defaultWorkspaceRef: { kind: 'thread' },
        model: 'm',
      });
      const untouched = JSON.parse(readColumn(sqlite, 'agents', 'id', 'a-2', 'config') ?? '{}');
      expect(untouched.defaultWorkspaceRef).toEqual({
        kind: 'folder',
        path: '/srv/app/sandbox',
      });
      expect(untouched.defaultRunDirectory).toBe('/srv/app/sandbox');
      expect(
        JSON.parse(readColumn(sqlite, 'runs', 'run_id', 'r-1', 'environment') ?? '{}'),
      ).toEqual({
        anchor: null,
        cwd: 'thread',
        provenance: 'thread',
      });
      expect(
        JSON.parse(readColumn(sqlite, 'runs', 'run_id', 'r-2', 'environment') ?? '{}'),
      ).toEqual({
        anchor: { kind: 'folder', path: '/srv/app' },
        cwd: 'anchor',
        provenance: 'agent',
      });
      expect(
        JSON.parse(
          readColumn(sqlite, 'pending_placements', 'run_id', 'r-1', 'environment') ?? '{}',
        ),
      ).toEqual({
        anchor: { kind: 'source', sourceId: 'src-api' },
        cwd: 'thread',
        provenance: 'run',
      });
      expect(
        JSON.parse(
          readColumn(sqlite, 'addon_trigger_instances', 'id', 'i-1', 'target_json') ?? '{}',
        ),
      ).toEqual({ threadId: 't-1', agentId: 'a-1', workspace: { kind: 'thread' } });
      expect(readColumn(sqlite, 'addon_trigger_instances', 'id', 'i-2', 'target_json')).toBe(
        '{"threadId":"t-2","agentId":"a-2"}',
      );
      const replica = JSON.parse(
        readColumn(sqlite, 'org_execution_replica', 'org_id', 'org-1', 'payload_json') ?? '{}',
      );
      expect(replica.agents[0].defaultWorkspaceRef).toEqual({ kind: 'thread' });
      expect(replica.notes).toBe('the sandbox folder stays');
    } finally {
      sqlite.close();
    }
  });

  test('is idempotent across repeated runs', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(SCHEMA_SQL);
      migrate(sqlite);
      const first = readColumn(sqlite, 'threads', 'id', 't-1', 'workspace_ref');
      migrate(sqlite);
      expect(readColumn(sqlite, 'threads', 'id', 't-1', 'workspace_ref')).toBe(first);
      expect(
        sqlite.query(`SELECT COUNT(*) AS count FROM threads`).get() as { count: number },
      ).toEqual({ count: 3 });
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

  test('rewriteSandboxModeJson returns null without changes and rewrites nested nodes', () => {
    expect(rewriteSandboxModeJson('{"kind":"thread"}')).toBeNull();
    expect(rewriteSandboxModeJson('{"kind":"folder","path":"/x/sandbox"}')).toBeNull();
    expect(rewriteSandboxModeJson('not json')).toBeNull();
    expect(
      rewriteSandboxModeJson('{"items":[{"cwd":"sandbox"},{"kind":"sandbox"}],"keep":"sandbox"}'),
    ).toBe('{"items":[{"cwd":"thread"},{"kind":"thread"}],"keep":"sandbox"}');
  });
});
