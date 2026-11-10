import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import { AppNotFoundException } from '../../domain/apps/errors.ts';
import { AppRepositoryPort } from '../../domain/apps/ports/app-repository.port.ts';
import type { AppRecord, AppUpdatePatch } from '../../domain/apps/records.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type AppInsertRow, appsTable } from '../org-sqlite/schema/index.ts';
import { toApp } from './apps.mappers.ts';

@Injectable()
export class AppRepositoryAdapter extends AppRepositoryPort {
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
      db.insert(appsTable).values(toInsertRow(record)).run();
    });
  }

  update(orgId: string, appId: string, patch: AppUpdatePatch): AppRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      db.update(appsTable)
        .set(updateRow(patch))
        .where(and(eq(appsTable.orgId, orgId), eq(appsTable.id, appId)))
        .run();
      const found = db
        .select()
        .from(appsTable)
        .where(and(eq(appsTable.orgId, orgId), eq(appsTable.id, appId)))
        .get();
      if (!found) {
        throw new AppNotFoundException(appId);
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
}

function toInsertRow(record: AppRecord): AppInsertRow {
  return {
    id: record.id,
    orgId: record.orgId,
    kind: record.kind,
    label: record.label,
    status: record.status,
    lastError: record.lastError,
    valuesJson: JSON.stringify(record.values),
    secretFieldsJson: JSON.stringify(record.secretFields),
    metadataJson: JSON.stringify(record.metadata),
    verifiedAt: record.verifiedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function updateRow(patch: AppUpdatePatch): Partial<AppInsertRow> {
  const row: Partial<AppInsertRow> = { updatedAt: patch.updatedAt ?? new Date().toISOString() };
  if (patch.label !== undefined) {
    row.label = patch.label;
  }
  if (patch.status !== undefined) {
    row.status = patch.status;
  }
  if (patch.lastError !== undefined) {
    row.lastError = patch.lastError;
  }
  if (patch.values !== undefined) {
    row.valuesJson = JSON.stringify(patch.values);
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
