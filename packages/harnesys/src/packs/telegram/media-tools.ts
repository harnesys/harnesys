import type { CapabilityScope } from '../../domain/pack.ts';
import type { TelegramChatsPort, TelegramMediaKind } from '../../ports/telegram-chats.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import {
  albumGate,
  MEDIA_INPUT_PROPERTIES,
  type MediaInput,
  mediaGate,
  mediaSourceOf,
  PARSE_MODE_PROPERTY,
  TARGET_PROPERTIES,
  targetOf,
} from './input.ts';

export interface TelegramMediaToolsParams {
  telegram: TelegramChatsPort;
  scope: () => CapabilityScope;
  bot?: string;
}

function mediaTool(
  deps: TelegramMediaToolsParams,
  name: string,
  kind: TelegramMediaKind,
  description: string,
): ToolDefinition {
  return tool(name, {
    group: 'telegram',
    description,
    input: {
      type: 'object',
      properties: { ...TARGET_PROPERTIES, ...MEDIA_INPUT_PROPERTIES },
      required: ['chat'],
      anyOf: [{ required: ['filePath'] }, { required: ['fileId'] }, { required: ['bytes'] }],
      additionalProperties: false,
    },
    sideEffect: 'communication',
    gate: mediaGate,
    execute: async (raw, ctx) => {
      const input = raw as MediaInput;
      const source = await mediaSourceOf(input, ctx, kind);
      return {
        post: await deps.telegram.sendMedia(deps.scope(), {
          ...targetOf(raw, deps.bot),
          kind,
          source,
          ...(input.caption !== undefined ? { caption: input.caption } : {}),
          ...(input.parseMode !== undefined ? { parseMode: input.parseMode } : {}),
          ...(input.disableNotification === true ? { disableNotification: true } : {}),
          ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
        }),
      };
    },
  });
}

export function createTelegramMediaTools(deps: TelegramMediaToolsParams): ToolDefinition[] {
  return [
    mediaTool(
      deps,
      'telegram_send_photo',
      'photo',
      'Post a photo with an optional caption to a Telegram chat, topic, or channel. ' +
        'Accept a local filePath, a thread: locator, a Telegram fileId, or base64 bytes.',
    ),
    mediaTool(
      deps,
      'telegram_send_document',
      'document',
      'Post a document or any file with an optional caption. ' +
        'Accept a local filePath, a thread: locator, a Telegram fileId, or base64 bytes.',
    ),
    mediaTool(deps, 'telegram_send_video', 'video', 'Post a video with an optional caption.'),
    mediaTool(
      deps,
      'telegram_send_animation',
      'animation',
      'Post a GIF or short silent video as an animation, with an optional caption.',
    ),
    mediaTool(
      deps,
      'telegram_send_audio',
      'audio',
      'Post an audio track with an optional caption.',
    ),
    mediaTool(
      deps,
      'telegram_send_voice',
      'voice',
      'Post a voice message. Telegram shows it as a playable voice note.',
    ),
    tool('telegram_send_album', {
      group: 'telegram',
      description:
        'Post an album of 2 to 10 photos, videos, or documents with per-item captions. ' +
        'Each item takes filePath, fileId, or base64 bytes.',
      input: {
        type: 'object',
        properties: {
          ...TARGET_PROPERTIES,
          items: {
            type: 'array',
            minItems: 2,
            maxItems: 10,
            items: {
              type: 'object',
              properties: {
                kind: {
                  type: 'string',
                  enum: ['photo', 'video', 'document'],
                  description: 'Media kind inside the album',
                },
                ...MEDIA_INPUT_PROPERTIES,
              },
              required: ['kind'],
              anyOf: [
                { required: ['filePath'] },
                { required: ['fileId'] },
                { required: ['bytes'] },
              ],
              additionalProperties: false,
            },
          },
          disableNotification: { type: 'boolean', description: 'Post silently' },
        },
        required: ['chat', 'items'],
        additionalProperties: false,
      },
      sideEffect: 'communication',
      gate: albumGate,
      execute: async (raw, ctx) => {
        const input = raw as {
          items: Array<MediaInput & { kind: 'photo' | 'video' | 'document' }>;
          disableNotification?: boolean;
        };
        const items = [];
        for (const item of input.items) {
          items.push({
            kind: item.kind,
            source: await mediaSourceOf(item, ctx, item.kind),
            ...(item.caption !== undefined ? { caption: item.caption } : {}),
            ...(item.parseMode !== undefined ? { parseMode: item.parseMode } : {}),
          });
        }
        return {
          posts: await deps.telegram.sendAlbum(deps.scope(), {
            ...targetOf(raw, deps.bot),
            items,
            ...(input.disableNotification === true ? { disableNotification: true } : {}),
          }),
        };
      },
    }),
    tool('telegram_edit_caption', {
      group: 'telegram',
      description: 'Edit the caption of a photo, video, or document the bot posted.',
      input: {
        type: 'object',
        properties: {
          chat: TARGET_PROPERTIES.chat,
          bot: TARGET_PROPERTIES.bot,
          messageId: { type: 'string', description: 'Telegram message id returned by a send' },
          caption: { type: 'string', description: 'New caption, up to 1024 characters' },
          parseMode: PARSE_MODE_PROPERTY,
        },
        required: ['chat', 'messageId', 'caption'],
        additionalProperties: false,
      },
      sideEffect: 'communication',
      execute: async (raw) => {
        const input = raw as {
          messageId?: string;
          caption?: string;
          parseMode?: 'HTML' | 'MarkdownV2';
        };
        return {
          post: await deps.telegram.editCaption(deps.scope(), {
            ...targetOf(raw, deps.bot),
            messageId: typeof input.messageId === 'string' ? input.messageId : '',
            caption: typeof input.caption === 'string' ? input.caption : '',
            ...(input.parseMode !== undefined ? { parseMode: input.parseMode } : {}),
          }),
        };
      },
    }),
  ];
}
