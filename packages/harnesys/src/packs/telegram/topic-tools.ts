import type { CapabilityScope } from '../../domain/pack.ts';
import type { TelegramChatsPort } from '../../ports/telegram-chats.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { TARGET_PROPERTIES, targetOf } from './input.ts';

export interface TelegramTopicToolsParams {
  telegram: TelegramChatsPort;
  scope: () => CapabilityScope;
  bot?: string;
}

export function createTelegramTopicTools(deps: TelegramTopicToolsParams): ToolDefinition[] {
  return [
    tool('telegram_create_topic', {
      group: 'telegram',
      description: 'Create a forum topic in a Telegram group and return its topic id.',
      input: {
        type: 'object',
        properties: {
          ...TARGET_PROPERTIES,
          name: { type: 'string', description: 'Topic title' },
        },
        required: ['chat', 'name'],
        additionalProperties: false,
      },
      sideEffect: 'communication',
      execute: async (raw) => {
        const input = raw as { name?: string };
        return {
          topic: await deps.telegram.createTopic(deps.scope(), {
            ...targetOf(raw, deps.bot),
            name: typeof input.name === 'string' ? input.name : '',
          }),
        };
      },
    }),
    tool('telegram_edit_topic', {
      group: 'telegram',
      description: 'Rename a forum topic and optionally close or reopen it.',
      input: {
        type: 'object',
        properties: {
          ...TARGET_PROPERTIES,
          name: { type: 'string', description: 'New topic title' },
          closed: { type: 'boolean', description: 'true closes the topic, false reopens it' },
        },
        required: ['chat', 'topicId'],
        additionalProperties: false,
      },
      sideEffect: 'communication',
      execute: async (raw) => {
        const input = raw as { topicId?: string; name?: string; closed?: boolean };
        await deps.telegram.editTopic(deps.scope(), {
          ...targetOf(raw, deps.bot),
          topicId: typeof input.topicId === 'string' ? input.topicId : '',
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(typeof input.closed === 'boolean' ? { closed: input.closed } : {}),
        });
        return { updated: true };
      },
    }),
    tool('telegram_delete_topic', {
      group: 'telegram',
      description: 'Delete a forum topic and all its messages.',
      input: {
        type: 'object',
        properties: {
          ...TARGET_PROPERTIES,
        },
        required: ['chat', 'topicId'],
        additionalProperties: false,
      },
      sideEffect: 'destructive',
      execute: async (raw) => {
        const input = raw as { topicId?: string };
        await deps.telegram.deleteTopic(deps.scope(), {
          ...targetOf(raw, deps.bot),
          topicId: typeof input.topicId === 'string' ? input.topicId : '',
        });
        return { deleted: true };
      },
    }),
  ];
}
