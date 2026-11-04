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

export function toBindingPublic(rec: ConnectorBindingRecord): ConnectorBindingPublic {
  return {
    id: rec.id,
    chatId: rec.externalChatId,
    topicId: rec.externalTopicId,
    chatType: rec.chatType,
    title: rec.title,
    threadId: rec.threadId,
    status: rec.status,
  };
}

export interface ConnectorPublicInput {
  agents: ThreadMember[];
  bindings: ConnectorBindingRecord[];
  threadId: string | null;
}

export function toConnectorPublic(
  rec: ConnectorRecord,
  input: ConnectorPublicInput,
): ConnectorPublic {
  return {
    id: rec.id,
    orgId: rec.orgId,
    agents: input.agents,
    provider: rec.provider,
    status: rec.status,
    botUsername: rec.botUsername,
    lastError: rec.lastError,
    threadId: input.threadId,
    capabilities: toCapabilitiesPublic(rec.capabilities),
    capabilityWarning: capabilityWarningOf({
      capabilities: rec.capabilities,
      bindings: input.bindings,
    }),
    bindings: input.bindings.map(toBindingPublic),
    policy: toPolicyPublic(rec.policy),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export function primaryThreadIdOf(bindings: ConnectorBindingRecord[]): string | null {
  const bound = bindings.find((binding) => binding.threadId !== null);
  return bound?.threadId ?? null;
}

export function pairExpiresAtIso(nowMs: number): string {
  return new Date(nowMs + PAIR_CODE_TTL_MS).toISOString();
}
