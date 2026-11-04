import type { ConnectorRecord } from '../../domain/connector/connector.ts';
import type { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import type { CanonicalUpdate } from '../../domain/connector/telegram-update.ts';

type DiscoveryUpdate = Extract<CanonicalUpdate, { kind: 'chat_member' | 'topic_created' }>;

export function discoverChat(
  connectors: ConnectorRepositoryPort,
  orgId: string,
  connector: ConnectorRecord,
  update: DiscoveryUpdate,
): void {
  if (update.kind === 'chat_member') {
    discoverChatMember(connectors, orgId, connector, update);
    return;
  }
  discoverTopic(connectors, orgId, connector, update);
}

function discoverChatMember(
  connectors: ConnectorRepositoryPort,
  orgId: string,
  connector: ConnectorRecord,
  update: Extract<CanonicalUpdate, { kind: 'chat_member' }>,
): void {
  if (update.chatType === 'private') {
    return;
  }
  upsertBinding(connectors, orgId, connector, {
    chatId: update.chatId,
    topicId: null,
    chatType: update.chatType,
    title: update.chatTitle,
  });
}

function discoverTopic(
  connectors: ConnectorRepositoryPort,
  orgId: string,
  connector: ConnectorRecord,
  update: Extract<CanonicalUpdate, { kind: 'topic_created' }>,
): void {
  upsertBinding(connectors, orgId, connector, {
    chatId: update.chatId,
    topicId: update.topicId,
    chatType: update.chatType,
    title: update.title || update.chatTitle,
  });
}

function upsertBinding(
  connectors: ConnectorRepositoryPort,
  orgId: string,
  connector: ConnectorRecord,
  input: { chatId: string; topicId: string | null; chatType: string; title: string },
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
