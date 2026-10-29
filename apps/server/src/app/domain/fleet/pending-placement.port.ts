import type { PendingPlacement } from './pending-placement.ts';

export abstract class PendingPlacementPort {
  abstract upsert(row: PendingPlacement): PendingPlacement;
  abstract findByRun(orgId: string, runId: string): PendingPlacement | null;
  abstract listByOrg(orgId: string): PendingPlacement[];
  abstract listByProfile(orgId: string, profileId: string): PendingPlacement[];
  abstract remove(orgId: string, runId: string): void;
  abstract updateReason(
    orgId: string,
    runId: string,
    input: {
      lastReason: string;
      attempt: number;
      configRevision: number;
      lastCandidatesJson: string;
    },
  ): void;
}
