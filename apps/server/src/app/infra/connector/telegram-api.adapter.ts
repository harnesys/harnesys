import { Injectable, Logger } from '@harnesys/brix';
import {
  type TelegramAlbumItem,
  TelegramApiPort,
  type TelegramBotCommand,
  type TelegramBotIdentity,
  type TelegramChatInfo,
  type TelegramChatMember,
  type TelegramFileRef,
  type TelegramForumTopic,
  type TelegramInlineButton,
  type TelegramMediaKind,
  type TelegramMediaOptions,
  type TelegramMediaSource,
  type TelegramSentMessage,
} from '../../domain/connector/telegram-api.port.ts';
import {
  asRecord,
  callJson,
  DEFAULT_ALLOWED_UPDATES,
  messageIdOf,
  rejectsStoppedUpdate,
  STOPPED_UPDATE,
} from './telegram-api.http.ts';
import {
  closeTopicRequest,
  createTopicRequest,
  deleteTopicRequest,
  editCaptionRequest,
  editTopicRequest,
  forwardMessageRequest,
  getChatInfoRequest,
  reopenTopicRequest,
  sendPollRequest,
  unpinMessageRequest,
} from './telegram-api-chat.ts';
import { getChatMemberRequest, getFileRequest } from './telegram-api-files.ts';
import { sendMediaAlbum, sendMediaUpload } from './telegram-api-media.ts';

@Injectable()
export class TelegramApiAdapter extends TelegramApiPort {
  private readonly log: Logger;
  private allowedUpdates: string[] = [...DEFAULT_ALLOWED_UPDATES];
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
      parseMode?: 'HTML' | 'MarkdownV2';
      disableNotification?: boolean;
      protectContent?: boolean;
      linkPreview?: boolean;
    },
  ): Promise<TelegramSentMessage> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (options?.topicId) {
      body.message_thread_id = Number(options.topicId);
    }
    if (options?.replyToMessageId) {
      body.reply_to_message_id = Number(options.replyToMessageId);
    }
    if (options?.parseMode) {
      body.parse_mode = options.parseMode;
    }
    if (options?.disableNotification === true) {
      body.disable_notification = true;
    }
    if (options?.protectContent === true) {
      body.protect_content = true;
    }
    if (options?.linkPreview === false) {
      body.link_preview_options = { is_disabled: true };
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

  async editMessageText(
    token: string,
    chatId: string,
    messageId: string,
    text: string,
    options?: { parseMode?: 'HTML' | 'MarkdownV2'; linkPreview?: boolean },
  ): Promise<TelegramSentMessage> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: Number(messageId),
      text,
    };
    if (options?.parseMode) {
      body.parse_mode = options.parseMode;
    }
    if (options?.linkPreview === false) {
      body.link_preview_options = { is_disabled: true };
    }
    return messageIdOf(await callJson(token, 'editMessageText', body));
  }

  async editMessageCaption(
    token: string,
    chatId: string,
    messageId: string,
    caption: string,
    options?: { parseMode?: 'HTML' | 'MarkdownV2' },
  ): Promise<TelegramSentMessage> {
    return editCaptionRequest(token, chatId, messageId, caption, options?.parseMode);
  }

  async deleteMessage(token: string, chatId: string, messageId: string): Promise<void> {
    await callJson(token, 'deleteMessage', {
      chat_id: chatId,
      message_id: Number(messageId),
    });
  }

  async pinChatMessage(
    token: string,
    chatId: string,
    messageId: string,
    notify?: boolean,
  ): Promise<void> {
    await callJson(token, 'pinChatMessage', {
      chat_id: chatId,
      message_id: Number(messageId),
      disable_notification: notify !== true,
    });
  }

  async unpinChatMessage(token: string, chatId: string, messageId: string): Promise<void> {
    await unpinMessageRequest(token, chatId, messageId);
  }

  async forwardMessage(
    token: string,
    fromChatId: string,
    messageId: string,
    toChatId: string,
    options?: { topicId?: string | null; disableNotification?: boolean },
  ): Promise<TelegramSentMessage> {
    return forwardMessageRequest(token, fromChatId, messageId, toChatId, options);
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
    source: TelegramMediaSource,
    options?: TelegramMediaOptions,
  ): Promise<TelegramSentMessage> {
    return sendMediaUpload(token, chatId, 'photo', source, options);
  }

  async sendDocument(
    token: string,
    chatId: string,
    source: TelegramMediaSource,
    options?: TelegramMediaOptions,
  ): Promise<TelegramSentMessage> {
    return sendMediaUpload(token, chatId, 'document', source, options);
  }

  async sendMedia(
    token: string,
    chatId: string,
    kind: TelegramMediaKind,
    source: TelegramMediaSource,
    options?: TelegramMediaOptions,
  ): Promise<TelegramSentMessage> {
    return sendMediaUpload(token, chatId, kind, source, options);
  }

  async sendMediaGroup(
    token: string,
    chatId: string,
    items: TelegramAlbumItem[],
    options?: { topicId?: string | null; disableNotification?: boolean },
  ): Promise<TelegramSentMessage[]> {
    return sendMediaAlbum(token, chatId, items, options);
  }

  async sendPoll(
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
  ): Promise<TelegramSentMessage> {
    return sendPollRequest(token, chatId, input);
  }

  async answerCallbackQuery(token: string, callbackQueryId: string, text?: string): Promise<void> {
    const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
    if (text !== undefined) {
      body.text = text;
    }
    await callJson(token, 'answerCallbackQuery', body);
  }

  async getFile(token: string, fileId: string): Promise<TelegramFileRef & { bytes: Uint8Array }> {
    return getFileRequest(token, fileId);
  }

  async getChatMember(
    token: string,
    chatId: string,
    userId: string,
  ): Promise<TelegramChatMember | null> {
    return getChatMemberRequest(token, chatId, userId);
  }

  async getChat(token: string, chatId: string): Promise<TelegramChatInfo> {
    return getChatInfoRequest(token, chatId);
  }

  async createForumTopic(token: string, chatId: string, name: string): Promise<TelegramForumTopic> {
    return createTopicRequest(token, chatId, name);
  }

  async editForumTopic(
    token: string,
    chatId: string,
    topicId: string,
    name: string,
  ): Promise<void> {
    await editTopicRequest(token, chatId, topicId, name);
  }

  async closeForumTopic(token: string, chatId: string, topicId: string): Promise<void> {
    await closeTopicRequest(token, chatId, topicId);
  }

  async reopenForumTopic(token: string, chatId: string, topicId: string): Promise<void> {
    await reopenTopicRequest(token, chatId, topicId);
  }

  async deleteForumTopic(token: string, chatId: string, topicId: string): Promise<void> {
    await deleteTopicRequest(token, chatId, topicId);
  }

  async setMyCommands(token: string, commands: TelegramBotCommand[]): Promise<void> {
    await callJson(token, 'setMyCommands', {
      commands: commands.map((command) => ({
        command: command.command,
        description: command.description,
      })),
    });
  }

  private shouldDropStoppedUpdate(error: unknown): boolean {
    return this.allowedUpdates.includes(STOPPED_UPDATE) && rejectsStoppedUpdate(error);
  }
}
