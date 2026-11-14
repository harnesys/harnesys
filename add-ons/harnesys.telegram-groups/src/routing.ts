export type RoutingPolicy = 'mention' | 'reply' | 'always' | 'commands';

export type RouteDecision = 'command' | 'bridge' | 'ignore';

export interface RoutingInput {
  text: string;
  isCommand: boolean;
  mentioned: boolean;
  replyToBot: boolean;
}

export function routeDecision(policy: RoutingPolicy, input: RoutingInput): RouteDecision {
  if (input.isCommand) {
    return 'command';
  }
  if (policy === 'commands') {
    return 'ignore';
  }
  if (policy === 'always') {
    return 'bridge';
  }
  if (policy === 'mention') {
    return input.mentioned ? 'bridge' : 'ignore';
  }
  return input.replyToBot ? 'bridge' : 'ignore';
}

export function isMentioned(text: string, botUsername: string | null): boolean {
  if (botUsername === null || botUsername.length === 0) {
    return false;
  }
  const escaped = botUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)@${escaped}\\b`, 'i').test(text);
}

export function authorLabel(from: { username?: string; first_name?: string } | undefined): string {
  if (from === undefined) {
    return 'unknown sender';
  }
  if (typeof from.username === 'string' && from.username.length > 0) {
    return `@${from.username}`;
  }
  if (typeof from.first_name === 'string' && from.first_name.length > 0) {
    return from.first_name;
  }
  return 'unknown sender';
}

export function attributedText(author: string, chatTitle: string, text: string): string {
  return `From ${author} in ${chatTitle}: ${text}`;
}
