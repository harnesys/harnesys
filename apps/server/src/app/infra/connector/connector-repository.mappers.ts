import {
  type ChannelCapabilities,
  parseChannelCapabilities,
  stringifyChannelCapabilities,
} from '../../domain/connector/channel-capabilities.ts';
import type {
  ConnectorBindingRecord,
  ConnectorBindingStatus,
  ConnectorChatType,
  ConnectorDeliveryRecord,
  ConnectorDeliveryStatus,
  ConnectorInboxKind,
  ConnectorInboxRecord,
  ConnectorInboxStatus,
  ConnectorProvider,
  ConnectorRecord,
  ConnectorStatus,
} from '../../domain/connector/connector.ts';
import type { MirrorPolicy } from '../../domain/connector/constants.ts';
import type {
  ConnectorBindingRow,
  ConnectorDeliveryRow,
  ConnectorInboxRow,
  ConnectorRow,
} from '../org-sqlite/schema/index.ts';

export function toConnector(row: ConnectorRow): ConnectorRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    provider: row.provider as ConnectorProvider,
    secretRef: row.secretRef,
    status: row.status as ConnectorStatus,
    botUserId: row.botUserId,
    botUsername: row.botUsername,
    pairCodeHash: row.pairCodeHash,
    pairCodeExpiresAt: row.pairCodeExpiresAt,
    leaseOwner: row.leaseOwner,
    leaseUntil: row.leaseUntil,
    capabilities: parseChannelCapabilities(row.capabilities),
    policy: parseJson<MirrorPolicy>(row.policy),
    modeOverride: row.modeOverride,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toBinding(row: ConnectorBindingRow): ConnectorBindingRecord {
  const topic = row.externalTopicId === '' ? null : row.externalTopicId;
  return {
    id: row.id,
    connectorId: row.connectorId,
    orgId: row.orgId,
    externalChatId: row.externalChatId,
    externalTopicId: topic,
    chatType: row.chatType as ConnectorChatType,
    title: row.title === '' ? null : row.title,
    threadId: row.threadId ?? null,
    status: row.status as ConnectorBindingStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toInbox(row: ConnectorInboxRow): ConnectorInboxRecord {
  return {
    id: row.id,
    connectorId: row.connectorId,
    bindingId: row.bindingId,
    updateId: row.updateId,
    kind: row.kind as ConnectorInboxKind,
    payload: parseJson<unknown>(row.payload),
    status: row.status as ConnectorInboxStatus,
    createdAt: row.createdAt,
  };
}

export function toDelivery(row: ConnectorDeliveryRow): ConnectorDeliveryRecord {
  return {
    id: row.id,
    connectorId: row.connectorId,
    bindingId: row.bindingId,
    threadId: row.threadId,
    runId: row.runId,
    blockKey: row.blockKey,
    interruptId: row.interruptId,
    draftId: row.draftId,
    lastText: row.lastText,
    externalMessageId: row.externalMessageId,
    status: row.status as ConnectorDeliveryStatus,
    updatedAt: row.updatedAt,
  };
}

export function topicToStorage(topicId: string | null): string {
  return topicId ?? '';
}

export function stringifyPolicy(policy: MirrorPolicy): string {
  return JSON.stringify(policy);
}

export function stringifyCapabilities(capabilities: ChannelCapabilities): string {
  return stringifyChannelCapabilities(capabilities);
}

export function stringifyPayload(payload: unknown): string {
  return JSON.stringify(payload ?? {});
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}
