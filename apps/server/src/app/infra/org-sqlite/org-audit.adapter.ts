import { Injectable } from '@harnesys/brix';
import { sql } from 'drizzle-orm';
import {
  OrgAudit,
  type OrgAuditPage,
  type OrgAuditRow,
} from '../../domain/fleet/org-audit.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { orgAuditTable } from './schema/index.ts';

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

  list(orgId: string, limit: number, offset: number): OrgAuditPage {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const rows = db
        .select()
        .from(orgAuditTable)
        .orderBy(sql`${orgAuditTable.at} DESC, ${orgAuditTable.id} DESC`)
        .limit(limit)
        .offset(offset)
        .all();
      const total =
        db.select({ value: sql<number>`count(*)` }).from(orgAuditTable).get()?.value ?? 0;
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
