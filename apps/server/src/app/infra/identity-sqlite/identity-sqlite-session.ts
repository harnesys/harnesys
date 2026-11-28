import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
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

const ensuredIdentityPaths = new Set<string>();

function ensureIdentitySchemaOnce(sqlite: Database, path: string): void {
  if (ensuredIdentityPaths.has(path)) {
    return;
  }
  ensureIdentitySchema(
    (sql) => {
      sqlite.exec(sql);
    },
    (sql) => sqlite.query(sql).all() as { name: string }[],
  );
  ensuredIdentityPaths.add(path);
}

export function openIdentitySqlite(layout: HostFsLayoutPort): IdentitySqliteSession {
  layout.ensureHome();
  const path = layout.identityDbPath();
  if (!existsSync(path)) {
    ensuredIdentityPaths.delete(path);
    cachedIdentityDbs.delete(path);
  }
  const sqlite = new Database(path, { create: true });
  configureIdentitySqlite(sqlite);
  ensureIdentitySchemaOnce(sqlite, path);
  return {
    sqlite,
    db: drizzle(sqlite, { schema: identitySchema }),
  };
}

const cachedIdentityDbs = new Map<string, IdentitySqliteDb>();

function cachedIdentityDb(layout: HostFsLayoutPort): IdentitySqliteDb {
  layout.ensureHome();
  const path = layout.identityDbPath();
  if (!existsSync(path)) {
    ensuredIdentityPaths.delete(path);
    cachedIdentityDbs.delete(path);
  }
  const existing = cachedIdentityDbs.get(path);
  if (existing) {
    return existing;
  }
  const sqlite = new Database(path, { create: true });
  configureIdentitySqlite(sqlite);
  ensureIdentitySchemaOnce(sqlite, path);
  const db = drizzle(sqlite, { schema: identitySchema });
  cachedIdentityDbs.set(path, db);
  return db;
}

export function withIdentitySqlite<T>(
  layout: HostFsLayoutPort,
  fn: (db: IdentitySqliteDb) => T,
): T {
  return fn(cachedIdentityDb(layout));
}
