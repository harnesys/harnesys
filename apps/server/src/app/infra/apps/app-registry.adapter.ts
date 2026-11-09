import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import type {
  AccountKey,
  AccountRecord,
  AccountStatus,
  AccountUpdatePatch,
} from '../../domain/apps/account.ts';
import type { AppRecord, AppUpdatePatch } from '../../domain/apps/app.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { AccountNotFoundException, AppNotFoundException } from '../../domain/apps/apps.error.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  type AppAccountInsertRow,
  type AppAccountRow,
  type AppInsertRow,
  type AppRow,
  appAccountsTable,
  appsTable,
} from '../org-sqlite/schema/index.ts';

type AppUpdateRow = Partial<AppInsertRow>;
type AccountUpdateRow = Partial<AppAccountInsertRow>;

@Injectable()
export class AppRegistryAdapter extends AppRegistryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(orgId: string): AppRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.select().from(appsTable).where(eq(appsTable.orgId, orgId)).all().map(mapApp),
    );
  }

  listByKind(orgId: string, kind: string): AppRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(appsTable)
        .where(and(eq(appsTable.orgId, orgId), eq(appsTable.kind, kind)))
        .all()
        .map(mapApp),
    );
  }

  findById(orgId: string, appId: string): AppRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(appsTable)
        .where(and(eq(appsTable.orgId, orgId), eq(appsTable.id, appId)))
        .get();
      return row ? mapApp(row) : null;
    });
  }

  insert(record: AppRecord): void {
    withOrgSqlite(this.layout, record.orgId, (db) => {
      db.insert(appsTable)
        .values({
          id: record.id,
          orgId: record.orgId,
          kind: record.kind,
          label: record.label,
          status: record.status,
          configJson: JSON.stringify(record.values),
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        })
        .run();
    });
  }

  update(orgId: string, appId: string, patch: AppUpdatePatch): AppRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      db.update(appsTable)
        .set(appUpdateRow(patch))
        .where(and(eq(appsTable.orgId, orgId), eq(appsTable.id, appId)))
        .run();
      const found = db
        .select()
        .from(appsTable)
        .where(and(eq(appsTable.orgId, orgId), eq(appsTable.id, appId)))
        .get();
      if (!found) {
        throw new AppNotFoundException(orgId, appId);
      }
      return mapApp(found);
    });
  }

  remove(orgId: string, appId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(appsTable)
        .where(and(eq(appsTable.orgId, orgId), eq(appsTable.id, appId)))
        .run();
    });
  }

  listAccounts(orgId: string): AccountRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(appAccountsTable)
        .where(eq(appAccountsTable.orgId, orgId))
        .all()
        .map(mapAccount),
    );
  }

  findAccount(orgId: string, accountId: string): AccountRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(appAccountsTable)
        .where(and(eq(appAccountsTable.orgId, orgId), eq(appAccountsTable.id, accountId)))
        .get();
      return row ? mapAccount(row) : null;
    });
  }

  findAccountByKey(orgId: string, key: AccountKey): AccountRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(appAccountsTable)
        .where(
          and(
            eq(appAccountsTable.orgId, orgId),
            eq(appAccountsTable.kind, key.kind),
            eq(appAccountsTable.externalAccountId, key.externalAccountId),
            eq(appAccountsTable.scopeKey, key.scopeKey),
          ),
        )
        .get();
      return row ? mapAccount(row) : null;
    });
  }

  insertAccount(record: AccountRecord): void {
    withOrgSqlite(this.layout, record.orgId, (db) => {
      db.insert(appAccountsTable)
        .values({
          id: record.id,
          orgId: record.orgId,
          appId: record.appId,
          kind: record.kind,
          externalAccountId: record.externalAccountId,
          label: record.label,
          status: record.status,
          scopesJson: JSON.stringify(record.scopes),
          scopeKey: record.scopeKey,
          secretRef: record.secretRef,
          lastError: record.lastError,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        })
        .run();
    });
  }

  updateAccount(orgId: string, accountId: string, patch: AccountUpdatePatch): AccountRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      db.update(appAccountsTable)
        .set(accountUpdateRow(patch))
        .where(and(eq(appAccountsTable.orgId, orgId), eq(appAccountsTable.id, accountId)))
        .run();
      const found = db
        .select()
        .from(appAccountsTable)
        .where(and(eq(appAccountsTable.orgId, orgId), eq(appAccountsTable.id, accountId)))
        .get();
      if (!found) {
        throw new AccountNotFoundException(orgId, accountId);
      }
      return mapAccount(found);
    });
  }

  removeAccount(orgId: string, accountId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(appAccountsTable)
        .where(and(eq(appAccountsTable.orgId, orgId), eq(appAccountsTable.id, accountId)))
        .run();
    });
  }
}

function appUpdateRow(patch: AppUpdatePatch): AppUpdateRow {
  const row: AppUpdateRow = {};
  if (patch.label !== undefined) {
    row.label = patch.label;
  }
  if (patch.status !== undefined) {
    row.status = patch.status;
  }
  if (patch.values !== undefined) {
    row.configJson = JSON.stringify(patch.values);
  }
  row.updatedAt = patch.updatedAt ?? new Date().toISOString();
  return row;
}

function accountUpdateRow(patch: AccountUpdatePatch): AccountUpdateRow {
  const row: AccountUpdateRow = {};
  if (patch.appId !== undefined) {
    row.appId = patch.appId;
  }
  if (patch.label !== undefined) {
    row.label = patch.label;
  }
  if (patch.status !== undefined) {
    row.status = patch.status;
  }
  if (patch.scopes !== undefined) {
    row.scopesJson = JSON.stringify(patch.scopes);
  }
  if (patch.scopeKey !== undefined) {
    row.scopeKey = patch.scopeKey;
  }
  if (patch.secretRef !== undefined) {
    row.secretRef = patch.secretRef;
  }
  if (patch.lastError !== undefined) {
    row.lastError = patch.lastError;
  }
  row.updatedAt = patch.updatedAt ?? new Date().toISOString();
  return row;
}

function mapApp(row: AppRow): AppRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    kind: row.kind,
    label: row.label,
    status: row.status === 'invalid' ? 'invalid' : 'configured',
    values: parseValues(row.configJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAccount(row: AppAccountRow): AccountRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    appId: row.appId,
    kind: row.kind,
    externalAccountId: row.externalAccountId,
    label: row.label,
    status: accountStatus(row.status),
    scopes: parseScopes(row.scopesJson),
    scopeKey: row.scopeKey,
    secretRef: row.secretRef,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseValues(raw: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(parseObject(raw))) {
    if (typeof value === 'string') {
      output[key] = value;
    }
  }
  return output;
}

function parseScopes(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string');
    }
  } catch {
    return [];
  }
  return [];
}

function parseObject(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function accountStatus(raw: string): AccountStatus {
  if (raw === 'connected' || raw === 'expired' || raw === 'error' || raw === 'pending') {
    return raw;
  }
  return 'pending';
}
