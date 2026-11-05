import type {
  TelegramAlbumItem,
  TelegramChatTarget,
  TelegramMediaKind,
  TelegramParseMode,
  TelegramPollInput,
  TelegramPostResult,
  TelegramTopicRecord,
} from 'harnesys';
import type {
  TelegramApiPort,
  TelegramMediaSource,
} from '../../../domain/connector/telegram-api.port.ts';

export interface ResolvedTarget {
  token: string;
  chatId: string;
  topicId: string | null;
}

const MAX_CAPTION = 1024;

function postResult(target: ResolvedTarget, messageId: string): TelegramPostResult {
  return { messageId, chatId: target.chatId, topicId: target.topicId };
}

function captionOf(caption: string | undefined): string | undefined {
  if (caption === undefined) {
    return undefined;
  }
  if (caption.length > MAX_CAPTION) {
    throw new Error(`Telegram captions are limited to ${MAX_CAPTION} characters`);
  }
  return caption;
}

function mediaOptions(
  target: ResolvedTarget,
  input: { caption?: string; parseMode?: TelegramParseMode; disableNotification?: boolean },
) {
  const caption = captionOf(input.caption);
  return {
    ...(caption !== undefined ? { caption } : {}),
    ...(input.parseMode !== undefined ? { parseMode: input.parseMode } : {}),
    ...(target.topicId ? { topicId: target.topicId } : {}),
    ...(input.disableNotification === true ? { disableNotification: true } : {}),
  };
}

export async function sendMediaTo(
  telegram: TelegramApiPort,
  target: ResolvedTarget,
  input: TelegramChatTarget & {
    kind: TelegramMediaKind;
    source: TelegramMediaSource;
    caption?: string;
    parseMode?: TelegramParseMode;
    disableNotification?: boolean;
    replyToMessageId?: string;
  },
): Promise<TelegramPostResult> {
  assertSource(input.source);
  const sent = await telegram.sendMedia(target.token, target.chatId, input.kind, input.source, {
    ...mediaOptions(target, input),
    ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
  });
  return postResult(target, sent.messageId);
}

export async function sendAlbumTo(
  telegram: TelegramApiPort,
  target: ResolvedTarget,
  input: TelegramChatTarget & {
    items: TelegramAlbumItem[];
    disableNotification?: boolean;
  },
): Promise<TelegramPostResult[]> {
  if (input.items.length < 2 || input.items.length > 10) {
    throw new Error('Telegram albums accept 2 to 10 items');
  }
  for (const item of input.items) {
    assertSource(item.source);
    captionOf(item.caption);
  }
  const sent = await telegram.sendMediaGroup(target.token, target.chatId, input.items, {
    ...(target.topicId ? { topicId: target.topicId } : {}),
    ...(input.disableNotification === true ? { disableNotification: true } : {}),
  });
  return sent.map((message) => postResult(target, message.messageId));
}

export async function editCaptionTo(
  telegram: TelegramApiPort,
  target: ResolvedTarget,
  input: TelegramChatTarget & {
    messageId: string;
    caption: string;
    parseMode?: TelegramParseMode;
  },
): Promise<TelegramPostResult> {
  const caption = captionOf(input.caption);
  if (caption === undefined) {
    throw new Error('Telegram caption text is required');
  }
  const sent = await telegram.editMessageCaption(
    target.token,
    target.chatId,
    input.messageId,
    caption,
    input.parseMode !== undefined ? { parseMode: input.parseMode } : undefined,
  );
  return postResult(target, sent.messageId);
}

export async function forwardTo(
  telegram: TelegramApiPort,
  target: ResolvedTarget,
  input: TelegramChatTarget & { fromChat: string; messageId: string },
): Promise<TelegramPostResult> {
  const sent = await telegram.forwardMessage(
    target.token,
    input.fromChat,
    input.messageId,
    target.chatId,
    target.topicId ? { topicId: target.topicId } : undefined,
  );
  return postResult(target, sent.messageId);
}

export async function sendPollTo(
  telegram: TelegramApiPort,
  target: ResolvedTarget,
  input: TelegramChatTarget & TelegramPollInput & { disableNotification?: boolean },
): Promise<TelegramPostResult> {
  if (input.options.length < 2 || input.options.length > 10) {
    throw new Error('Telegram polls accept 2 to 10 options');
  }
  const sent = await telegram.sendPoll(target.token, target.chatId, {
    question: input.question,
    options: input.options,
    ...(input.anonymous !== undefined ? { anonymous: input.anonymous } : {}),
    ...(input.multiple === true ? { multiple: true } : {}),
    ...(input.quiz === true ? { quiz: true } : {}),
    ...(input.correctOptionId !== undefined ? { correctOptionId: input.correctOptionId } : {}),
    ...(input.explanation !== undefined ? { explanation: input.explanation } : {}),
    ...(target.topicId ? { topicId: target.topicId } : {}),
    ...(input.disableNotification === true ? { disableNotification: true } : {}),
  });
  return postResult(target, sent.messageId);
}

export async function createTopicTo(
  telegram: TelegramApiPort,
  target: ResolvedTarget,
  name: string,
): Promise<TelegramTopicRecord> {
  const topic = await telegram.createForumTopic(target.token, target.chatId, name);
  return { chatId: topic.chatId, topicId: topic.topicId };
}

export async function editTopicTo(
  telegram: TelegramApiPort,
  target: ResolvedTarget,
  topicId: string,
  input: { name?: string; closed?: boolean },
): Promise<void> {
  if (input.name !== undefined) {
    await telegram.editForumTopic(target.token, target.chatId, topicId, input.name);
  }
  if (input.closed === true) {
    await telegram.closeForumTopic(target.token, target.chatId, topicId);
  }
  if (input.closed === false) {
    await telegram.reopenForumTopic(target.token, target.chatId, topicId);
  }
}

function assertSource(source: TelegramMediaSource): void {
  if (source.fileId === undefined && source.bytes === undefined) {
    throw new Error('Telegram media requires filePath, fileId, or bytes');
  }
}
