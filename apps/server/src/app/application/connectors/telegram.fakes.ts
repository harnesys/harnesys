import {
  type TelegramAlbumItem,
  TelegramApiPort,
  type TelegramBotCommand,
  type TelegramBotIdentity,
  type TelegramChatInfo,
  type TelegramChatMember,
  type TelegramFileRef,
  type TelegramForumTopic,
  type TelegramMediaKind,
  type TelegramMediaOptions,
  type TelegramMediaSource,
  type TelegramSentMessage,
} from '../../domain/connector/telegram-api.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';

export class FakeSecrets extends SecretStorePort {
  async get(): Promise<string | null> {
    return 'token';
  }

  async set(): Promise<void> {}

  async delete(): Promise<void> {}

  async listKeys(): Promise<string[]> {
    return [];
  }
}

export class FakeTelegram extends TelegramApiPort {
  async getMe(): Promise<TelegramBotIdentity> {
    return { id: 'bot-1', username: 'coder_bot', canReadAllGroupMessages: true };
  }

  async getUpdates(): Promise<unknown[]> {
    return [];
  }

  async sendMessage(
    _token: string,
    _chatId: string,
    _text: string,
    _options?: {
      replyMarkup?: { inlineKeyboard: Array<Array<{ label: string; value: string }>> };
      topicId?: string | null;
      replyToMessageId?: string | null;
      parseMode?: 'HTML' | 'MarkdownV2';
      disableNotification?: boolean;
      protectContent?: boolean;
      linkPreview?: boolean;
    },
  ): Promise<TelegramSentMessage> {
    return { messageId: '1' };
  }

  async editMessageText(): Promise<TelegramSentMessage> {
    return { messageId: '1' };
  }

  async editMessageCaption(): Promise<TelegramSentMessage> {
    return { messageId: '1' };
  }

  async sendChatAction(): Promise<void> {}

  async sendPhoto(): Promise<TelegramSentMessage> {
    return { messageId: '1' };
  }

  async sendDocument(): Promise<TelegramSentMessage> {
    return { messageId: '1' };
  }

  async sendMedia(
    _token: string,
    _chatId: string,
    _kind: TelegramMediaKind,
    _source: TelegramMediaSource,
    _options?: TelegramMediaOptions,
  ): Promise<TelegramSentMessage> {
    return { messageId: '1' };
  }

  async sendMediaGroup(
    _token: string,
    _chatId: string,
    _items: TelegramAlbumItem[],
    _options?: { topicId?: string | null; disableNotification?: boolean },
  ): Promise<TelegramSentMessage[]> {
    return [{ messageId: '1' }];
  }

  async sendPoll(): Promise<TelegramSentMessage> {
    return { messageId: '1' };
  }

  async answerCallbackQuery(): Promise<void> {}

  async getFile(): Promise<TelegramFileRef & { bytes: Uint8Array }> {
    return { filePath: '', fileSize: 0, bytes: new Uint8Array() };
  }

  async getChatMember(
    _token: string,
    _chatId: string,
    _userId: string,
  ): Promise<TelegramChatMember | null> {
    return { status: 'administrator', canManageChat: true, canManageTopics: true };
  }

  async getChat(_token: string, _chatId: string): Promise<TelegramChatInfo> {
    return {
      id: '',
      type: 'supergroup',
      title: null,
      username: null,
      description: null,
      memberCount: null,
    };
  }

  async createForumTopic(
    _token: string,
    _chatId: string,
    _name: string,
  ): Promise<TelegramForumTopic> {
    return { chatId: '', topicId: '' };
  }

  async editForumTopic(): Promise<void> {}

  async closeForumTopic(): Promise<void> {}

  async reopenForumTopic(): Promise<void> {}

  async deleteForumTopic(): Promise<void> {}

  async unpinChatMessage(): Promise<void> {}

  async forwardMessage(): Promise<TelegramSentMessage> {
    return { messageId: '1' };
  }

  async deleteMessage(_token: string, _chatId: string, _messageId: string): Promise<void> {}

  async pinChatMessage(
    _token: string,
    _chatId: string,
    _messageId: string,
    _notify?: boolean,
  ): Promise<void> {}

  async setMyCommands(_token: string, _commands: TelegramBotCommand[]): Promise<void> {}
}
