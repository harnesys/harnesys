import type { PermissionGrantStorePort } from '../../domain/approval/permission-grant-store.port.ts';

export interface RecordOperationGrantsInput {
  agentId: string;
  ops: string[];
  decidedBy?: string;
}

export function recordOperationGrants(
  grants: PermissionGrantStorePort,
  orgId: string,
  input: RecordOperationGrantsInput,
): void {
  for (const op of input.ops) {
    grants.record(orgId, {
      agentId: input.agentId,
      operation: op,
      ...(input.decidedBy !== undefined ? { decidedBy: input.decidedBy } : {}),
    });
  }
}
