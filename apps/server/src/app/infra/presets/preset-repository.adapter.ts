import { SQLiteError } from 'bun:sqlite';
import { Injectable } from '@harnesys/brix';
import type { CatalogItem, PresetDetail, PresetKind, PresetOrigin } from '@harnesys/contracts';
import { and, eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  PresetConflictException,
  PresetValidationException,
} from '../../domain/presets/preset.error.ts';
import {
  type PresetCatalogFilter,
  PresetCatalogPort,
} from '../../domain/presets/preset-catalog.port.ts';
import {
  PresetLibraryPort,
  type PresetRecord,
  type PresetSaveInput,
} from '../../domain/presets/preset-library.port.ts';
import { toCatalogItem, toPresetDetail } from '../../domain/presets/preset-view.ts';
import { withMachineSqlite } from '../plugins/machine-sqlite-session.ts';
import { toPresetRecord, toPresetRow } from './preset-rows.ts';
import { type PresetRow, presetsTable } from './presets.schema.ts';

@Injectable()
export class PresetRepositoryAdapter extends PresetLibraryPort implements PresetCatalogPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(filter?: PresetCatalogFilter): CatalogItem[] {
    return withMachineSqlite(this.layout, (db) =>
      db
        .select()
        .from(presetsTable)
        .all()
        .filter((row) => filter?.kind === undefined || row.kind === filter.kind)
        .filter((row) => filter?.origin === undefined || row.origin === filter.origin)
        .map(toRecord)
        .map(toCatalogItem),
    );
  }

  listDetailed(filter?: PresetCatalogFilter): PresetDetail[] {
    return withMachineSqlite(this.layout, (db) =>
      db
        .select()
        .from(presetsTable)
        .all()
        .filter((row) => filter?.kind === undefined || row.kind === filter.kind)
        .filter((row) => filter?.origin === undefined || row.origin === filter.origin)
        .map(toRecord)
        .map((record) => toPresetDetail(record)),
    );
  }

  get(kind: PresetKind, id: string): PresetDetail | null {
    const record = this.findById(kind, id);
    return record === null ? null : toPresetDetail(record);
  }

  findAnyById(id: string): PresetRecord | null {
    return withMachineSqlite(this.layout, (db) => {
      const row = db.select().from(presetsTable).where(eq(presetsTable.id, id)).get();
      return row === undefined ? null : toRecord(row);
    });
  }

  findById(kind: PresetKind, id: string): PresetRecord | null {
    return withMachineSqlite(this.layout, (db) => {
      const row = db.select().from(presetsTable).where(eq(presetsTable.id, id)).get();
      if (row === undefined || row.kind !== kind) {
        return null;
      }
      return toRecord(row);
    });
  }

  save(input: PresetSaveInput): PresetRecord {
    return withMachineSqlite(this.layout, (db) => {
      const existing = db.select().from(presetsTable).where(eq(presetsTable.id, input.id)).get();
      if (existing !== undefined && existing.kind !== input.kind) {
        throw new PresetConflictException(`preset id is taken by another kind: ${input.id}`, {
          id: input.id,
        });
      }
      const now = new Date().toISOString();
      const values = toPresetRow({
        id: input.id,
        kind: input.kind,
        origin: input.origin,
        version: input.version,
        name: input.name,
        description: input.description ?? null,
        body: input.body,
        author: input.author ?? null,
        installedFrom: input.installedFrom ?? null,
        tags: input.tags ?? [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      try {
        db.insert(presetsTable)
          .values(values)
          .onConflictDoUpdate({
            target: presetsTable.id,
            set: {
              kind: values.kind,
              origin: values.origin,
              version: values.version,
              name: values.name,
              description: values.description,
              body: values.body,
              author: values.author,
              installedFrom: values.installedFrom,
              tags: values.tags,
              updatedAt: values.updatedAt,
            },
          })
          .run();
      } catch (err) {
        throw mapPresetSqliteError(err);
      }
      const saved = db.select().from(presetsTable).where(eq(presetsTable.id, input.id)).get();
      if (saved === undefined) {
        throw new PresetValidationException(`preset save failed: ${input.id}`);
      }
      return toRecord(saved);
    });
  }

  delete(kind: PresetKind, id: string): void {
    withMachineSqlite(this.layout, (db) => {
      db.delete(presetsTable)
        .where(and(eq(presetsTable.id, id), eq(presetsTable.kind, kind)))
        .run();
    });
  }

  listByOrigin(origin: PresetOrigin): PresetRecord[] {
    return withMachineSqlite(this.layout, (db) =>
      db.select().from(presetsTable).where(eq(presetsTable.origin, origin)).all().map(toRecord),
    );
  }

  deleteSystemRowsExcept(ids: string[]): void {
    withMachineSqlite(this.layout, (db) => {
      const rows = db.select().from(presetsTable).where(eq(presetsTable.origin, 'system')).all();
      for (const row of rows) {
        if (!ids.includes(row.id)) {
          db.delete(presetsTable).where(eq(presetsTable.id, row.id)).run();
        }
      }
    });
  }
}

function mapPresetSqliteError(err: unknown): never {
  if (err instanceof PresetConflictException || err instanceof PresetValidationException) {
    throw err;
  }
  if (err instanceof SQLiteError && err.code?.startsWith('SQLITE_CONSTRAINT')) {
    throw new PresetConflictException('preset id is taken');
  }
  if (err instanceof Error) {
    throw new PresetValidationException(err.message);
  }
  throw err;
}

function toRecord(row: PresetRow): PresetRecord {
  return toPresetRecord(row);
}
