import { definePack } from '../../domain/pack.ts';
import type { TelegramChatsPort } from '../../ports/telegram-chats.ts';
import { createTelegramTools } from './create-telegram-tools.ts';

export interface TelegramCapabilityPorts {
  telegram: TelegramChatsPort;
}

export interface TelegramPackSpec {
  bot?: string;
}

const TOOL_META = [
  {
    name: 'telegram_list_chats',
    description: 'List Telegram DMs, groups, topics, and channels known to the bots.',
  },
  {
    name: 'telegram_get_chat',
    description: 'Read one Telegram chat: type, title, thread, and agents.',
  },
  {
    name: 'telegram_read_messages',
    description: 'Read recent messages the bot received in a chat, newest first.',
  },
  {
    name: 'telegram_send_message',
    description: 'Post a message to a Telegram group, topic, or channel.',
  },
  {
    name: 'telegram_edit_message',
    description: 'Edit a message the bot posted.',
  },
  {
    name: 'telegram_delete_message',
    description: 'Delete a message the bot posted.',
  },
  {
    name: 'telegram_pin_message',
    description: 'Pin a message in a group or channel.',
  },
];

export const telegramCapability = definePack<TelegramCapabilityPorts, TelegramPackSpec>({
  name: 'telegram',
  version: '1.0.0',
  description:
    'Telegram: list chats and channels, read recent messages, post, edit, delete, and pin messages as the organization bot',
  icon: 'telegram',
  specSchema: {
    type: 'object',
    properties: {
      bot: {
        type: 'string',
        description: 'Bot @username to use when several Telegram bots are connected',
      },
    },
    additionalProperties: false,
  },
  meta: {
    tools: TOOL_META,
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => {
    if (!ctx.ports.telegram.hasAny(ctx.scope)) {
      return {
        notes: () => [
          {
            tag: 'telegram-connect',
            text: 'Telegram is not connected. Add a bot in Settings → Connectors → Telegram.',
          },
        ],
      };
    }
    const bot =
      typeof ctx.spec.bot === 'string' && ctx.spec.bot.trim() !== ''
        ? ctx.spec.bot.trim()
        : undefined;
    return {
      tools: createTelegramTools({
        telegram: ctx.ports.telegram,
        scope: () => ctx.scope,
        ...(bot ? { bot } : {}),
      }),
    };
  },
});
