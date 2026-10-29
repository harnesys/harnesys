import type { MaterializationOrigin, MaterializationState } from '@harnesys/contracts';

export interface MaterializationRecord {
  orgId: string;
  sourceId: string;
  hostId: string;
  origin: MaterializationOrigin;
  localPath: string | null;
  state: MaterializationState;
  lastError: string | null;
  revision: number;
  updatedAt: string;
  lastConflictPaths: string[];
  refreshRequired: boolean;
}

export interface UpsertMaterializationInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  origin: MaterializationOrigin;
  localPath?: string | null;
  state: MaterializationState;
  lastError?: string | null;
  revision: number;
  updatedAt: string;
  lastConflictPaths?: string[];
  refreshRequired?: boolean;
}

export interface MaterializationProjectionRecord {
  orgId: string;
  sourceId: string;
  hostId: string;
  state: MaterializationState;
  revision: number;
  lastConfirmedAt: string;
  lastErrorCode: string | null;
  lastConflictPaths: string[];
  refreshRequired: boolean;
}

export type MaterializationRevisionDecision = 'applied' | 'ignored' | 'idempotent';

export function decideMaterializationRevision(
  currentRevision: number | null,
  incomingRevision: number,
): MaterializationRevisionDecision {
  if (currentRevision === null) {
    return 'applied';
  }
  if (incomingRevision < currentRevision) {
    return 'ignored';
  }
  if (incomingRevision === currentRevision) {
    return 'idempotent';
  }
  return 'applied';
}

export abstract class SourceMaterializationPort {
  abstract find(orgId: string, sourceId: string, hostId: string): MaterializationRecord | null;
  abstract listForSource(orgId: string, sourceId: string): MaterializationRecord[];
  abstract upsert(input: UpsertMaterializationInput): void;
  abstract removeForSource(orgId: string, sourceId: string): void;
  abstract findProjection(
    orgId: string,
    sourceId: string,
    hostId: string,
  ): MaterializationProjectionRecord | null;
  abstract listProjectionsForSource(
    orgId: string,
    sourceId: string,
  ): MaterializationProjectionRecord[];
  abstract upsertProjection(
    input: MaterializationProjectionRecord,
  ): MaterializationRevisionDecision;
}
