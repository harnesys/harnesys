import {
  ORG_EXECUTION_SNAPSHOT_SCHEMA_VERSION,
  type OrgExecutionSnapshot,
  OrgExecutionSnapshotSchema,
  type SnapshotAckStatus,
} from '@harnesys/contracts';

export interface SnapshotApplyDecision {
  status: SnapshotAckStatus;
  revision: number;
  snapshot: OrgExecutionSnapshot | null;
  reason?: string;
}

export function decideSnapshotApply(raw: unknown): SnapshotApplyDecision {
  const parsed = OrgExecutionSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    const revision =
      raw !== null &&
      typeof raw === 'object' &&
      'revision' in raw &&
      typeof (raw as { revision: unknown }).revision === 'number'
        ? (raw as { revision: number }).revision
        : 0;
    return {
      status: 'incompatible',
      revision,
      snapshot: null,
      reason: 'snapshot schema validation failed',
    };
  }
  if (parsed.data.schemaVersion !== ORG_EXECUTION_SNAPSHOT_SCHEMA_VERSION) {
    return {
      status: 'incompatible',
      revision: parsed.data.revision,
      snapshot: null,
      reason: `unsupported schemaVersion ${parsed.data.schemaVersion}`,
    };
  }
  return {
    status: 'accepted',
    revision: parsed.data.revision,
    snapshot: parsed.data,
  };
}

export function isReplicaReadyForRevision(
  accepted: { revision: number; status: SnapshotAckStatus } | null,
  configRevision: number,
): boolean {
  return (
    accepted !== null && accepted.status === 'accepted' && accepted.revision === configRevision
  );
}
