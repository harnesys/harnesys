import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';

export function normalizeChatRef(raw: string): string {
  const value = raw.trim();
  if (value.length === 0) {
    throw new ConnectorValidationException('Enter a chat @username, link, or numeric id');
  }
  if (/^-?\d+$/.test(value)) {
    return value;
  }
  if (value.startsWith('@')) {
    return value;
  }
  const fromLink = linkChatRef(value);
  if (fromLink !== null) {
    return fromLink;
  }
  throw new ConnectorValidationException(
    'Use @username, a t.me link, or a numeric chat id. Invite links do not carry the chat id.',
  );
}

function linkChatRef(value: string): string | null {
  const match = /^(?:https?:\/\/)?t\.me\/(?:c\/)?([A-Za-z0-9_]+)(?:\/\d+)?\/?$/i.exec(value);
  const part = match?.[1];
  if (part === undefined) {
    return null;
  }
  return /^\d+$/.test(part) ? `-100${part}` : `@${part}`;
}
