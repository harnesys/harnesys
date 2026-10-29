import { Database } from 'bun:sqlite';
import { Injectable, Logger } from '@harnesys/brix';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgDbPort } from '../../domain/org/org-db.port.ts';
import { nodes, orgs } from './org.schema.ts';
import { ensureOrgSchema } from './org-sql-ensure.ts';
import { configureOrgSqlite } from './org-sqlite-session.ts';

@Injectable()
export class OrgDbAdapter extends OrgDbPort {
  private readonly log: Logger;

  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    logger: Logger,
  ) {
    super();
    this.log = logger.child('org-db');
  }

  bootstrap(orgId: string, name: string): void {
    this.layout.ensureOrgDir(orgId);
    const sqlite = this.open(orgId);
    try {
      this.ensureSchema(sqlite);
      const db = drizzle(sqlite, { schema: { orgs, nodes } });
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
    } finally {
      sqlite.close();
    }
  }

  rename(orgId: string, name: string): void {
    const sqlite = this.open(orgId);
    try {
      this.ensureSchema(sqlite);
      const db = drizzle(sqlite, { schema: { orgs } });
      const now = new Date().toISOString();
      db.update(orgs).set({ name, updatedAt: now }).where(eq(orgs.id, orgId)).run();
    } finally {
      sqlite.close();
    }
  }

  private open(orgId: string): Database {
    const sqlite = new Database(this.layout.orgDbPath(orgId), { create: true });
    configureOrgSqlite(sqlite);
    return sqlite;
  }

  private ensureSchema(sqlite: Database): void {
    const worktreeBranchDupes = ensureOrgSchema(
      (sql) => {
        sqlite.exec(sql);
      },
      (sql) => sqlite.query(sql).all() as { name: string }[],
    );
    if (worktreeBranchDupes > 0) {
      this.log.warn(
        { worktreeBranchDupes },
        'worktree branch unique index skipped: duplicate active worktrees in database',
      );
    }
  }
}
