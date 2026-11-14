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
