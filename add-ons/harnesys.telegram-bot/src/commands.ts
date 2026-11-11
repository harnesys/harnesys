import type { AddonContext } from '@harnesys/sdk';
import { call } from './bot-api.ts';

export interface CommandMessage {
  chatId: string;
  topicId: string | null;
  text: string;
  channel: string;
}

export const BOT_COMMANDS: Array<{ command: string; description: string }> = [
  { command: 'start', description: 'Connect this chat to its Harnesys thread' },
  { command: 'help', description: 'Show the available commands' },
  { command: 'id', description: 'Show the chat, topic and channel identifiers' },
];

const HELP = [
  '/start - connect this chat to its Harnesys thread',
  '/help - show this list',
  '/id - show the chat, topic and channel identifiers',
  '',
  'Any other message is delivered to the thread agent and its replies come back here.',
].join('\n');

function reply(ctx: AddonContext, message: CommandMessage, text: string): Promise<unknown> {
  return call(ctx, 'sendMessage', {
    chat_id: message.chatId,
    text,
    ...(message.topicId !== null ? { message_thread_id: Number(message.topicId) } : {}),
  });
}

function commandOf(text: string): string {
  const [head] = text.trim().split(/\s+/);
  if (head === undefined) {
    return '';
  }
  const withoutMention = head.split('@')[0] ?? head;
  return withoutMention.toLowerCase();
}

export function isCommand(text: string): boolean {
  return text.trimStart().startsWith('/');
}

export async function handleCommand(ctx: AddonContext, message: CommandMessage): Promise<boolean> {
  const command = commandOf(message.text);
  if (command === '/start') {
    await reply(
      ctx,
      message,
      `This chat is connected as ${message.channel}. Send a message here and it goes to the thread agent; its replies come back through this bot.`,
    );
    return true;
  }
  if (command === '/help') {
    await reply(ctx, message, HELP);
    return true;
  }
  if (command === '/id') {
    const parts = [`chat: ${message.chatId}`, `channel: ${message.channel}`];
    if (message.topicId !== null) {
      parts.push(`topic: ${message.topicId}`);
    }
    await reply(ctx, message, parts.join('\n'));
    return true;
  }
  return false;
}
