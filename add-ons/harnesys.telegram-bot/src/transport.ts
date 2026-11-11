import type { AddonContext, TransportHandlers } from '@harnesys/sdk';
import { call } from './bot-api.ts';
import { sendMedia } from './media.ts';

type MessageFormat = 'text' | 'markdown' | 'html';

interface Attachment {
  name?: string;
  mimeType?: string;
  url?: string;
  path?: string;
  dataBase64?: string;
}

interface ParsedMessage {
  channel: string;
  text: string;
  format?: MessageFormat;
  replyTo?: string;
  topic?: string;
  attachments?: Attachment[];
}

interface ChatTarget {
  chat: string;
  topicId?: string;
}

interface PreparedMessage extends ChatTarget {
  replyTo?: string;
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2';
}

const MAX_CAPTION = 1024;

export function parseChannel(channel: string): ChatTarget {
  const separator = channel.lastIndexOf(':');
  if (separator <= 0) {
    return { chat: channel };
  }
  const topic = channel.slice(separator + 1);
  if (!/^\d+$/.test(topic)) {
    return { chat: channel };
  }
  return { chat: channel.slice(0, separator), topicId: topic };
}

function parseModeOf(format: MessageFormat | undefined): 'HTML' | 'MarkdownV2' | undefined {
  if (format === 'html') {
    return 'HTML';
  }
  if (format === 'markdown') {
    return 'MarkdownV2';
  }
  return undefined;
}

function prepare(message: ParsedMessage): PreparedMessage {
  const target = parseChannel(message.channel);
  const topicId = message.topic ?? target.topicId;
  const parseMode = parseModeOf(message.format);
  return {
    chat: target.chat,
    ...(topicId !== undefined ? { topicId } : {}),
    ...(message.replyTo !== undefined && message.replyTo.length > 0
      ? { replyTo: message.replyTo }
      : {}),
    text: message.text,
    ...(parseMode !== undefined ? { parseMode } : {}),
  };
}

function textFields(message: PreparedMessage, text: string): Record<string, unknown> {
  return {
    chat_id: message.chat,
    text,
    ...(message.topicId !== undefined ? { message_thread_id: Number(message.topicId) } : {}),
    ...(message.replyTo !== undefined ? { reply_to_message_id: Number(message.replyTo) } : {}),
    ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
  };
}

function sourceOf(attachment: Attachment) {
  return {
    ...(attachment.url !== undefined ? { url: attachment.url } : {}),
    ...(attachment.path !== undefined ? { path: attachment.path } : {}),
    ...(attachment.dataBase64 !== undefined ? { dataBase64: attachment.dataBase64 } : {}),
    ...(attachment.name !== undefined ? { name: attachment.name } : {}),
    ...(attachment.mimeType !== undefined ? { mimeType: attachment.mimeType } : {}),
  };
}

async function sendMessage(ctx: AddonContext, message: PreparedMessage): Promise<string> {
  const result = await call<{ message_id: number }>(
    ctx,
    'sendMessage',
    textFields(message, message.text),
  );
  return String(result.message_id);
}

async function sendWithAttachments(
  ctx: AddonContext,
  message: PreparedMessage,
  attachments: Attachment[],
): Promise<string> {
  const [first, ...rest] = attachments;
  if (first === undefined) {
    return sendMessage(ctx, message);
  }
  const caption = message.text.length <= MAX_CAPTION ? message.text : undefined;
  const sent = await sendMedia(
    ctx,
    {
      chat: message.chat,
      ...(message.topicId !== undefined ? { topicId: message.topicId } : {}),
      ...(message.replyTo !== undefined ? { replyTo: message.replyTo } : {}),
      ...(caption !== undefined ? { caption } : {}),
    },
    sourceOf(first),
  );
  if (caption === undefined && message.text.length > 0) {
    await sendMessage(ctx, message);
  }
  for (const attachment of rest) {
    await sendMedia(
      ctx,
      {
        chat: message.chat,
        ...(message.topicId !== undefined ? { topicId: message.topicId } : {}),
      },
      sourceOf(attachment),
    );
  }
  return String(sent.message_id);
}

export const telegramTransport: TransportHandlers = {
  send: async (params, ctx: AddonContext) => {
    const message = prepare(params.message as ParsedMessage);
    const attachments = params.message.attachments;
    if (message.text.length === 0 && (attachments === undefined || attachments.length === 0)) {
      return {};
    }
    const messageId =
      attachments === undefined || attachments.length === 0
        ? await sendMessage(ctx, message)
        : await sendWithAttachments(ctx, message, attachments as Attachment[]);
    return { messageId };
  },
  edit: async (params, ctx: AddonContext) => {
    const message = prepare(params.message as ParsedMessage);
    await call(ctx, 'editMessageText', {
      chat_id: message.chat,
      message_id: Number(params.messageId),
      text: message.text,
      ...(message.parseMode !== undefined ? { parse_mode: message.parseMode } : {}),
    });
  },
  typing: async (params, ctx: AddonContext) => {
    const target = parseChannel(params.channel);
    await call(ctx, 'sendChatAction', {
      chat_id: target.chat,
      action: params.on ? 'typing' : 'cancel',
      ...(target.topicId !== undefined ? { message_thread_id: Number(target.topicId) } : {}),
    });
  },
};
