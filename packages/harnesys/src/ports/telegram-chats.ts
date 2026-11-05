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

export type TelegramParseMode = 'HTML' | 'MarkdownV2';

export type TelegramMediaKind = 'photo' | 'document' | 'video' | 'animation' | 'audio' | 'voice';

export interface TelegramMediaSource {
  bytes?: Uint8Array;
  filename?: string;
  fileId?: string;
}

export interface TelegramAlbumItem {
  kind: TelegramMediaKind;
  source: TelegramMediaSource;
  caption?: string;
}

export interface TelegramTopicRecord {
  chatId: string;
  topicId: string;
}

export interface TelegramPollInput {
  question: string;
  options: string[];
  anonymous?: boolean;
  multiple?: boolean;
  quiz?: boolean;
  correctOptionId?: number;
  explanation?: string;
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
    input: TelegramChatTarget & {
      text: string;
      parseMode?: TelegramParseMode;
      disableNotification?: boolean;
      protectContent?: boolean;
      linkPreview?: boolean;
      replyToMessageId?: string;
    },
  ): Promise<TelegramPostResult>;
  abstract editMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & {
      messageId: string;
      text: string;
      parseMode?: TelegramParseMode;
      linkPreview?: boolean;
    },
  ): Promise<TelegramPostResult>;
  abstract sendMedia(
    scope: CapabilityScope,
    input: TelegramChatTarget & {
      kind: TelegramMediaKind;
      source: TelegramMediaSource;
      caption?: string;
      parseMode?: TelegramParseMode;
      disableNotification?: boolean;
      replyToMessageId?: string;
    },
  ): Promise<TelegramPostResult>;
  abstract sendAlbum(
    scope: CapabilityScope,
    input: TelegramChatTarget & {
      items: TelegramAlbumItem[];
      disableNotification?: boolean;
    },
  ): Promise<TelegramPostResult[]>;
  abstract editCaption(
    scope: CapabilityScope,
    input: TelegramChatTarget & {
      messageId: string;
      caption: string;
      parseMode?: TelegramParseMode;
    },
  ): Promise<TelegramPostResult>;
  abstract deleteMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { messageId: string },
  ): Promise<void>;
  abstract pinMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { messageId: string; notify?: boolean },
  ): Promise<void>;
  abstract unpinMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { messageId: string },
  ): Promise<void>;
  abstract forwardMessage(
    scope: CapabilityScope,
    input: TelegramChatTarget & { fromChat: string; messageId: string },
  ): Promise<TelegramPostResult>;
  abstract createTopic(
    scope: CapabilityScope,
    input: TelegramChatTarget & { name: string },
  ): Promise<TelegramTopicRecord>;
  abstract editTopic(
    scope: CapabilityScope,
    input: TelegramChatTarget & { topicId: string; name?: string; closed?: boolean },
  ): Promise<void>;
  abstract deleteTopic(
    scope: CapabilityScope,
    input: TelegramChatTarget & { topicId: string },
  ): Promise<void>;
  abstract sendPoll(
    scope: CapabilityScope,
    input: TelegramChatTarget & TelegramPollInput & { disableNotification?: boolean },
  ): Promise<TelegramPostResult>;
}
