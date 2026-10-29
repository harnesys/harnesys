import { Injectable } from '@harnesys/brix';
import { eq } from 'drizzle-orm';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { orgConfigRevisionsTable } from './schema/index.ts';

@Injectable()
export class OrgConfigRevisionAdapter extends OrgConfigRevisionPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  get(orgId: string): { revision: number; contentHash: string } {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(orgConfigRevisionsTable)
        .where(eq(orgConfigRevisionsTable.orgId, orgId))
        .get();
      return {
        revision: row?.revision ?? 0,
        contentHash: row?.contentHash ?? '',
      };
    });
  }

  sync(orgId: string, contentHash: string): { revision: number; bumped: boolean } {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const now = new Date().toISOString();
      const row = db
        .select()
        .from(orgConfigRevisionsTable)
        .where(eq(orgConfigRevisionsTable.orgId, orgId))
        .get();
      if (!row) {
        db.insert(orgConfigRevisionsTable)
          .values({ orgId, revision: 1, contentHash, updatedAt: now })
          .run();
        return { revision: 1, bumped: true };
      }
      if (row.contentHash === contentHash) {
        return { revision: row.revision, bumped: false };
      }
      const revision = row.revision + 1;
      db.update(orgConfigRevisionsTable)
        .set({ revision, contentHash, updatedAt: now })
        .where(eq(orgConfigRevisionsTable.orgId, orgId))
        .run();
      return { revision, bumped: true };
    });
  }
}
