import { Database } from 'bun:sqlite';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ensurePresetsSchema, presetsTable } from '../presets/presets.schema.ts';
import {
  ensurePluginMarketplacesSchema,
  pluginCatalogEntriesTable,
  pluginRegistriesTable,
} from './plugin-marketplaces.schema.ts';

const machineSchema = {
  pluginRegistriesTable,
  pluginCatalogEntriesTable,
  presetsTable,
};

export type MachineSqliteDb = BunSQLiteDatabase<typeof machineSchema>;

export function withMachineSqlite<T>(layout: HostFsLayoutPort, fn: (db: MachineSqliteDb) => T): T {
  layout.ensureHome();
  const sqlite = new Database(layout.machineDbPath(), { create: true });
  try {
    sqlite.exec('PRAGMA journal_mode = WAL;');
    sqlite.exec('PRAGMA busy_timeout = 5000;');
    sqlite.exec('PRAGMA foreign_keys = ON;');
    ensurePluginMarketplacesSchema((sql) => {
      sqlite.exec(sql);
    });
    ensurePresetsSchema((sql) => {
      sqlite.exec(sql);
    });
    const db = drizzle(sqlite, { schema: machineSchema });
    return fn(db);
  } finally {
    sqlite.close();
  }
}
