export class TelegramUnauthorizedError extends Error {
  readonly statusCode = 401;

  constructor(message = 'Telegram rejected the bot token') {
    super(message);
    this.name = 'TelegramUnauthorizedError';
  }
}

export class TelegramBlockedError extends Error {
  readonly statusCode = 403;

  constructor(message = 'The Telegram user blocked the bot') {
    super(message);
    this.name = 'TelegramBlockedError';
  }
}

export interface TelegramBotIdentity {
  id: string;
  username: string;
  canReadAllGroupMessages: boolean;
}

export interface TelegramSentMessage {
  messageId: string;
}

export interface TelegramFileRef {
  filePath: string;
  fileSize: number;
}

export interface TelegramBotCommand {
  command: string;
  description: string;
}

export interface TelegramInlineButton {
  label: string;
  value: string;
}

export interface TelegramChatMember {
  status: string;
  canManageChat: boolean;
  canManageTopics: boolean;
}

export interface TelegramChatInfo {
  id: string;
  type: string;
  title: string | null;
  username: string | null;
  description: string | null;
  memberCount: number | null;
}

export interface TelegramForumTopic {
  chatId: string;
  topicId: string;
}

export type TelegramParseMode = 'HTML' | 'MarkdownV2';

export type TelegramMediaKind = 'photo' | 'document' | 'video' | 'animation' | 'audio' | 'voice';

export interface TelegramMediaSource {
  bytes?: Uint8Array;
  filename?: string;
  fileId?: string;
}

export interface TelegramMediaOptions {
  caption?: string;
  parseMode?: TelegramParseMode;
  topicId?: string | null;
  replyToMessageId?: string | null;
  disableNotification?: boolean;
}

export interface TelegramAlbumItem {
  kind: TelegramMediaKind;
  source: TelegramMediaSource;
  caption?: string;
  parseMode?: TelegramParseMode;
}

export abstract class TelegramApiPort {
  abstract getMe(token: string): Promise<TelegramBotIdentity>;

  abstract getUpdates(
    token: string,
    offset: number,
    timeoutSec: number,
    signal?: AbortSignal,
  ): Promise<unknown[]>;

  abstract sendMessage(
    token: string,
    chatId: string,
    text: string,
    options?: {
      replyMarkup?: { inlineKeyboard: TelegramInlineButton[][] };
      topicId?: string | null;
      replyToMessageId?: string | null;
      parseMode?: TelegramParseMode;
      disableNotification?: boolean;
      protectContent?: boolean;
      linkPreview?: boolean;
    },
  ): Promise<TelegramSentMessage>;

  abstract editMessageText(
    token: string,
    chatId: string,
    messageId: string,
    text: string,
    options?: { parseMode?: TelegramParseMode; linkPreview?: boolean },
  ): Promise<TelegramSentMessage>;

  abstract editMessageCaption(
    token: string,
    chatId: string,
    messageId: string,
    caption: string,
    options?: { parseMode?: TelegramParseMode },
  ): Promise<TelegramSentMessage>;

  abstract deleteMessage(token: string, chatId: string, messageId: string): Promise<void>;

  abstract pinChatMessage(
    token: string,
    chatId: string,
    messageId: string,
    notify?: boolean,
  ): Promise<void>;

  abstract unpinChatMessage(token: string, chatId: string, messageId: string): Promise<void>;

  abstract forwardMessage(
    token: string,
    fromChatId: string,
    messageId: string,
    toChatId: string,
    options?: { topicId?: string | null; disableNotification?: boolean },
  ): Promise<TelegramSentMessage>;

  abstract sendChatAction(
    token: string,
    chatId: string,
    action: 'typing',
    topicId?: string | null,
  ): Promise<void>;

  abstract sendPhoto(
    token: string,
    chatId: string,
    source: TelegramMediaSource,
    options?: TelegramMediaOptions,
  ): Promise<TelegramSentMessage>;

  abstract sendDocument(
    token: string,
    chatId: string,
    source: TelegramMediaSource,
    options?: TelegramMediaOptions,
  ): Promise<TelegramSentMessage>;

  abstract sendMedia(
    token: string,
    chatId: string,
    kind: TelegramMediaKind,
    source: TelegramMediaSource,
    options?: TelegramMediaOptions,
  ): Promise<TelegramSentMessage>;

  abstract sendMediaGroup(
    token: string,
    chatId: string,
    items: TelegramAlbumItem[],
    options?: { topicId?: string | null; disableNotification?: boolean },
  ): Promise<TelegramSentMessage[]>;

  abstract sendPoll(
    token: string,
    chatId: string,
    input: {
      question: string;
      options: string[];
      anonymous?: boolean;
      multiple?: boolean;
      quiz?: boolean;
      correctOptionId?: number;
      explanation?: string;
      topicId?: string | null;
      disableNotification?: boolean;
    },
  ): Promise<TelegramSentMessage>;

  abstract answerCallbackQuery(
    token: string,
    callbackQueryId: string,
    text?: string,
  ): Promise<void>;

  abstract getFile(token: string, fileId: string): Promise<TelegramFileRef & { bytes: Uint8Array }>;

  abstract getChatMember(
    token: string,
    chatId: string,
    userId: string,
  ): Promise<TelegramChatMember | null>;

  abstract getChat(token: string, chatId: string): Promise<TelegramChatInfo>;

  abstract createForumTopic(
    token: string,
    chatId: string,
    name: string,
  ): Promise<TelegramForumTopic>;

  abstract editForumTopic(
    token: string,
    chatId: string,
    topicId: string,
    name: string,
  ): Promise<void>;

  abstract closeForumTopic(token: string, chatId: string, topicId: string): Promise<void>;

  abstract reopenForumTopic(token: string, chatId: string, topicId: string): Promise<void>;

  abstract deleteForumTopic(token: string, chatId: string, topicId: string): Promise<void>;

  abstract setMyCommands(token: string, commands: TelegramBotCommand[]): Promise<void>;
}
