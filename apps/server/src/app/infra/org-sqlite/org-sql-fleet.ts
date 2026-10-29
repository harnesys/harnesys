export const CREATE_EVENT_CLAIMS_SQL = `
CREATE TABLE IF NOT EXISTS event_claims (
  run_id TEXT PRIMARY KEY NOT NULL,
  node_id TEXT NOT NULL,
  lease_epoch INTEGER NOT NULL DEFAULT 0,
  lease_until TEXT NOT NULL,
  token TEXT NOT NULL,
  done_at TEXT
);
CREATE INDEX IF NOT EXISTS event_claims_node_idx ON event_claims(node_id, lease_until);
`;

export const CREATE_NODE_COMMANDS_SQL = `
CREATE TABLE IF NOT EXISTS node_commands (
  id TEXT PRIMARY KEY NOT NULL,
  node_id TEXT NOT NULL,
  command_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS node_commands_node ON node_commands(node_id, created_at);
`;

export const CREATE_SOURCE_WRITE_LEASES_SQL = `
CREATE TABLE IF NOT EXISTS source_write_leases (
  source_id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  lease_epoch INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL
);
`;

export const CREATE_SOURCE_OPERATION_GRANTS_SQL = `
CREATE TABLE IF NOT EXISTS source_operation_grants (
  operation_id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  cred_ref TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS source_operation_grants_org_node
  ON source_operation_grants(org_id, node_id, expires_at);
`;

export const CREATE_ORG_CONFIG_REVISIONS_SQL = `
CREATE TABLE IF NOT EXISTS org_config_revisions (
  org_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
`;

export const CREATE_NODE_SNAPSHOT_ACKS_SQL = `
CREATE TABLE IF NOT EXISTS node_snapshot_acks (
  org_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, node_id)
);
`;

export const CREATE_ORG_EXECUTION_REPLICA_SQL = `
CREATE TABLE IF NOT EXISTS org_execution_replica (
  org_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  accepted_at TEXT NOT NULL
);
`;

export const CREATE_PENDING_RUN_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS pending_run_events (
  run_id TEXT NOT NULL,
  lease_epoch INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  started_by_user_id TEXT,
  via TEXT NOT NULL DEFAULT 'direct',
  on_node_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, lease_epoch, seq)
);
CREATE INDEX IF NOT EXISTS pending_run_events_run_idx
  ON pending_run_events(run_id, lease_epoch, seq);
`;

const RUN_ATTRIBUTION_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'started_by_user_id', ddl: 'TEXT' },
  { name: 'via', ddl: `TEXT NOT NULL DEFAULT 'direct'` },
  { name: 'on_node_id', ddl: 'TEXT' },
];

export function migratePendingRunEventsAttributionColumns(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const present = new Set(all('PRAGMA table_info(pending_run_events)').map((col) => col.name));
  for (const column of RUN_ATTRIBUTION_COLUMNS) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE pending_run_events ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export const CREATE_WORKER_ORG_OPERATION_RECEIPTS_SQL = `
CREATE TABLE IF NOT EXISTS worker_org_operation_receipts (
  org_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, run_id, operation_id)
);
`;

export const CREATE_PENDING_PLACEMENTS_SQL = `
CREATE TABLE IF NOT EXISTS pending_placements (
  run_id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  config_revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_reason TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 3,
  trigger_kind TEXT NOT NULL,
  trigger_id TEXT NOT NULL,
  expires_at TEXT,
  payload_json TEXT NOT NULL,
  last_candidates_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS pending_placements_profile_idx
  ON pending_placements(profile_id, created_at, run_id);
`;

export const CREATE_ORG_TICKET_KEYS_SQL = `
CREATE TABLE IF NOT EXISTS org_ticket_keys (
  org_id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  rotated_at TEXT
);
`;

export const CREATE_ORG_AUDIT_SQL = `
CREATE TABLE IF NOT EXISTS org_audit (
  id TEXT PRIMARY KEY NOT NULL,
  at TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  via_node_id TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  result TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS org_audit_at_idx ON org_audit(at);
`;

export const CREATE_INVITES_SQL = `
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY NOT NULL,
  code_hash TEXT NOT NULL,
  node_name TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
`;

export const CREATE_INVITES_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS invites_code_hash_unique ON invites(code_hash);
`;

interface ColumnInfo {
  name: string;
}

export function migrateInvitesCodeHash(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const present = new Set(all('PRAGMA table_info(invites)').map((col) => col.name));
  if (!(present.has('code') && !present.has('code_hash'))) {
    return;
  }
  exec('DROP TABLE invites');
  exec(CREATE_INVITES_SQL);
}

export function ensureFleetSchema(exec: (sql: string) => void): void {
  exec(CREATE_EVENT_CLAIMS_SQL);
  exec(CREATE_NODE_COMMANDS_SQL);
  exec(CREATE_SOURCE_WRITE_LEASES_SQL);
  exec(CREATE_SOURCE_OPERATION_GRANTS_SQL);
  exec(CREATE_ORG_CONFIG_REVISIONS_SQL);
  exec(CREATE_NODE_SNAPSHOT_ACKS_SQL);
  exec(CREATE_ORG_EXECUTION_REPLICA_SQL);
  exec(CREATE_PENDING_RUN_EVENTS_SQL);
  exec(CREATE_WORKER_ORG_OPERATION_RECEIPTS_SQL);
  exec(CREATE_PENDING_PLACEMENTS_SQL);
  exec(CREATE_ORG_TICKET_KEYS_SQL);
  exec(CREATE_ORG_AUDIT_SQL);
}
