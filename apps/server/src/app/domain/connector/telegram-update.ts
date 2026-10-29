export type CanonicalUpdate =
  | {
      kind: 'command';
      command: string;
      args: string;
      chatType: string;
      chatId: string;
      userId: string;
      messageId: string;
    }
  | {
      kind: 'message';
      chatType: string;
      chatId: string;
      userId: string;
      messageId: string;
      text: string;
      fileId?: string;
      fileKind?: 'photo' | 'document';
    }
  | {
      kind: 'callback';
      chatId: string;
      userId: string;
      deliveryId: string;
      callbackQueryId: string;
    }
  | { kind: 'edit'; chatId: string; messageId: string }
  | { kind: 'generation_stopped'; chatId: string }
  | { kind: 'unsupported'; chatType: string; chatId: string };

export class ConnectorUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorUpdateError';
  }
}

export function parseTelegramUpdate(update: unknown): CanonicalUpdate {
  const root = asRecord(update);
  if (root === null) {
    throw new ConnectorUpdateError('Empty telegram update');
  }

  const stopped = asRecord(root.stopped_message_generation);
  if (stopped !== null) {
    const chatId = chatIdOf(stopped);
    if (chatId === null) {
      throw new ConnectorUpdateError('Empty telegram update');
    }
    return { kind: 'generation_stopped', chatId };
  }

  const callback = asRecord(root.callback_query);
  if (callback !== null) {
    return parseCallback(callback);
  }

  const edited = asRecord(root.edited_message);
  if (edited !== null) {
    const chatId = chatIdOf(edited);
    const messageId = messageIdOf(edited);
    if (chatId === null || messageId === null) {
      throw new ConnectorUpdateError('Empty telegram update');
    }
    return { kind: 'edit', chatId, messageId };
  }

  const message = asRecord(root.message);
  if (message !== null) {
    return parseMessage(message);
  }

  throw new ConnectorUpdateError('Empty telegram update');
}

function parseCallback(callback: Record<string, unknown>): CanonicalUpdate {
  const from = asRecord(callback.from);
  const message = asRecord(callback.message);
  const chatId = message !== null ? chatIdOf(message) : null;
  const userId = from !== null ? idString(from.id) : null;
  const callbackQueryId =
    typeof callback.id === 'string' || typeof callback.id === 'number' ? String(callback.id) : null;
  const deliveryId = typeof callback.data === 'string' ? callback.data : '';

  if (chatId === null || userId === null || callbackQueryId === null) {
    throw new ConnectorUpdateError('Empty telegram update');
  }

  return {
    kind: 'callback',
    chatId,
    userId,
    deliveryId,
    callbackQueryId,
  };
}

function parseMessage(message: Record<string, unknown>): CanonicalUpdate {
  const chat = asRecord(message.chat);
  const from = asRecord(message.from);
  const chatId = chat !== null ? idString(chat.id) : null;
  const chatType = chat !== null && typeof chat.type === 'string' ? chat.type : 'unknown';
  const userId = from !== null ? idString(from.id) : null;
  const messageId = messageIdOf(message);

  if (chatId === null) {
    throw new ConnectorUpdateError('Empty telegram update');
  }
  if (hasUnsupportedMedia(message)) {
    return { kind: 'unsupported', chatType, chatId };
  }
  if (userId === null || messageId === null) {
    throw new ConnectorUpdateError('Empty telegram update');
  }

  const withFile = messageWithFile(message, { chatType, chatId, userId, messageId });
  if (withFile !== null) {
    return withFile;
  }

  const text = typeof message.text === 'string' ? message.text : '';
  const command = parseCommand(text);
  if (command !== null) {
    return {
      kind: 'command',
      command: command.command,
      args: command.args,
      chatType,
      chatId,
      userId,
      messageId,
    };
  }

  return { kind: 'message', chatType, chatId, userId, messageId, text };
}

function messageWithFile(
  message: Record<string, unknown>,
  base: { chatType: string; chatId: string; userId: string; messageId: string },
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
    return { kind: 'unsupported', chatType: base.chatType, chatId: base.chatId };
  }
  return {
    kind: 'message',
    ...base,
    text: captionOrText(message),
    fileId,
    fileKind: 'document',
  };
}

function parseCommand(text: string): { command: string; args: string } | null {
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

function hasUnsupportedMedia(message: Record<string, unknown>): boolean {
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

function captionOrText(message: Record<string, unknown>): string {
  if (typeof message.caption === 'string') {
    return message.caption;
  }
  if (typeof message.text === 'string') {
    return message.text;
  }
  return '';
}

function chatIdOf(value: Record<string, unknown>): string | null {
  const chat = asRecord(value.chat);
  if (chat === null) {
    return null;
  }
  return idString(chat.id);
}

function messageIdOf(value: Record<string, unknown>): string | null {
  return idString(value.message_id);
}

function idString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}
