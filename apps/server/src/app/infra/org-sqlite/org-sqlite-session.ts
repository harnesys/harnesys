import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ensureOrgSchema } from './org-sql-ensure.ts';
import * as knowledgeSchema from './schema/index.ts';

export const orgSqliteKnowledgeSchema = knowledgeSchema;

export type OrgSqliteDb = BunSQLiteDatabase<typeof knowledgeSchema>;

export interface OrgSqliteSession {
  sqlite: Database;
  db: OrgSqliteDb;
  close: () => void;
}

const ORG_SQLITE_BUSY_TIMEOUT_MS = 5_000;

export function configureOrgSqlite(sqlite: Database): void {
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec(`PRAGMA busy_timeout = ${ORG_SQLITE_BUSY_TIMEOUT_MS};`);
  sqlite.exec('PRAGMA foreign_keys = ON;');
}

const ensuredOrgPaths = new Set<string>();

function ensureOrgSchemaOnce(sqlite: Database, path: string): void {
  if (ensuredOrgPaths.has(path)) {
    return;
  }
  ensureOrgSchema(
    (sql) => {
      sqlite.exec(sql);
    },
    (sql) => sqlite.query(sql).all() as { name: string }[],
  );
  ensuredOrgPaths.add(path);
}

export function openOrgSqlite(layout: HostFsLayoutPort, orgId: string): OrgSqliteSession {
  layout.ensureOrgDir(orgId);
  const path = layout.orgDbPath(orgId);
  if (!existsSync(path)) {
    ensuredOrgPaths.delete(path);
    cachedOrgDbs.delete(path);
  }
  const sqlite = new Database(path, { create: true });
  configureOrgSqlite(sqlite);
  ensureOrgSchemaOnce(sqlite, path);
  const db = drizzle(sqlite, { schema: knowledgeSchema });
  return {
    sqlite,
    db,
    close: () => {
      sqlite.close();
    },
  };
}

const cachedOrgDbs = new Map<string, OrgSqliteDb>();

function cachedOrgDb(layout: HostFsLayoutPort, orgId: string): OrgSqliteDb {
  layout.ensureOrgDir(orgId);
  const path = layout.orgDbPath(orgId);
  if (!existsSync(path)) {
    ensuredOrgPaths.delete(path);
    cachedOrgDbs.delete(path);
  }
  const existing = cachedOrgDbs.get(path);
  if (existing) {
    return existing;
  }
  const sqlite = new Database(path, { create: true });
  configureOrgSqlite(sqlite);
  ensureOrgSchemaOnce(sqlite, path);
  const db = drizzle(sqlite, { schema: knowledgeSchema });
  cachedOrgDbs.set(path, db);
  return db;
}

export function withOrgSqlite<T>(
  layout: HostFsLayoutPort,
  orgId: string,
  fn: (db: OrgSqliteDb) => T,
): T {
  return fn(cachedOrgDb(layout, orgId));
}

export function invalidateOrgSqliteCache(layout: HostFsLayoutPort, orgId: string): void {
  const path = layout.orgDbPath(orgId);
  cachedOrgDbs.delete(path);
  ensuredOrgPaths.delete(path);
}

export async function withOrgSqliteAsync<T>(
  layout: HostFsLayoutPort,
  orgId: string,
  fn: (db: OrgSqliteDb) => Promise<T>,
): Promise<T> {
  const session = openOrgSqlite(layout, orgId);
  try {
    return await fn(session.db);
  } finally {
    session.close();
  }
}
