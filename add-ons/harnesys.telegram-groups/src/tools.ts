import type { AddonContext, ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { call, downloadFile } from './bot-api.ts';
import { sendAlbum, sendMedia } from './media.ts';

const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const WRITE_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 4096;
const MAX_CAPTION = 1024;

function str(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  return value;
}

function optionalStr(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalBool(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  return typeof value === 'boolean' ? value : undefined;
}

function requireText(value: string, key: string, max: number): string {
  if (value.length > max) {
    throw new AddonError('invalid_params', { detail: `${key} exceeds ${max} characters` });
  }
  return value;
}

function topicField(topicId: string | undefined): Record<string, unknown> {
  return topicId === undefined ? {} : { message_thread_id: Number(topicId) };
}

const getChat: ToolHandler = async (input, ctx: AddonContext) => {
  const chat = await call<Record<string, unknown>>(ctx, 'getChat', { chat_id: str(input, 'chat') });
  return {
    id: chat.id,
    type: chat.type,
    title: chat.title ?? chat.username ?? '',
    pinnedMessageId: chat.pinned_message
      ? (chat.pinned_message as { message_id: number }).message_id
      : null,
  };
};

const sendMessageTool: ToolHandler = async (input, ctx: AddonContext) => {
  const parseMode = optionalStr(input, 'parseMode');
  const sent = await call<{ message_id: number }>(ctx, 'sendMessage', {
    chat_id: str(input, 'chat'),
    text: requireText(str(input, 'text'), 'text', MAX_TEXT),
    ...topicField(optionalStr(input, 'topicId')),
    ...(optionalStr(input, 'replyToMessageId') !== undefined
      ? { reply_to_message_id: Number(str(input, 'replyToMessageId')) }
      : {}),
    ...(parseMode !== undefined ? { parse_mode: parseMode } : {}),
    ...(optionalBool(input, 'disableNotification') === true ? { disable_notification: true } : {}),
    ...(optionalBool(input, 'linkPreview') === false
      ? { link_preview_options: { is_disabled: true } }
      : {}),
  });
  return { messageId: String(sent.message_id) };
};

const editMessage: ToolHandler = async (input, ctx: AddonContext) => {
  const parseMode = optionalStr(input, 'parseMode');
  await call(ctx, 'editMessageText', {
    chat_id: str(input, 'chat'),
    message_id: Number(str(input, 'messageId')),
    text: requireText(str(input, 'text'), 'text', MAX_TEXT),
    ...(parseMode !== undefined ? { parse_mode: parseMode } : {}),
  });
  return { edited: true };
};

const deleteMessage: ToolHandler = async (input, ctx: AddonContext) => {
  await call(ctx, 'deleteMessage', {
    chat_id: str(input, 'chat'),
    message_id: Number(str(input, 'messageId')),
  });
  return { deleted: true };
};

const sendMediaTool: ToolHandler = async (input, ctx: AddonContext) => {
  const caption = optionalStr(input, 'caption');
  const sent = await sendMedia(
    ctx,
    {
      chat: str(input, 'chat'),
      ...(optionalStr(input, 'topicId') !== undefined ? { topicId: str(input, 'topicId') } : {}),
      ...(caption !== undefined ? { caption: requireText(caption, 'caption', MAX_CAPTION) } : {}),
    },
    {
      ...(optionalStr(input, 'url') !== undefined ? { url: str(input, 'url') } : {}),
      ...(optionalStr(input, 'path') !== undefined ? { path: str(input, 'path') } : {}),
      ...(optionalStr(input, 'dataBase64') !== undefined
        ? { dataBase64: str(input, 'dataBase64') }
        : {}),
      ...(optionalStr(input, 'name') !== undefined ? { name: str(input, 'name') } : {}),
      ...(optionalStr(input, 'kind') === 'photo' ? { mimeType: 'image/jpeg' } : {}),
    },
  );
  return { messageId: String(sent.message_id) };
};

const sendAlbumTool: ToolHandler = async (input, ctx: AddonContext) => {
  const urls = input.urls;
  if (!Array.isArray(urls) || urls.some((entry) => typeof entry !== 'string')) {
    throw new AddonError('invalid_params', { detail: 'urls must be an array of strings' });
  }
  const caption = optionalStr(input, 'caption');
  const sent = await sendAlbum(
    ctx,
    {
      chat: str(input, 'chat'),
      ...(optionalStr(input, 'topicId') !== undefined ? { topicId: str(input, 'topicId') } : {}),
      ...(caption !== undefined ? { caption: requireText(caption, 'caption', MAX_CAPTION) } : {}),
    },
    urls as string[],
  );
  return { messageIds: sent.map((entry) => String(entry.message_id)) };
};

const downloadFileTool: ToolHandler = async (input, ctx: AddonContext) => {
  const file = await call<{ file_path?: string; file_size?: number }>(ctx, 'getFile', {
    file_id: str(input, 'fileId'),
  });
  if (file.file_path === undefined) {
    throw new AddonError('not_found', { detail: 'Telegram did not return a file path' });
  }
  if ((file.file_size ?? 0) > MAX_DOWNLOAD_BYTES) {
    throw new AddonError('invalid_params', {
      detail: `file is larger than ${MAX_DOWNLOAD_BYTES} bytes`,
    });
  }
  const path = str(input, 'path');
  const bytes = Buffer.from(await downloadFile(ctx, file.file_path), 'base64');
  if (bytes.length > MAX_DOWNLOAD_BYTES) {
    throw new AddonError('invalid_params', {
      detail: `file is larger than ${MAX_DOWNLOAD_BYTES} bytes`,
    });
  }
  let written: { path: string; size: number } | null = null;
  for (let offset = 0; offset < bytes.length; offset += WRITE_CHUNK_BYTES) {
    const slice = bytes.subarray(offset, offset + WRITE_CHUNK_BYTES);
    written = await ctx.files.write({
      path,
      data: slice.toString('base64'),
      append: offset > 0,
    });
  }
  return { path: written?.path ?? path, size: bytes.length };
};

const forwardMessage: ToolHandler = async (input, ctx: AddonContext) => {
  const sent = await call<{ message_id: number }>(ctx, 'forwardMessage', {
    chat_id: str(input, 'toChat'),
    from_chat_id: str(input, 'fromChat'),
    message_id: Number(str(input, 'messageId')),
  });
  return { messageId: String(sent.message_id) };
};

const pinMessage: ToolHandler = async (input, ctx: AddonContext) => {
  await call(ctx, 'pinChatMessage', {
    chat_id: str(input, 'chat'),
    message_id: Number(str(input, 'messageId')),
    disable_notification: optionalBool(input, 'notify') !== true,
  });
  return { pinned: true };
};

const createTopic: ToolHandler = async (input, ctx: AddonContext) => {
  const topic = await call<{ message_thread_id: number }>(ctx, 'createForumTopic', {
    chat_id: str(input, 'chat'),
    name: str(input, 'name'),
  });
  return { topicId: String(topic.message_thread_id) };
};

const editTopic: ToolHandler = async (input, ctx: AddonContext) => {
  const chat = str(input, 'chat');
  const topicId = Number(str(input, 'topicId'));
  const name = optionalStr(input, 'name');
  const closed = optionalBool(input, 'closed');
  if (name !== undefined) {
    await call(ctx, 'editForumTopic', {
      chat_id: chat,
      message_thread_id: topicId,
      name,
    });
  }
  if (closed === true) {
    await call(ctx, 'closeForumTopic', { chat_id: chat, message_thread_id: topicId });
  }
  if (closed === false) {
    await call(ctx, 'reopenForumTopic', { chat_id: chat, message_thread_id: topicId });
  }
  return { updated: name !== undefined || closed !== undefined };
};

const createPoll: ToolHandler = async (input, ctx: AddonContext) => {
  const options = input.options;
  if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
    throw new AddonError('invalid_params', { detail: 'options must hold 2 to 10 strings' });
  }
  const sent = await call<{ message_id: number }>(ctx, 'sendPoll', {
    chat_id: str(input, 'chat'),
    question: requireText(str(input, 'question'), 'question', 300),
    options,
    is_anonymous: optionalBool(input, 'anonymous') !== false,
    allows_multiple_answers: optionalBool(input, 'multiple') === true,
  });
  return { messageId: String(sent.message_id) };
};

export const telegramTools: Record<string, ToolHandler> = {
  get_chat: getChat,
  send_message: sendMessageTool,
  edit_message: editMessage,
  delete_message: deleteMessage,
  send_media: sendMediaTool,
  send_album: sendAlbumTool,
  download_file: downloadFileTool,
  forward_message: forwardMessage,
  pin_message: pinMessage,
  create_topic: createTopic,
  edit_topic: editTopic,
  create_poll: createPoll,
};
