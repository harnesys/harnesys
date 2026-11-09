export const CREATE_APPS_SQL = `
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'configured',
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status IN ('configured', 'invalid'))
);
`;

export const CREATE_APPS_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS apps_org_idx ON apps(org_id);
CREATE INDEX IF NOT EXISTS apps_org_kind_idx ON apps(org_id, kind);
`;

export const CREATE_APP_ACCOUNTS_SQL = `
CREATE TABLE IF NOT EXISTS app_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  app_id TEXT REFERENCES apps(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  scopes_json TEXT NOT NULL DEFAULT '[]',
  scope_key TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status IN ('connected', 'expired', 'error', 'pending')),
  UNIQUE (org_id, kind, external_account_id, scope_key)
);
`;

export const CREATE_APP_ACCOUNTS_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS app_accounts_org_idx ON app_accounts(org_id);
CREATE INDEX IF NOT EXISTS app_accounts_app_idx ON app_accounts(app_id);
`;

export function ensureAppsSchema(exec: (sql: string) => void): void {
  exec(CREATE_APPS_SQL);
  exec(CREATE_APPS_INDEXES_SQL);
  exec(CREATE_APP_ACCOUNTS_SQL);
  exec(CREATE_APP_ACCOUNTS_INDEXES_SQL);
}
