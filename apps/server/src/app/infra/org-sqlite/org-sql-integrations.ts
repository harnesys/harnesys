import type { ColumnInfo } from './org-sql-usage.ts';

export const CREATE_INTEGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  account_label TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  cred_ref TEXT NOT NULL,
  provider_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_refresh_at TEXT,
  UNIQUE(org_id, provider, external_account_id)
);
`;

interface CloudDriveDistributionJson {
  kind?: unknown;
  backend?: unknown;
  remoteFolderId?: unknown;
  credRef?: unknown;
  integrationId?: unknown;
}

interface BackfillSourceRow {
  id: string;
  org_id: string;
  distribution_json: string;
}

type ExecFn = (sql: string) => void;
type AllFn = (sql: string) => ColumnInfo[];

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}

function parseDistribution(raw: string): CloudDriveDistributionJson | null {
  try {
    const json: unknown = JSON.parse(raw);
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return null;
    }
    return json as CloudDriveDistributionJson;
  } catch {
    return null;
  }
}

function findOrCreateIntegration(exec: ExecFn, all: AllFn, orgId: string, credRef: string): string {
  const existing = all(
    `SELECT id FROM integrations
     WHERE org_id = '${escapeSql(orgId)}'
       AND provider = 'google'
       AND external_account_id = '${escapeSql(credRef)}'`,
  ) as Array<{ id?: string }>;
  const found = existing[0]?.id;
  if (found) {
    return found;
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  exec(
    `INSERT INTO integrations
       (id, org_id, provider, status, account_label, external_account_id, cred_ref,
        provider_json, created_at, updated_at, last_refresh_at)
     VALUES
       ('${id}', '${escapeSql(orgId)}', 'google', 'connected', 'Google account',
        '${escapeSql(credRef)}', '${escapeSql(credRef)}', NULL, '${now}', '${now}', NULL)`,
  );
  return id;
}

function backfillSourceRow(exec: ExecFn, all: AllFn, row: Partial<BackfillSourceRow>): void {
  const sourceId = row.id;
  const orgId = row.org_id;
  const distributionJson = row.distribution_json;
  if (!sourceId || !orgId || !distributionJson) {
    return;
  }
  const distribution = parseDistribution(distributionJson);
  if (distribution?.kind !== 'cloud-drive') {
    return;
  }
  if (typeof distribution.integrationId === 'string' && distribution.integrationId) {
    return;
  }
  if (typeof distribution.credRef !== 'string' || !distribution.credRef) {
    return;
  }
  const integrationId = findOrCreateIntegration(exec, all, orgId, distribution.credRef);
  const remoteFolderId =
    typeof distribution.remoteFolderId === 'string' && distribution.remoteFolderId
      ? distribution.remoteFolderId
      : 'root';
  const next = {
    kind: 'cloud-drive',
    backend: 'google',
    remoteFolderId,
    integrationId,
  };
  exec(
    `UPDATE sources SET distribution_json = '${escapeSql(JSON.stringify(next))}'
       WHERE id = '${escapeSql(sourceId)}'`,
  );
}

export function backfillIntegrationsFromSources(exec: ExecFn, all?: AllFn): void {
  if (!all) {
    return;
  }
  if (all('PRAGMA table_info(sources)').length === 0) {
    return;
  }
  const rows = all('SELECT id, org_id, distribution_json FROM sources') as Array<
    Partial<BackfillSourceRow>
  >;
  for (const row of rows) {
    backfillSourceRow(exec, all, row);
  }
}
