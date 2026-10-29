export interface EventClaimRecord {
  runId: string;
  nodeId: string;
  leaseEpoch: number;
  leaseUntil: string;
  token: string;
  doneAt: string | null;
}

export interface GrantEventClaimInput {
  orgId: string;
  runId: string;
  nodeId: string;
  leaseEpoch: number;
  leaseUntil: string;
  token: string;
}

export abstract class EventClaimPort {
  abstract grant(input: GrantEventClaimInput): EventClaimRecord | null;
  abstract findByRun(orgId: string, runId: string): EventClaimRecord | null;
  abstract findActiveByNode(orgId: string, nodeId: string, nowIso: string): EventClaimRecord[];
  abstract findExpired(orgId: string, nowIso: string): EventClaimRecord[];
  abstract countActiveByNode(orgId: string, nodeId: string, nowIso: string): number;
  abstract renew(input: {
    orgId: string;
    runId: string;
    nodeId: string;
    leaseEpoch: number;
    leaseUntil: string;
  }): boolean;
  abstract markDone(orgId: string, runId: string, nodeId: string, doneAt: string): boolean;
  abstract releaseExpired(orgId: string, nowIso: string): number;
}
