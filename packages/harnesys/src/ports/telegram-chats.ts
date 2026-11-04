import type { CapabilityScope } from '../domain/pack.ts';

export interface TelegramChatSummary {
  connectorId: string;
  botUsername: string;
  chatId: string;
  topicId: string | null;
  chatType: string;
  title: string | null;
  threadId: string | null;
  agentIds: string[];
}

export interface TelegramChatTarget {
  chat: string;
  bot?: string;
  topicId?: string | null;
}

export interface TelegramMessageSummary {
  messageId: string;
  authorName: string;
  authorUsername: string | null;
  text: string;
  topicId: string | null;
  receivedAt: string;
}

export interface TelegramPostResult {
  messageId: string;
  chatId: string;
  topicId: string | null;
}

export abstract class TelegramChatsPort {
  abstract hasAny(scope: CapabilityScope): boolean;
  abstract listChats(
    scope: CapabilityScope,
    input?: { type?: string; bot?: string },
  ): TelegramChatSummary[];
  abstract getChat(scope: CapabilityScope, input: TelegramChatTarget): Promise<TelegramChatSummary>;
  abstract readMessages(
    scope: CapabilityScope,
    input: TelegramChatTarget & { limit: number },
  ): Promise<TelegramMessageSummary[]>;
  abstract sendMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { text: string },
  ): Promise<TelegramPostResult>;
  abstract editMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { messageId: string; text: string },
  ): Promise<TelegramPostResult>;
  abstract deleteMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { messageId: string },
  ): Promise<void>;
  abstract pinMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { messageId: string; notify?: boolean },
  ): Promise<void>;
}
