export const CREATE_CONNECTORS_SQL = `
CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_pair'
    CHECK(status IN ('awaiting_pair', 'active', 'paused', 'error')),
  bot_user_id TEXT NOT NULL DEFAULT '',
  bot_username TEXT NOT NULL DEFAULT '',
  pair_code_hash TEXT,
  pair_code_expires_at TEXT,
  lease_owner TEXT,
  lease_until TEXT,
  capabilities TEXT NOT NULL DEFAULT '{}',
  policy TEXT NOT NULL,
  mode_override TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS connectors_org_idx ON connectors(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS connectors_org_provider_bot_user_unique
  ON connectors(org_id, provider, bot_user_id)
  WHERE bot_user_id != '';

CREATE TABLE IF NOT EXISTS connector_agents (
  connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (connector_id, agent_id)
);
CREATE INDEX IF NOT EXISTS connector_agents_agent_idx ON connector_agents(agent_id);

CREATE TABLE IF NOT EXISTS connector_bindings (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  external_chat_id TEXT NOT NULL DEFAULT '',
  external_topic_id TEXT NOT NULL DEFAULT '',
  chat_type TEXT NOT NULL DEFAULT 'private',
  title TEXT NOT NULL DEFAULT '',
  thread_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'unpaired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS connector_bindings_chat_unique
  ON connector_bindings(connector_id, external_chat_id, external_topic_id);
CREATE INDEX IF NOT EXISTS connector_bindings_connector_idx
  ON connector_bindings(connector_id);
CREATE INDEX IF NOT EXISTS connector_bindings_thread_idx
  ON connector_bindings(thread_id);

CREATE TABLE IF NOT EXISTS connector_inbox (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  binding_id TEXT,
  update_id INTEGER NOT NULL,
  kind TEXT NOT NULL
    CHECK(kind IN ('message', 'callback', 'command', 'edit', 'generation_stopped', 'unsupported')),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'consumed', 'rejected')),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS connector_inbox_update_unique
  ON connector_inbox(connector_id, update_id);
CREATE INDEX IF NOT EXISTS connector_inbox_pending_idx
  ON connector_inbox(connector_id, status);

CREATE TABLE IF NOT EXISTS connector_deliveries (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  binding_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  block_key TEXT NOT NULL,
  interrupt_id TEXT,
  draft_id INTEGER,
  last_text TEXT,
  external_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'streaming'
    CHECK(status IN ('streaming', 'final', 'failed')),
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS connector_deliveries_block_unique
  ON connector_deliveries(connector_id, run_id, block_key);
CREATE INDEX IF NOT EXISTS connector_deliveries_streaming_idx
  ON connector_deliveries(connector_id, status);
CREATE INDEX IF NOT EXISTS connector_deliveries_message_idx
  ON connector_deliveries(connector_id, external_message_id);
`;
