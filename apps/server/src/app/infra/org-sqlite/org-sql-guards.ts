interface ColumnInfo {
  name: string;
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
