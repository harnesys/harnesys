import type { RunAttribution } from 'harnesys';

export interface PendingRunEvent {
  runId: string;
  leaseEpoch: number;
  seq: number;
  attribution?: RunAttribution;
  payloadJson: string;
  createdAt: string;
}

export abstract class PendingRunEventPort {
  abstract insert(orgId: string, event: PendingRunEvent): void;
  abstract listPending(orgId: string, runId: string, leaseEpoch: number): PendingRunEvent[];
  abstract ackThrough(orgId: string, runId: string, leaseEpoch: number, lastSeq: number): number;
  abstract listAllPending(orgId: string): PendingRunEvent[];
  abstract deleteRun(orgId: string, runId: string, leaseEpoch: number): void;
}
