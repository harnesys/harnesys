import type { ConnectorRecord } from '../../domain/connector/connector.ts';
import type { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import type { CanonicalUpdate } from '../../domain/connector/telegram-update.ts';

interface DiscoveredChat {
  chatId: string;
  topicId: string | null;
  chatType: string;
  title: string;
}

export function discoverChat(
  connectors: ConnectorRepositoryPort,
  orgId: string,
  connector: ConnectorRecord,
  update: CanonicalUpdate,
): void {
  const chat = chatOfUpdate(update);
  if (chat === null || chat.chatType === 'private') {
    return;
  }
  upsertBinding(connectors, orgId, connector, chat);
}

function chatOfUpdate(update: CanonicalUpdate): DiscoveredChat | null {
  if (update.kind === 'topic_created') {
    return {
      chatId: update.chatId,
      topicId: update.topicId,
      chatType: update.chatType,
      title: update.title || update.chatTitle,
    };
  }
  if (update.kind === 'chat_member' || update.kind === 'message' || update.kind === 'command') {
    return {
      chatId: update.chatId,
      topicId: null,
      chatType: update.chatType,
      title: update.chatTitle,
    };
  }
  if (update.kind === 'ignored' || update.kind === 'unsupported') {
    if (update.chatId === null) {
      return null;
    }
    return {
      chatId: update.chatId,
      topicId: null,
      chatType: update.chatType,
      title: update.chatTitle,
    };
  }
  return null;
}

function upsertBinding(
  connectors: ConnectorRepositoryPort,
  orgId: string,
  connector: ConnectorRecord,
  input: DiscoveredChat,
): void {
  const now = new Date().toISOString();
  const existing = connectors.findBindingByChat(orgId, connector.id, input.chatId, input.topicId);
  if (existing) {
    if (input.title && input.title !== existing.title) {
      connectors.updateBindingTitle(orgId, existing.id, input.title, now);
    }
    return;
  }
  try {
    connectors.insertBinding({
      id: crypto.randomUUID(),
      connectorId: connector.id,
      orgId,
      externalChatId: input.chatId,
      externalTopicId: input.topicId,
      chatType: input.chatType,
      title: input.title || null,
      threadId: null,
      status: 'unpaired',
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    // another update may have created the binding first
  }
}
