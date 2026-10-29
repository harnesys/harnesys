import { Injectable } from '@harnesys/brix';
import { and, eq, like, or } from 'drizzle-orm';
import type { CatalogEntry, RegistryKind } from 'harnesys/plugins-catalog';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  PluginConflictException,
  PluginValidationException,
} from '../../domain/plugin/plugin.error.ts';
import {
  PluginRegistriesPort,
  type PluginRegistryRecord,
} from '../../domain/plugin/plugin-registries.port.ts';
import { withMachineSqlite } from './machine-sqlite-session.ts';
import {
  type PluginCatalogEntryRow,
  type PluginRegistryRow,
  pluginCatalogEntriesTable,
  pluginRegistriesTable,
} from './plugin-marketplaces.schema.ts';

@Injectable()
export class PluginMarketplacesAdapter extends PluginRegistriesPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(): PluginRegistryRecord[] {
    return withMachineSqlite(this.layout, (db) =>
      db
        .select()
        .from(pluginRegistriesTable)
        .orderBy(pluginRegistriesTable.name)
        .all()
        .map(toRegistryRecord),
    );
  }

  findById(id: string): PluginRegistryRecord | undefined {
    return withMachineSqlite(this.layout, (db) => {
      const row = db
        .select()
        .from(pluginRegistriesTable)
        .where(eq(pluginRegistriesTable.id, id))
        .get();
      return row ? toRegistryRecord(row) : undefined;
    });
  }

  findByName(name: string): PluginRegistryRecord | undefined {
    return withMachineSqlite(this.layout, (db) => {
      const row = db
        .select()
        .from(pluginRegistriesTable)
        .where(eq(pluginRegistriesTable.name, name))
        .get();
      return row ? toRegistryRecord(row) : undefined;
    });
  }

  upsert(rec: PluginRegistryRecord): PluginRegistryRecord {
    return withMachineSqlite(this.layout, (db) => {
      try {
        const row = db
          .insert(pluginRegistriesTable)
          .values({
            id: rec.id,
            name: rec.name,
            kind: rec.kind,
            source: rec.source,
            path: rec.path,
            revision: rec.revision ?? null,
            lastSyncAt: rec.lastSyncAt ?? null,
            lastError: rec.lastError ?? null,
            createdAt: rec.createdAt,
            updatedAt: rec.updatedAt,
          })
          .onConflictDoUpdate({
            target: pluginRegistriesTable.id,
            set: {
              name: rec.name,
              kind: rec.kind,
              source: rec.source,
              path: rec.path,
              revision: rec.revision ?? null,
              lastSyncAt: rec.lastSyncAt ?? null,
              lastError: rec.lastError ?? null,
              updatedAt: rec.updatedAt,
            },
          })
          .returning()
          .get();
        return toRegistryRecord(row);
      } catch (err) {
        throw mapMarketplaceSqliteError(err);
      }
    });
  }

  delete(id: string): void {
    withMachineSqlite(this.layout, (db) => {
      db.delete(pluginCatalogEntriesTable)
        .where(eq(pluginCatalogEntriesTable.registryId, id))
        .run();
      db.delete(pluginRegistriesTable).where(eq(pluginRegistriesTable.id, id)).run();
    });
  }

  replaceCatalog(registryId: string, entries: CatalogEntry[]): void {
    withMachineSqlite(this.layout, (db) => {
      const now = new Date().toISOString();
      db.delete(pluginCatalogEntriesTable)
        .where(eq(pluginCatalogEntriesTable.registryId, registryId))
        .run();
      for (const entry of entries) {
        db.insert(pluginCatalogEntriesTable)
          .values({
            id: `${registryId}:${entry.pluginName}`,
            registryId,
            pluginName: entry.pluginName,
            payload: JSON.stringify({ ...entry, registryId }),
            updatedAt: now,
          })
          .run();
      }
    });
  }

  listCatalog(filter: { registryId?: string; q?: string } = {}): CatalogEntry[] {
    return withMachineSqlite(this.layout, (db) => {
      const conditions = [];
      if (filter.registryId) {
        conditions.push(eq(pluginCatalogEntriesTable.registryId, filter.registryId));
      }
      if (filter.q && filter.q.trim().length > 0) {
        const pattern = `%${filter.q.trim().toLowerCase()}%`;
        conditions.push(
          or(
            like(pluginCatalogEntriesTable.pluginName, pattern),
            like(pluginCatalogEntriesTable.payload, pattern),
          ),
        );
      }
      let rows: PluginCatalogEntryRow[];
      if (conditions.length === 0) {
        rows = db.select().from(pluginCatalogEntriesTable).all();
      } else if (conditions.length === 1) {
        const only = conditions[0];
        rows =
          only === undefined
            ? db.select().from(pluginCatalogEntriesTable).all()
            : db.select().from(pluginCatalogEntriesTable).where(only).all();
      } else {
        rows = db
          .select()
          .from(pluginCatalogEntriesTable)
          .where(and(...conditions))
          .all();
      }
      return rows
        .map(toCatalogEntry)
        .filter((entry): entry is CatalogEntry => entry !== undefined)
        .sort((a, b) => a.pluginName.localeCompare(b.pluginName));
    });
  }

  findCatalogEntry(registryId: string, pluginName: string): CatalogEntry | undefined {
    return withMachineSqlite(this.layout, (db) => {
      const row = db
        .select()
        .from(pluginCatalogEntriesTable)
        .where(
          and(
            eq(pluginCatalogEntriesTable.registryId, registryId),
            eq(pluginCatalogEntriesTable.pluginName, pluginName),
          ),
        )
        .get();
      return row ? toCatalogEntry(row) : undefined;
    });
  }
}

function toRegistryRecord(row: PluginRegistryRow): PluginRegistryRecord {
  const record: PluginRegistryRecord = {
    id: row.id,
    name: row.name,
    kind: row.kind as RegistryKind,
    source: row.source,
    path: row.path,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.revision) {
    record.revision = row.revision;
  }
  if (row.lastSyncAt) {
    record.lastSyncAt = row.lastSyncAt;
  }
  if (row.lastError) {
    record.lastError = row.lastError;
  }
  return record;
}

function toCatalogEntry(row: PluginCatalogEntryRow): CatalogEntry | undefined {
  try {
    const parsed: unknown = JSON.parse(row.payload);
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    return parsed as CatalogEntry;
  } catch {
    return undefined;
  }
}

function mapMarketplaceSqliteError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (/UNIQUE|constraint/i.test(message)) {
    throw new PluginConflictException('plugin registry exists');
  }
  throw new PluginValidationException(message);
}
