import type {
  ConnectorBindingPublic,
  ConnectorCapabilities,
  ConnectorPublic,
  MirrorPolicyPublic,
  ThreadMember,
} from '@harnesys/contracts';
import {
  type ChannelCapabilities,
  capabilityWarningOf,
} from '../../domain/connector/channel-capabilities.ts';
import type { ConnectorBindingRecord, ConnectorRecord } from '../../domain/connector/connector.ts';
import { type MirrorPolicy, PAIR_CODE_TTL_MS } from '../../domain/connector/constants.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';

export function connectorSecretKey(connectorId: string): string {
  return `connector_telegram_${connectorId}`;
}

export function pairUrlFor(botUsername: string, code: string): string {
  return `https://t.me/${botUsername}?start=${code}`;
}

export function toPolicyPublic(policy: MirrorPolicy): MirrorPolicyPublic {
  return {
    text: policy.text,
    ask: policy.ask,
    failures: policy.failures,
    files: policy.files,
    appUserEcho: policy.appUserEcho,
  };
}

export function toCapabilitiesPublic(capabilities: ChannelCapabilities): ConnectorCapabilities {
  return {
    canReadUnmentioned: capabilities.canReadUnmentioned,
    supportsTopics: capabilities.supportsTopics,
    supportsReplyTargets: capabilities.supportsReplyTargets,
    canEditMessages: capabilities.canEditMessages,
    maxMessageLength: capabilities.maxMessageLength,
    streaming: capabilities.streaming,
  };
}

export function toBindingPublic(
  rec: ConnectorBindingRecord,
  thread: ThreadRecord | null,
  agentIds: string[],
): ConnectorBindingPublic {
  return {
    id: rec.id,
    chatId: rec.externalChatId,
    topicId: rec.externalTopicId,
    chatType: rec.chatType,
    title: rec.title,
    status: rec.status,
    threadId: rec.threadId,
    threadTitle: thread?.title ?? null,
    threadKind: thread?.kind ?? null,
    agentIds,
    autoReplyAgentId: thread?.autoReplyAgentId ?? null,
  };
}

export interface ConnectorPublicInput {
  bindings: ConnectorBindingPublic[];
}

export function toConnectorPublic(
  rec: ConnectorRecord,
  input: ConnectorPublicInput,
): ConnectorPublic {
  return {
    id: rec.id,
    orgId: rec.orgId,
    provider: rec.provider,
    status: rec.status,
    botId: rec.botUserId,
    botUsername: rec.botUsername,
    lastError: rec.lastError,
    pairExpiresAt: rec.pairCodeExpiresAt,
    capabilities: toCapabilitiesPublic(rec.capabilities),
    capabilityWarning: capabilityWarningOf({
      capabilities: rec.capabilities,
      bindings: input.bindings,
    }),
    bindings: input.bindings,
    policy: toPolicyPublic(rec.policy),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export function pairExpiresAtIso(nowMs: number): string {
  return new Date(nowMs + PAIR_CODE_TTL_MS).toISOString();
}

export type { ThreadMember };
