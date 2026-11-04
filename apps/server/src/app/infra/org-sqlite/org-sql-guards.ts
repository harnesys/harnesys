interface ColumnInfo {
  name: string;
}

interface TableSqlRow {
  sql?: string | null;
}

export function assertIssuesStatusKey(all?: (sql: string) => ColumnInfo[]): void {
  if (!all) {
    return;
  }
  const columns = new Set(all('PRAGMA table_info(issues)').map((column) => column.name));
  if (columns.size === 0 || columns.has('status_key')) {
    return;
  }
  throw new Error(
    'Legacy org database detected: table "issues" has no "status_key" column. Delete the org database and restart so the schema is recreated.',
  );
}

export function assertThreadsOwnMembership(all?: (sql: string) => ColumnInfo[]): void {
  if (!all) {
    return;
  }
  const columns = new Set(all('PRAGMA table_info(threads)').map((column) => column.name));
  if (columns.size === 0 || !columns.has('agent_id')) {
    return;
  }
  throw new Error(
    'Legacy org database detected: table "threads" still has an "agent_id" column. Delete the org database and restart so the schema is recreated.',
  );
}

export function assertThreadsThreadSeq(all?: (sql: string) => ColumnInfo[]): void {
  if (!all) {
    return;
  }
  const columns = new Set(all('PRAGMA table_info(threads)').map((column) => column.name));
  if (columns.size === 0 || columns.has('last_thread_seq')) {
    return;
  }
  throw new Error(
    'Legacy org database detected: table "threads" has no "last_thread_seq" column. Delete the org database and restart so the schema is recreated.',
  );
}

export function assertThreadsKindIsConversation(all?: (sql: string) => ColumnInfo[]): void {
  if (!all) {
    return;
  }
  const rows = all(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'threads'",
  ) as TableSqlRow[];
  const ddl = rows[0]?.sql ?? '';
  if (!ddl?.includes("'connector'")) {
    return;
  }
  throw new Error(
    'Legacy org database detected: table "threads" still allows the "connector" kind. Delete the org database and restart so the schema is recreated.',
  );
}

export function assertRunEventsThreadScoped(all?: (sql: string) => ColumnInfo[]): void {
  if (!all) {
    return;
  }
  const columns = new Set(all('PRAGMA table_info(run_events)').map((column) => column.name));
  if (columns.size === 0 || columns.has('thread_seq')) {
    return;
  }
  throw new Error(
    'Legacy org database detected: table "run_events" has no "thread_seq" column. Delete the org database and restart so the schema is recreated.',
  );
}

export function assertRunsAgentSnapshot(all?: (sql: string) => ColumnInfo[]): void {
  if (!all) {
    return;
  }
  const columns = new Set(all('PRAGMA table_info(runs)').map((column) => column.name));
  if (columns.size === 0 || columns.has('agent_name')) {
    return;
  }
  throw new Error(
    'Legacy org database detected: table "runs" has no "agent_name" column. Delete the org database and restart so the schema is recreated.',
  );
}

export function assertRunsOriginConnector(all?: (sql: string) => ColumnInfo[]): void {
  if (!all) {
    return;
  }
  const columns = new Set(all('PRAGMA table_info(runs)').map((column) => column.name));
  if (columns.size === 0 || columns.has('origin_connector_id')) {
    return;
  }
  throw new Error(
    'Legacy org database detected: table "runs" has no "origin_connector_id" column. Delete the org database and restart so the schema is recreated.',
  );
}

export function assertConnectorsAgentSet(all?: (sql: string) => ColumnInfo[]): void {
  if (!all) {
    return;
  }
  const columns = new Set(all('PRAGMA table_info(connectors)').map((column) => column.name));
  if (columns.size === 0 || !columns.has('agent_id')) {
    return;
  }
  throw new Error(
    'Legacy org database detected: table "connectors" still has an "agent_id" column. Delete the org database and restart so the schema is recreated.',
  );
}
