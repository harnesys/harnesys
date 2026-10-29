import type { Database } from 'bun:sqlite';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';

export function sqliteClient(db: OrgSqliteDb | { $client: Database }): Database {
  return (db as OrgSqliteDb & { $client: Database }).$client;
}
