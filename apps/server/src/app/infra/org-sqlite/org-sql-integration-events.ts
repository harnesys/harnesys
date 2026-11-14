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
