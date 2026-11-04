import type {
  CapabilityScope,
  TelegramChatSummary,
  TelegramChatTarget,
  TelegramMessageSummary,
  TelegramPostResult,
} from 'harnesys';
import { TelegramChatsPort } from 'harnesys';
import type { ConnectorBindingRecord, ConnectorInboxRecord, ConnectorRecord } from '../../../domain/connector/connector.ts';
import type { ConnectorRepositoryPort } from '../../../domain/connector/connector-repository.port.ts';
import type { TelegramApiPort } from '../../../domain/connector/telegram-api.port.ts';
import type { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';

export interface OrgTelegramDeps {
  connectors: ConnectorRepositoryPort;
  secrets: SecretStorePort;
  telegram: TelegramApiPort;
}

interface ResolvedChat {
  connector: ConnectorRecord;
  binding: ConnectorBindingRecord;
  token: string;
  topicId: string | null;
}

const MAX_TEXT = 4096;

export class OrgTelegramPort extends TelegramChatsPort {
  constructor(private readonly deps: OrgTelegramDeps) {
    super();
  }

  hasAny(scope: CapabilityScope): boolean {
    return this.telegramConnectors(scope.orgId).length > 0;
  }

  listChats(
    scope: CapabilityScope,
    input?: { type?: string; bot?: string },
  ): TelegramChatSummary[] {
    const connectors = input?.bot
      ? [this.pickConnector(scope.orgId, input.bot)]
      : this.telegramConnectors(scope.orgId);
    const chats = connectors.flatMap((connector) => this.summaries(scope.orgId, connector));
    return input?.type ? chats.filter((chat) => chat.chatType === input.type) : chats;
  }

  async getChat(scope: CapabilityScope, input: TelegramChatTarget): Promise<TelegramChatSummary> {
    const target = await this.resolve(scope.orgId, input);
    return this.summary(scope.orgId, target.connector, target.binding);
  }

  async readMessages(
    scope: CapabilityScope,
    input: TelegramChatTarget & { limit: number },
  ): Promise<TelegramMessageSummary[]> {
    const target = await this.resolve(scope.orgId, input);
    const rows = this.deps.connectors.listRecentInbox(
      scope.orgId,
      target.connector.id,
      target.binding.externalChatId,
      target.topicId,
      input.limit,
    );
    return rows.flatMap(messageOf);
  }

  async sendMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { text: string },
  ): Promise<TelegramPostResult> {
    const target = await this.resolve(scope.orgId, input);
    const text = input.text.trim();
    if (text.length === 0) {
      throw new Error('Telegram message text is required');
    }
    if (text.length > MAX_TEXT) {
      throw new Error(`Telegram messages are limited to ${MAX_TEXT} characters`);
    }
    const sent = await this.deps.telegram.sendMessage(
      target.token,
      target.binding.externalChatId,
      text,
      { topicId: target.topicId },
    );
    return {
      messageId: sent.messageId,
      chatId: target.binding.externalChatId,
      topicId: target.topicId,
    };
  }

  async editMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { messageId: string; text: string },
  ): Promise<TelegramPostResult> {
    const target = await this.resolve(scope.orgId, input);
    const text = input.text.trim();
    if (text.length === 0) {
      throw new Error('Telegram message text is required');
    }
    const sent = await this.deps.telegram.editMessageText(
      target.token,
      target.binding.externalChatId,
      input.messageId,
      text,
    );
    return {
      messageId: sent.messageId,
      chatId: target.binding.externalChatId,
      topicId: target.topicId,
    };
  }

  async deleteMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { messageId: string },
  ): Promise<void> {
    const target = await this.resolve(scope.orgId, input);
    await this.deps.telegram.deleteMessage(
      target.token,
      target.binding.externalChatId,
      input.messageId,
    );
  }

  async pinMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { messageId: string; notify?: boolean },
  ): Promise<void> {
    const target = await this.resolve(scope.orgId, input);
    await this.deps.telegram.pinChatMessage(
      target.token,
      target.binding.externalChatId,
      input.messageId,
      input.notify,
    );
  }

  private telegramConnectors(orgId: string): ConnectorRecord[] {
    return this.deps.connectors.listByOrg(orgId).filter((row) => row.provider === 'telegram');
  }

  private pickConnector(orgId: string, bot: string): ConnectorRecord {
    const all = this.telegramConnectors(orgId);
    this.requireAny(all);
    const needle = bot.replace(/^@/, '').toLowerCase();
    const found = all.find(
      (row) => row.id === bot || row.botUsername.toLowerCase() === needle.toLowerCase(),
    );
    if (!found) {
      throw new Error(
        `Bot ${bot} is not connected. Connected bots: ${usernames(all)}. Add it in Settings → Connectors → Telegram.`,
      );
    }
    return found;
  }

  private connectorFor(orgId: string, bot: string | undefined): ConnectorRecord {
    if (bot) {
      return this.pickConnector(orgId, bot);
    }
    const all = this.telegramConnectors(orgId);
    this.requireAny(all);
    if (all.length > 1) {
      throw new Error(`Choose a bot: ${usernames(all)}`);
    }
    const only = all[0];
    if (!only) {
      throw new Error('Telegram is not connected');
    }
    return only;
  }

  private requireAny(all: ConnectorRecord[]): void {
    if (all.length === 0) {
      throw new Error('Telegram is not connected. Add a bot in Settings → Connectors → Telegram.');
    }
  }

  private summaries(orgId: string, connector: ConnectorRecord): TelegramChatSummary[] {
    return this.deps.connectors
      .listBindings(orgId, connector.id)
      .map((binding) => this.summary(orgId, connector, binding));
  }

  private summary(
    orgId: string,
    connector: ConnectorRecord,
    binding: ConnectorBindingRecord,
  ): TelegramChatSummary {
    return {
      connectorId: connector.id,
      botUsername: connector.botUsername,
      chatId: binding.externalChatId,
      topicId: binding.externalTopicId,
      chatType: binding.chatType,
      title: binding.title,
      threadId: binding.threadId,
      agentIds: this.deps.connectors.listAgentIds(orgId, connector.id),
    };
  }

  private async resolve(orgId: string, input: TelegramChatTarget): Promise<ResolvedChat> {
    const connector = this.connectorFor(orgId, input.bot);
    const token = await this.deps.secrets.get(orgId, connector.secretRef);
    if (!token) {
      throw new Error('The Telegram bot token is missing. Replace it in Settings → Connectors.');
    }
    const binding = await this.findBinding(orgId, connector, token, input);
    return {
      connector,
      binding,
      token,
      topicId: input.topicId ?? binding.externalTopicId,
    };
  }

  private async findBinding(
    orgId: string,
    connector: ConnectorRecord,
    token: string,
    input: TelegramChatTarget,
  ): Promise<ConnectorBindingRecord> {
    const bindings = this.deps.connectors.listBindings(orgId, connector.id);
    const direct = bindings.find(
      (row) => row.id === input.chat || row.externalChatId === input.chat,
    );
    if (direct) {
      return direct;
    }
    const byTitle = matchByTitle(bindings, input.chat);
    if (byTitle) {
      return byTitle;
    }
    if (input.chat.startsWith('@')) {
      const info = await this.deps.telegram.getChat(token, input.chat);
      const byUsername = bindings.find(
        (row) =>
          row.externalChatId === info.id &&
          (input.topicId === undefined || row.externalTopicId === input.topicId),
      );
      if (byUsername) {
        return byUsername;
      }
    }
    throw new Error(
      `The bot does not know the chat "${input.chat}". Add it in Settings → Connectors → Telegram first.`,
    );
  }
}

function usernames(all: ConnectorRecord[]): string {
  return all.map((row) => `@${row.botUsername}`).join(', ');
}

function matchByTitle(
  bindings: ConnectorBindingRecord[],
  chat: string,
): ConnectorBindingRecord | undefined {
  const needle = chat.replace(/^@/, '').trim().toLowerCase();
  const matches = bindings.filter((row) => (row.title ?? '').trim().toLowerCase() === needle);
  if (matches.length > 1) {
    throw new Error(`Several chats are named "${chat}". Use the chat id instead.`);
  }
  return matches[0];
}

function messageOf(row: ConnectorInboxRecord): TelegramMessageSummary[] {
  const payload = asRecord(row.payload);
  if (!payload || payload.kind !== 'message') {
    return [];
  }
  const author = asRecord(payload.author);
  return [
    {
      messageId: String(payload.messageId ?? ''),
      authorName: typeof author?.displayName === 'string' ? author.displayName : 'Unknown',
      authorUsername: typeof author?.username === 'string' ? author.username : null,
      text: typeof payload.text === 'string' ? payload.text : '',
      topicId: typeof payload.topicId === 'string' ? payload.topicId : null,
      receivedAt: row.createdAt,
    },
  ];
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}
