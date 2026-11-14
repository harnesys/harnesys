export const CREATE_INTEGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  account_label TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  cred_ref TEXT NOT NULL,
  provider_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_refresh_at TEXT,
  UNIQUE(org_id, provider, external_account_id)
);
`;
