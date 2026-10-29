import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { CREATE_ORG_MEMORY_SETTINGS_SQL } from './org-sql.ts';
import { migrateOrgMemorySettingsModelColumns } from './org-sql-ensure.ts';

const LEGACY_SQL = `
CREATE TABLE IF NOT EXISTS org_memory_settings (
  org_id TEXT PRIMARY KEY NOT NULL,
  embed_provider TEXT,
  embed_model TEXT,
  last_crawl_at TEXT,
  last_crawl_summary TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS llm_providers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  driver TEXT NOT NULL,
  api_url TEXT,
  api_key TEXT,
  headers_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS llm_models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

function columnNames(sqlite: Database, table: string): Set<string> {
  return new Set(
    (sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (col) => col.name,
    ),
  );
}

describe('migrateOrgMemorySettingsModelColumns', () => {
  test('backfills embed_model_id from the legacy name pair and drops old columns', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(LEGACY_SQL);
      sqlite.run(
        `INSERT INTO llm_providers (id, org_id, name, driver, created_at, updated_at)
         VALUES ('p-1', 'org-1', 'ollama', 'openai-compatible', '2026-01-01', '2026-01-01')`,
      );
      sqlite.run(
        `INSERT INTO llm_models (id, provider_id, name, kind, created_at, updated_at)
         VALUES ('m-1', 'p-1', 'nomic-embed-text', 'embed', '2026-01-01', '2026-01-01')`,
      );
      sqlite.run(
        `INSERT INTO org_memory_settings (org_id, embed_provider, embed_model, updated_at)
         VALUES ('org-1', 'ollama', 'nomic-embed-text', '2026-01-01')`,
      );
      sqlite.run(
        `INSERT INTO org_memory_settings (org_id, embed_provider, embed_model, updated_at)
         VALUES ('org-2', 'ghost', 'missing-model', '2026-01-01')`,
      );
      migrateOrgMemorySettingsModelColumns(
        (sql) => sqlite.run(sql),
        (sql) => sqlite.query(sql).all() as Array<{ name: string }>,
      );
      const columns = columnNames(sqlite, 'org_memory_settings');
      expect(columns.has('embed_provider')).toBe(false);
      expect(columns.has('embed_model')).toBe(false);
      expect(columns.has('embed_model_id')).toBe(true);
      expect(columns.has('decision_model_id')).toBe(true);
      const rows = sqlite
        .query('SELECT org_id, embed_model_id FROM org_memory_settings ORDER BY org_id')
        .all() as Array<{ org_id: string; embed_model_id: string | null }>;
      expect(rows).toEqual([
        { org_id: 'org-1', embed_model_id: 'm-1' },
        { org_id: 'org-2', embed_model_id: null },
      ]);
    } finally {
      sqlite.close();
    }
  });

  test('is a no-op on the fresh schema', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(CREATE_ORG_MEMORY_SETTINGS_SQL);
      migrateOrgMemorySettingsModelColumns(
        (sql) => sqlite.run(sql),
        (sql) => sqlite.query(sql).all() as Array<{ name: string }>,
      );
      expect(columnNames(sqlite, 'org_memory_settings').has('embed_model_id')).toBe(true);
    } finally {
      sqlite.close();
    }
  });
});
