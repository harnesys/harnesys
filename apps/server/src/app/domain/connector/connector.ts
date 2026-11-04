import type { ChannelCapabilities } from './channel-capabilities.ts';
import type { MirrorPolicy } from './constants.ts';

export type ConnectorProvider = string;

export type ConnectorStatus = 'awaiting_pair' | 'active' | 'paused' | 'error';

export type ConnectorStreamMode = 'draft' | 'edit';

export type ConnectorBindingStatus = 'active' | 'unpaired';

export type ConnectorInboxKind =
  | 'message'
  | 'callback'
  | 'command'
  | 'edit'
  | 'generation_stopped'
  | 'unsupported';

export type ConnectorInboxStatus = 'pending' | 'consumed' | 'rejected';

export type ConnectorDeliveryStatus = 'streaming' | 'final' | 'failed';

export type ConnectorChatType = string;

export interface ConnectorRecord {
  id: string;
  orgId: string;
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
  capabilities: ChannelCapabilities;
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
  capabilities: ChannelCapabilities;
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
  title: string | null;
  threadId: string | null;
  status: ConnectorBindingStatus;
  createdAt: string;
  updatedAt: string;
}

export type ConnectorBindingInsert = ConnectorBindingRecord;

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
