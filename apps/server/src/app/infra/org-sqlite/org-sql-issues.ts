export const CREATE_ISSUE_BOARDS_SQL = `
CREATE TABLE IF NOT EXISTS issue_boards (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6366f1',
  icon TEXT NOT NULL DEFAULT 'kanban-square',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS issue_boards_org_idx ON issue_boards(org_id);
`;

export const CREATE_ISSUE_LABELS_SQL = `
CREATE TABLE IF NOT EXISTS issue_labels (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  title TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS issue_labels_org_idx ON issue_labels(org_id);
CREATE INDEX IF NOT EXISTS issue_labels_title_idx ON issue_labels(org_id, title);
`;

export const CREATE_ISSUES_SQL = `
CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  board_id TEXT NOT NULL REFERENCES issue_boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status_key TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 4),
  type TEXT NOT NULL DEFAULT 'task'
    CHECK(type IN ('task', 'bug', 'research', 'feature', 'improvement', 'review')),
  assignee_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  labels TEXT NOT NULL DEFAULT '[]',
  parent_issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
  due_date TEXT,
  closed_at TEXT,
  fire_trail TEXT NOT NULL DEFAULT '[]',
  source_id TEXT,
  worktree_base_branch TEXT,
  branch TEXT,
  worktree_on_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS issues_org_idx ON issues(org_id, status_key);
CREATE INDEX IF NOT EXISTS issues_board_idx ON issues(board_id, status_key);
CREATE INDEX IF NOT EXISTS issues_assignee_idx ON issues(assignee_agent_id);
CREATE INDEX IF NOT EXISTS issues_parent_idx ON issues(parent_issue_id);
`;

export const CREATE_ISSUE_COMMENTS_SQL = `
CREATE TABLE IF NOT EXISTS issue_comments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK(author_type IN ('human', 'agent')),
  author_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS issue_comments_issue_idx ON issue_comments(issue_id, created_at);
`;

export const CREATE_ISSUE_DEPENDENCIES_SQL = `
CREATE TABLE IF NOT EXISTS issue_dependencies (
  org_id TEXT NOT NULL,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  depends_on_issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'blocks' CHECK(type IN ('blocks', 'relates', 'duplicate')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (issue_id, depends_on_issue_id),
  CHECK(issue_id <> depends_on_issue_id)
);
CREATE INDEX IF NOT EXISTS issue_dependencies_issue_idx ON issue_dependencies(issue_id);
CREATE INDEX IF NOT EXISTS issue_dependencies_depends_on_idx ON issue_dependencies(depends_on_issue_id);
`;

export const CREATE_ISSUE_ATTACHMENTS_SQL = `
CREATE TABLE IF NOT EXISTS issue_attachments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('file', 'source')),
  name TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  kind_media TEXT NOT NULL DEFAULT 'file' CHECK(kind_media IN ('image', 'audio', 'video', 'file')),
  size_bytes INTEGER NOT NULL DEFAULT 0,
  path TEXT,
  source_id TEXT,
  source_path TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS issue_attachments_issue_idx ON issue_attachments(issue_id);
`;
