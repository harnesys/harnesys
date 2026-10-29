import { Database } from 'bun:sqlite';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import * as identitySchema from './identity.schema.ts';
import { ensureIdentitySchema } from './identity-sql.ts';

export const identitySqliteSchema = identitySchema;

export type IdentitySqliteDb = BunSQLiteDatabase<typeof identitySchema>;

export interface IdentitySqliteSession {
  sqlite: Database;
  db: IdentitySqliteDb;
}

const IDENTITY_SQLITE_BUSY_TIMEOUT_MS = 5_000;

export function configureIdentitySqlite(sqlite: Database): void {
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec(`PRAGMA busy_timeout = ${IDENTITY_SQLITE_BUSY_TIMEOUT_MS};`);
  sqlite.exec('PRAGMA foreign_keys = ON;');
}

export function openIdentitySqlite(layout: HostFsLayoutPort): IdentitySqliteSession {
  layout.ensureHome();
  const sqlite = new Database(layout.identityDbPath(), { create: true });
  configureIdentitySqlite(sqlite);
  ensureIdentitySchema((sql) => {
    sqlite.exec(sql);
  });
  return {
    sqlite,
    db: drizzle(sqlite, { schema: identitySchema }),
  };
}

export function withIdentitySqlite<T>(
  layout: HostFsLayoutPort,
  fn: (db: IdentitySqliteDb) => T,
): T {
  const sqlite = new Database(layout.identityDbPath(), { create: true });
  configureIdentitySqlite(sqlite);
  ensureIdentitySchema((sql) => {
    sqlite.exec(sql);
  });
  const db = drizzle(sqlite, { schema: identitySchema });
  try {
    return fn(db);
  } finally {
    sqlite.close();
  }
}
