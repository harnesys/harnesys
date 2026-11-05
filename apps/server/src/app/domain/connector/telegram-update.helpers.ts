import type { CanonicalAuthor, CanonicalChat, CanonicalUpdate } from './telegram-update.ts';

export function chatOf(
  chat: Record<string, unknown> | null,
  message: Record<string, unknown>,
  chatId: string,
  chatType: string,
): CanonicalChat {
  return {
    chatId,
    chatType,
    chatTitle: chat !== null && typeof chat.title === 'string' ? chat.title : '',
    topicId: topicIdOf(message),
  };
}

export function chatTitleOf(chat: Record<string, unknown> | null): string {
  return chat !== null && typeof chat.title === 'string' ? chat.title : '';
}

export function authorOf(from: Record<string, unknown>, userId: string): CanonicalAuthor {
  const firstName = typeof from.first_name === 'string' ? from.first_name : '';
  const lastName = typeof from.last_name === 'string' ? from.last_name : '';
  const username = typeof from.username === 'string' ? from.username : null;
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return {
    userId,
    displayName: displayName || username || userId,
    username,
  };
}

export function messageWithFile(
  message: Record<string, unknown>,
  base: Omit<Extract<CanonicalUpdate, { kind: 'message' }>, 'kind' | 'text'>,
): CanonicalUpdate | null {
  const photoFileId = lastPhotoFileId(message.photo);
  if (photoFileId !== null) {
    return {
      kind: 'message',
      ...base,
      text: captionOrText(message),
      fileId: photoFileId,
      fileKind: 'photo',
    };
  }

  const document = asRecord(message.document);
  if (document === null) {
    return null;
  }
  const fileId = typeof document.file_id === 'string' ? document.file_id : null;
  if (fileId === null) {
    return {
      kind: 'unsupported',
      chatType: base.chatType,
      chatId: base.chatId,
      chatTitle: base.chatTitle,
    };
  }
  return {
    kind: 'message',
    ...base,
    text: captionOrText(message),
    fileId,
    fileKind: 'document',
  };
}

export function parseCommand(text: string): { command: string; args: string } | null {
  if (!text.startsWith('/')) {
    return null;
  }
  const body = text.slice(1).trimStart();
  if (body.length === 0) {
    return null;
  }
  const firstSpace = body.search(/\s/);
  const head = firstSpace === -1 ? body : body.slice(0, firstSpace);
  const args = firstSpace === -1 ? '' : body.slice(firstSpace).trim();
  const at = head.indexOf('@');
  const command = (at === -1 ? head : head.slice(0, at)).toLowerCase();
  if (command.length === 0) {
    return null;
  }
  return { command, args };
}

export function replyToMessageIdOf(message: Record<string, unknown>): string | null {
  const replied = asRecord(message.reply_to_message);
  if (replied !== null) {
    const id = messageIdOf(replied);
    if (id !== null) {
      return id;
    }
  }
  const quote = asRecord(message.quote);
  if (quote !== null) {
    const id = messageIdOf(quote);
    if (id !== null) {
      return id;
    }
  }
  return null;
}

export function topicIdOf(message: Record<string, unknown>): string | null {
  return idString(message.message_thread_id);
}

export function hasUnsupportedMedia(message: Record<string, unknown>): boolean {
  return (
    message.voice !== undefined ||
    message.sticker !== undefined ||
    message.video !== undefined ||
    message.video_note !== undefined ||
    message.animation !== undefined ||
    message.audio !== undefined ||
    message.location !== undefined ||
    message.venue !== undefined ||
    message.contact !== undefined ||
    message.poll !== undefined ||
    message.dice !== undefined
  );
}

function lastPhotoFileId(photo: unknown): string | null {
  if (!Array.isArray(photo) || photo.length === 0) {
    return null;
  }
  const last = asRecord(photo[photo.length - 1]);
  if (last === null || typeof last.file_id !== 'string') {
    return null;
  }
  return last.file_id;
}

export function captionOrText(message: Record<string, unknown>): string {
  if (typeof message.caption === 'string') {
    return message.caption;
  }
  if (typeof message.text === 'string') {
    return message.text;
  }
  return '';
}

export function chatIdOf(value: Record<string, unknown>): string | null {
  const chat = asRecord(value.chat);
  if (chat === null) {
    return null;
  }
  return idString(chat.id);
}

export function messageIdOf(value: Record<string, unknown>): string | null {
  return idString(value.message_id);
}

export function idString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function asRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}
