export const CREATE_SOURCES_SQL = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  distribution_json TEXT NOT NULL,
  ui_visibility TEXT NOT NULL DEFAULT 'org',
  managed INTEGER NOT NULL DEFAULT 0,
  lsp_json TEXT,
  vcs_json TEXT,
  availability_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const CREATE_SOURCE_MATERIALIZATIONS_SQL = `
CREATE TABLE IF NOT EXISTS source_materializations (
  org_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  local_path TEXT,
  state TEXT NOT NULL,
  last_error TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  last_conflict_paths TEXT NOT NULL DEFAULT '[]',
  refresh_required INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, source_id, host_id)
);
`;

export const CREATE_SOURCE_MATERIALIZATION_PROJECTIONS_SQL = `
CREATE TABLE IF NOT EXISTS source_materialization_projections (
  org_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  state TEXT NOT NULL,
  revision INTEGER NOT NULL,
  last_confirmed_at TEXT NOT NULL,
  last_error_code TEXT,
  last_conflict_paths TEXT NOT NULL DEFAULT '[]',
  refresh_required INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, source_id, host_id)
);
`;
