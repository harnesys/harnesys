export interface AppsColumnInfo {
  name: string;
}

export const CREATE_APPS_SQL = `
CREATE TABLE IF NOT EXISTS apps (
  id                 TEXT PRIMARY KEY NOT NULL,
  org_id             TEXT NOT NULL,
  kind               TEXT NOT NULL,
  label              TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'configured',
  last_error         TEXT,
  values_json        TEXT NOT NULL DEFAULT '{}',
  secret_fields_json TEXT NOT NULL DEFAULT '[]',
  metadata_json      TEXT NOT NULL DEFAULT '{}',
  verified_at        INTEGER,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  CHECK (status IN ('configured', 'invalid'))
);
`;

export const CREATE_APPS_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS apps_org_kind ON apps (org_id, kind);
`;

export const CREATE_APP_ACCOUNTS_SQL = `
CREATE TABLE IF NOT EXISTS app_accounts (
  id                  TEXT PRIMARY KEY NOT NULL,
  org_id              TEXT NOT NULL,
  app_id              TEXT REFERENCES apps (id) ON DELETE RESTRICT,
  kind                TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  partition           TEXT NOT NULL DEFAULT '',
  label               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'connected',
  last_error          TEXT,
  scopes_json         TEXT NOT NULL DEFAULT '[]',
  expires_at          INTEGER,
  config_json         TEXT NOT NULL DEFAULT '{}',
  secret_fields_json  TEXT NOT NULL DEFAULT '[]',
  metadata_json       TEXT NOT NULL DEFAULT '{}',
  verified_at         INTEGER,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  CHECK (status IN ('connected', 'expired', 'error')),
  UNIQUE (org_id, kind, external_account_id, partition)
);
`;

export const CREATE_APP_ACCOUNTS_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS app_accounts_org_kind ON app_accounts (org_id, kind);
CREATE INDEX IF NOT EXISTS app_accounts_org_app ON app_accounts (org_id, app_id);
`;

export function ensureAppsSchema(
  exec: (sql: string) => void,
  all?: (sql: string) => AppsColumnInfo[],
): void {
  const present = all ? new Set(all('PRAGMA table_info(apps)').map((column) => column.name)) : null;
  if (present && present.size > 0 && !present.has('metadata_json')) {
    exec('DROP TABLE IF EXISTS app_accounts;');
    exec('DROP TABLE IF EXISTS apps;');
  }
  exec(CREATE_APPS_SQL);
  exec(CREATE_APPS_INDEXES_SQL);
  exec(CREATE_APP_ACCOUNTS_SQL);
  exec(CREATE_APP_ACCOUNTS_INDEXES_SQL);
}
