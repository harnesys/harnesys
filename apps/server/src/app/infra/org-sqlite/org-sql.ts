import {
  CREATE_SOURCE_MATERIALIZATION_PROJECTIONS_SQL,
  CREATE_SOURCE_MATERIALIZATIONS_SQL,
  CREATE_SOURCES_SQL,
} from './org-sql-sources.ts';
import type { ColumnInfo } from './org-sql-usage.ts';
import { migrateRepositoryWorktreeBranchUniqueIndex } from './org-sql-worktrees.ts';

export {
  CREATE_ISSUE_ATTACHMENTS_SQL,
  CREATE_ISSUE_BOARDS_SQL,
  CREATE_ISSUE_COMMENTS_SQL,
  CREATE_ISSUE_DEPENDENCIES_SQL,
  CREATE_ISSUE_LABELS_SQL,
  CREATE_ISSUES_SQL,
} from './org-sql-issues.ts';
export { migrateUsageTable } from './org-sql-usage.ts';

export const CREATE_ORGS_SQL = `
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const CREATE_NODES_SQL = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT,
  last_seen_at TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  enrolled_at TEXT NOT NULL,
  disk_free_bytes INTEGER,
  disk_total_bytes INTEGER,
  docker_available INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS nodes_name_unique ON nodes(name);
`;

export function migrateNodesDockerColumn(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const present = new Set(all('PRAGMA table_info(nodes)').map((col) => col.name));
  if (!present.has('docker_available')) {
    exec(`ALTER TABLE nodes ADD COLUMN docker_available INTEGER`);
  }
}

export const CREATE_SECRETS_SQL = `
CREATE TABLE IF NOT EXISTS secrets (
  key TEXT PRIMARY KEY NOT NULL,
  ciphertext BLOB NOT NULL,
  iv BLOB NOT NULL,
  tag BLOB NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const DROPPED_AGENT_COLUMNS = ['autonomy', 'ask_ops', 'deny_ops'] as const;

export function migrateAgentsPolicyColumns(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const present = new Set(all('PRAGMA table_info(agents)').map((col) => col.name));
  for (const column of DROPPED_AGENT_COLUMNS) {
    if (present.has(column)) {
      exec(`ALTER TABLE agents DROP COLUMN ${column}`);
    }
  }
}

export function migrateAgentsExecutionProfileColumn(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const present = new Set(all('PRAGMA table_info(agents)').map((col) => col.name));
  if (!present.has('execution_profile_id')) {
    exec(`ALTER TABLE agents ADD COLUMN execution_profile_id TEXT`);
  }
}

export const CREATE_REPOSITORY_WORKTREES_SQL = `
CREATE TABLE IF NOT EXISTS repository_worktrees (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  branch TEXT NOT NULL,
  base_commit TEXT,
  state TEXT NOT NULL,
  active_run_id TEXT,
  operation_id TEXT NOT NULL,
  issue_id TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS repository_worktrees_org_operation_unique
  ON repository_worktrees(org_id, operation_id);
CREATE INDEX IF NOT EXISTS repository_worktrees_source_idx
  ON repository_worktrees(org_id, source_id, host_id);
`;

export function migrateSourceMaterializationCloudColumns(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  migrateSqliteColumns(exec, all, 'source_materializations', [
    { name: 'last_conflict_paths', ddl: `TEXT NOT NULL DEFAULT '[]'` },
    { name: 'refresh_required', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  ]);
  migrateSqliteColumns(exec, all, 'source_materialization_projections', [
    { name: 'last_conflict_paths', ddl: `TEXT NOT NULL DEFAULT '[]'` },
    { name: 'refresh_required', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  ]);
}

export function migrateSourcesVcsColumns(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  migrateSqliteColumns(exec, all, 'sources', [
    { name: 'vcs_json', ddl: 'TEXT' },
    { name: 'availability_json', ddl: `TEXT NOT NULL DEFAULT '[]'` },
    { name: 'description', ddl: 'TEXT' },
  ]);
  const present = all(`PRAGMA table_info(sources)`).length > 0;
  if (!present) {
    return;
  }
  exec(`UPDATE sources SET distribution_json = '{"kind":"host-bound","hostId":"' || (
    SELECT host_id FROM source_materializations m WHERE m.source_id = sources.id LIMIT 1
  ) || '"}'
    WHERE json_extract(distribution_json, '$.kind') = 'git'
      AND EXISTS (SELECT 1 FROM source_materializations m WHERE m.source_id = sources.id)`);
  exec(`UPDATE sources SET distribution_json = '{"kind":"host-bound","hostId":"00000000-0000-4000-8000-000000000000"}'
    WHERE json_extract(distribution_json, '$.kind') = 'git'
      AND NOT EXISTS (SELECT 1 FROM source_materializations m WHERE m.source_id = sources.id)`);
}

function migrateSqliteColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
  table: string,
  columns: Array<{ name: string; ddl: string }>,
): void {
  const present = new Set(all(`PRAGMA table_info(${table})`).map((col) => col.name));
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function ensureSourcesSchema(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): number {
  exec(CREATE_SOURCES_SQL);
  exec(CREATE_SOURCE_MATERIALIZATIONS_SQL);
  exec(CREATE_SOURCE_MATERIALIZATION_PROJECTIONS_SQL);
  migrateSourceMaterializationCloudColumns(exec, all);
  exec(CREATE_REPOSITORY_WORKTREES_SQL);
  if (!all) {
    return 0;
  }
  return migrateRepositoryWorktreeBranchUniqueIndex(exec, all);
}
export const CREATE_LLM_PROVIDERS_SQL = `
CREATE TABLE IF NOT EXISTS llm_providers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  driver TEXT NOT NULL,
  api_url TEXT,
  api_key TEXT,
  headers TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS llm_providers_org_id_name_unique
  ON llm_providers(org_id, name);
`;

export const CREATE_LLM_MODELS_SQL = `
CREATE TABLE IF NOT EXISTS llm_models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS llm_models_provider_id_name_unique
  ON llm_models(provider_id, name);
`;

export const CREATE_AGENTS_SQL = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  instructions TEXT NOT NULL,
  model TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  budget_usd_daily REAL,
  level TEXT NOT NULL DEFAULT 'top',
  parent_id TEXT,
  placement TEXT NOT NULL DEFAULT '{"prefer":"any"}',
  execution_profile_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS agents_org_id_name_unique
  ON agents(org_id, name);
`;

export const CREATE_MODE_PRESETS_SQL = `
CREATE TABLE IF NOT EXISTS mode_presets (
  org_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  skills_json TEXT NOT NULL DEFAULT '[]',
  packs_json TEXT NOT NULL DEFAULT '{}',
  disabled_tools_json TEXT NOT NULL DEFAULT '[]',
  exposure_json TEXT NOT NULL DEFAULT '{}',
  permissions_json TEXT NOT NULL DEFAULT '{}',
  builtin INTEGER NOT NULL DEFAULT 0,
  installed_by_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mode_presets_org_id_name_unique
  ON mode_presets(org_id, name);
`;

export const CREATE_PLUGINS_SQL = `
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  revision TEXT NOT NULL,
  path TEXT NOT NULL,
  data_path TEXT NOT NULL,
  format TEXT,
  grants TEXT NOT NULL DEFAULT '{}',
  options TEXT NOT NULL DEFAULT '{}',
  registry_id TEXT,
  catalog_plugin_name TEXT,
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS plugins_org_id_name_unique
  ON plugins(org_id, name);

CREATE TABLE IF NOT EXISTS plugin_approvals (
  org_id TEXT NOT NULL,
  plugin_name TEXT NOT NULL,
  server_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  PRIMARY KEY (org_id, plugin_name, server_id)
);

CREATE TABLE IF NOT EXISTS plugin_server_state (
  plugin_name TEXT NOT NULL,
  server_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  disabled_at TEXT NOT NULL,
  PRIMARY KEY (plugin_name, server_id, org_id),
  FOREIGN KEY (org_id, plugin_name) REFERENCES plugins(org_id, name) ON DELETE CASCADE
);
`;

export const CREATE_KNOWLEDGE_SQL = `
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  uri TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  embedding BLOB,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_source_idx
  ON knowledge_chunks(source_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_source_uri_idx
  ON knowledge_chunks(source_id, uri);

CREATE TABLE IF NOT EXISTS knowledge_roots (
  source_id TEXT NOT NULL,
  path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (source_id, path)
);

CREATE TABLE IF NOT EXISTS knowledge_settings (
  source_id TEXT PRIMARY KEY NOT NULL,
  entire_source INTEGER NOT NULL DEFAULT 0,
  backend TEXT NOT NULL DEFAULT 'fts',
  embed_provider TEXT,
  embed_model TEXT,
  watch_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  CHECK(backend IN ('fts', 'vector'))
);

CREATE TABLE IF NOT EXISTS knowledge_files (
  source_id TEXT NOT NULL,
  uri TEXT NOT NULL,
  status TEXT NOT NULL,
  skip_reason TEXT,
  mtime_ms INTEGER,
  size_bytes INTEGER,
  content_hash TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_id, uri),
  CHECK(status IN ('pending', 'indexed', 'skipped', 'error'))
);
CREATE INDEX IF NOT EXISTS knowledge_files_source_status_idx
  ON knowledge_files(source_id, status);

CREATE TABLE IF NOT EXISTS knowledge_index_state (
  source_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  phase TEXT,
  processed INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TEXT,
  finished_at TEXT,
  CHECK(status IN ('idle', 'running', 'error'))
);
`;

export const CREATE_KNOWLEDGE_FTS_SQL = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
    title,
    text,
    content='knowledge_chunks',
    content_rowid='rowid'
  );`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ai AFTER INSERT ON knowledge_chunks BEGIN
    INSERT INTO knowledge_chunks_fts(rowid, title, text)
      VALUES (new.rowid, new.title, new.text);
  END;`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ad AFTER DELETE ON knowledge_chunks BEGIN
    INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, title, text)
      VALUES('delete', old.rowid, old.title, old.text);
  END;`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_chunks_au AFTER UPDATE ON knowledge_chunks BEGIN
    INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, title, text)
      VALUES('delete', old.rowid, old.title, old.text);
    INSERT INTO knowledge_chunks_fts(rowid, title, text)
      VALUES (new.rowid, new.title, new.text);
  END;`,
] as const;

export function ensureKnowledgeFts(exec: (sql: string) => void): void {
  for (const statement of CREATE_KNOWLEDGE_FTS_SQL) {
    try {
      exec(statement);
    } catch {
      // FTS/triggers may already exist from a partial bootstrap
    }
  }
}

export const CREATE_THREADS_SQL = `
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  origin_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'chat' CHECK(kind IN ('chat', 'schedule', 'webhook', 'issue', 'connector')),
  parent_thread_id TEXT REFERENCES threads(id) ON DELETE SET NULL,
  fork_at TEXT,
  inherited_event_count TEXT NOT NULL DEFAULT '0',
  metadata TEXT NOT NULL DEFAULT '{}',
  issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
  run_profile_id TEXT,
  run_directory TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_read_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS threads_org_idx ON threads(org_id);
CREATE INDEX IF NOT EXISTS threads_agent_idx ON threads(agent_id);
`;

export const CREATE_THREADS_ISSUE_IDX_SQL = `
CREATE INDEX IF NOT EXISTS threads_issue_idx ON threads(issue_id);
`;

const THREADS_ISSUE_MIGRATE_SQL = `
CREATE TABLE threads_issue_mig (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  origin_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'chat' CHECK(kind IN ('chat', 'schedule', 'webhook', 'issue', 'connector')),
  parent_thread_id TEXT REFERENCES threads(id) ON DELETE SET NULL,
  fork_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_read_at TEXT NOT NULL
);
INSERT INTO threads_issue_mig
  (id, org_id, agent_id, origin_agent_id, title, kind, parent_thread_id, fork_at, metadata, issue_id, created_at, updated_at, last_read_at)
SELECT id, org_id, agent_id, origin_agent_id, title, kind, parent_thread_id, fork_at, metadata, NULL, created_at, updated_at, last_read_at FROM threads;
DROP TABLE threads;
ALTER TABLE threads_issue_mig RENAME TO threads;
CREATE INDEX IF NOT EXISTS threads_org_idx ON threads(org_id);
CREATE INDEX IF NOT EXISTS threads_agent_idx ON threads(agent_id);
CREATE INDEX IF NOT EXISTS threads_issue_idx ON threads(issue_id);
`;

const THREADS_CONNECTOR_MIGRATE_SQL = `
CREATE TABLE threads_connector_mig (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  origin_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'chat' CHECK(kind IN ('chat', 'schedule', 'webhook', 'issue', 'connector')),
  parent_thread_id TEXT REFERENCES threads(id) ON DELETE SET NULL,
  fork_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_read_at TEXT NOT NULL
);
INSERT INTO threads_connector_mig
  (id, org_id, agent_id, origin_agent_id, title, kind, parent_thread_id, fork_at, metadata, issue_id, created_at, updated_at, last_read_at)
SELECT id, org_id, agent_id, origin_agent_id, title, kind, parent_thread_id, fork_at, metadata, issue_id, created_at, updated_at, last_read_at FROM threads;
DROP TABLE threads;
ALTER TABLE threads_connector_mig RENAME TO threads;
CREATE INDEX IF NOT EXISTS threads_org_idx ON threads(org_id);
CREATE INDEX IF NOT EXISTS threads_agent_idx ON threads(agent_id);
CREATE INDEX IF NOT EXISTS threads_issue_idx ON threads(issue_id);
`;

export function migrateThreadsIssueKind(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const rows = all(
    `SELECT sql AS name FROM sqlite_master WHERE type = 'table' AND name = 'threads'`,
  );
  const ddl = rows[0]?.name ?? '';
  if (!ddl || ddl.includes(`'issue'`)) {
    return;
  }
  exec('PRAGMA foreign_keys=OFF');
  exec('BEGIN');
  try {
    exec(THREADS_ISSUE_MIGRATE_SQL);
    exec('COMMIT');
  } catch (err) {
    exec('ROLLBACK');
    exec('PRAGMA foreign_keys=ON');
    throw err;
  }
  exec('PRAGMA foreign_keys=ON');
}

export function migrateThreadsConnectorKind(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const rows = all(
    `SELECT sql AS name FROM sqlite_master WHERE type = 'table' AND name = 'threads'`,
  );
  const ddl = rows[0]?.name ?? '';
  if (!ddl || ddl.includes(`'connector'`)) {
    return;
  }
  exec('PRAGMA foreign_keys=OFF');
  exec('BEGIN');
  try {
    exec(THREADS_CONNECTOR_MIGRATE_SQL);
    exec('COMMIT');
  } catch (err) {
    exec('ROLLBACK');
    exec('PRAGMA foreign_keys=ON');
    throw err;
  }
  exec('PRAGMA foreign_keys=ON');
}

export function migrateThreadsInheritedEventCount(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const present = new Set(all('PRAGMA table_info(threads)').map((col) => col.name));
  if (!present.has('inherited_event_count')) {
    exec(`ALTER TABLE threads ADD COLUMN inherited_event_count TEXT NOT NULL DEFAULT '0'`);
  }
}

export const CREATE_BOARD_STATUSES_SQL = `
CREATE TABLE IF NOT EXISTS board_statuses (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES issue_boards(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('backlog', 'started', 'finished', 'cancelled')),
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  is_entry INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS board_statuses_board_key_idx ON board_statuses(board_id, key);
CREATE INDEX IF NOT EXISTS board_statuses_board_order_idx ON board_statuses(board_id, "order");
`;

export const CREATE_BOARD_RULES_SQL = `
CREATE TABLE IF NOT EXISTS board_rules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  board_id TEXT NOT NULL REFERENCES issue_boards(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_payload TEXT NOT NULL DEFAULT '{}',
  conditions TEXT NOT NULL DEFAULT '[]',
  actions TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS board_rules_board_idx ON board_rules(board_id, position);
`;

export const CREATE_ISSUE_EXECUTIONS_SQL = `
CREATE TABLE IF NOT EXISTS issue_executions (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  run_id TEXT,
  agent_id TEXT NOT NULL,
  worktree_id TEXT,
  correlation_id TEXT NOT NULL,
  lease_epoch INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL,
  requested_status TEXT NOT NULL,
  rule_id TEXT,
  profile_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS issue_executions_active_issue_unique
  ON issue_executions(org_id, issue_id)
  WHERE state IN ('reserved', 'active', 'handoff');
CREATE UNIQUE INDEX IF NOT EXISTS issue_executions_org_correlation_unique
  ON issue_executions(org_id, correlation_id)
  WHERE state IN ('reserved', 'active', 'handoff');
CREATE INDEX IF NOT EXISTS issue_executions_run_idx ON issue_executions(org_id, run_id);
`;

export function migrateIssueExecutionCorrelationIndex(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const rows = all(
    `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = 'issue_executions_org_correlation_unique'`,
  ) as Array<{ name?: string; sql?: string | null }>;
  const createSql = rows[0]?.sql ?? '';
  if (!createSql || createSql.includes('WHERE')) {
    return;
  }
  exec('DROP INDEX IF EXISTS issue_executions_org_correlation_unique');
  exec(`CREATE UNIQUE INDEX IF NOT EXISTS issue_executions_org_correlation_unique
  ON issue_executions(org_id, correlation_id)
  WHERE state IN ('reserved', 'active', 'handoff')`);
}

export const CREATE_RUNS_SQL = `
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  interrupt_id TEXT,
  wait_fire_at INTEGER,
  parent_run_id TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  lease_instance_id TEXT,
  lease_expires_at INTEGER,
  lease_epoch INTEGER NOT NULL DEFAULT 0,
  last_seq INTEGER NOT NULL DEFAULT 0,
  started_by_user_id TEXT,
  via TEXT NOT NULL DEFAULT 'direct',
  on_node_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS runs_active_root_idx ON runs(thread_id)
  WHERE parent_run_id IS NULL AND status IN ('queued', 'running', 'needs_input', 'waiting');
CREATE INDEX IF NOT EXISTS runs_claim_idx ON runs(status, created_at);
CREATE INDEX IF NOT EXISTS runs_ask_ttl_idx ON runs(status, updated_at);
CREATE INDEX IF NOT EXISTS runs_wait_fire_idx ON runs(status, wait_fire_at);
`;

export const CREATE_RUN_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS run_events (
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  metadata TEXT,
  client_event_id TEXT,
  PRIMARY KEY (run_id, seq)
);
CREATE INDEX IF NOT EXISTS run_events_client_idx ON run_events(thread_id, client_event_id);
`;

export const CREATE_RUN_SNAPSHOTS_SQL = `
CREATE TABLE IF NOT EXISTS run_snapshots (
  run_id TEXT PRIMARY KEY REFERENCES runs(run_id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  status TEXT NOT NULL,
  runtime_version TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS run_snapshots_session_idx ON run_snapshots(session_id);
`;

export const CREATE_THREAD_MESSAGE_QUEUE_SQL = `
CREATE TABLE IF NOT EXISTS thread_message_queue (
  item_id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  attachments TEXT,
  origin TEXT,
  client_event_id TEXT UNIQUE,
  queued_at TEXT NOT NULL,
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS thread_message_queue_thread_idx
  ON thread_message_queue(thread_id, queued_at);
`;

export const CREATE_ATTACHMENTS_SQL = `
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'file',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  path TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_thread_idx ON attachments(thread_id);
`;

export const CREATE_APPROVALS_SQL = `
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT,
  interrupt_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  decision_seq INTEGER NOT NULL DEFAULT 0,
  resume_state TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS approvals_run_interrupt
  ON approvals(run_id, interrupt_id)
  WHERE status <> 'superseded';
CREATE INDEX IF NOT EXISTS approvals_status ON approvals(status);
`;

export const CREATE_SCHEDULES_SQL = `
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'failed')),
  target_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  detail TEXT NOT NULL DEFAULT '',
  cron TEXT NOT NULL,
  mode_id TEXT NOT NULL DEFAULT 'default',
  history TEXT NOT NULL DEFAULT 'none' CHECK(history IN ('none', 'last', 'all')),
  history_last INTEGER NOT NULL DEFAULT 1,
  miss_policy TEXT NOT NULL DEFAULT 'catch-up' CHECK(miss_policy IN ('catch-up', 'skip', 'escalate')),
  thread_id TEXT NOT NULL REFERENCES threads(id),
  next_run_at TEXT,
  last_fired_at TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS schedules_org_idx ON schedules(org_id);
CREATE INDEX IF NOT EXISTS schedules_due_idx ON schedules(status, next_run_at);
CREATE UNIQUE INDEX IF NOT EXISTS schedules_thread_idx ON schedules(thread_id);
CREATE TABLE IF NOT EXISTS schedule_fires (
  fire_id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  run_id TEXT,
  created_at TEXT NOT NULL
);
`;

export const CREATE_USAGE_SQL = `
CREATE TABLE IF NOT EXISTS usage (
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
CREATE INDEX IF NOT EXISTS usage_ts_idx ON usage(ts);
CREATE INDEX IF NOT EXISTS usage_agent_idx ON usage(agent_id);
CREATE INDEX IF NOT EXISTS usage_project_idx ON usage(project_id);

CREATE TABLE IF NOT EXISTS budget_marks (
  entity_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  percent INTEGER NOT NULL,
  marked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_overrides (
  model_id TEXT PRIMARY KEY,
  input_per_1m REAL NOT NULL,
  output_per_1m REAL NOT NULL
);
`;

export function migrateApprovalsTable(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const columns = all(`PRAGMA table_info(approvals)`);
  if (columns.length === 0) {
    return;
  }
  if (!columns.some((column) => column.name === 'ttl_at')) {
    return;
  }
  exec('DROP INDEX IF EXISTS approvals_status_ttl;');
  exec('ALTER TABLE approvals DROP COLUMN ttl_at;');
}

export function migrateApprovalsResumeStateColumn(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const columns = all('PRAGMA table_info(approvals)');
  if (columns.length === 0 || columns.some((column) => column.name === 'resume_state')) {
    return;
  }
  exec(`ALTER TABLE approvals ADD COLUMN resume_state TEXT NOT NULL DEFAULT 'pending'`);
  exec(`UPDATE approvals SET resume_state = 'applied' WHERE status <> 'pending'`);
}

export const CREATE_WEBHOOKS_SQL = `
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'failed')),
  target_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  detail TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  last_fired_at TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS webhooks_org_idx ON webhooks(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS webhooks_thread_idx ON webhooks(thread_id);
`;

export const CREATE_THREAD_PLANS_SQL = `
CREATE TABLE IF NOT EXISTS thread_plans (
  org_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS thread_plans_thread_idx ON thread_plans(thread_id);
CREATE INDEX IF NOT EXISTS thread_plans_org_idx ON thread_plans(org_id);
`;

export function migrateThreadPlansTable(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const columns = all(`PRAGMA table_info(thread_plans)`).map((column) => column.name);
  if (columns.length === 0) {
    return;
  }
  if (!columns.includes('created_at')) {
    exec(`ALTER TABLE thread_plans ADD COLUMN created_at TEXT NOT NULL DEFAULT ''`);
  }
}

export const CREATE_AGENT_MEMORY_SQL = `
CREATE TABLE IF NOT EXISTS memory_pins (
  org_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  key TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS memory_pins_org_agent_key_idx
  ON memory_pins(org_id, agent_name, key);

CREATE TABLE IF NOT EXISTS memory_facts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  scope TEXT NOT NULL,
  text TEXT NOT NULL,
  key TEXT,
  thread_id TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 5,
  last_accessed_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  superseded_by TEXT,
  embedding BLOB,
  embedding_model TEXT
);
CREATE INDEX IF NOT EXISTS memory_facts_lookup_idx
  ON memory_facts(org_id, agent_name, scope, key);
`;

export const CREATE_MEMORY_CONSOLIDATIONS_SQL = `
CREATE TABLE IF NOT EXISTS memory_consolidations (
  org_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  last_run_id TEXT NOT NULL DEFAULT '',
  last_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, agent_name, thread_id)
);
`;

export const CREATE_MEMORY_REFLECTS_SQL = `
CREATE TABLE IF NOT EXISTS memory_reflects (
  org_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  last_reflected_at TEXT NOT NULL,
  PRIMARY KEY (org_id, agent_name)
);
`;

export const CREATE_MEMORY_PROMOTIONS_SQL = `
CREATE TABLE IF NOT EXISTS memory_promotions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  instruction_block TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS memory_promotions_org_agent_fact_idx
  ON memory_promotions(org_id, agent_name, fact_id);
`;

export const CREATE_EXECUTION_PROFILES_SQL = `
CREATE TABLE IF NOT EXISTS execution_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  system INTEGER NOT NULL DEFAULT 0,
  normalized_name TEXT NOT NULL,
  isolation TEXT NOT NULL DEFAULT 'host',
  docker_image TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS execution_profiles_org_id_normalized_name_unique
  ON execution_profiles(org_id, normalized_name);
`;

export function migrateExecutionProfileIsolation(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  migrateSqliteColumns(exec, all, 'execution_profiles', [
    { name: 'isolation', ddl: `TEXT NOT NULL DEFAULT 'host'` },
    { name: 'docker_image', ddl: 'TEXT' },
  ]);
}

export const CREATE_EXECUTION_PROFILE_NODES_SQL = `
CREATE TABLE IF NOT EXISTS execution_profile_nodes (
  profile_id TEXT NOT NULL REFERENCES execution_profiles(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, node_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS execution_profile_nodes_profile_node_unique
  ON execution_profile_nodes(profile_id, node_id);
`;

export const CREATE_ORG_EXECUTION_SETTINGS_SQL = `
CREATE TABLE IF NOT EXISTS org_execution_settings (
  org_id TEXT PRIMARY KEY NOT NULL,
  default_profile_id TEXT,
  updated_at TEXT NOT NULL
);
`;

export const CREATE_ORG_MEMORY_SETTINGS_SQL = `
CREATE TABLE IF NOT EXISTS org_memory_settings (
  org_id TEXT PRIMARY KEY NOT NULL,
  embed_model_id TEXT,
  decision_model_id TEXT,
  last_crawl_at TEXT,
  last_crawl_summary TEXT,
  updated_at TEXT NOT NULL
);
`;
