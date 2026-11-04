import { Injectable, Logger } from '@harnesys/brix';
import {
  TelegramApiPort,
  TelegramBlockedError,
  type TelegramBotCommand,
  type TelegramBotIdentity,
  type TelegramChatMember,
  type TelegramFileRef,
  type TelegramInlineButton,
  type TelegramSentMessage,
  TelegramUnauthorizedError,
} from '../../domain/connector/telegram-api.port.ts';
import {
  API_ROOT,
  asRecord,
  callForm,
  callJson,
  isMemberLookupMiss,
  messageIdOf,
} from './telegram-api.http.ts';

const STOPPED_UPDATE = 'stopped_message_generation';
const DEFAULT_ALLOWED = ['message', 'edited_message', 'callback_query', STOPPED_UPDATE] as const;

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
    const result = await callJson(token, 'getMe', {});
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
    return {
      id: String(id),
      username,
      canReadAllGroupMessages: user?.can_read_all_group_messages === true,
    };
  }

  async getUpdates(
    token: string,
    offset: number,
    timeoutSec: number,
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    try {
      const result = await callJson(
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
        const result = await callJson(
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
    options?: {
      replyMarkup?: { inlineKeyboard: TelegramInlineButton[][] };
      topicId?: string | null;
      replyToMessageId?: string | null;
    },
  ): Promise<TelegramSentMessage> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (options?.topicId) {
      body.message_thread_id = Number(options.topicId);
    }
    if (options?.replyToMessageId) {
      body.reply_to_message_id = Number(options.replyToMessageId);
    }
    if (options?.replyMarkup) {
      body.reply_markup = {
        inline_keyboard: options.replyMarkup.inlineKeyboard.map((row) =>
          row.map((button) => ({ text: button.label, callback_data: button.value })),
        ),
      };
    }
    return messageIdOf(await callJson(token, 'sendMessage', body));
  }

  async sendMessageDraft(
    token: string,
    chatId: string,
    draftId: number,
    text: string,
    options?: { canStop?: boolean; topicId?: string | null },
  ): Promise<TelegramSentMessage> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      draft_id: draftId,
      text,
    };
    if (options?.topicId) {
      body.message_thread_id = Number(options.topicId);
    }
    if (options?.canStop === true) {
      body.can_stop = true;
    }
    await callJson(token, 'sendMessageDraft', body);
    return { messageId: String(draftId) };
  }

  async editMessageText(
    token: string,
    chatId: string,
    messageId: string,
    text: string,
  ): Promise<TelegramSentMessage> {
    return messageIdOf(
      await callJson(token, 'editMessageText', {
        chat_id: chatId,
        message_id: Number(messageId),
        text,
      }),
    );
  }

  async sendChatAction(
    token: string,
    chatId: string,
    action: 'typing',
    topicId?: string | null,
  ): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, action };
    if (topicId) {
      body.message_thread_id = Number(topicId);
    }
    await callJson(token, 'sendChatAction', body);
  }

  async sendPhoto(
    token: string,
    chatId: string,
    bytes: Uint8Array,
    filename: string,
    topicId?: string | null,
  ): Promise<TelegramSentMessage> {
    return this.sendUpload({
      token,
      method: 'sendPhoto',
      field: 'photo',
      chatId,
      bytes,
      filename,
      ...(topicId ? { topicId } : {}),
    });
  }

  async sendDocument(
    token: string,
    chatId: string,
    bytes: Uint8Array,
    filename: string,
    topicId?: string | null,
  ): Promise<TelegramSentMessage> {
    return this.sendUpload({
      token,
      method: 'sendDocument',
      field: 'document',
      chatId,
      bytes,
      filename,
      ...(topicId ? { topicId } : {}),
    });
  }

  async answerCallbackQuery(token: string, callbackQueryId: string, text?: string): Promise<void> {
    const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
    if (text !== undefined) {
      body.text = text;
    }
    await callJson(token, 'answerCallbackQuery', body);
  }

  async getFile(token: string, fileId: string): Promise<TelegramFileRef & { bytes: Uint8Array }> {
    const result = asRecord(await callJson(token, 'getFile', { file_id: fileId }));
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

  async getChatMember(
    token: string,
    chatId: string,
    userId: string,
  ): Promise<TelegramChatMember | null> {
    try {
      const result = asRecord(
        await callJson(token, 'getChatMember', { chat_id: chatId, user_id: userId }),
      );
      const status = result?.status;
      if (typeof status !== 'string') {
        return null;
      }
      return { status, canManageChat: result?.can_manage_chat === true };
    } catch (error) {
      if (isMemberLookupMiss(error)) {
        return null;
      }
      throw error;
    }
  }

  async setMyCommands(token: string, commands: TelegramBotCommand[]): Promise<void> {
    await callJson(token, 'setMyCommands', {
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
    topicId?: string;
  }): Promise<TelegramSentMessage> {
    const form = new FormData();
    form.set('chat_id', input.chatId);
    if (input.topicId) {
      form.set('message_thread_id', String(Number(input.topicId)));
    }
    form.set(input.field, new Blob([input.bytes]), input.filename);
    return messageIdOf(await callForm(input.token, input.method, form));
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
