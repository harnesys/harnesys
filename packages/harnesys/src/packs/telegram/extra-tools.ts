import type { CapabilityScope } from '../../domain/pack.ts';
import type { TelegramChatsPort } from '../../ports/telegram-chats.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { TARGET_PROPERTIES, targetOf } from './input.ts';

export interface TelegramExtraToolsParams {
  telegram: TelegramChatsPort;
  scope: () => CapabilityScope;
  bot?: string;
}

function pollOf(raw: unknown) {
  const input = raw as Record<string, unknown>;
  return {
    question: typeof input.question === 'string' ? input.question : '',
    options: Array.isArray(input.options) ? (input.options as string[]) : [],
    ...(typeof input.anonymous === 'boolean' ? { anonymous: input.anonymous } : {}),
    ...(input.multiple === true ? { multiple: true } : {}),
    ...(input.quiz === true ? { quiz: true } : {}),
    ...(typeof input.correctOptionId === 'number'
      ? { correctOptionId: input.correctOptionId }
      : {}),
    ...(typeof input.explanation === 'string' ? { explanation: input.explanation } : {}),
    ...(input.disableNotification === true ? { disableNotification: true } : {}),
  };
}

export function createTelegramExtraTools(deps: TelegramExtraToolsParams): ToolDefinition[] {
  return [
    tool('telegram_unpin_message', {
      group: 'telegram',
      description: 'Unpin a message in a Telegram group or channel.',
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
      sideEffect: 'write',
      execute: async (raw) => {
        const input = raw as { messageId?: string };
        await deps.telegram.unpinMessage(deps.scope(), {
          ...targetOf(raw, deps.bot),
          messageId: typeof input.messageId === 'string' ? input.messageId : '',
        });
        return { unpinned: true };
      },
    }),
    tool('telegram_forward_message', {
      group: 'telegram',
      description:
        'Forward a message from one chat, channel, or topic to another chat the bot can post to.',
      input: {
        type: 'object',
        properties: {
          ...TARGET_PROPERTIES,
          fromChat: {
            type: 'string',
            description: 'Source chat id, @username, or title the bot knows',
          },
          messageId: { type: 'string', description: 'Source message id' },
        },
        required: ['chat', 'fromChat', 'messageId'],
        additionalProperties: false,
      },
      sideEffect: 'communication',
      execute: async (raw) => {
        const input = raw as { fromChat?: string; messageId?: string };
        return {
          post: await deps.telegram.forwardMessage(deps.scope(), {
            ...targetOf(raw, deps.bot),
            fromChat: typeof input.fromChat === 'string' ? input.fromChat : '',
            messageId: typeof input.messageId === 'string' ? input.messageId : '',
          }),
        };
      },
    }),
    tool('telegram_send_poll', {
      group: 'telegram',
      description: 'Post a poll or quiz to a Telegram group or channel.',
      input: {
        type: 'object',
        properties: {
          ...TARGET_PROPERTIES,
          question: { type: 'string', description: 'Poll question' },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 10,
            items: { type: 'string' },
            description: 'Answer options',
          },
          anonymous: { type: 'boolean', description: 'Default true' },
          multiple: { type: 'boolean', description: 'Allow several answers' },
          quiz: { type: 'boolean', description: 'Make it a quiz with one correct answer' },
          correctOptionId: {
            type: 'integer',
            minimum: 0,
            description: 'Zero-based option index for a quiz',
          },
          explanation: { type: 'string', description: 'Explanation shown after a quiz answer' },
          disableNotification: { type: 'boolean' },
        },
        required: ['chat', 'question', 'options'],
        additionalProperties: false,
      },
      sideEffect: 'communication',
      execute: async (raw) => ({
        post: await deps.telegram.sendPoll(deps.scope(), {
          ...targetOf(raw, deps.bot),
          ...pollOf(raw),
        }),
      }),
    }),
  ];
}
