import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { CREATE_PERMISSION_RULES_SQL, migratePermissionRules } from './org-sql-permission-rules.ts';

interface RuleRow {
  kind: string;
  pattern: string;
  agent_id: string | null;
  action: string | null;
  effect: string;
}

function openDbWithLegacyData(): Database {
  const db = new Database(':memory:');
  db.exec(CREATE_PERMISSION_RULES_SQL);
  db.exec(`
    CREATE TABLE file_access_rules (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL, agent_id TEXT, host_id TEXT,
      path_pattern TEXT NOT NULL, action TEXT NOT NULL, effect TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO file_access_rules VALUES
      ('fr-1', 'org-1', 'agent-1', 'host-1', '/repo/**', 'edit', 'allow', '2026-01-01', '2026-01-01'),
      ('fr-2', 'org-1', NULL, 'host-1', '/shared/**', 'read', 'deny', '2026-01-01', '2026-01-01');
    CREATE TABLE permission_grants (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL, agent_id TEXT NOT NULL,
      operation TEXT NOT NULL, decided_by TEXT, created_at TEXT NOT NULL
    );
    INSERT INTO permission_grants VALUES
      ('g-1', 'org-1', 'agent-1', 'network', 'web', '2026-01-02'),
      ('g-2', 'org-1', 'agent-1', 'network', 'push', '2026-01-02');
    CREATE TABLE agents (id TEXT, org_id TEXT, config TEXT NOT NULL DEFAULT '{}');
    INSERT INTO agents VALUES
      ('agent-1', 'org-1',
       '{"name":"coder","shell":{"spec":{"timeout":30,"allowlist":["git status"],"blocklist":["rm *"]}}}'),
      ('agent-2', 'org-1', '{"name":"qa"}');
    CREATE TABLE mode_presets (id TEXT, org_id TEXT, packs_json TEXT NOT NULL DEFAULT '{}');
    INSERT INTO mode_presets VALUES
      ('plan', 'org-1', '{"shell":{"spec":{"allowlist":["bun test"]}}}');
  `);
  return db;
}

function ruleIdsOf(db: Database): string[] {
  return db
    .query<RuleRow, []>(
      `SELECT kind, pattern, agent_id FROM permission_rules ORDER BY kind, pattern`,
    )
    .all()
    .map(rowToKey);
}

interface RuleRow {
  kind: string;
  pattern: string;
  agent_id: string | null;
}

function rowToKey({ kind, pattern, agent_id }: RuleRow): string {
  return `${kind}|${pattern}|${agent_id ?? 'org'}`;
}

function tableDropExec(db: Database): (sql: string) => void {
  return (sql: string) => {
    for (const statement of splitStatements(sql)) {
      db.exec(statement);
    }
  };
}

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith('--'));
}

function columnOf(all: (sql: string) => unknown[], sql: string, column: string): string {
  const row = all(sql)[0] as Record<string, string | undefined> | undefined;
  if (row === undefined) {
    throw new Error(`expected a row for: ${sql}`);
  }
  const value = row[column];
  if (value === undefined) {
    throw new Error(`expected column ${column} for: ${sql}`);
  }
  return value;
}

describe('migratePermissionRules', () => {
  test('backfills fs-path, op and shell-cmd rows once, then drops legacy tables', () => {
    const db = openDbWithLegacyData();
    const all = (sql: string) => db.query(sql).all();
    migratePermissionRules(tableDropExec(db), all);

    const ids = ruleIdsOf(db);
    expect(ids).toEqual([
      'fs-path|/repo/**|agent-1',
      'fs-path|/shared/**|org',
      'op|network|agent-1',
      'shell-cmd|bun test|org',
      'shell-cmd|git status|agent-1',
      'shell-cmd|rm *|agent-1',
    ]);

    const legacyTables = all(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('file_access_rules', 'permission_grants')",
    );
    expect(legacyTables).toHaveLength(0);
  });

  test('second run inserts nothing and does not touch legacy sources', () => {
    const db = openDbWithLegacyData();
    const all = (sql: string) => db.query(sql).all();
    migratePermissionRules(tableDropExec(db), all);
    const afterFirst = ruleIdsOf(db);

    expect(() => migratePermissionRules(tableDropExec(db), all)).not.toThrow();
    expect(ruleIdsOf(db)).toEqual(afterFirst);
  });

  test('strips shell spec allowlist/blocklist from agents and mode presets', () => {
    const db = openDbWithLegacyData();
    const all = (sql: string) => db.query(sql).all();
    migratePermissionRules(tableDropExec(db), all);

    expect(
      JSON.parse(columnOf(all, "SELECT config FROM agents WHERE id = 'agent-1'", 'config')),
    ).toEqual({
      name: 'coder',
      shell: { spec: { timeout: 30 } },
    });
    expect(
      JSON.parse(
        columnOf(all, "SELECT packs_json FROM mode_presets WHERE id = 'plan'", 'packs_json'),
      ),
    ).toEqual({});
    expect(
      JSON.parse(columnOf(all, "SELECT config FROM agents WHERE id = 'agent-2'", 'config')),
    ).toEqual({
      name: 'qa',
    });
  });

  test('runs clean on a fresh database without legacy tables', () => {
    const db = new Database(':memory:');
    db.exec(CREATE_PERMISSION_RULES_SQL);
    db.exec('CREATE TABLE agents (id TEXT, org_id TEXT, config TEXT NOT NULL DEFAULT "{}");');
    db.exec(
      'CREATE TABLE mode_presets (id TEXT, org_id TEXT, packs_json TEXT NOT NULL DEFAULT "{}");',
    );
    expect(() =>
      migratePermissionRules(tableDropExec(db), (sql: string) => db.query(sql).all()),
    ).not.toThrow();
    expect(ruleIdsOf(db)).toHaveLength(0);
  });
});
