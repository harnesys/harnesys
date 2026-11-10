import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import { AccountNotFoundException } from '../../domain/apps/errors.ts';
import {
  type AccountIdentity,
  AccountRepositoryPort,
} from '../../domain/apps/ports/account-repository.port.ts';
import type { AccountRecord, AccountUpdatePatch } from '../../domain/apps/records.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type AppAccountInsertRow, appAccountsTable } from '../org-sqlite/schema/index.ts';
import { toAccount } from './apps.mappers.ts';

@Injectable()
export class AccountRepositoryAdapter extends AccountRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(orgId: string): AccountRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(appAccountsTable)
        .where(eq(appAccountsTable.orgId, orgId))
        .all()
        .map(toAccount),
    );
  }

  listByKind(orgId: string, kind: string): AccountRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(appAccountsTable)
        .where(and(eq(appAccountsTable.orgId, orgId), eq(appAccountsTable.kind, kind)))
        .all()
        .map(toAccount),
    );
  }

  listByApp(orgId: string, appId: string): AccountRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(appAccountsTable)
        .where(and(eq(appAccountsTable.orgId, orgId), eq(appAccountsTable.appId, appId)))
        .all()
        .map(toAccount),
    );
  }

  findById(orgId: string, accountId: string): AccountRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(appAccountsTable)
        .where(and(eq(appAccountsTable.orgId, orgId), eq(appAccountsTable.id, accountId)))
        .get();
      return row ? toAccount(row) : null;
    });
  }

  findByIdentity(orgId: string, identity: AccountIdentity): AccountRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(appAccountsTable)
        .where(
          and(
            eq(appAccountsTable.orgId, orgId),
            eq(appAccountsTable.kind, identity.kind),
            eq(appAccountsTable.externalAccountId, identity.externalAccountId),
            eq(appAccountsTable.partition, identity.partition),
          ),
        )
        .get();
      return row ? toAccount(row) : null;
    });
  }

  insert(record: AccountRecord): void {
    withOrgSqlite(this.layout, record.orgId, (db) => {
      db.insert(appAccountsTable).values(toInsertRow(record)).run();
    });
  }

  update(orgId: string, accountId: string, patch: AccountUpdatePatch): AccountRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      db.update(appAccountsTable)
        .set(updateRow(patch))
        .where(and(eq(appAccountsTable.orgId, orgId), eq(appAccountsTable.id, accountId)))
        .run();
      const found = db
        .select()
        .from(appAccountsTable)
        .where(and(eq(appAccountsTable.orgId, orgId), eq(appAccountsTable.id, accountId)))
        .get();
      if (!found) {
        throw new AccountNotFoundException(accountId);
      }
      return toAccount(found);
    });
  }

  remove(orgId: string, accountId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(appAccountsTable)
        .where(and(eq(appAccountsTable.orgId, orgId), eq(appAccountsTable.id, accountId)))
        .run();
    });
  }
}

function toInsertRow(record: AccountRecord): AppAccountInsertRow {
  return {
    id: record.id,
    orgId: record.orgId,
    appId: record.appId,
    kind: record.kind,
    externalAccountId: record.externalAccountId,
    partition: record.partition,
    label: record.label,
    status: record.status,
    lastError: record.lastError,
    scopesJson: JSON.stringify(record.scopes),
    expiresAt: record.expiresAt,
    configJson: JSON.stringify(record.config),
    secretFieldsJson: JSON.stringify(record.secretFields),
    metadataJson: JSON.stringify(record.metadata),
    verifiedAt: record.verifiedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function updateRow(patch: AccountUpdatePatch): Partial<AppAccountInsertRow> {
  const row: Partial<AppAccountInsertRow> = {
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };
  if (patch.appId !== undefined) {
    row.appId = patch.appId;
  }
  if (patch.label !== undefined) {
    row.label = patch.label;
  }
  if (patch.status !== undefined) {
    row.status = patch.status;
  }
  if (patch.lastError !== undefined) {
    row.lastError = patch.lastError;
  }
  if (patch.scopes !== undefined) {
    row.scopesJson = JSON.stringify(patch.scopes);
  }
  if (patch.expiresAt !== undefined) {
    row.expiresAt = patch.expiresAt;
  }
  if (patch.config !== undefined) {
    row.configJson = JSON.stringify(patch.config);
  }
  if (patch.secretFields !== undefined) {
    row.secretFieldsJson = JSON.stringify(patch.secretFields);
  }
  if (patch.metadata !== undefined) {
    row.metadataJson = JSON.stringify(patch.metadata);
  }
  if (patch.verifiedAt !== undefined) {
    row.verifiedAt = patch.verifiedAt;
  }
  return row;
}
