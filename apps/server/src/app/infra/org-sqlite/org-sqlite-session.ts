import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
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

const ensuredOrgs = new Set<string>();

export function openOrgSqlite(layout: HostFsLayoutPort, orgId: string): OrgSqliteSession {
  layout.ensureOrgDir(orgId);
  const path = layout.orgDbPath(orgId);
  const existed = existsSync(path);
  if (!existed) {
    ensuredOrgs.delete(orgId);
  }
  const sqlite = new Database(path, { create: true });
  configureOrgSqlite(sqlite);
  if (!ensuredOrgs.has(orgId)) {
    ensureOrgSchema(
      (sql) => {
        sqlite.exec(sql);
      },
      (sql) => sqlite.query(sql).all() as { name: string }[],
    );
    ensuredOrgs.add(orgId);
  }
  const db = drizzle(sqlite, { schema: knowledgeSchema });
  return {
    sqlite,
    db,
    close: () => {
      sqlite.close();
    },
  };
}

export function withOrgSqlite<T>(
  layout: HostFsLayoutPort,
  orgId: string,
  fn: (db: OrgSqliteDb) => T,
): T {
  const session = openOrgSqlite(layout, orgId);
  try {
    return fn(session.db);
  } finally {
    session.close();
  }
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
