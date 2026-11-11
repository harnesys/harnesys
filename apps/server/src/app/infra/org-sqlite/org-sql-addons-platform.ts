export const CREATE_ORG_ADDONS_SQL = `
CREATE TABLE IF NOT EXISTS org_addons (
  org_id        TEXT NOT NULL,
  addon_id      TEXT NOT NULL,
  version       TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 0,
  grants_json   TEXT NOT NULL DEFAULT '[]',
  grants_digest TEXT NOT NULL DEFAULT '',
  config_json   TEXT NOT NULL DEFAULT '{}',
  health        TEXT NOT NULL DEFAULT 'stopped'
                CHECK (health IN ('stopped','running','failed','quarantined')),
  last_error    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (org_id, addon_id)
);
`;

export const CREATE_ADDON_BINDINGS_SQL = `
CREATE TABLE IF NOT EXISTS addon_bindings (
  org_id        TEXT NOT NULL,
  addon_id      TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (org_id, addon_id, connection_id, account_id)
);
CREATE INDEX IF NOT EXISTS addon_bindings_account ON addon_bindings (org_id, account_id);
`;

export const CREATE_ADDON_TRIGGER_INSTANCES_SQL = `
CREATE TABLE IF NOT EXISTS addon_trigger_instances (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  addon_id    TEXT NOT NULL,
  trigger_id  TEXT NOT NULL,
  label       TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  target_json TEXT NOT NULL DEFAULT '{}',
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS addon_trigger_instances_addon
  ON addon_trigger_instances (org_id, addon_id);
`;

export const CREATE_ADDON_TRIGGER_FIRES_SQL = `
CREATE TABLE IF NOT EXISTS addon_trigger_fires (
  instance_id TEXT NOT NULL,
  run_key     TEXT NOT NULL,
  fired_at    INTEGER NOT NULL,
  PRIMARY KEY (instance_id, run_key)
);
`;

export const CREATE_ADDON_JOB_STATE_SQL = `
CREATE TABLE IF NOT EXISTS addon_job_state (
  org_id      TEXT NOT NULL,
  addon_id    TEXT NOT NULL,
  job_id      TEXT NOT NULL,
  next_run_at INTEGER,
  last_run_at INTEGER,
  last_status TEXT,
  enabled     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (org_id, addon_id, job_id)
);
`;

export const CREATE_ADDON_TRANSPORT_BINDINGS_SQL = `
CREATE TABLE IF NOT EXISTS addon_transport_bindings (
  org_id           TEXT NOT NULL,
  addon_id         TEXT NOT NULL,
  provider         TEXT NOT NULL,
  external_chat_id TEXT NOT NULL,
  thread_id        TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (org_id, addon_id, provider, external_chat_id)
);
`;

export const CREATE_ADDON_TRANSPORT_SESSIONS_SQL = `
CREATE TABLE IF NOT EXISTS addon_transport_sessions (
  org_id           TEXT NOT NULL,
  addon_id         TEXT NOT NULL,
  provider         TEXT NOT NULL,
  external_chat_id TEXT NOT NULL,
  thread_id        TEXT NOT NULL,
  run_id           TEXT NOT NULL,
  draft            TEXT NOT NULL DEFAULT '',
  last_seq         INTEGER NOT NULL DEFAULT 0,
  message_id       TEXT,
  status           TEXT NOT NULL DEFAULT 'streaming'
                   CHECK(status IN ('streaming','parked','closed')),
  ask_id           TEXT,
  ask_options_json TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (org_id, thread_id, run_id, addon_id)
);
CREATE INDEX IF NOT EXISTS addon_transport_sessions_open
  ON addon_transport_sessions (status, updated_at);
CREATE INDEX IF NOT EXISTS addon_transport_sessions_chat
  ON addon_transport_sessions (org_id, addon_id, external_chat_id);
`;

export const CREATE_ADDON_TRANSPORT_OUTBOUND_SQL = `
CREATE TABLE IF NOT EXISTS addon_transport_outbound (
  org_id     TEXT NOT NULL,
  addon_id   TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, addon_id, message_id)
);
`;

export const CREATE_ADDON_WORKER_LEASES_SQL = `
CREATE TABLE IF NOT EXISTS addon_worker_leases (
  org_id     TEXT NOT NULL,
  addon_id   TEXT NOT NULL,
  worker_id  TEXT NOT NULL,
  holder_id  TEXT NOT NULL,
  epoch      INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, addon_id, worker_id)
);
`;

export function ensureAddonsPlatformSchema(exec: (sql: string) => void): void {
  exec(CREATE_ORG_ADDONS_SQL);
  exec(CREATE_ADDON_BINDINGS_SQL);
  exec(CREATE_ADDON_TRIGGER_INSTANCES_SQL);
  exec(CREATE_ADDON_TRIGGER_FIRES_SQL);
  exec(CREATE_ADDON_JOB_STATE_SQL);
  exec(CREATE_ADDON_TRANSPORT_BINDINGS_SQL);
  exec(CREATE_ADDON_TRANSPORT_SESSIONS_SQL);
  exec(CREATE_ADDON_TRANSPORT_OUTBOUND_SQL);
  exec(CREATE_ADDON_WORKER_LEASES_SQL);
}
