import { Injectable, Logger } from '@harnesys/brix';
import {
  TelegramApiPort,
  TelegramBlockedError,
  type TelegramBotCommand,
  type TelegramBotIdentity,
  type TelegramFileRef,
  type TelegramInlineButton,
  type TelegramSentMessage,
  TelegramUnauthorizedError,
} from '../../domain/connector/telegram-api.port.ts';

const API_ROOT = 'https://api.telegram.org';
const STOPPED_UPDATE = 'stopped_message_generation';
const DEFAULT_ALLOWED = ['message', 'edited_message', 'callback_query', STOPPED_UPDATE] as const;

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
  result?: unknown;
}

@Injectable()
export class TelegramApiAdapter extends TelegramApiPort {
  private readonly log: Logger;
  private allowedUpdates: string[] = [...DEFAULT_ALLOWED];
  private warnedStoppedUpdate = false;

  constructor(logger: Logger) {
    super();
    this.log = logger.child('telegram-api');
  }

  async getMe(token: string): Promise<TelegramBotIdentity> {
    const result = await this.callJson(token, 'getMe', {});
    const user = asRecord(result);
    const id = user?.id;
    const username = user?.username;
    if (
      (typeof id !== 'number' && typeof id !== 'string') ||
      typeof username !== 'string' ||
      username.length === 0
    ) {
      throw new Error('Telegram getMe returned an unexpected payload');
    }
    return { id: String(id), username };
  }

  async getUpdates(
    token: string,
    offset: number,
    timeoutSec: number,
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    try {
      const result = await this.callJson(
        token,
        'getUpdates',
        {
          offset,
          timeout: timeoutSec,
          allowed_updates: this.allowedUpdates,
        },
        signal,
      );
      return Array.isArray(result) ? result : [];
    } catch (error) {
      if (this.shouldDropStoppedUpdate(error)) {
        this.allowedUpdates = this.allowedUpdates.filter((name) => name !== STOPPED_UPDATE);
        if (!this.warnedStoppedUpdate) {
          this.warnedStoppedUpdate = true;
          this.log.warn({}, 'Telegram rejected stopped_message_generation in allowed_updates');
        }
        const result = await this.callJson(
          token,
          'getUpdates',
          {
            offset,
            timeout: timeoutSec,
            allowed_updates: this.allowedUpdates,
          },
          signal,
        );
        return Array.isArray(result) ? result : [];
      }
      throw error;
    }
  }

  async sendMessage(
    token: string,
    chatId: string,
    text: string,
    options?: { replyMarkup?: { inlineKeyboard: TelegramInlineButton[][] } },
  ): Promise<TelegramSentMessage> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (options?.replyMarkup) {
      body.reply_markup = {
        inline_keyboard: options.replyMarkup.inlineKeyboard.map((row) =>
          row.map((button) => ({ text: button.label, callback_data: button.value })),
        ),
      };
    }
    return messageIdOf(await this.callJson(token, 'sendMessage', body));
  }

  async sendMessageDraft(
    token: string,
    chatId: string,
    draftId: number,
    text: string,
    options?: { canStop?: boolean },
  ): Promise<TelegramSentMessage> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      draft_id: draftId,
      text,
    };
    if (options?.canStop === true) {
      body.can_stop = true;
    }
    await this.callJson(token, 'sendMessageDraft', body);
    return { messageId: String(draftId) };
  }

  async editMessageText(
    token: string,
    chatId: string,
    messageId: string,
    text: string,
  ): Promise<TelegramSentMessage> {
    return messageIdOf(
      await this.callJson(token, 'editMessageText', {
        chat_id: chatId,
        message_id: Number(messageId),
        text,
      }),
    );
  }

  async sendChatAction(token: string, chatId: string, action: 'typing'): Promise<void> {
    await this.callJson(token, 'sendChatAction', { chat_id: chatId, action });
  }

  async sendPhoto(
    token: string,
    chatId: string,
    bytes: Uint8Array,
    filename: string,
  ): Promise<TelegramSentMessage> {
    return this.sendUpload({
      token,
      method: 'sendPhoto',
      field: 'photo',
      chatId,
      bytes,
      filename,
    });
  }

  async sendDocument(
    token: string,
    chatId: string,
    bytes: Uint8Array,
    filename: string,
  ): Promise<TelegramSentMessage> {
    return this.sendUpload({
      token,
      method: 'sendDocument',
      field: 'document',
      chatId,
      bytes,
      filename,
    });
  }

  async answerCallbackQuery(token: string, callbackQueryId: string, text?: string): Promise<void> {
    const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
    if (text !== undefined) {
      body.text = text;
    }
    await this.callJson(token, 'answerCallbackQuery', body);
  }

  async getFile(token: string, fileId: string): Promise<TelegramFileRef & { bytes: Uint8Array }> {
    const result = asRecord(await this.callJson(token, 'getFile', { file_id: fileId }));
    const filePath = result?.file_path;
    const fileSize = result?.file_size;
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new Error('Telegram getFile returned no file_path');
    }
    const size = typeof fileSize === 'number' ? fileSize : 0;
    const response = await fetch(`${API_ROOT}/file/bot${token}/${filePath}`);
    if (response.status === 401) {
      throw new TelegramUnauthorizedError();
    }
    if (response.status === 403 && (await response.text()).toLowerCase().includes('blocked')) {
      throw new TelegramBlockedError();
    }
    if (!response.ok) {
      throw new Error(`Telegram file download failed with HTTP ${response.status}`);
    }
    return {
      filePath,
      fileSize: size,
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  }

  async setMyCommands(token: string, commands: TelegramBotCommand[]): Promise<void> {
    await this.callJson(token, 'setMyCommands', {
      commands: commands.map((command) => ({
        command: command.command,
        description: command.description,
      })),
    });
  }

  private async sendUpload(input: {
    token: string;
    method: string;
    field: string;
    chatId: string;
    bytes: Uint8Array;
    filename: string;
  }): Promise<TelegramSentMessage> {
    const form = new FormData();
    form.set('chat_id', input.chatId);
    form.set(input.field, new Blob([input.bytes]), input.filename);
    return messageIdOf(await this.callForm(input.token, input.method, form));
  }

  private async callJson(
    token: string,
    method: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const response = await fetch(`${API_ROOT}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    return this.readOk(response);
  }

  private async callForm(token: string, method: string, form: FormData): Promise<unknown> {
    const response = await fetch(`${API_ROOT}/bot${token}/${method}`, {
      method: 'POST',
      body: form,
    });
    return this.readOk(response);
  }

  private async readOk(response: Response): Promise<unknown> {
    const payload = (await response.json()) as TelegramApiResponse;
    if (response.status === 401 || payload.error_code === 401) {
      throw new TelegramUnauthorizedError();
    }
    const description = payload.description ?? '';
    if (
      (response.status === 403 || payload.error_code === 403) &&
      description.toLowerCase().includes('blocked')
    ) {
      throw new TelegramBlockedError();
    }
    if (!payload.ok) {
      const error = new Error(
        description || `Telegram API error ${payload.error_code ?? response.status}`,
      );
      Object.assign(error, {
        statusCode: payload.error_code ?? response.status,
        description,
      });
      throw error;
    }
    return payload.result;
  }

  private shouldDropStoppedUpdate(error: unknown): boolean {
    if (this.allowedUpdates.includes(STOPPED_UPDATE) === false) {
      return false;
    }
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    const rec = error as { statusCode?: unknown; description?: unknown; message?: unknown };
    if (rec.statusCode !== 400) {
      return false;
    }
    const text = `${String(rec.description ?? '')} ${String(rec.message ?? '')}`.toLowerCase();
    return text.includes(STOPPED_UPDATE);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function messageIdOf(result: unknown): TelegramSentMessage {
  const message = asRecord(result);
  const messageId = message?.message_id;
  if (typeof messageId !== 'number' && typeof messageId !== 'string') {
    throw new Error('Telegram response missing message_id');
  }
  return { messageId: String(messageId) };
}
