import type { NodeConfigSync, SnapshotAckStatus } from '@harnesys/contracts';

export interface NodeConfigSyncInput {
  role: 'relay' | 'worker';
  status: string;
  peerConnected: boolean;
  targetRevision: number;
  ack: { revision: number; status: SnapshotAckStatus } | null;
}

export interface NodeConfigSyncView {
  configSync: NodeConfigSync;
  acceptedRevision: number | null;
  targetRevision: number;
  syncReason: string | null;
}

export function resolveNodeConfigSync(input: NodeConfigSyncInput): NodeConfigSyncView {
  if (input.role === 'relay') {
    return {
      configSync: 'ready',
      acceptedRevision: input.targetRevision,
      targetRevision: input.targetRevision,
      syncReason: null,
    };
  }
  if (input.ack?.status === 'incompatible') {
    return {
      configSync: 'incompatible',
      acceptedRevision: input.ack.revision,
      targetRevision: input.targetRevision,
      syncReason: `rejected revision ${input.ack.revision}`,
    };
  }
  if (input.ack && input.ack.status === 'accepted' && input.ack.revision === input.targetRevision) {
    return {
      configSync: 'ready',
      acceptedRevision: input.ack.revision,
      targetRevision: input.targetRevision,
      syncReason: null,
    };
  }
  if (input.peerConnected || input.status === 'online') {
    return {
      configSync: 'syncing',
      acceptedRevision: input.ack?.revision ?? null,
      targetRevision: input.targetRevision,
      syncReason:
        input.ack === null
          ? `waiting for revision ${input.targetRevision}`
          : `accepted ${input.ack.revision}, need ${input.targetRevision}`,
    };
  }
  if (input.ack) {
    return {
      configSync: 'stale',
      acceptedRevision: input.ack.revision,
      targetRevision: input.targetRevision,
      syncReason: `last accepted ${input.ack.revision}, need ${input.targetRevision}`,
    };
  }
  return {
    configSync: 'unknown',
    acceptedRevision: null,
    targetRevision: input.targetRevision,
    syncReason: 'no snapshot ack yet',
  };
}
