import type { MirrorPolicy } from './constants.ts';

export type ConnectorProvider = 'telegram';

export type ConnectorStatus = 'awaiting_pair' | 'active' | 'paused' | 'error';

export type ConnectorStreamMode = 'draft' | 'edit';

export type ConnectorBindingStatus = 'active' | 'unpaired';

export type ConnectorRouteScope = 'thread' | 'agent';

export type ConnectorInboxKind =
  | 'message'
  | 'callback'
  | 'command'
  | 'edit'
  | 'generation_stopped'
  | 'unsupported';

export type ConnectorInboxStatus = 'pending' | 'consumed' | 'rejected';

export type ConnectorDeliveryStatus = 'streaming' | 'final' | 'failed';

export type ConnectorChatType = 'private';

export interface ParticipantPolicy {
  userId: string;
}

export interface ConnectorRecord {
  id: string;
  orgId: string;
  agentId: string;
  provider: ConnectorProvider;
  secretRef: string;
  status: ConnectorStatus;
  botUserId: string;
  botUsername: string;
  pairCodeHash: string | null;
  pairCodeExpiresAt: string | null;
  leaseOwner: string | null;
  leaseUntil: string | null;
  streamMode: ConnectorStreamMode | null;
  policy: MirrorPolicy;
  modeOverride: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ConnectorInsert = ConnectorRecord;

export type ConnectorPatch = Partial<{
  secretRef: string;
  status: ConnectorStatus;
  botUserId: string;
  botUsername: string;
  pairCodeHash: string | null;
  pairCodeExpiresAt: string | null;
  leaseOwner: string | null;
  leaseUntil: string | null;
  streamMode: ConnectorStreamMode | null;
  policy: MirrorPolicy;
  modeOverride: string | null;
  lastError: string | null;
  updatedAt: string;
}>;

export interface ConnectorBindingRecord {
  id: string;
  connectorId: string;
  orgId: string;
  externalChatId: string;
  externalTopicId: string | null;
  chatType: ConnectorChatType;
  threadId: string;
  participantPolicy: ParticipantPolicy | null;
  status: ConnectorBindingStatus;
  createdAt: string;
  updatedAt: string;
}

export type ConnectorBindingInsert = ConnectorBindingRecord;

export interface ConnectorRouteRecord {
  id: string;
  connectorId: string;
  bindingId: string;
  scope: ConnectorRouteScope;
  threadId: string;
  createdAt: string;
}

export type ConnectorRouteInsert = ConnectorRouteRecord;

export interface ConnectorInboxRecord {
  id: string;
  connectorId: string;
  bindingId: string | null;
  updateId: number;
  kind: ConnectorInboxKind;
  payload: unknown;
  status: ConnectorInboxStatus;
  createdAt: string;
}

export type ConnectorInboxInsert = ConnectorInboxRecord;

export interface ConnectorDeliveryRecord {
  id: string;
  connectorId: string;
  bindingId: string;
  threadId: string;
  runId: string;
  blockKey: string;
  interruptId: string | null;
  draftId: number | null;
  lastText: string | null;
  externalMessageId: string | null;
  status: ConnectorDeliveryStatus;
  updatedAt: string;
}

export type ConnectorDeliveryInsert = ConnectorDeliveryRecord;

export type InsertInboxResult = 'inserted' | 'duplicate';
