export const CREATE_INTEGRATION_OAUTH_SESSIONS_SQL = `
CREATE TABLE IF NOT EXISTS integration_oauth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  state TEXT,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER
);
`;

export const CREATE_INTEGRATION_OAUTH_SESSIONS_IDX_SQL = `
CREATE INDEX IF NOT EXISTS integration_oauth_sessions_state_idx
  ON integration_oauth_sessions (provider, kind, state);
`;

export interface IntegrationSessionInsert {
  id: string;
  orgId: string;
  provider: string;
  kind: string;
  state: string | null;
  status: string;
  payloadJson: string;
  createdAt: string;
  expiresAt: number | null;
}

export interface IntegrationSessionRow extends IntegrationSessionInsert {}

type ExecFn = (sql: string) => void;
type AllFn = (sql: string) => Array<Record<string, unknown>>;

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}

export function upsertIntegrationSession(exec: ExecFn, row: IntegrationSessionInsert): void {
  exec(`INSERT OR REPLACE INTO integration_oauth_sessions
      (id, org_id, provider, kind, state, status, payload_json, created_at, expires_at)
    VALUES
      ('${escapeSql(row.id)}', '${escapeSql(row.orgId)}', '${escapeSql(row.provider)}',
       '${escapeSql(row.kind)}', ${row.state === null ? 'NULL' : `'${escapeSql(row.state)}'`},
       '${escapeSql(row.status)}', '${escapeSql(row.payloadJson)}', '${escapeSql(row.createdAt)}',
       ${row.expiresAt === null ? 'NULL' : Math.floor(row.expiresAt)})`);
}

export function getIntegrationSessionById(all: AllFn, id: string): IntegrationSessionRow | null {
  const rows = all(
    `SELECT id, org_id, provider, kind, state, status, payload_json, created_at, expires_at
     FROM integration_oauth_sessions WHERE id = '${escapeSql(id)}'`,
  );
  return rows.length > 0 ? toRow(rows[0] ?? {}) : null;
}

export function findPendingIntegrationSessionByState(
  all: AllFn,
  provider: string,
  kind: string,
  state: string,
): IntegrationSessionRow | null {
  const rows = all(
    `SELECT id, org_id, provider, kind, state, status, payload_json, created_at, expires_at
     FROM integration_oauth_sessions
     WHERE provider = '${escapeSql(provider)}' AND kind = '${escapeSql(kind)}'
       AND state = '${escapeSql(state)}' AND status = 'pending'`,
  );
  return rows.length > 0 ? toRow(rows[0] ?? {}) : null;
}

export function deleteIntegrationSession(exec: ExecFn, id: string): void {
  exec(`DELETE FROM integration_oauth_sessions WHERE id = '${escapeSql(id)}'`);
}

export function purgeExpiredIntegrationSessions(exec: ExecFn, provider: string, now: number): void {
  exec(`DELETE FROM integration_oauth_sessions
    WHERE provider = '${escapeSql(provider)}' AND expires_at IS NOT NULL AND expires_at < ${Math.floor(now)}`);
}

function toRow(record: Record<string, unknown>): IntegrationSessionRow {
  return {
    id: String(record.id ?? ''),
    orgId: String(record.org_id ?? ''),
    provider: String(record.provider ?? ''),
    kind: String(record.kind ?? ''),
    state: record.state === null || record.state === undefined ? null : String(record.state),
    status: String(record.status ?? ''),
    payloadJson: String(record.payload_json ?? '{}'),
    createdAt: String(record.created_at ?? ''),
    expiresAt:
      record.expires_at === null || record.expires_at === undefined
        ? null
        : Number(record.expires_at),
  };
}
