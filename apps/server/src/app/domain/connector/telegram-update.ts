import {
  asRecord,
  authorOf,
  captionOrText,
  chatIdOf,
  chatOf,
  hasUnsupportedMedia,
  idString,
  messageIdOf,
  messageWithFile,
  parseCommand,
  replyToMessageIdOf,
} from './telegram-update.helpers.ts';

export interface CanonicalChat {
  chatId: string;
  chatType: string;
  chatTitle: string;
  topicId: string | null;
}

export interface CanonicalAuthor {
  userId: string;
  displayName: string;
  username: string | null;
}

export type CanonicalUpdate =
  | ({
      kind: 'command';
      command: string;
      args: string;
      messageId: string;
      replyToMessageId: string | null;
      author: CanonicalAuthor;
    } & CanonicalChat)
  | ({
      kind: 'message';
      messageId: string;
      text: string;
      replyToMessageId: string | null;
      author: CanonicalAuthor;
      fileId?: string;
      fileKind?: 'photo' | 'document';
    } & CanonicalChat)
  | {
      kind: 'callback';
      chatId: string;
      userId: string;
      deliveryId: string;
      callbackQueryId: string;
    }
  | { kind: 'edit'; chatId: string; messageId: string }
  | { kind: 'generation_stopped'; chatId: string }
  | {
      kind: 'chat_member';
      chatId: string;
      chatType: string;
      chatTitle: string;
      status: string;
      userId: string;
    }
  | {
      kind: 'topic_created';
      chatId: string;
      chatType: string;
      chatTitle: string;
      topicId: string;
      title: string;
      author: CanonicalAuthor;
    }
  | { kind: 'ignored'; chatId: string | null; chatType: string }
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

  const editedChannel = asRecord(root.edited_channel_post);
  if (editedChannel !== null) {
    const chatId = chatIdOf(editedChannel);
    const messageId = messageIdOf(editedChannel);
    if (chatId === null || messageId === null) {
      throw new ConnectorUpdateError('Empty telegram update');
    }
    return { kind: 'edit', chatId, messageId };
  }

  const membership = asRecord(root.my_chat_member);
  if (membership !== null) {
    return parseChatMember(membership);
  }

  const channelPost = asRecord(root.channel_post);
  if (channelPost !== null) {
    return parseChannelPost(channelPost);
  }

  const message = asRecord(root.message);
  if (message !== null) {
    return parseMessage(message);
  }

  throw new ConnectorUpdateError('Empty telegram update');
}

function parseChatMember(membership: Record<string, unknown>): CanonicalUpdate {
  const chat = asRecord(membership.chat);
  const member = asRecord(membership.new_chat_member);
  const memberUser = member !== null ? asRecord(member.user) : null;
  const from = asRecord(membership.from);
  const chatId = chat !== null ? idString(chat.id) : null;
  if (chatId === null) {
    throw new ConnectorUpdateError('Empty telegram update');
  }
  return {
    kind: 'chat_member',
    chatId,
    chatType: chat !== null && typeof chat.type === 'string' ? chat.type : 'unknown',
    chatTitle: chat !== null && typeof chat.title === 'string' ? chat.title : '',
    status: member !== null && typeof member.status === 'string' ? member.status : 'unknown',
    userId:
      (memberUser !== null ? idString(memberUser.id) : null) ??
      (from !== null ? idString(from.id) : null) ??
      '',
  };
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

function parseChannelPost(post: Record<string, unknown>): CanonicalUpdate {
  const chat = asRecord(post.chat);
  const chatId = chat !== null ? idString(chat.id) : null;
  const messageId = messageIdOf(post);
  if (chatId === null || messageId === null) {
    throw new ConnectorUpdateError('Empty telegram update');
  }
  const chatType = 'channel';
  const from = asRecord(post.from);
  if (from !== null && from.is_bot === true) {
    return { kind: 'ignored', chatId, chatType };
  }
  const senderChat = asRecord(post.sender_chat);
  const authorRef = from ?? senderChat;
  const authorId = authorRef !== null ? idString(authorRef.id) : null;
  if (authorRef === null || authorId === null) {
    return { kind: 'ignored', chatId, chatType };
  }
  const base = {
    ...chatOf(chat, post, chatId, chatType),
    messageId,
    replyToMessageId: replyToMessageIdOf(post),
    author: from !== null ? authorOf(from, authorId) : channelAuthorOf(authorRef, authorId),
  };
  const withFile = messageWithFile(post, base);
  if (withFile !== null) {
    return withFile;
  }
  return { kind: 'message', text: captionOrText(post), ...base };
}

function channelAuthorOf(
  senderChat: Record<string, unknown>,
  userId: string,
): CanonicalAuthor {
  const username = typeof senderChat.username === 'string' ? senderChat.username : null;
  const title = typeof senderChat.title === 'string' ? senderChat.title : '';
  return { userId, displayName: title || username || userId, username };
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

  const topic = parseTopicCreated({ message, chat, from, chatId, chatType, userId });
  if (topic !== null) {
    return topic;
  }
  if (from !== null && from.is_bot === true) {
    return { kind: 'ignored', chatId, chatType };
  }
  if (hasUnsupportedMedia(message)) {
    return { kind: 'unsupported', chatType, chatId };
  }
  if (userId === null || messageId === null || from === null) {
    throw new ConnectorUpdateError('Empty telegram update');
  }
  return parseContent({ message, chat, chatId, chatType, from, userId, messageId });
}

function parseTopicCreated(parts: {
  message: Record<string, unknown>;
  chat: Record<string, unknown> | null;
  from: Record<string, unknown> | null;
  chatId: string;
  chatType: string;
  userId: string | null;
}): CanonicalUpdate | null {
  const { message, chat, from, chatId, chatType, userId } = parts;
  const topic = asRecord(message.forum_topic_created);
  if (topic === null) {
    return null;
  }
  const topicId = idString(message.message_thread_id);
  if (topicId === null) {
    throw new ConnectorUpdateError('Empty telegram update');
  }
  return {
    kind: 'topic_created',
    chatId,
    chatType,
    chatTitle: chat !== null && typeof chat.title === 'string' ? chat.title : '',
    topicId,
    title: typeof topic.name === 'string' ? topic.name : '',
    author:
      from !== null && userId !== null
        ? authorOf(from, userId)
        : { userId: '', displayName: '', username: null },
  };
}

function parseContent(parts: {
  message: Record<string, unknown>;
  chat: Record<string, unknown> | null;
  chatId: string;
  chatType: string;
  from: Record<string, unknown>;
  userId: string;
  messageId: string;
}): CanonicalUpdate {
  const { message, chat, chatId, chatType, from, userId, messageId } = parts;
  const base = {
    ...chatOf(chat, message, chatId, chatType),
    messageId,
    replyToMessageId: replyToMessageIdOf(message),
    author: authorOf(from, userId),
  };
  const withFile = messageWithFile(message, base);
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
      ...base,
    };
  }

  return { kind: 'message', text, ...base };
}
