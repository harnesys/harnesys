import type { ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { requireAllowed, requireWritable, resolveTarget, toolAccess } from './access.ts';
import { call } from './bot-api.ts';
import { enumField, intField, optionalBool, optionalStr, requireText, str } from './params.ts';
import {
  downloadFileTool,
  getChatTool,
  getFileTool,
  listBotsTool,
  listChatsTool,
} from './tools-chat.ts';
import { sendAlbumTool, sendMediaTool } from './tools-media.ts';

const MAX_TEXT = 4096;
const MAX_QUESTION = 300;
const MAX_OPTION = 100;
const MAX_TOPIC_NAME = 128;
const PARSE_MODES = ['HTML', 'MarkdownV2'] as const;

const sendMessageTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  requireWritable(access, 'send_message');
  const target = await resolveTarget(ctx, access, input);
  const parseMode = enumField(input, 'parseMode', PARSE_MODES);
  const replyTo = intField(input, 'replyToMessageId', 'optional');
  const sent = await call<{ message_id: number }>(
    ctx,
    'sendMessage',
    {
      chat_id: target.chat,
      text: requireText(str(input, 'text'), 'text', MAX_TEXT),
      ...(target.topicId === undefined ? {} : { message_thread_id: Number(target.topicId) }),
      ...(replyTo === undefined ? {} : { reply_to_message_id: replyTo }),
      ...(parseMode === undefined ? {} : { parse_mode: parseMode }),
      ...(optionalBool(input, 'disableNotification') === true
        ? { disable_notification: true }
        : {}),
      ...(optionalBool(input, 'linkPreview') === false
        ? { link_preview_options: { is_disabled: true } }
        : {}),
    },
    { accountId: access.accountId },
  );
  return {
    messageId: String(sent.message_id),
    bot: access.label,
    chat: target.chat,
    ...(target.topicId === undefined ? {} : { topicId: target.topicId }),
  };
};

const editMessageTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  requireWritable(access, 'edit_message');
  const target = await resolveTarget(ctx, access, input);
  const messageId = intField(input, 'messageId', 'required');
  const parseMode = enumField(input, 'parseMode', PARSE_MODES);
  await call(
    ctx,
    'editMessageText',
    {
      chat_id: target.chat,
      message_id: messageId,
      text: requireText(str(input, 'text'), 'text', MAX_TEXT),
      ...(parseMode === undefined ? {} : { parse_mode: parseMode }),
    },
    { accountId: access.accountId },
  );
  return { edited: true, messageId: String(messageId), bot: access.label };
};

const deleteMessageTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  requireWritable(access, 'delete_message');
  const target = await resolveTarget(ctx, access, input);
  await call(
    ctx,
    'deleteMessage',
    { chat_id: target.chat, message_id: intField(input, 'messageId', 'required') },
    { accountId: access.accountId },
  );
  return { deleted: true, bot: access.label };
};

const forwardMessageTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  requireWritable(access, 'forward_message');
  const target = await resolveTarget(ctx, access, input);
  const fromChat = str(input, 'fromChat');
  await requireAllowed(ctx, access, fromChat);
  const sent = await call<{ message_id: number }>(
    ctx,
    'forwardMessage',
    {
      chat_id: target.chat,
      from_chat_id: fromChat,
      message_id: intField(input, 'messageId', 'required'),
    },
    { accountId: access.accountId },
  );
  return { messageId: String(sent.message_id), bot: access.label, chat: target.chat };
};

const pinMessageTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  requireWritable(access, 'pin_message');
  const target = await resolveTarget(ctx, access, input);
  await call(
    ctx,
    'pinChatMessage',
    {
      chat_id: target.chat,
      message_id: intField(input, 'messageId', 'required'),
      disable_notification: optionalBool(input, 'notify') !== true,
    },
    { accountId: access.accountId },
  );
  return { pinned: true, bot: access.label };
};

const createTopicTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  requireWritable(access, 'create_topic');
  const target = await resolveTarget(ctx, access, input);
  const topic = await call<{ message_thread_id: number }>(
    ctx,
    'createForumTopic',
    { chat_id: target.chat, name: requireText(str(input, 'name'), 'name', MAX_TOPIC_NAME) },
    { accountId: access.accountId },
  );
  return { topicId: String(topic.message_thread_id), bot: access.label, chat: target.chat };
};

const editTopicTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  requireWritable(access, 'edit_topic');
  const target = await resolveTarget(ctx, access, input);
  const topicId = intField(input, 'topicId', 'required');
  const name = optionalStr(input, 'name');
  const closed = optionalBool(input, 'closed');
  if (name === undefined && closed === undefined) {
    throw new AddonError('invalid_params', { detail: 'pass name, closed, or both' });
  }
  if (name !== undefined) {
    await call(
      ctx,
      'editForumTopic',
      {
        chat_id: target.chat,
        message_thread_id: topicId,
        name: requireText(name, 'name', MAX_TOPIC_NAME),
      },
      { accountId: access.accountId },
    );
  }
  if (closed === true) {
    await call(
      ctx,
      'closeForumTopic',
      { chat_id: target.chat, message_thread_id: topicId },
      { accountId: access.accountId },
    );
  }
  if (closed === false) {
    await call(
      ctx,
      'reopenForumTopic',
      { chat_id: target.chat, message_thread_id: topicId },
      { accountId: access.accountId },
    );
  }
  return { updated: true, bot: access.label };
};

const createPollTool: ToolHandler = async (input, ctx) => {
  const access = await toolAccess(ctx, input);
  requireWritable(access, 'create_poll');
  const target = await resolveTarget(ctx, access, input);
  const options = input.options;
  if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
    throw new AddonError('invalid_params', { detail: 'options must hold 2 to 10 strings' });
  }
  const normalized = options.map((entry) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new AddonError('invalid_params', {
        detail: 'every option must be a non-empty string',
      });
    }
    return requireText(entry, 'option', MAX_OPTION);
  });
  const sent = await call<{ message_id: number }>(
    ctx,
    'sendPoll',
    {
      chat_id: target.chat,
      question: requireText(str(input, 'question'), 'question', MAX_QUESTION),
      options: normalized,
      is_anonymous: optionalBool(input, 'anonymous') !== false,
      allows_multiple_answers: optionalBool(input, 'multiple') === true,
    },
    { accountId: access.accountId },
  );
  return { messageId: String(sent.message_id), bot: access.label, chat: target.chat };
};

export const telegramTools: Record<string, ToolHandler> = {
  list_bots: listBotsTool,
  list_chats: listChatsTool,
  get_chat: getChatTool,
  send_message: sendMessageTool,
  edit_message: editMessageTool,
  delete_message: deleteMessageTool,
  send_media: sendMediaTool,
  send_album: sendAlbumTool,
  get_file: getFileTool,
  download_file: downloadFileTool,
  forward_message: forwardMessageTool,
  pin_message: pinMessageTool,
  create_topic: createTopicTool,
  edit_topic: editTopicTool,
  create_poll: createPollTool,
};
