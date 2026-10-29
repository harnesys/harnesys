export const CREATE_INTEGRATION_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS integration_events (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export const CREATE_INTEGRATION_EVENTS_DELIVERY_IDX_SQL = `
CREATE INDEX IF NOT EXISTS integration_events_org_integration_idx
  ON integration_events (org_id, integration_id, created_at DESC);
`;

export interface IntegrationEventInsert {
  id: string;
  orgId: string;
  integrationId: string;
  deliveryId: string;
  eventType: string;
  payloadJson: string;
  createdAt: string;
}

type ExecFn = (sql: string) => void;
type AllFn = (sql: string) => Array<Record<string, unknown>>;

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}

export function appendIntegrationEvent(
  exec: ExecFn,
  all: AllFn,
  input: IntegrationEventInsert,
): 'stored' | 'duplicate' {
  exec(`INSERT OR IGNORE INTO integration_events
      (id, org_id, integration_id, delivery_id, event_type, payload_json, created_at)
    VALUES
      ('${escapeSql(input.id)}', '${escapeSql(input.orgId)}', '${escapeSql(input.integrationId)}',
       '${escapeSql(input.deliveryId)}', '${escapeSql(input.eventType)}',
       '${escapeSql(input.payloadJson)}', '${escapeSql(input.createdAt)}')`);
  const changes = all('SELECT changes() AS changes');
  const written = Number(changes[0]?.changes ?? 0);
  return written > 0 ? 'stored' : 'duplicate';
}

export function listRecentIntegrationEvents(
  all: AllFn,
  orgId: string,
  integrationId: string,
  limit: number,
): IntegrationEventInsert[] {
  const rows = all(
    `SELECT id, org_id, integration_id, delivery_id, event_type, payload_json, created_at
     FROM integration_events
     WHERE org_id = '${escapeSql(orgId)}' AND integration_id = '${escapeSql(integrationId)}'
     ORDER BY created_at DESC, id DESC
     LIMIT ${Math.max(1, Math.floor(limit))}`,
  );
  return rows.map((row) => ({
    id: String(row.id ?? ''),
    orgId: String(row.org_id ?? ''),
    integrationId: String(row.integration_id ?? ''),
    deliveryId: String(row.delivery_id ?? ''),
    eventType: String(row.event_type ?? ''),
    payloadJson: String(row.payload_json ?? ''),
    createdAt: String(row.created_at ?? ''),
  }));
}
