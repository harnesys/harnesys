import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import { IntegrationNotFoundException } from '../../domain/integration/integration.error.ts';
import {
  type IntegrationProvider,
  type IntegrationRecord,
  IntegrationRegistryPort,
  type IntegrationStatus,
  type UpdateIntegrationPatch,
} from '../../domain/integration/integration-registry.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  type IntegrationInsertRow,
  type IntegrationRow,
  integrationsTable,
} from '../org-sqlite/schema/index.ts';

@Injectable()
export class IntegrationRegistryAdapter extends IntegrationRegistryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(orgId: string): IntegrationRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(integrationsTable)
        .where(eq(integrationsTable.orgId, orgId))
        .all()
        .map(mapIntegration),
    );
  }

  findById(orgId: string, id: string): IntegrationRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(integrationsTable)
        .where(and(eq(integrationsTable.orgId, orgId), eq(integrationsTable.id, id)))
        .get();
      return row ? mapIntegration(row) : null;
    });
  }

  findByExternalAccount(
    orgId: string,
    provider: IntegrationProvider,
    externalAccountId: string,
  ): IntegrationRecord | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(integrationsTable)
        .where(
          and(
            eq(integrationsTable.orgId, orgId),
            eq(integrationsTable.provider, provider),
            eq(integrationsTable.externalAccountId, externalAccountId),
          ),
        )
        .get();
      return row ? mapIntegration(row) : null;
    });
  }

  insert(record: IntegrationRecord): void {
    withOrgSqlite(this.layout, record.orgId, (db) => {
      db.insert(integrationsTable)
        .values({
          id: record.id,
          orgId: record.orgId,
          provider: record.provider,
          status: record.status,
          accountLabel: record.accountLabel,
          externalAccountId: record.externalAccountId,
          credRef: record.credRef,
          providerJson: stringifyProviderJson(record.providerJson),
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          lastRefreshAt: record.lastRefreshAt,
        })
        .run();
    });
  }

  update(orgId: string, id: string, patch: UpdateIntegrationPatch): IntegrationRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      db.update(integrationsTable)
        .set(patchToUpdateRow(patch))
        .where(and(eq(integrationsTable.orgId, orgId), eq(integrationsTable.id, id)))
        .run();
      const row = db
        .select()
        .from(integrationsTable)
        .where(and(eq(integrationsTable.orgId, orgId), eq(integrationsTable.id, id)))
        .get();
      if (!row) {
        throw new IntegrationNotFoundException(orgId, id);
      }
      return mapIntegration(row);
    });
  }

  remove(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(integrationsTable)
        .where(and(eq(integrationsTable.orgId, orgId), eq(integrationsTable.id, id)))
        .run();
    });
  }
}

type IntegrationUpdateRow = Partial<IntegrationInsertRow>;

function patchToUpdateRow(patch: UpdateIntegrationPatch): IntegrationUpdateRow {
  const row: IntegrationUpdateRow = {};
  if (patch.provider !== undefined) {
    row.provider = patch.provider;
  }
  if (patch.status !== undefined) {
    row.status = patch.status;
  }
  if (patch.accountLabel !== undefined) {
    row.accountLabel = patch.accountLabel;
  }
  if (patch.externalAccountId !== undefined) {
    row.externalAccountId = patch.externalAccountId;
  }
  if (patch.credRef !== undefined) {
    row.credRef = patch.credRef;
  }
  if (patch.providerJson !== undefined) {
    row.providerJson = stringifyProviderJson(patch.providerJson);
  }
  if (patch.createdAt !== undefined) {
    row.createdAt = patch.createdAt;
  }
  row.updatedAt = patch.updatedAt ?? new Date().toISOString();
  if (patch.lastRefreshAt !== undefined) {
    row.lastRefreshAt = patch.lastRefreshAt;
  }
  return row;
}

function stringifyProviderJson(providerJson: Record<string, unknown> | null): string | null {
  return providerJson === null ? null : JSON.stringify(providerJson);
}

function parseProviderJson(raw: string | null): Record<string, unknown> | null {
  if (raw === null) {
    return null;
  }
  try {
    const json: unknown = JSON.parse(raw);
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      return json as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function mapIntegration(row: IntegrationRow): IntegrationRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    provider: row.provider as IntegrationProvider,
    status: row.status as IntegrationStatus,
    accountLabel: row.accountLabel,
    externalAccountId: row.externalAccountId,
    credRef: row.credRef,
    providerJson: parseProviderJson(row.providerJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastRefreshAt: row.lastRefreshAt,
  };
}
