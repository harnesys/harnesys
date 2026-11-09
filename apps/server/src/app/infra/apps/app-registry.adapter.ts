import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import type { AccountKey, AccountRecord, AccountUpdatePatch } from '../../domain/apps/account.ts';
import { scopesCover } from '../../domain/apps/account.ts';
import type { AppRecord, AppUpdatePatch } from '../../domain/apps/app.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { AccountNotFoundException, AppNotFoundException } from '../../domain/apps/apps.error.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  type AppAccountInsertRow,
  type AppInsertRow,
  appAccountsTable,
  appsTable,
} from '../org-sqlite/schema/index.ts';
import { toAccount, toApp } from './app-registry.mappers.ts';

type AppUpdateRow = Partial<AppInsertRow>;
type AccountUpdateRow = Partial<AppAccountInsertRow>;

@Injectable()
export class AppRegistryAdapter extends AppRegistryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(orgId: string): AppRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db.select().from(appsTable).where(eq(appsTable.orgId, orgId)).all().map(toApp),
    );
  }

  listByKind(orgId: string, kind: string): AppRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(appsTable)
        .where(and(eq(appsTable.orgId, orgId), eq(appsTable.kind, kind)))
        .all()
        .map(toApp),
    );
  }

  findById(orgId: string, appId: string): AppRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(appsTable)
        .where(and(eq(appsTable.orgId, orgId), eq(appsTable.id, appId)))
        .get();
      return row ? toApp(row) : null;
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
          secretFieldsJson: JSON.stringify(record.secretFields),
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
      return toApp(found);
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
        .map(toAccount),
    );
  }

  findAccountByExternalAccount(
    orgId: string,
    kind: string,
    externalAccountId: string,
  ): AccountRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(appAccountsTable)
        .where(
          and(
            eq(appAccountsTable.orgId, orgId),
            eq(appAccountsTable.kind, kind),
            eq(appAccountsTable.externalAccountId, externalAccountId),
          ),
        )
        .get();
      return row ? toAccount(row) : null;
    });
  }

  accountsCoveringScopes(
    orgId: string,
    kind: string,
    requiredScopes: readonly string[],
  ): AccountRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(appAccountsTable)
        .where(and(eq(appAccountsTable.orgId, orgId), eq(appAccountsTable.kind, kind)))
        .all()
        .map(toAccount)
        .filter((account) => scopesCover(account.scopes, requiredScopes)),
    );
  }

  accountById(orgId: string, accountId: string): AccountRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(appAccountsTable)
        .where(and(eq(appAccountsTable.orgId, orgId), eq(appAccountsTable.id, accountId)))
        .get();
      return row ? toAccount(row) : null;
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
      return row ? toAccount(row) : null;
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
          valuesJson: JSON.stringify(record.values),
          secretFieldsJson: JSON.stringify(record.secretFields),
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
      return toAccount(found);
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
  if (patch.secretFields !== undefined) {
    row.secretFieldsJson = JSON.stringify(patch.secretFields);
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
  if (patch.values !== undefined) {
    row.valuesJson = JSON.stringify(patch.values);
  }
  if (patch.secretFields !== undefined) {
    row.secretFieldsJson = JSON.stringify(patch.secretFields);
  }
  if (patch.lastError !== undefined) {
    row.lastError = patch.lastError;
  }
  row.updatedAt = patch.updatedAt ?? new Date().toISOString();
  return row;
}
