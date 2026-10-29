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
    },
  ): Promise<TelegramSentMessage>;

  abstract sendMessageDraft(
    token: string,
    chatId: string,
    draftId: number,
    text: string,
    options?: { canStop?: boolean },
  ): Promise<TelegramSentMessage>;

  abstract editMessageText(
    token: string,
    chatId: string,
    messageId: string,
    text: string,
  ): Promise<TelegramSentMessage>;

  abstract sendChatAction(token: string, chatId: string, action: 'typing'): Promise<void>;

  abstract sendPhoto(
    token: string,
    chatId: string,
    bytes: Uint8Array,
    filename: string,
  ): Promise<TelegramSentMessage>;

  abstract sendDocument(
    token: string,
    chatId: string,
    bytes: Uint8Array,
    filename: string,
  ): Promise<TelegramSentMessage>;

  abstract answerCallbackQuery(
    token: string,
    callbackQueryId: string,
    text?: string,
  ): Promise<void>;

  abstract getFile(token: string, fileId: string): Promise<TelegramFileRef & { bytes: Uint8Array }>;

  abstract setMyCommands(token: string, commands: TelegramBotCommand[]): Promise<void>;
}
