export interface ColumnInfo {
  name: string;
}

export function migrateThreadsBindingColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(threads)').map((col) => col.name));
  const columns = [
    { name: 'run_profile_id', ddl: 'TEXT' },
    { name: 'run_directory', ddl: 'TEXT' },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE threads ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function migrateRunsAttributionColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(runs)').map((col) => col.name));
  const columns = [
    { name: 'started_by_user_id', ddl: 'TEXT' },
    { name: 'via', ddl: `TEXT NOT NULL DEFAULT 'direct'` },
    { name: 'on_node_id', ddl: 'TEXT' },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE runs ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function migrateModePresetToolColumns(
  exec: (sql: string) => void,
  all?: (sql: string) => ColumnInfo[],
): void {
  if (!all) {
    return;
  }
  const present = new Set(all('PRAGMA table_info(mode_presets)').map((col) => col.name));
  if (present.size === 0) {
    return;
  }
  const columns = [
    { name: 'disabled_tools_json', ddl: `TEXT NOT NULL DEFAULT '[]'` },
    { name: 'exposure_json', ddl: `TEXT NOT NULL DEFAULT '{}'` },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE mode_presets ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function migrateTriggerOwnerColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  for (const table of ['schedules', 'webhooks']) {
    const present = new Set(all(`PRAGMA table_info(${table})`).map((col) => col.name));
    if (present.size > 0 && !present.has('created_by_user_id')) {
      exec(`ALTER TABLE ${table} ADD COLUMN created_by_user_id TEXT`);
    }
  }
}

export function migrateIssuesBranchColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const present = new Set(all('PRAGMA table_info(issues)').map((col) => col.name));
  if (present.size === 0) {
    return;
  }
  const columns = [
    { name: 'branch', ddl: 'TEXT' },
    { name: 'worktree_on_status', ddl: 'TEXT' },
  ];
  for (const column of columns) {
    if (!present.has(column.name)) {
      exec(`ALTER TABLE issues ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

export function migrateAppsSecretFieldColumns(
  exec: (sql: string) => void,
  all: (sql: string) => ColumnInfo[],
): void {
  const accounts = new Set(all('PRAGMA table_info(app_accounts)').map((col) => col.name));
  if (accounts.size > 0) {
    const columns = [
      { name: 'values_json', ddl: `TEXT NOT NULL DEFAULT '{}'` },
      { name: 'secret_fields_json', ddl: `TEXT NOT NULL DEFAULT '[]'` },
    ];
    for (const column of columns) {
      if (!accounts.has(column.name)) {
        exec(`ALTER TABLE app_accounts ADD COLUMN ${column.name} ${column.ddl}`);
      }
    }
    if (accounts.has('secret_ref')) {
      exec('ALTER TABLE app_accounts DROP COLUMN secret_ref');
    }
  }
  const apps = new Set(all('PRAGMA table_info(apps)').map((col) => col.name));
  if (apps.size > 0 && !apps.has('secret_fields_json')) {
    exec(`ALTER TABLE apps ADD COLUMN secret_fields_json TEXT NOT NULL DEFAULT '[]'`);
  }
}
