export const CREATE_DASHBOARDS_SQL = `
CREATE TABLE IF NOT EXISTS dashboards (
  org_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, id)
);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  org_id TEXT NOT NULL,
  id TEXT NOT NULL,
  dashboard_id TEXT NOT NULL,
  slot_json TEXT NOT NULL DEFAULT '{}',
  doc_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, id)
);
CREATE INDEX IF NOT EXISTS dashboard_widgets_org_dashboard_idx
  ON dashboard_widgets(org_id, dashboard_id);

CREATE TABLE IF NOT EXISTS dashboard_widget_state (
  org_id TEXT NOT NULL,
  widget_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL DEFAULT 'null',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, widget_id, key)
);
`;

interface ColumnInfo {
  name: string;
}

/** Dev DBs created before color/icon need the columns appended. */
export function migrateDashboardPresentationColumns(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const present = new Set(all('PRAGMA table_info(dashboards)').map((col) => col.name));
  if (present.size === 0) {
    return;
  }
  for (const column of [
    { name: 'color', ddl: 'TEXT' },
    { name: 'icon', ddl: 'TEXT' },
  ]) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE dashboards ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}
