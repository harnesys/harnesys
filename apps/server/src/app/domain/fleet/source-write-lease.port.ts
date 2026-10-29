export interface SourceWriteLeaseRecord {
  sourceId: string;
  runId: string;
  nodeId: string;
  leaseEpoch: number;
  expiresAt: string;
}

export type AcquireWriteLeaseResult =
  | { ok: true; lease: SourceWriteLeaseRecord }
  | { ok: false; holder: SourceWriteLeaseRecord };

export abstract class SourceWriteLeasePort {
  abstract acquire(input: {
    orgId: string;
    sourceId: string;
    runId: string;
    nodeId: string;
    expiresAt: string;
  }): AcquireWriteLeaseResult;
  abstract release(orgId: string, sourceId: string, runId: string): boolean;
  abstract find(orgId: string, sourceId: string): SourceWriteLeaseRecord | null;
  abstract renew(input: {
    orgId: string;
    sourceId: string;
    runId: string;
    expiresAt: string;
  }): boolean;
}
