export const CREATE_HOOK_RUNS_SQL = `
CREATE TABLE IF NOT EXISTS hook_runs (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  hook_id TEXT NOT NULL,
  event TEXT NOT NULL,
  handler_type TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  error_code TEXT,
  effects_json TEXT NOT NULL DEFAULT '[]',
  run_id TEXT,
  thread_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS hook_runs_agent_created_idx
  ON hook_runs(agent_id, created_at);
`;
