import type {
  TelegramChatInfo,
  TelegramForumTopic,
  TelegramSentMessage,
} from '../../domain/connector/telegram-api.port.ts';
import { asRecord, callJson, messageIdOf } from './telegram-api.http.ts';

export async function getChatInfoRequest(token: string, chatId: string): Promise<TelegramChatInfo> {
  const result = asRecord(await callJson(token, 'getChat', { chat_id: chatId }));
  const id = result?.id;
  const type = result?.type;
  if ((typeof id !== 'number' && typeof id !== 'string') || typeof type !== 'string') {
    throw new Error('Telegram getChat returned an unexpected payload');
  }
  return {
    id: String(id),
    type,
    title: typeof result?.title === 'string' ? result.title : null,
    username: typeof result?.username === 'string' ? result.username : null,
    description: typeof result?.description === 'string' ? result.description : null,
    memberCount: typeof result?.member_count === 'number' ? result.member_count : null,
  };
}

export async function createTopicRequest(
  token: string,
  chatId: string,
  name: string,
): Promise<TelegramForumTopic> {
  const result = asRecord(await callJson(token, 'createForumTopic', { chat_id: chatId, name }));
  const topicId = result?.message_thread_id;
  if (typeof topicId !== 'number' && typeof topicId !== 'string') {
    throw new Error('Telegram createForumTopic returned no message_thread_id');
  }
  return { chatId, topicId: String(topicId) };
}

export async function editTopicRequest(
  token: string,
  chatId: string,
  topicId: string,
  name: string,
): Promise<void> {
  await callJson(token, 'editForumTopic', {
    chat_id: chatId,
    message_thread_id: Number(topicId),
    name,
  });
}

export async function closeTopicRequest(
  token: string,
  chatId: string,
  topicId: string,
): Promise<void> {
  await callJson(token, 'closeForumTopic', {
    chat_id: chatId,
    message_thread_id: Number(topicId),
  });
}

export async function reopenTopicRequest(
  token: string,
  chatId: string,
  topicId: string,
): Promise<void> {
  await callJson(token, 'reopenForumTopic', {
    chat_id: chatId,
    message_thread_id: Number(topicId),
  });
}

export async function deleteTopicRequest(
  token: string,
  chatId: string,
  topicId: string,
): Promise<void> {
  await callJson(token, 'deleteForumTopic', {
    chat_id: chatId,
    message_thread_id: Number(topicId),
  });
}

export async function unpinMessageRequest(
  token: string,
  chatId: string,
  messageId: string,
): Promise<void> {
  await callJson(token, 'unpinChatMessage', {
    chat_id: chatId,
    message_id: Number(messageId),
  });
}

export async function editCaptionRequest(
  token: string,
  chatId: string,
  messageId: string,
  caption: string,
  parseMode?: string,
): Promise<TelegramSentMessage> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: Number(messageId),
    caption,
  };
  if (parseMode !== undefined) {
    body.parse_mode = parseMode;
  }
  return messageIdOf(await callJson(token, 'editMessageCaption', body));
}

export async function forwardMessageRequest(
  token: string,
  fromChatId: string,
  messageId: string,
  toChatId: string,
  options?: { topicId?: string | null; disableNotification?: boolean },
): Promise<TelegramSentMessage> {
  const body: Record<string, unknown> = {
    chat_id: toChatId,
    from_chat_id: fromChatId,
    message_id: Number(messageId),
  };
  if (options?.topicId) {
    body.message_thread_id = Number(options.topicId);
  }
  if (options?.disableNotification === true) {
    body.disable_notification = true;
  }
  return messageIdOf(await callJson(token, 'forwardMessage', body));
}

export async function sendPollRequest(
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
  const body: Record<string, unknown> = {
    chat_id: chatId,
    question: input.question,
    options: input.options.map((text) => ({ text })),
  };
  if (input.anonymous === false) {
    body.is_anonymous = false;
  }
  if (input.multiple === true) {
    body.allows_multiple_answers = true;
  }
  if (input.quiz === true) {
    body.type = 'quiz';
    body.correct_option_id = input.correctOptionId ?? 0;
  }
  if (input.explanation !== undefined) {
    body.explanation = input.explanation;
  }
  if (input.topicId) {
    body.message_thread_id = Number(input.topicId);
  }
  if (input.disableNotification === true) {
    body.disable_notification = true;
  }
  return messageIdOf(await callJson(token, 'sendPoll', body));
}
