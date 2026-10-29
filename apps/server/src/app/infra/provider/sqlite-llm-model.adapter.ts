import { Injectable } from '@harnesys/brix';
import { and, eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  type LlmModel,
  type LlmModelInsert,
  type LlmModelPatch,
  LlmModelPort,
} from '../../domain/provider/llm-provider.port.ts';
import { ProviderModelNotFoundException } from '../../domain/provider/provider.error.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type LlmModelRow, llmModelsTable } from '../org-sqlite/schema/index.ts';
import { mapSqliteError } from '../org-sqlite/sqlite-errors.ts';

@Injectable()
export class SqliteLlmModelAdapter extends LlmModelPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByProvider(orgId: string, providerId: string): LlmModel[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(llmModelsTable)
        .where(eq(llmModelsTable.providerId, providerId))
        .all()
        .map(toModel),
    );
  }

  findById(orgId: string, id: string): LlmModel | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db.select().from(llmModelsTable).where(eq(llmModelsTable.id, id)).get();
      return row ? toModel(row) : undefined;
    });
  }

  findByProviderAndName(orgId: string, providerId: string, name: string): LlmModel | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(llmModelsTable)
        .where(and(eq(llmModelsTable.providerId, providerId), eq(llmModelsTable.name, name)))
        .get();
      return row ? toModel(row) : undefined;
    });
  }

  insert(orgId: string, rec: LlmModelInsert): LlmModel {
    return withOrgSqlite(this.layout, orgId, (db) => {
      try {
        const row = db
          .insert(llmModelsTable)
          .values({ ...rec, metadata: JSON.stringify(rec.metadata ?? {}) })
          .returning()
          .get();
        return toModel(row);
      } catch (err) {
        return mapSqliteError(err, { conflict: 'model exists in provider' });
      }
    });
  }

  update(orgId: string, id: string, patch: LlmModelPatch): LlmModel {
    return withOrgSqlite(this.layout, orgId, (db) => {
      try {
        const { metadata, ...rest } = patch;
        const dbPatch =
          metadata !== undefined ? { ...rest, metadata: JSON.stringify(metadata) } : rest;
        const row = db
          .update(llmModelsTable)
          .set(dbPatch)
          .where(eq(llmModelsTable.id, id))
          .returning()
          .get();
        if (!row) {
          throw new ProviderModelNotFoundException(id);
        }
        return toModel(row);
      } catch (err) {
        return mapSqliteError(err, { conflict: 'model exists in provider' });
      }
    });
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(llmModelsTable).where(eq(llmModelsTable.id, id)).run();
    });
  }
}

function toModel(row: LlmModelRow): LlmModel {
  return {
    id: row.id,
    providerId: row.providerId,
    name: row.name,
    kind: row.kind,
    metadata: JSON.parse(row.metadata) as unknown,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
