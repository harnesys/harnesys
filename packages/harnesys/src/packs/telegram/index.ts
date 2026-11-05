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
  {
    name: 'telegram_unpin_message',
    description: 'Unpin a message in a group or channel.',
  },
  {
    name: 'telegram_send_photo',
    description: 'Post a photo with an optional caption from a file path, file id, or bytes.',
  },
  {
    name: 'telegram_send_document',
    description: 'Post a document with an optional caption from a file path, file id, or bytes.',
  },
  {
    name: 'telegram_send_video',
    description: 'Post a video with an optional caption.',
  },
  {
    name: 'telegram_send_animation',
    description: 'Post a GIF or short silent video as an animation.',
  },
  {
    name: 'telegram_send_audio',
    description: 'Post an audio track with an optional caption.',
  },
  {
    name: 'telegram_send_voice',
    description: 'Post a voice message.',
  },
  {
    name: 'telegram_send_album',
    description: 'Post an album of 2 to 10 photos, videos, or documents with captions.',
  },
  {
    name: 'telegram_edit_caption',
    description: 'Edit the caption of a media message the bot posted.',
  },
  {
    name: 'telegram_forward_message',
    description: 'Forward a message to another chat the bot can post to.',
  },
  {
    name: 'telegram_create_topic',
    description: 'Create a forum topic in a group.',
  },
  {
    name: 'telegram_edit_topic',
    description: 'Rename, close, or reopen a forum topic.',
  },
  {
    name: 'telegram_delete_topic',
    description: 'Delete a forum topic and its messages.',
  },
  {
    name: 'telegram_send_poll',
    description: 'Post a poll or quiz to a group or channel.',
  },
];

export const telegramCapability = definePack<TelegramCapabilityPorts, TelegramPackSpec>({
  name: 'telegram',
  version: '1.0.0',
  description:
    'Telegram content management: list chats and channels, read recent messages, post and edit text, photos, videos, documents, albums, polls, manage topics, forward, pin, and delete as the organization bot',
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
