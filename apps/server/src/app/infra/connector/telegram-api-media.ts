import type {
  TelegramAlbumItem,
  TelegramMediaKind,
  TelegramMediaOptions,
  TelegramMediaSource,
  TelegramSentMessage,
} from '../../domain/connector/telegram-api.port.ts';
import { asRecord, callForm, callJson, messageIdOf } from './telegram-api.http.ts';

const MEDIA_FIELDS: Record<TelegramMediaKind, { method: string; field: string }> = {
  photo: { method: 'sendPhoto', field: 'photo' },
  document: { method: 'sendDocument', field: 'document' },
  video: { method: 'sendVideo', field: 'video' },
  animation: { method: 'sendAnimation', field: 'animation' },
  audio: { method: 'sendAudio', field: 'audio' },
  voice: { method: 'sendVoice', field: 'voice' },
};

export async function sendMediaUpload(
  token: string,
  chatId: string,
  kind: TelegramMediaKind,
  source: TelegramMediaSource,
  options?: TelegramMediaOptions,
): Promise<TelegramSentMessage> {
  const target = MEDIA_FIELDS[kind];
  if (source.fileId !== undefined) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      [target.field]: source.fileId,
      ...mediaBody(options),
    };
    return messageIdOf(await callJson(token, target.method, body));
  }
  if (source.bytes === undefined) {
    throw new Error('Telegram media requires bytes or fileId');
  }
  const form = new FormData();
  form.set('chat_id', chatId);
  setMediaOptions(form, options);
  form.set(target.field, new Blob([source.bytes]), source.filename ?? kind);
  return messageIdOf(await callForm(token, target.method, form));
}

export async function sendMediaAlbum(
  token: string,
  chatId: string,
  items: TelegramAlbumItem[],
  options?: { topicId?: string | null; disableNotification?: boolean },
): Promise<TelegramSentMessage[]> {
  const form = new FormData();
  form.set('chat_id', chatId);
  if (options?.topicId) {
    form.set('message_thread_id', String(Number(options.topicId)));
  }
  if (options?.disableNotification === true) {
    form.set('disable_notification', 'true');
  }
  const media = items.map((item, index) => {
    const entry: Record<string, unknown> = { type: item.kind };
    if (item.source.fileId !== undefined) {
      entry.media = item.source.fileId;
    } else {
      if (item.source.bytes === undefined) {
        throw new Error('Telegram album item requires bytes or fileId');
      }
      entry.media = `attach://file${index}`;
      form.set(
        `file${index}`,
        new Blob([item.source.bytes]),
        item.source.filename ?? `${item.kind}${index}`,
      );
    }
    if (item.caption !== undefined) {
      entry.caption = item.caption;
    }
    if (item.parseMode !== undefined) {
      entry.parse_mode = item.parseMode;
    }
    return entry;
  });
  form.set('media', JSON.stringify(media));
  const result = await callForm(token, 'sendMediaGroup', form);
  if (!Array.isArray(result)) {
    throw new Error('Telegram sendMediaGroup returned no messages');
  }
  return result.map((row) => {
    const messageId = asRecord(row)?.message_id;
    if (typeof messageId !== 'number' && typeof messageId !== 'string') {
      throw new Error('Telegram response missing message_id');
    }
    return { messageId: String(messageId) };
  });
}

function mediaBody(options?: TelegramMediaOptions): Record<string, unknown> {
  if (!options) {
    return {};
  }
  const body: Record<string, unknown> = {};
  if (options.caption !== undefined) {
    body.caption = options.caption;
  }
  if (options.parseMode !== undefined) {
    body.parse_mode = options.parseMode;
  }
  if (options.topicId) {
    body.message_thread_id = Number(options.topicId);
  }
  if (options.replyToMessageId) {
    body.reply_to_message_id = Number(options.replyToMessageId);
  }
  if (options.disableNotification === true) {
    body.disable_notification = true;
  }
  return body;
}

function setMediaOptions(form: FormData, options?: TelegramMediaOptions): void {
  if (!options) {
    return;
  }
  if (options.caption !== undefined) {
    form.set('caption', options.caption);
  }
  if (options.parseMode !== undefined) {
    form.set('parse_mode', options.parseMode);
  }
  if (options.topicId) {
    form.set('message_thread_id', String(Number(options.topicId)));
  }
  if (options.replyToMessageId) {
    form.set('reply_to_message_id', String(Number(options.replyToMessageId)));
  }
  if (options.disableNotification === true) {
    form.set('disable_notification', 'true');
  }
}
