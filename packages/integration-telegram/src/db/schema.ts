export const TELEGRAM_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS readers (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'anonymous'
    CHECK(status IN ('anonymous', 'awaiting_code', 'awaiting_password', 'authorized', 'error')),
  api_id INTEGER NOT NULL,
  phone_masked TEXT NOT NULL DEFAULT '',
  dc_id INTEGER,
  last_error TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY NOT NULL,
  reader_id TEXT NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  peer_kind TEXT NOT NULL DEFAULT 'channel'
    CHECK(peer_kind IN ('channel', 'group', 'supergroup')),
  peer_id TEXT NOT NULL,
  access_hash TEXT NOT NULL DEFAULT '',
  username TEXT,
  title TEXT NOT NULL,
  joined INTEGER NOT NULL DEFAULT 0,
  watch_topics INTEGER NOT NULL DEFAULT 0,
  last_post_id INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sources_peer_idx ON sources(reader_id, peer_id);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'failed')),
  agent_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  mode_id TEXT NOT NULL DEFAULT 'default',
  detail TEXT NOT NULL DEFAULT '',
  filter_json TEXT NOT NULL DEFAULT '[]',
  history TEXT NOT NULL DEFAULT 'none' CHECK(history IN ('none', 'last')),
  history_last INTEGER NOT NULL DEFAULT 20,
  max_runs_per_day INTEGER NOT NULL DEFAULT 50,
  throttle_sec INTEGER NOT NULL DEFAULT 0,
  runs_date TEXT NOT NULL DEFAULT '',
  runs_today INTEGER NOT NULL DEFAULT 0,
  last_fired_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_sources (
  rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, source_id)
);
CREATE INDEX IF NOT EXISTS rule_sources_source_idx ON rule_sources(source_id);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL,
  topic_id INTEGER,
  author_title TEXT,
  text TEXT NOT NULL DEFAULT '',
  media_json TEXT NOT NULL DEFAULT '[]',
  published_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'new'
    CHECK(outcome IN ('new', 'filtered', 'fired', 'throttled', 'over_limit', 'error')),
  fire_count INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS posts_source_post_idx ON posts(source_id, post_id);
CREATE INDEX IF NOT EXISTS posts_received_idx ON posts(received_at DESC);

CREATE TABLE IF NOT EXISTS fires (
  fire_id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fires_rule_idx ON fires(rule_id, created_at);
`;

export const POST_KEEP_PER_SOURCE = 500;
export const POST_MAX_AGE_DAYS = 30;
export const LOGIN_TTL_MS = 10 * 60_000;
export const TEXT_LIMIT = 4_000;
export const PRUNE_INTERVAL_MS = 60 * 60_000;
export const FIRE_KEEP_PER_RULE = 200;
export const RESTART_BACKOFF_MS = 30_000;
