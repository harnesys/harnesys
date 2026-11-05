import type {
  CapabilityScope,
  TelegramAlbumItem,
  TelegramChatSummary,
  TelegramChatTarget,
  TelegramMediaKind,
  TelegramMessageSummary,
  TelegramParseMode,
  TelegramPollInput,
  TelegramPostResult,
  TelegramTopicRecord,
} from 'harnesys';
import { TelegramChatsPort } from 'harnesys';
import type { ConnectorInboxRecord } from '../../../domain/connector/connector.ts';
import type { TelegramMediaSource } from '../../../domain/connector/telegram-api.port.ts';
import {
  createTopicTo,
  editCaptionTo,
  editTopicTo,
  forwardTo,
  type ResolvedTarget,
  sendAlbumTo,
  sendMediaTo,
  sendPollTo,
} from './org-telegram-actions.ts';
import {
  type OrgTelegramDeps,
  pickConnector,
  type ResolvedChat,
  resolveTarget,
  summaries,
  summary,
  telegramConnectors,
} from './org-telegram-resolve.ts';

export type { OrgTelegramDeps };

const MAX_TEXT = 4096;

export class OrgTelegramPort extends TelegramChatsPort {
  constructor(private readonly deps: OrgTelegramDeps) {
    super();
  }

  hasAny(scope: CapabilityScope): boolean {
    return telegramConnectors(this.deps, scope.orgId).length > 0;
  }

  listChats(
    scope: CapabilityScope,
    input?: { type?: string; bot?: string },
  ): TelegramChatSummary[] {
    const connectors = input?.bot
      ? [pickConnector(this.deps, scope.orgId, input.bot)]
      : telegramConnectors(this.deps, scope.orgId);
    const chats = connectors.flatMap((connector) => summaries(this.deps, scope.orgId, connector));
    return input?.type ? chats.filter((chat) => chat.chatType === input.type) : chats;
  }

  async getChat(scope: CapabilityScope, input: TelegramChatTarget): Promise<TelegramChatSummary> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
    return summary(this.deps, scope.orgId, target.connector, target.binding);
  }

  async readMessages(
    scope: CapabilityScope,
    input: TelegramChatTarget & { limit: number },
  ): Promise<TelegramMessageSummary[]> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
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
    input: TelegramChatTarget & {
      text: string;
      parseMode?: TelegramParseMode;
      disableNotification?: boolean;
      protectContent?: boolean;
      linkPreview?: boolean;
      replyToMessageId?: string;
    },
  ): Promise<TelegramPostResult> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
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
      {
        topicId: target.topicId,
        ...(input.parseMode !== undefined ? { parseMode: input.parseMode } : {}),
        ...(input.disableNotification === true ? { disableNotification: true } : {}),
        ...(input.protectContent === true ? { protectContent: true } : {}),
        ...(input.linkPreview === false ? { linkPreview: false } : {}),
        ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
      },
    );
    return postOf(target, sent.messageId);
  }

  async editMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & {
      messageId: string;
      text: string;
      parseMode?: TelegramParseMode;
      linkPreview?: boolean;
    },
  ): Promise<TelegramPostResult> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
    const text = input.text.trim();
    if (text.length === 0) {
      throw new Error('Telegram message text is required');
    }
    const sent = await this.deps.telegram.editMessageText(
      target.token,
      target.binding.externalChatId,
      input.messageId,
      text,
      {
        ...(input.parseMode !== undefined ? { parseMode: input.parseMode } : {}),
        ...(input.linkPreview === false ? { linkPreview: false } : {}),
      },
    );
    return postOf(target, sent.messageId);
  }

  async sendMedia(
    scope: CapabilityScope,
    input: TelegramChatTarget & {
      kind: TelegramMediaKind;
      source: TelegramMediaSource;
      caption?: string;
      parseMode?: TelegramParseMode;
      disableNotification?: boolean;
      replyToMessageId?: string;
    },
  ): Promise<TelegramPostResult> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
    return sendMediaTo(this.deps.telegram, targetOf(target), input);
  }

  async sendAlbum(
    scope: CapabilityScope,
    input: TelegramChatTarget & {
      items: TelegramAlbumItem[];
      disableNotification?: boolean;
    },
  ): Promise<TelegramPostResult[]> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
    return sendAlbumTo(this.deps.telegram, targetOf(target), input);
  }

  async editCaption(
    scope: CapabilityScope,
    input: TelegramChatTarget & {
      messageId: string;
      caption: string;
      parseMode?: TelegramParseMode;
    },
  ): Promise<TelegramPostResult> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
    return editCaptionTo(this.deps.telegram, targetOf(target), input);
  }

  async deleteMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { messageId: string },
  ): Promise<void> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
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
    const target = await resolveTarget(this.deps, scope.orgId, input);
    await this.deps.telegram.pinChatMessage(
      target.token,
      target.binding.externalChatId,
      input.messageId,
      input.notify,
    );
  }

  async unpinMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { messageId: string },
  ): Promise<void> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
    await this.deps.telegram.unpinChatMessage(
      target.token,
      target.binding.externalChatId,
      input.messageId,
    );
  }

  async forwardMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { fromChat: string; messageId: string },
  ): Promise<TelegramPostResult> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
    return forwardTo(this.deps.telegram, targetOf(target), input);
  }

  async createTopic(
    scope: CapabilityScope,
    input: TelegramChatTarget & { name: string },
  ): Promise<TelegramTopicRecord> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
    return createTopicTo(this.deps.telegram, targetOf(target), input.name);
  }

  async editTopic(
    scope: CapabilityScope,
    input: TelegramChatTarget & { topicId: string; name?: string; closed?: boolean },
  ): Promise<void> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
    await editTopicTo(this.deps.telegram, targetOf(target), input.topicId, input);
  }

  async deleteTopic(
    scope: CapabilityScope,
    input: TelegramChatTarget & { topicId: string },
  ): Promise<void> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
    await this.deps.telegram.deleteForumTopic(
      target.token,
      target.binding.externalChatId,
      input.topicId,
    );
  }

  async sendPoll(
    scope: CapabilityScope,
    input: TelegramChatTarget & TelegramPollInput & { disableNotification?: boolean },
  ): Promise<TelegramPostResult> {
    const target = await resolveTarget(this.deps, scope.orgId, input);
    return sendPollTo(this.deps.telegram, targetOf(target), input);
  }
}

function targetOf(target: ResolvedChat): ResolvedTarget {
  return {
    token: target.token,
    chatId: target.binding.externalChatId,
    topicId: target.topicId,
  };
}

function postOf(target: ResolvedChat, messageId: string): TelegramPostResult {
  return {
    messageId,
    chatId: target.binding.externalChatId,
    topicId: target.topicId,
  };
}

function messageOf(row: ConnectorInboxRecord): TelegramMessageSummary[] {
  const payload = asRecord(row.payload);
  if (payload?.kind !== 'message') {
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
