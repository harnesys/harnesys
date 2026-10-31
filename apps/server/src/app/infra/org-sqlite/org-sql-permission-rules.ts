export const CREATE_PERMISSION_RULES_SQL = `
CREATE TABLE IF NOT EXISTS permission_rules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT,
  host_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('fs-path', 'shell-cmd', 'op')),
  pattern TEXT NOT NULL,
  action TEXT CHECK(action IN ('read', 'edit')),
  effect TEXT NOT NULL CHECK(effect IN ('allow', 'deny')),
  decided_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS permission_rules_org_kind_idx
  ON permission_rules(org_id, kind);
CREATE INDEX IF NOT EXISTS permission_rules_org_agent_idx
  ON permission_rules(org_id, agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS permission_rules_identity_idx
  ON permission_rules(kind, pattern, COALESCE(agent_id, ''), COALESCE(action, ''), effect, COALESCE(host_id, ''));
`;

type SqlExec = (statement: string) => void;
type SqlAll = (statement: string) => unknown[];

interface AgentsRow {
  id: string;
  org_id: string;
  config: string;
}

interface ModePresetRow {
  id: string;
  org_id: string;
  packs_json: string;
}

/**
 * Moves legacy exception stores into permission_rules, then drops them.
 * Sources: file_access_rules (fs-path), permission_grants (op),
 * shell allowlist/blocklist in agents.config and mode_presets.packs_json (shell-cmd).
 * Idempotent: rows are keyed by (kind, pattern, agent_id, action, effect) and both
 * legacy tables are guarded by existence checks; a second run inserts nothing.
 * Shell spec allowlist/blocklist fields are removed from the configs after copy.
 */
export function migratePermissionRules(exec: SqlExec, all: SqlAll): void {
  if (tableExists(all, 'file_access_rules')) {
    exec(`
      INSERT OR IGNORE INTO permission_rules (id, org_id, agent_id, host_id, kind, pattern, action, effect, decided_by, created_at, updated_at)
      SELECT
        r.id, r.org_id, r.agent_id, r.host_id, 'fs-path', r.path_pattern, r.action, r.effect, NULL,
        r.created_at, r.updated_at
      FROM file_access_rules r;
    `);
    exec(`DROP TABLE file_access_rules`);
  }
  if (tableExists(all, 'permission_grants')) {
    exec(`
      INSERT OR IGNORE INTO permission_rules (id, org_id, agent_id, host_id, kind, pattern, action, effect, decided_by, created_at, updated_at)
      SELECT
        'op-' || r.id, r.org_id, r.agent_id, NULL, 'op', r.operation, NULL, 'allow', r.decided_by,
        r.created_at, r.created_at
      FROM permission_grants r;
    `);
    exec(`DROP TABLE permission_grants`);
  }

  const now = new Date().toISOString();
  for (const raw of all(`SELECT id, org_id, config FROM agents`)) {
    const row = raw as AgentsRow;
    copyShellSpecRules(
      { exec, orgId: row.org_id, agentId: row.id, now },
      shellSpecOfAgent(row.config),
    );
    const withoutLists = stripShellLists(row.config);
    if (withoutLists !== null) {
      exec(`UPDATE agents SET config = '${escapeSql(withoutLists)}' WHERE id = '${row.id}';`);
    }
  }
  for (const raw of all(`SELECT id, org_id, packs_json FROM mode_presets`)) {
    const row = raw as ModePresetRow;
    copyShellSpecRules(
      { exec, orgId: row.org_id, agentId: null, now },
      shellSpecOfPreset(row.packs_json),
    );
    const withoutLists = stripShellLists(row.packs_json);
    if (withoutLists !== null) {
      exec(
        `UPDATE mode_presets SET packs_json = '${escapeSql(withoutLists)}' WHERE id = '${row.id}' AND org_id = '${row.org_id}';`,
      );
    }
  }
}

function tableExists(all: SqlAll, table: string): boolean {
  return (
    all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table}'`).length > 0
  );
}

interface LegacyShellSpec {
  allowlist?: unknown;
  blocklist?: unknown;
}

interface ShellCopyContext {
  exec: SqlExec;
  orgId: string;
  agentId: string | null;
  now: string;
}

function copyShellSpecRules(
  ctxIn: Omit<ShellCopyContext, 'now'> & { now: string },
  spec: LegacyShellSpec | undefined,
): void {
  if (spec === undefined) {
    return;
  }
  const ctx: ShellCopyContext = ctxIn;
  copyShellList(ctx, spec.allowlist, 'allow');
  copyShellList(ctx, spec.blocklist, 'deny');
}

function copyShellList(ctx: ShellCopyContext, raw: unknown, effect: 'allow' | 'deny'): void {
  const { exec, orgId, agentId, now } = ctx;
  if (!Array.isArray(raw)) {
    return;
  }
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      continue;
    }
    const pattern = escapeSql(entry.trim());
    exec(`
      INSERT OR IGNORE INTO permission_rules (id, org_id, agent_id, kind, pattern, action, effect, decided_by, created_at, updated_at)
      SELECT '${crypto.randomUUID()}', '${orgId}', ${agentId === null ? 'NULL' : `'${agentId}'`},
             'shell-cmd', '${pattern}', NULL, '${effect}', 'migration', '${now}', '${now}';
    `);
  }
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function shellSpecOfAgent(configJson: string): LegacyShellSpec | undefined {
  if (configJson.trim() === '') {
    return undefined;
  }
  return shellSpecOfPackedJson(configJson);
}

function shellSpecOfPreset(packsJson: string): LegacyShellSpec | undefined {
  if (packsJson.trim() === '') {
    return undefined;
  }
  return shellSpecOfPackedJson(packsJson);
}

interface ShellSpecSubject {
  shell?: { spec?: LegacyShellSpec | null };
}

/**
 * Returns the JSON with shell spec allowlist/blocklist removed, or null when
 * nothing has to change (either no shell spec lists or unparsable JSON).
 */
function stripShellLists(raw: string): string | null {
  if (raw.trim() === '') {
    return null;
  }
  let parsed: ShellSpecSubject;
  try {
    parsed = JSON.parse(raw) as ShellSpecSubject;
  } catch {
    return null;
  }
  const shell = parsed?.shell;
  const spec = shell?.spec;
  if (
    shell === null ||
    shell === undefined ||
    spec === null ||
    spec === undefined ||
    typeof spec !== 'object'
  ) {
    return null;
  }
  if (!Array.isArray(spec.allowlist) && !Array.isArray(spec.blocklist)) {
    return null;
  }
  if (Array.isArray(spec.allowlist)) {
    delete spec.allowlist;
  }
  if (Array.isArray(spec.blocklist)) {
    delete spec.blocklist;
  }
  if (Object.keys(spec).length === 0) {
    delete shell.spec;
  }
  if (Object.keys(shell).length === 0) {
    delete parsed.shell;
  }
  return JSON.stringify(parsed);
}

function shellSpecOfPackedJson(raw: string): LegacyShellSpec | undefined {
  if (raw.trim() === '') {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }
  const packs = parsed as Record<string, unknown>;
  const shell = packs.shell;
  if (shell === null || typeof shell !== 'object' || Array.isArray(shell)) {
    return undefined;
  }
  const spec = (shell as Record<string, unknown>).spec;
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
    return undefined;
  }
  const list = spec as Record<string, unknown>;
  if (!Array.isArray(list.allowlist) && !Array.isArray(list.blocklist)) {
    return undefined;
  }
  return list as LegacyShellSpec;
}
