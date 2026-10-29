export interface ColumnInfo {
  name: string;
  type?: string;
}

export function migrateUsageTable(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const columns = all(`PRAGMA table_info(usage)`);
  if (columns.length === 0) {
    return;
  }
  const present = new Set(columns.map((column) => column.name));
  if (!present.has('reasoning_tokens')) {
    exec(`ALTER TABLE usage ADD COLUMN reasoning_tokens INTEGER`);
  }
  if (!present.has('model_id')) {
    exec(`ALTER TABLE usage ADD COLUMN model_id TEXT`);
  }
  if (!present.has('images')) {
    exec(`ALTER TABLE usage ADD COLUMN images INTEGER`);
  }
  const costType = columns.find((column) => column.name === 'cost_usd')?.type?.toUpperCase();
  if (costType && costType !== 'REAL') {
    rebuildUsageTable(exec);
  }
  migratePriceOverridesTable(exec, all);
}

function rebuildUsageTable(exec: (sql: string) => void): void {
  exec(`
CREATE TABLE usage_migrated (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  project_id TEXT,
  agent_id TEXT,
  run_id TEXT NOT NULL,
  model TEXT NOT NULL,
  model_id TEXT,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  reasoning_tokens INTEGER,
  images INTEGER,
  cost_usd REAL NOT NULL DEFAULT 0,
  pricing_source TEXT NOT NULL DEFAULT 'none'
);
INSERT INTO usage_migrated (
  id, ts, project_id, agent_id, run_id, model, model_id, input_tokens, output_tokens,
  cache_read_tokens, cache_write_tokens, reasoning_tokens, images, cost_usd, pricing_source
)
SELECT
  id, ts, project_id, agent_id, run_id, model, model_id, input_tokens, output_tokens,
  cache_read_tokens, cache_write_tokens, reasoning_tokens, images, cost_usd, pricing_source
FROM usage;
DROP TABLE usage;
ALTER TABLE usage_migrated RENAME TO usage;
CREATE INDEX IF NOT EXISTS usage_ts_idx ON usage(ts);
CREATE INDEX IF NOT EXISTS usage_agent_idx ON usage(agent_id);
CREATE INDEX IF NOT EXISTS usage_project_idx ON usage(project_id);
`);
}

function migratePriceOverridesTable(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const columns = all(`PRAGMA table_info(price_overrides)`);
  if (columns.length === 0) {
    return;
  }
  const present = new Set(columns.map((column) => column.name));
  if (present.has('model_id')) {
    return;
  }
  exec(`
CREATE TABLE price_overrides_migrated (
  model_id TEXT PRIMARY KEY,
  input_per_1m REAL NOT NULL,
  output_per_1m REAL NOT NULL
);
DROP TABLE price_overrides;
ALTER TABLE price_overrides_migrated RENAME TO price_overrides;
`);
}
