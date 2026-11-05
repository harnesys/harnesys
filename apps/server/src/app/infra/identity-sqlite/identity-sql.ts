export const CREATE_USERS_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  login TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_login_unique ON users(login);
`;

export const CREATE_MEMBERSHIPS_SQL = `
CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, org_id)
);
CREATE INDEX IF NOT EXISTS memberships_org_idx ON memberships(org_id);
`;

export const CREATE_SESSIONS_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  refresh_hash TEXT NOT NULL,
  access_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_refresh_hash_unique ON sessions(refresh_hash);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_access_hash_unique ON sessions(access_hash);
CREATE INDEX IF NOT EXISTS sessions_family_idx ON sessions(family_id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
`;

export const CREATE_CONSUMED_REFRESHES_SQL = `
CREATE TABLE IF NOT EXISTS consumed_refreshes (
  refresh_hash TEXT PRIMARY KEY NOT NULL,
  family_id TEXT NOT NULL,
  consumed_at TEXT NOT NULL
);
`;

export const CREATE_LOGIN_ATTEMPTS_SQL = `
CREATE TABLE IF NOT EXISTS login_attempts (
  login TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_login_idx ON login_attempts(login, at);
`;

export const CREATE_USER_INVITES_SQL = `
CREATE TABLE IF NOT EXISTS user_invites (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS user_invites_code_hash_unique ON user_invites(code_hash);
CREATE INDEX IF NOT EXISTS user_invites_org_idx ON user_invites(org_id);
`;

export const CREATE_IDENTITY_AUDIT_SQL = `
CREATE TABLE IF NOT EXISTS identity_audit (
  id TEXT PRIMARY KEY NOT NULL,
  at TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  reason TEXT
);
`;

export const CREATE_IDENTITY_LINKS_SQL = `
CREATE TABLE IF NOT EXISTS identity_links (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  display_name TEXT,
  handle TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider)
);
CREATE UNIQUE INDEX IF NOT EXISTS identity_links_identity_unique
  ON identity_links(provider, provider_user_id);
`;

export function migrateIdentityLinkProfileColumns(
  exec: (sql: string) => void,
  all: (sql: string) => Array<{ name: string }>,
): void {
  const present = new Set(all('PRAGMA table_info(identity_links)').map((column) => column.name));
  if (!present.has('display_name')) {
    exec('ALTER TABLE identity_links ADD COLUMN display_name TEXT');
  }
  if (!present.has('handle')) {
    exec('ALTER TABLE identity_links ADD COLUMN handle TEXT');
  }
}

export const CREATE_IDENTITY_LINK_CODES_SQL = `
CREATE TABLE IF NOT EXISTS identity_link_codes (
  code_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS identity_link_codes_expiry_idx ON identity_link_codes(expires_at);
`;

export function ensureIdentitySchema(
  exec: (sql: string) => void,
  all?: (sql: string) => Array<{ name: string }>,
): void {
  exec(CREATE_USERS_SQL);
  exec(CREATE_MEMBERSHIPS_SQL);
  exec(CREATE_SESSIONS_SQL);
  exec(CREATE_CONSUMED_REFRESHES_SQL);
  exec(CREATE_LOGIN_ATTEMPTS_SQL);
  exec(CREATE_USER_INVITES_SQL);
  exec(CREATE_IDENTITY_AUDIT_SQL);
  exec(CREATE_IDENTITY_LINKS_SQL);
  if (all) {
    migrateIdentityLinkProfileColumns(exec, all);
  }
  exec(CREATE_IDENTITY_LINK_CODES_SQL);
}
