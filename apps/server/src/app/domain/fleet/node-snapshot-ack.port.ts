import type { SnapshotAckStatus } from '@harnesys/contracts';

export abstract class NodeSnapshotAckPort {
  abstract record(orgId: string, nodeId: string, revision: number, status: SnapshotAckStatus): void;
  abstract find(
    orgId: string,
    nodeId: string,
  ): { revision: number; status: SnapshotAckStatus } | null;
  abstract isReadyForRevision(orgId: string, nodeId: string, revision: number): boolean;
}
