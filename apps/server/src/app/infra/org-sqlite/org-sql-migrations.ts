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

export function migrateTriggerOwnerColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  for (const table of ['schedules', 'webhooks']) {
    const present = new Set(all(`PRAGMA table_info(${table})`).map((col) => col.name));
    if (present.size > 0 && !present.has('created_by_user_id')) {
      exec(`ALTER TABLE ${table} ADD COLUMN created_by_user_id TEXT`);
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

export function migrateSchedulesHistoryToThreads(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const schedules = new Set(all('PRAGMA table_info(schedules)').map((col) => col.name));
  if (schedules.size === 0 || !schedules.has('history') || !threadsTableExists(all)) {
    return;
  }
  const policies = threadPolicies(all);
  for (const row of scheduleHistoryRows(all)) {
    applyScheduleHistoryPolicy(exec, policies, row);
  }
  if (schedules.has('history')) {
    exec('ALTER TABLE schedules DROP COLUMN history');
  }
  if (schedules.has('history_last')) {
    exec('ALTER TABLE schedules DROP COLUMN history_last');
  }
}

interface ScheduleHistoryRow {
  threadId?: string;
  history?: string;
  historyLast?: unknown;
}

function threadsTableExists(all: (sql: string) => ColumnInfo[]): boolean {
  return all('PRAGMA table_info(threads)').length > 0;
}

function threadPolicies(all: (sql: string) => ColumnInfo[]): Map<string, string> {
  const policies = new Map<string, string>();
  const rows = all('SELECT id, policy FROM threads') as Array<{ id?: unknown; policy?: unknown }>;
  for (const row of rows) {
    if (typeof row.id === 'string' && typeof row.policy === 'string') {
      policies.set(row.id, row.policy);
    }
  }
  return policies;
}

function scheduleHistoryRows(all: (sql: string) => ColumnInfo[]): ScheduleHistoryRow[] {
  const rows = all('SELECT thread_id, history, history_last FROM schedules') as Array<{
    thread_id?: unknown;
    history?: unknown;
    history_last?: unknown;
  }>;
  return rows.map((row) => ({
    threadId: typeof row.thread_id === 'string' ? row.thread_id : undefined,
    history: typeof row.history === 'string' ? row.history : undefined,
    historyLast: row.history_last,
  }));
}

function applyScheduleHistoryPolicy(
  exec: (sql: string) => void,
  policies: Map<string, string>,
  row: ScheduleHistoryRow,
): void {
  const rawPolicy = row.threadId ? policies.get(row.threadId) : undefined;
  if (!row.threadId || rawPolicy === undefined) {
    return;
  }
  const next = policyWithMigratedHistory(rawPolicy, row.history, row.historyLast);
  if (!next) {
    return;
  }
  exec(`UPDATE threads SET policy = '${escapeSql(next)}' WHERE id = '${escapeSql(row.threadId)}'`);
}

export function migrateWebhooksModeColumn(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const columns = all('PRAGMA table_info(webhooks)');
  if (columns.length === 0) {
    return;
  }
  const mode = columns.find((col) => col.name === 'mode');
  if (!mode) {
    exec(`ALTER TABLE webhooks ADD COLUMN mode TEXT`);
    return;
  }
  if (!mode.notnull && (mode.dflt_value === null || mode.dflt_value === undefined)) {
    return;
  }
  exec(`ALTER TABLE webhooks DROP COLUMN mode`);
  exec(`ALTER TABLE webhooks ADD COLUMN mode TEXT`);
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

const SCHEDULE_HISTORY_TO_HISTORY_MODE: Record<string, string> = {
  none: 'none',
  last: 'last',
  all: 'full',
};

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

function policyWithMigratedHistory(
  rawPolicy: string,
  history: string | undefined,
  historyLast: unknown,
): string | null {
  const parsed = parsePolicyObject(rawPolicy);
  if (!parsed || history === undefined) {
    return null;
  }
  const historyMode = SCHEDULE_HISTORY_TO_HISTORY_MODE[history];
  if (!historyMode || 'historyMode' in parsed) {
    return null;
  }
  const next = { ...parsed, version: 2, historyMode } as Record<string, unknown>;
  if (historyMode === 'last' && typeof historyLast === 'number' && historyLast > 0) {
    next.historyLast = historyLast;
  }
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
