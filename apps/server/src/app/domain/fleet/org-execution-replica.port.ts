import type { OrgExecutionSnapshot, SnapshotAckStatus } from '@harnesys/contracts';

export interface ReplicaApplyResult {
  status: SnapshotAckStatus;
  revision: number;
  reason?: string;
}

export abstract class OrgExecutionReplicaPort {
  abstract apply(orgId: string, snapshot: OrgExecutionSnapshot): ReplicaApplyResult;
  abstract get(orgId: string): OrgExecutionSnapshot | null;
  abstract acceptedRevision(orgId: string): number | null;
  abstract isCompatible(orgId: string): boolean;
  abstract isReadyForRevision(orgId: string, configRevision: number): boolean;
}
