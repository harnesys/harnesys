export interface PermissionGrantRecord {
  id: string;
  orgId: string;
  agentId: string;
  operation: string;
  decidedBy: string | null;
  createdAt: string;
}

export interface PermissionGrantWriteInput {
  agentId: string;
  operation: string;
  decidedBy?: string;
}

export abstract class PermissionGrantStorePort {
  abstract record(orgId: string, input: PermissionGrantWriteInput): PermissionGrantRecord;
  abstract has(orgId: string, agentId: string, operation: string): boolean;
  abstract list(orgId: string, agentId?: string): PermissionGrantRecord[];
  abstract revoke(orgId: string, grantId: string): boolean;
}

export type { PermissionGrantRecord as PermissionGrant };
