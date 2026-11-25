export interface ColumnInfo {
  name: string;
  notnull?: number;
  dflt_value?: string | null;
}

export function migrateThreadsBindingColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(threads)').map((col) => col.name));
  const columns = [
    { name: 'run_profile_id', ddl: 'TEXT' },
    { name: 'run_directory', ddl: 'TEXT' },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE threads ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function migrateThreadsWorkspaceRefColumn(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(threads)').map((col) => col.name));
  if (present.size > 0 && !present.has('workspace_ref')) {
    exec('ALTER TABLE threads ADD COLUMN workspace_ref TEXT');
  }
}

export function migrateRunsEnvironmentColumn(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(runs)').map((col) => col.name));
  if (present.size > 0 && !present.has('environment')) {
    exec('ALTER TABLE runs ADD COLUMN environment TEXT');
  }
}

export function migratePendingPlacementsEnvironmentColumn(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(pending_placements)').map((col) => col.name));
  if (present.size > 0 && !present.has('environment')) {
    exec('ALTER TABLE pending_placements ADD COLUMN environment TEXT');
  }
}

export function migrateRunsAttributionColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(runs)').map((col) => col.name));
  const columns = [
    { name: 'started_by_user_id', ddl: 'TEXT' },
    { name: 'via', ddl: `TEXT NOT NULL DEFAULT 'direct'` },
    { name: 'on_node_id', ddl: 'TEXT' },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE runs ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function migrateRunsWakeKeyColumn(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(runs)').map((col) => col.name));
  if (present.size === 0) {
    return;
  }
  if (!present.has('wake_key')) {
    exec(`ALTER TABLE runs ADD COLUMN wake_key TEXT`);
  }
  exec('CREATE INDEX IF NOT EXISTS runs_wake_key_idx ON runs(status, wake_key)');
}

export function migrateModePresetToolColumns(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const present = new Set(all('PRAGMA table_info(mode_presets)').map((col) => col.name));
  if (present.size === 0) {
    return;
  }
  const columns = [
    { name: 'disabled_tools_json', ddl: `TEXT NOT NULL DEFAULT '[]'` },
    { name: 'exposure_json', ddl: `TEXT NOT NULL DEFAULT '{}'` },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE mode_presets ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function migrateIssuesBranchColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(issues)').map((col) => col.name));
  if (present.size === 0) {
    return;
  }
  const columns = [
    { name: 'branch', ddl: 'TEXT' },
    { name: 'workspace_subpath', ddl: 'TEXT' },
    { name: 'worktree_on_status', ddl: 'TEXT' },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE issues ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function migrateAppsSecretFieldColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const accounts = new Set(all('PRAGMA table_info(app_accounts)').map((col) => col.name));
  if (accounts.size > 0) {
    const columns = [
      { name: 'values_json', ddl: `TEXT NOT NULL DEFAULT '{}'` },
      { name: 'secret_fields_json', ddl: `TEXT NOT NULL DEFAULT '[]'` },
    ];
    for (const column of columns) {
      if (!accounts.has(column.name)) {
        exec(`ALTER TABLE app_accounts ADD COLUMN ${column.name} ${column.ddl}`);
      }
    }
    if (accounts.has('secret_ref')) {
      exec('ALTER TABLE app_accounts DROP COLUMN secret_ref');
    }
  }
  const apps = new Set(all('PRAGMA table_info(apps)').map((col) => col.name));
  if (apps.size > 0 && !apps.has('secret_fields_json')) {
    exec(`ALTER TABLE apps ADD COLUMN secret_fields_json TEXT NOT NULL DEFAULT '[]'`);
  }
}

export function migrateThreadsPolicyContextWindow(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  if (all('PRAGMA table_info(threads)').length === 0) {
    return;
  }
  const rows = all('SELECT id, policy FROM threads') as Array<{ id?: unknown; policy?: unknown }>;
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : undefined;
    const policy = typeof row.policy === 'string' ? row.policy : undefined;
    if (!id || !policy) {
      continue;
    }
    const next = policyWithoutContextWindow(policy);
    if (!next) {
      continue;
    }
    exec(`UPDATE threads SET policy = '${escapeSql(next)}' WHERE id = '${escapeSql(id)}'`);
  }
}

export function migrateThreadMessageQueueModeColumn(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(thread_message_queue)').map((col) => col.name));
  if (present.size > 0 && !present.has('mode')) {
    exec(`ALTER TABLE thread_message_queue ADD COLUMN mode TEXT`);
  }
}

export function migrateThreadMessageQueueTargetRunColumn(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(thread_message_queue)').map((col) => col.name));
  if (present.size > 0 && !present.has('target_run_id')) {
    exec(`ALTER TABLE thread_message_queue ADD COLUMN target_run_id TEXT`);
  }
}

function policyWithoutContextWindow(rawPolicy: string): string | null {
  const parsed = parsePolicyObject(rawPolicy);
  if (!parsed || typeof parsed.contextWindow !== 'number') {
    return null;
  }
  const next: Record<string, unknown> = { ...parsed, version: 2, historyMode: 'last' };
  delete next.contextWindow;
  next.historyLast = Math.ceil(parsed.contextWindow / 2);
  return JSON.stringify(next);
}

function parsePolicyObject(rawPolicy: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(rawPolicy);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...(parsed as Record<string, unknown>) };
    }
    return null;
  } catch {
    return null;
  }
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}
