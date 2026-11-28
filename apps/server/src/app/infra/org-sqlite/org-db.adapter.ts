import { Injectable } from '@harnesys/brix';
import { eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgDbPort } from '../../domain/org/org-db.port.ts';
import { sqliteClient } from '../knowledge/sqlite-client.ts';
import { nodes, orgs } from './org.schema.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';

@Injectable()
export class OrgDbAdapter extends OrgDbPort {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
  ) {
    super();
  }

  bootstrap(orgId: string, name: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const existing = db.select().from(orgs).where(eq(orgs.id, orgId)).get();
      if (!existing) {
        const now = new Date().toISOString();
        db.insert(orgs).values({ id: orgId, name, createdAt: now, updatedAt: now }).run();
      }
      const host = this.machineConfig.get();
      const selfNode = db.select().from(nodes).where(eq(nodes.id, host.id)).get();
      if (!selfNode) {
        const now = new Date().toISOString();
        db.insert(nodes)
          .values({
            id: host.id,
            name: host.name,
            role: 'relay',
            tokenHash: null,
            lastSeenAt: now,
            status: 'online',
            enrolledAt: now,
            diskFreeBytes: null,
            diskTotalBytes: null,
            dockerAvailable: null,
          })
          .run();
      }
    });
  }

  rename(orgId: string, name: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const now = new Date().toISOString();
      db.update(orgs).set({ name, updatedAt: now }).where(eq(orgs.id, orgId)).run();
    });
  }

  snapshot(orgId: string, outPath: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      sqliteClient(db).exec(`VACUUM INTO '${outPath.replaceAll("'", "''")}'`);
    });
  }
}
