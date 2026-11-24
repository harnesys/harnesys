import { Injectable } from '@harnesys/brix';
import { and, eq, gte, lte, or, type SQL, sql } from 'drizzle-orm';
import {
  OrgAudit,
  type OrgAuditListQuery,
  type OrgAuditPage,
  type OrgAuditRow,
} from '../../domain/fleet/org-audit.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { orgAuditTable } from './schema/index.ts';

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function auditFilter(query: OrgAuditListQuery): SQL | undefined {
  const conditions: SQL[] = [];
  if (query.from !== undefined) {
    conditions.push(gte(orgAuditTable.at, query.from));
  }
  if (query.to !== undefined) {
    conditions.push(lte(orgAuditTable.at, query.to));
  }
  if (query.action !== undefined) {
    conditions.push(
      sql`${orgAuditTable.action} like ${`${escapeLike(query.action)}%`} escape '\\'`,
    );
  }
  if (query.actorKind !== undefined) {
    conditions.push(eq(orgAuditTable.actorKind, query.actorKind));
  }
  if (query.result !== undefined) {
    conditions.push(eq(orgAuditTable.result, query.result));
  }
  if (query.actorId !== undefined) {
    conditions.push(eq(orgAuditTable.actorId, query.actorId));
  }
  if (query.q !== undefined) {
    const pattern = `%${escapeLike(query.q.toLowerCase())}%`;
    const match = or(
      sql`lower(${orgAuditTable.resource}) like ${pattern} escape '\\'`,
      sql`lower(${orgAuditTable.actorId}) like ${pattern} escape '\\'`,
    );
    if (match !== undefined) {
      conditions.push(match);
    }
  }
  if (conditions.length === 0) {
    return undefined;
  }
  return and(...conditions);
}

@Injectable()
export class OrgAuditAdapter extends OrgAudit {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  append(orgId: string, row: OrgAuditRow): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.insert(orgAuditTable)
        .values({
          id: row.id,
          at: row.at,
          actorKind: row.actorKind,
          actorId: row.actorId,
          viaNodeId: row.viaNodeId,
          action: row.action,
          resource: row.resource,
          result: row.result,
        })
        .run();
    });
  }

  list(orgId: string, query: OrgAuditListQuery): OrgAuditPage {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const filter = auditFilter(query);
      const rows = db
        .select()
        .from(orgAuditTable)
        .where(filter)
        .orderBy(sql`${orgAuditTable.at} DESC, ${orgAuditTable.id} DESC`)
        .limit(query.limit)
        .offset(query.offset)
        .all();
      const total =
        db.select({ value: sql<number>`count(*)` }).from(orgAuditTable).where(filter).get()
          ?.value ?? 0;
      return {
        items: rows.map((row) => ({
          id: row.id,
          at: row.at,
          actorKind: row.actorKind,
          actorId: row.actorId,
          viaNodeId: row.viaNodeId,
          action: row.action,
          resource: row.resource,
          result: row.result,
        })),
        total,
      };
    });
  }
}
