import { Injectable } from '@harnesys/brix';
import type { SnapshotAckStatus } from '@harnesys/contracts';
import { and, eq } from 'drizzle-orm';
import { NodeSnapshotAckPort } from '../../domain/fleet/node-snapshot-ack.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { nodeSnapshotAcksTable } from './schema/index.ts';

@Injectable()
export class NodeSnapshotAckAdapter extends NodeSnapshotAckPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  record(orgId: string, nodeId: string, revision: number, status: SnapshotAckStatus): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const now = new Date().toISOString();
      const existing = db
        .select()
        .from(nodeSnapshotAcksTable)
        .where(
          and(eq(nodeSnapshotAcksTable.orgId, orgId), eq(nodeSnapshotAcksTable.nodeId, nodeId)),
        )
        .get();
      if (existing) {
        db.update(nodeSnapshotAcksTable)
          .set({ revision, status, updatedAt: now })
          .where(
            and(eq(nodeSnapshotAcksTable.orgId, orgId), eq(nodeSnapshotAcksTable.nodeId, nodeId)),
          )
          .run();
        return;
      }
      db.insert(nodeSnapshotAcksTable)
        .values({ orgId, nodeId, revision, status, updatedAt: now })
        .run();
    });
  }

  find(orgId: string, nodeId: string): { revision: number; status: SnapshotAckStatus } | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(nodeSnapshotAcksTable)
        .where(
          and(eq(nodeSnapshotAcksTable.orgId, orgId), eq(nodeSnapshotAcksTable.nodeId, nodeId)),
        )
        .get();
      if (!row) {
        return null;
      }
      return { revision: row.revision, status: row.status as SnapshotAckStatus };
    });
  }

  isReadyForRevision(orgId: string, nodeId: string, revision: number): boolean {
    const ack = this.find(orgId, nodeId);
    return ack !== null && ack.status === 'accepted' && ack.revision === revision;
  }
}
