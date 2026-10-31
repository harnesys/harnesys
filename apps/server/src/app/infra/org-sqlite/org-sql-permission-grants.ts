export const CREATE_PERMISSION_GRANTS_SQL = `
CREATE TABLE IF NOT EXISTS permission_grants (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  decided_by TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS permission_grants_agent_operation
  ON permission_grants(org_id, agent_id, operation);
`;
