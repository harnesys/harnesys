export const BOT_COMMANDS = [
  { command: 'start', description: 'Link this chat with the code from Harnesys' },
  { command: 'stop', description: 'Stop the current run' },
  { command: 'compact', description: 'Compact this thread' },
  { command: 'stats', description: 'Thread token and cost totals' },
  { command: 'skills', description: 'Skills this agent can use' },
  { command: 'help', description: 'List commands' },
] as const;

export type BotCommandName = 'start' | 'stop' | 'compact' | 'stats' | 'skills' | 'help';

export const PAIRED_COMMANDS = ['stop', 'compact', 'stats', 'skills', 'help'] as const;

export type PairedCommandName = 'stop' | 'compact' | 'stats' | 'skills' | 'help';

export function helpText(): string {
  return BOT_COMMANDS.map((item) => `/${item.command} - ${item.description}`).join('\n');
}

export function isPairedCommand(name: string): name is PairedCommandName {
  return (PAIRED_COMMANDS as readonly string[]).includes(name);
}
