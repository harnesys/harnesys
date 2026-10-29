import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { migrateUsageTable } from './org-sql.ts';

const LEGACY_USAGE_SQL = `
CREATE TABLE usage (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  project_id TEXT,
  agent_id TEXT,
  run_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  reasoning_tokens INTEGER,
  cost_usd INTEGER NOT NULL DEFAULT 0,
  pricing_source TEXT NOT NULL DEFAULT 'none'
);
CREATE INDEX usage_ts_idx ON usage(ts);
CREATE INDEX usage_agent_idx ON usage(agent_id);
CREATE INDEX usage_project_idx ON usage(project_id);
CREATE TABLE price_overrides (
  model TEXT PRIMARY KEY,
  input_per_1m INTEGER NOT NULL,
  output_per_1m INTEGER NOT NULL
);
`;

function columnTypes(sqlite: Database, table: string): Record<string, string> {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
    type: string;
  }>;
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.name] = row.type;
  }
  return out;
}

describe('migrateUsageTable', () => {
  test('rebuilds usage with REAL cost and model_id, keeping rows', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(LEGACY_USAGE_SQL);
      sqlite.run(
        `INSERT INTO usage (id, ts, run_id, model, input_tokens, output_tokens, cost_usd, pricing_source)
         VALUES ('u-1', '2026-10-21T00:00:00.000Z', 'r-1', 'gpt-4o', 10, 5, 0, 'none')`,
      );

      migrateUsageTable(
        (sql) => {
          sqlite.exec(sql);
        },
        (sql) => sqlite.query(sql).all() as Array<{ name: string; type: string }>,
      );

      const types = columnTypes(sqlite, 'usage');
      expect(types.cost_usd).toBe('REAL');
      expect(types.model_id).toBe('TEXT');
      const rows = sqlite.query(`SELECT id, model, cost_usd FROM usage`).all() as Array<{
        id: string;
        model: string;
        cost_usd: number;
      }>;
      expect(rows).toEqual([{ id: 'u-1', model: 'gpt-4o', cost_usd: 0 }]);
      const indexes = sqlite
        .query(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'usage'`)
        .all() as Array<{ name: string }>;
      expect(indexes.map((row) => row.name)).toContain('usage_ts_idx');
    } finally {
      sqlite.close();
    }
  });

  test('rebuilds price_overrides keyed by model_id', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(LEGACY_USAGE_SQL);
      sqlite.run(`INSERT INTO price_overrides VALUES ('gpt-4o', 3, 15)`);

      migrateUsageTable(
        (sql) => {
          sqlite.exec(sql);
        },
        (sql) => sqlite.query(sql).all() as Array<{ name: string; type: string }>,
      );

      const types = columnTypes(sqlite, 'price_overrides');
      expect(types.model_id).toBe('TEXT');
      expect(types.input_per_1m).toBe('REAL');
      expect(sqlite.query(`SELECT * FROM price_overrides`).all()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  test('adds the images column without rebuilding the table', () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(LEGACY_USAGE_SQL);
      sqlite.run(
        `INSERT INTO usage (id, ts, run_id, model, input_tokens, output_tokens, cost_usd, pricing_source)
         VALUES ('u-1', '2026-10-21T00:00:00.000Z', 'r-1', 'gpt-4o', 10, 5, 0, 'none')`,
      );

      migrateUsageTable(
        (sql) => {
          sqlite.exec(sql);
        },
        (sql) => sqlite.query(sql).all() as Array<{ name: string; type: string }>,
      );

      const types = columnTypes(sqlite, 'usage');
      expect(types.images).toBe('INTEGER');
      const rows = sqlite.query(`SELECT id, images FROM usage`).all() as Array<{
        id: string;
        images: number | null;
      }>;
      expect(rows).toEqual([{ id: 'u-1', images: null }]);
    } finally {
      sqlite.close();
    }
  });
});
