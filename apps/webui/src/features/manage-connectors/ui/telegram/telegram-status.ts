import type { ConnectorBindingPublic, ConnectorStatus } from '@harnesys/contracts';

export interface PairInfo {
  pairCode: string;
  pairUrl: string;
}

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

export function chatLabel(binding: ConnectorBindingPublic): string {
  const base = binding.title || chatTypeLabel(binding.chatType);
  return binding.topicId ? `Topic “${base}”` : base;
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
