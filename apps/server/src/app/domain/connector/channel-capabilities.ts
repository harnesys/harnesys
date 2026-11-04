import type { ConnectorBindingRecord } from './connector.ts';

export interface ChannelCapabilities {
  canReadUnmentioned: boolean;
  supportsTopics: boolean;
  supportsReplyTargets: boolean;
  canEditMessages: boolean;
  maxMessageLength: number;
  streaming: boolean;
}

export const UNKNOWN_CAPABILITIES: ChannelCapabilities = {
  canReadUnmentioned: false,
  supportsTopics: false,
  supportsReplyTargets: true,
  canEditMessages: true,
  maxMessageLength: 4096,
  streaming: true,
};

export function telegramCapabilities(input: {
  canReadAllGroupMessages: boolean;
  canEditMessages: boolean;
  streaming: boolean;
}): ChannelCapabilities {
  return {
    canReadUnmentioned: input.canReadAllGroupMessages,
    supportsTopics: true,
    supportsReplyTargets: true,
    canEditMessages: input.canEditMessages,
    maxMessageLength: 4096,
    streaming: input.streaming,
  };
}

export function parseChannelCapabilities(raw: string | null | undefined): ChannelCapabilities {
  if (!raw) {
    return UNKNOWN_CAPABILITIES;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return UNKNOWN_CAPABILITIES;
    }
    const rec = parsed as Record<string, unknown>;
    return {
      canReadUnmentioned: rec.canReadUnmentioned === true,
      supportsTopics: rec.supportsTopics === true,
      supportsReplyTargets: rec.supportsReplyTargets !== false,
      canEditMessages: rec.canEditMessages !== false,
      maxMessageLength:
        typeof rec.maxMessageLength === 'number' && rec.maxMessageLength > 0
          ? rec.maxMessageLength
          : UNKNOWN_CAPABILITIES.maxMessageLength,
      streaming: rec.streaming !== false,
    };
  } catch {
    return UNKNOWN_CAPABILITIES;
  }
}

export function stringifyChannelCapabilities(capabilities: ChannelCapabilities): string {
  return JSON.stringify(capabilities);
}

const GROUP_CHATS = new Set(['group', 'supergroup', 'channel']);

export function isGroupChat(chatType: string): boolean {
  return GROUP_CHATS.has(chatType);
}

export function capabilityWarningOf(input: {
  capabilities: ChannelCapabilities;
  bindings: Array<Pick<ConnectorBindingRecord, 'chatType'>>;
}): string | null {
  const groups = input.bindings.filter((binding) => isGroupChat(binding.chatType));
  if (groups.length === 0 || input.capabilities.canReadUnmentioned) {
    return null;
  }
  return 'This bot reads only group messages that mention it. Disable privacy mode in BotFather (/setprivacy) if it should answer every message.';
}
