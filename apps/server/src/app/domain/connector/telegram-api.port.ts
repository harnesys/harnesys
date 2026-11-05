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
}

export interface TelegramForumTopic {
  chatId: string;
  topicId: string;
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
    },
  ): Promise<TelegramSentMessage>;

  abstract editMessageText(
    token: string,
    chatId: string,
    messageId: string,
    text: string,
  ): Promise<TelegramSentMessage>;

  abstract deleteMessage(token: string, chatId: string, messageId: string): Promise<void>;

  abstract pinChatMessage(
    token: string,
    chatId: string,
    messageId: string,
    notify?: boolean,
  ): Promise<void>;

  abstract sendChatAction(
    token: string,
    chatId: string,
    action: 'typing',
    topicId?: string | null,
  ): Promise<void>;

  abstract sendPhoto(
    token: string,
    chatId: string,
    bytes: Uint8Array,
    filename: string,
    topicId?: string | null,
  ): Promise<TelegramSentMessage>;

  abstract sendDocument(
    token: string,
    chatId: string,
    bytes: Uint8Array,
    filename: string,
    topicId?: string | null,
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

  abstract setMyCommands(token: string, commands: TelegramBotCommand[]): Promise<void>;
}
