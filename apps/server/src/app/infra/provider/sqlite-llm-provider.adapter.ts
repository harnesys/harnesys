import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  type LlmProvider,
  type LlmProviderInsert,
  type LlmProviderPatch,
  LlmProviderPort,
} from '../../domain/provider/llm-provider.port.ts';
import { ProviderNotFoundException } from '../../domain/provider/provider.error.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type LlmProviderRow, llmProvidersTable } from '../org-sqlite/schema/index.ts';
import { mapSqliteError } from '../org-sqlite/sqlite-errors.ts';

@Injectable()
export class SqliteLlmProviderAdapter extends LlmProviderPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(orgId: string): LlmProvider[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(llmProvidersTable)
        .where(eq(llmProvidersTable.orgId, orgId))
        .all()
        .map(toProvider),
    );
  }

  findById(orgId: string, id: string): LlmProvider | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(llmProvidersTable)
        .where(and(eq(llmProvidersTable.orgId, orgId), eq(llmProvidersTable.id, id)))
        .get();
      return row ? toProvider(row) : undefined;
    });
  }

  findByName(orgId: string, name: string): LlmProvider | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(llmProvidersTable)
        .where(and(eq(llmProvidersTable.orgId, orgId), eq(llmProvidersTable.name, name)))
        .get();
      return row ? toProvider(row) : undefined;
    });
  }

  insert(rec: LlmProviderInsert): LlmProvider {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      try {
        const row = db
          .insert(llmProvidersTable)
          .values({ ...rec, headers: JSON.stringify(rec.headers) })
          .returning()
          .get();
        return toProvider(row);
      } catch (err) {
        return mapSqliteError(err, { conflict: 'provider exists' });
      }
    });
  }

  update(orgId: string, id: string, patch: LlmProviderPatch): LlmProvider {
    return withOrgSqlite(this.layout, orgId, (db) => {
      try {
        const { headers, ...rest } = patch;
        const dbPatch =
          headers !== undefined ? { ...rest, headers: JSON.stringify(headers) } : rest;
        const row = db
          .update(llmProvidersTable)
          .set(dbPatch)
          .where(and(eq(llmProvidersTable.orgId, orgId), eq(llmProvidersTable.id, id)))
          .returning()
          .get();
        if (!row) {
          throw new ProviderNotFoundException(id);
        }
        return toProvider(row);
      } catch (err) {
        return mapSqliteError(err, { conflict: 'provider exists' });
      }
    });
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(llmProvidersTable)
        .where(and(eq(llmProvidersTable.orgId, orgId), eq(llmProvidersTable.id, id)))
        .run();
    });
  }
}

function toProvider(row: LlmProviderRow): LlmProvider {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    driver: row.driver,
    apiUrl: row.apiUrl,
    apiKey: row.apiKey,
    headers: JSON.parse(row.headers) as Record<string, string>,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
