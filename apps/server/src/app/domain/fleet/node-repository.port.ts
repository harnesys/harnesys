import type { NodeStatus } from '@harnesys/contracts';

export interface NodeRecord {
  id: string;
  name: string;
  role: 'relay' | 'worker';
  tokenHash: string | null;
  lastSeenAt: string | null;
  status: NodeStatus;
  enrolledAt: string;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
  dockerAvailable: boolean | null;
}

export interface InsertNodeInput {
  id: string;
  name: string;
  role: 'relay' | 'worker';
  tokenHash: string | null;
  enrolledAt: string;
  status?: NodeStatus;
  lastSeenAt?: string | null;
}

export abstract class NodeRepository {
  abstract insert(orgId: string, node: InsertNodeInput): void;
  abstract findById(orgId: string, nodeId: string): NodeRecord | null;
  abstract findByName(orgId: string, name: string): NodeRecord | null;
  abstract findByTokenHash(orgId: string, tokenHash: string): NodeRecord | null;
  abstract list(orgId: string): NodeRecord[];
  abstract updatePresence(
    orgId: string,
    nodeId: string,
    patch: {
      lastSeenAt: string;
      status: NodeStatus;
      diskFreeBytes?: number | null;
      diskTotalBytes?: number | null;
      dockerAvailable?: boolean | null;
    },
  ): void;
  abstract setStatus(orgId: string, nodeId: string, status: NodeStatus): void;
  abstract updateRoleAndToken(
    orgId: string,
    nodeId: string,
    patch: { role: 'relay' | 'worker'; tokenHash: string | null },
  ): void;
  abstract remove(orgId: string, nodeId: string): void;
  abstract readOrgName(orgId: string): string | null;
  abstract exportDbBytes(orgId: string): Uint8Array;
  abstract importDbBytes(orgId: string, bytes: Uint8Array): void;
}
