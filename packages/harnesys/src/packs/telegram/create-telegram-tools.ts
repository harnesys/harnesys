import type { CapabilityScope } from '../../domain/pack.ts';
import type { TelegramChatsPort } from '../../ports/telegram-chats.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { createTelegramExtraTools } from './extra-tools.ts';
import { PARSE_MODE_PROPERTY, TARGET_PROPERTIES, targetOf } from './input.ts';
import { createTelegramMediaTools } from './media-tools.ts';
import { createTelegramTopicTools } from './topic-tools.ts';

export interface CreateTelegramToolsParams {
  telegram: TelegramChatsPort;
  scope: () => CapabilityScope;
  bot?: string;
}

export function createTelegramTools(deps: CreateTelegramToolsParams): ToolDefinition[] {
  const scope = () => deps.scope();
  return [
    ...createTelegramMediaTools(deps),
    ...createTelegramTopicTools(deps),
    ...createTelegramExtraTools(deps),
    tool('telegram_list_chats', {
      group: 'telegram',
      description:
        'List Telegram chats known to the bots: DMs, groups, forum topics, and channels, with their Harnesys thread and agents.',
      input: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['private', 'group', 'supergroup', 'channel'],
            description: 'Only return chats of this type',
          },
          bot: TARGET_PROPERTIES.bot,
        },
        additionalProperties: false,
      },
      sideEffect: 'read',
      execute: (raw) => {
        const input = raw as { type?: string; bot?: string };
        const bot = input.bot ?? deps.bot;
        return {
          chats: deps.telegram.listChats(scope(), {
            ...(input.type ? { type: input.type } : {}),
            ...(bot ? { bot } : {}),
          }),
        };
      },
    }),
    tool('telegram_get_chat', {
      group: 'telegram',
      description:
        'Read one known Telegram chat: its id, type, title, Harnesys thread, and connected agents.',
      input: {
        type: 'object',
        properties: TARGET_PROPERTIES,
        required: ['chat'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      execute: async (raw) => ({
        chat: await deps.telegram.getChat(scope(), targetOf(raw, deps.bot)),
      }),
    }),
    tool('telegram_read_messages', {
      group: 'telegram',
      description:
        'Read recent messages the bot received in a chat, newest first. Telegram only delivers messages the bot has seen, so old history is unavailable.',
      input: {
        type: 'object',
        properties: {
          ...TARGET_PROPERTIES,
          limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Default 20' },
        },
        required: ['chat'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      execute: async (raw) => {
        const input = raw as { limit?: number };
        const limit =
          typeof input.limit === 'number' ? Math.min(100, Math.max(1, input.limit)) : 20;
        return {
          messages: await deps.telegram.readMessages(scope(), {
            ...targetOf(raw, deps.bot),
            limit,
          }),
        };
      },
    }),
    tool('telegram_send_message', {
      group: 'telegram',
      description:
        'Post a plain-text message to a Telegram group, forum topic, or channel as the connected bot.',
      input: {
        type: 'object',
        properties: {
          ...TARGET_PROPERTIES,
          text: { type: 'string', description: 'Message text, up to 4096 characters' },
          parseMode: PARSE_MODE_PROPERTY,
          disableNotification: { type: 'boolean', description: 'Post silently' },
          protectContent: { type: 'boolean', description: 'Disable forwarding and saving' },
          linkPreview: { type: 'boolean', description: 'Set false to hide the link preview' },
          replyToMessageId: { type: 'string', description: 'Message id to reply to' },
        },
        required: ['chat', 'text'],
        additionalProperties: false,
      },
      sideEffect: 'communication',
      execute: async (raw) => {
        const input = raw as {
          text?: string;
          parseMode?: 'HTML' | 'MarkdownV2';
          disableNotification?: boolean;
          protectContent?: boolean;
          linkPreview?: boolean;
          replyToMessageId?: string;
        };
        return {
          post: await deps.telegram.sendMessage(scope(), {
            ...targetOf(raw, deps.bot),
            text: typeof input.text === 'string' ? input.text : '',
            ...(input.parseMode !== undefined ? { parseMode: input.parseMode } : {}),
            ...(input.disableNotification === true ? { disableNotification: true } : {}),
            ...(input.protectContent === true ? { protectContent: true } : {}),
            ...(input.linkPreview === false ? { linkPreview: false } : {}),
            ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
          }),
        };
      },
    }),
    tool('telegram_edit_message', {
      group: 'telegram',
      description: 'Edit the text of a message the bot posted in a group or channel.',
      input: {
        type: 'object',
        properties: {
          chat: TARGET_PROPERTIES.chat,
          bot: TARGET_PROPERTIES.bot,
          messageId: { type: 'string', description: 'Telegram message id returned by a send' },
          text: { type: 'string' },
          parseMode: PARSE_MODE_PROPERTY,
          linkPreview: { type: 'boolean', description: 'Set false to hide the link preview' },
        },
        required: ['chat', 'messageId', 'text'],
        additionalProperties: false,
      },
      sideEffect: 'communication',
      execute: async (raw) => {
        const input = raw as {
          messageId?: string;
          text?: string;
          parseMode?: 'HTML' | 'MarkdownV2';
          linkPreview?: boolean;
        };
        return {
          post: await deps.telegram.editMessage(scope(), {
            ...targetOf(raw, deps.bot),
            messageId: typeof input.messageId === 'string' ? input.messageId : '',
            text: typeof input.text === 'string' ? input.text : '',
            ...(input.parseMode !== undefined ? { parseMode: input.parseMode } : {}),
            ...(input.linkPreview === false ? { linkPreview: false } : {}),
          }),
        };
      },
    }),
    tool('telegram_delete_message', {
      group: 'telegram',
      description:
        'Delete a message the bot posted. Telegram also allows deleting recent messages.',
      input: {
        type: 'object',
        properties: {
          chat: TARGET_PROPERTIES.chat,
          bot: TARGET_PROPERTIES.bot,
          messageId: { type: 'string' },
        },
        required: ['chat', 'messageId'],
        additionalProperties: false,
      },
      sideEffect: 'destructive',
      execute: async (raw) => {
        const input = raw as { messageId?: string };
        await deps.telegram.deleteMessage(scope(), {
          ...targetOf(raw, deps.bot),
          messageId: typeof input.messageId === 'string' ? input.messageId : '',
        });
        return { deleted: true };
      },
    }),
    tool('telegram_pin_message', {
      group: 'telegram',
      description: 'Pin a message in a Telegram group or channel.',
      input: {
        type: 'object',
        properties: {
          chat: TARGET_PROPERTIES.chat,
          bot: TARGET_PROPERTIES.bot,
          messageId: { type: 'string' },
          notify: { type: 'boolean', description: 'Notify members about the pin' },
        },
        required: ['chat', 'messageId'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      execute: async (raw) => {
        const input = raw as { messageId?: string; notify?: boolean };
        await deps.telegram.pinMessage(scope(), {
          ...targetOf(raw, deps.bot),
          messageId: typeof input.messageId === 'string' ? input.messageId : '',
          ...(input.notify === true ? { notify: true } : {}),
        });
        return { pinned: true };
      },
    }),
  ];
}
