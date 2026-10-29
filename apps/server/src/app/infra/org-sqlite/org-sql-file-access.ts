export const CREATE_FILE_ACCESS_RULES_SQL = `
CREATE TABLE IF NOT EXISTS file_access_rules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT,
  host_id TEXT,
  path_pattern TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('read', 'edit')),
  effect TEXT NOT NULL CHECK(effect IN ('allow', 'deny')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS file_access_rules_org_agent_idx
  ON file_access_rules(org_id, agent_id);
CREATE INDEX IF NOT EXISTS file_access_rules_org_host_idx
  ON file_access_rules(org_id, host_id);
`;
