import type { ConnectorBindingPublic, ConnectorPublic, ConnectorStatus } from '@harnesys/contracts';

export interface PairInfo {
  pairCode: string;
  pairUrl: string;
}

export type ChatKind = 'dm' | 'group' | 'channel';

export const CONNECTOR_STATUS_LABEL: Record<ConnectorStatus, string> = {
  awaiting_pair: 'Awaiting pair',
  active: 'Active',
  paused: 'Paused',
  error: 'Error',
};

export const CONNECTOR_STATUS_TONE: Record<ConnectorStatus, 'ok' | 'warn' | 'info' | 'danger'> = {
  active: 'ok',
  paused: 'warn',
  awaiting_pair: 'info',
  error: 'danger',
};

const CHAT_LABEL: Record<string, string> = {
  private: 'Direct message',
  group: 'Group',
  supergroup: 'Group',
  channel: 'Channel',
};

export function chatTypeLabel(chatType: string): string {
  return CHAT_LABEL[chatType] ?? chatType;
}

export function isTopic(binding: ConnectorBindingPublic): boolean {
  return binding.topicId !== null;
}

export function isGroupChat(chatType: string): boolean {
  return chatType === 'group' || chatType === 'supergroup';
}

export function agentNamesOf(ids: string[], namesById: Map<string, string>): string {
  return ids.map((id) => namesById.get(id) ?? id).join(', ');
}

export function chatKindOf(binding: ConnectorBindingPublic): ChatKind {
  if (binding.chatType === 'private') {
    return 'dm';
  }
  if (binding.chatType === 'channel') {
    return 'channel';
  }
  return 'group';
}

export function isUnnamedTitle(binding: ConnectorBindingPublic): boolean {
  const title = binding.title?.trim() ?? '';
  if (title.length === 0 || title === binding.chatId) {
    return true;
  }
  if (/^-?\d+$/.test(title)) {
    return true;
  }
  return /^Topic \d+$/.test(title);
}

export function chatDisplayName(binding: ConnectorBindingPublic): string {
  const fallback = fallbackName(binding);
  if (isUnnamedTitle(binding)) {
    return fallback;
  }
  return isTopic(binding) ? `#${binding.title}` : (binding.title ?? fallback);
}

function fallbackName(binding: ConnectorBindingPublic): string {
  if (binding.chatType === 'channel') {
    return 'Untitled channel';
  }
  if (chatKindOf(binding) === 'dm') {
    return 'Direct message';
  }
  return 'Untitled group';
}

export function chatLabel(binding: ConnectorBindingPublic): string {
  const base = chatDisplayName(binding);
  return isTopic(binding) ? `Topic “${base.slice(1)}”` : base;
}

export function pairExpiryOf(connector: ConnectorPublic): number | null {
  if (connector.pairExpiresAt === null) {
    return null;
  }
  const at = Date.parse(connector.pairExpiresAt);
  return Number.isNaN(at) || at <= Date.now() ? null : at;
}

export function formatExpiry(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
