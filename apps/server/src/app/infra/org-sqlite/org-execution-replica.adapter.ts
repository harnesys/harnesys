import { Injectable } from '@harnesys/brix';
import type { OrgExecutionSnapshot } from '@harnesys/contracts';
import { eq } from 'drizzle-orm';
import {
  OrgExecutionReplicaPort,
  type ReplicaApplyResult,
} from '../../domain/fleet/org-execution-replica.port.ts';
import {
  decideSnapshotApply,
  isReplicaReadyForRevision,
} from '../../domain/fleet/org-execution-snapshot.apply.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import { orgExecutionReplicaTable } from './schema/index.ts';

@Injectable()
export class OrgExecutionReplicaAdapter extends OrgExecutionReplicaPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  apply(orgId: string, snapshot: OrgExecutionSnapshot): ReplicaApplyResult {
    const decision = decideSnapshotApply(snapshot);
    return withOrgSqlite(this.layout, orgId, (db) => {
      const now = new Date().toISOString();
      const payloadJson =
        decision.status === 'accepted' && decision.snapshot
          ? JSON.stringify(decision.snapshot)
          : JSON.stringify(snapshot);
      const schemaVersion =
        decision.snapshot?.schemaVersion ??
        (typeof snapshot.schemaVersion === 'number' ? snapshot.schemaVersion : 0);
      const existing = db
        .select()
        .from(orgExecutionReplicaTable)
        .where(eq(orgExecutionReplicaTable.orgId, orgId))
        .get();
      if (existing) {
        db.update(orgExecutionReplicaTable)
          .set({
            revision: decision.revision,
            schemaVersion,
            status: decision.status,
            payloadJson,
            acceptedAt: now,
          })
          .where(eq(orgExecutionReplicaTable.orgId, orgId))
          .run();
      } else {
        db.insert(orgExecutionReplicaTable)
          .values({
            orgId,
            revision: decision.revision,
            schemaVersion,
            status: decision.status,
            payloadJson,
            acceptedAt: now,
          })
          .run();
      }
      return {
        status: decision.status,
        revision: decision.revision,
        ...(decision.reason ? { reason: decision.reason } : {}),
      };
    });
  }

  get(orgId: string): OrgExecutionSnapshot | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(orgExecutionReplicaTable)
        .where(eq(orgExecutionReplicaTable.orgId, orgId))
        .get();
      if (row?.status !== 'accepted') {
        return null;
      }
      const decision = decideSnapshotApply(JSON.parse(row.payloadJson));
      return decision.snapshot;
    });
  }

  acceptedRevision(orgId: string): number | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(orgExecutionReplicaTable)
        .where(eq(orgExecutionReplicaTable.orgId, orgId))
        .get();
      if (row?.status !== 'accepted') {
        return null;
      }
      return row.revision;
    });
  }

  isCompatible(orgId: string): boolean {
    return this.acceptedRevision(orgId) !== null;
  }

  isReadyForRevision(orgId: string, configRevision: number): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(orgExecutionReplicaTable)
        .where(eq(orgExecutionReplicaTable.orgId, orgId))
        .get();
      if (!row) {
        return false;
      }
      return isReplicaReadyForRevision(
        { revision: row.revision, status: row.status as 'accepted' | 'incompatible' },
        configRevision,
      );
    });
  }
}
