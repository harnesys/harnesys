import { AddonError } from '@harnesys/sdk';

export type ChatRefKind = 'username' | 'id';

export interface ChatRef {
  raw: string;
  kind: ChatRefKind;
  username: string | null;
  numeric: readonly string[];
}

export interface ChatIdentity {
  peerId: string;
  username: string | null;
}

const LINK_PREFIXES = [
  'https://t.me/',
  'http://t.me/',
  't.me/',
  'https://telegram.me/',
  'http://telegram.me/',
  'telegram.me/',
];

const NUMERIC = /^-?\d+$/;
const PRIVATE_PATH = 'c';
const INVITE_PATH = 'joinchat';
const BOT_API_CHANNEL_PREFIX = '-100';
const BOT_API_CHANNEL_DIGITS = BOT_API_CHANNEL_PREFIX.length - 1;

function invalidChat(value: string): AddonError {
  return new AddonError('invalid_params', {
    detail: `chat must be @username, t.me/... or a numeric id, got "${value}"`,
  });
}

function inviteLink(value: string): AddonError {
  return new AddonError('invalid_params', {
    detail: `invite link cannot be read; join with this account and pass @username or t.me/c/<id> (got "${value}")`,
  });
}

function linkPathOf(value: string): string | null {
  const lower = value.toLowerCase();
  const prefix = LINK_PREFIXES.find((entry) => lower.startsWith(entry));
  return prefix === undefined ? null : value.slice(prefix.length);
}

function pathSegments(path: string): string[] {
  const withoutQuery = path.split(/[?#]/)[0] ?? '';
  const withoutSection = withoutQuery.replace(/^s\//i, '');
  return withoutSection
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function numericKeys(value: string): string[] {
  const trimmed = value.trim();
  if (!NUMERIC.test(trimmed)) {
    return [];
  }
  const digits = trimmed.replace(/^-/, '');
  if (trimmed.startsWith(BOT_API_CHANNEL_PREFIX) && digits.length > BOT_API_CHANNEL_DIGITS) {
    return [digits.slice(BOT_API_CHANNEL_DIGITS)];
  }
  return [digits];
}

export function chatRefOf(value: string): ChatRef {
  const raw = value.trim();
  if (raw.length === 0) {
    throw invalidChat(value);
  }
  const path = linkPathOf(raw);
  const segments = pathSegments(path ?? raw);
  const head = segments[0] ?? '';
  if (path !== null && head.toLowerCase() === PRIVATE_PATH) {
    const id = segments[1] ?? '';
    if (!/^\d+$/.test(id)) {
      throw invalidChat(value);
    }
    return { raw, kind: 'id', username: null, numeric: numericKeys(id) };
  }
  if (head.startsWith('+') || (path !== null && head.toLowerCase() === INVITE_PATH)) {
    throw inviteLink(value);
  }
  const numeric = numericKeys(head);
  if (numeric.length > 0) {
    return { raw, kind: 'id', username: null, numeric };
  }
  const username = head.replace(/^@/, '').toLowerCase();
  if (username.length === 0) {
    throw invalidChat(value);
  }
  return { raw, kind: 'username', username, numeric: [] };
}

export function refKeysOf(ref: ChatRef): string[] {
  if (ref.username !== null) {
    return [`u:${ref.username}`];
  }
  return ref.numeric.map((digits) => `n:${digits}`);
}

export function chatKeysOf(value: string): string[] {
  return refKeysOf(chatRefOf(value));
}

export function chatLabelOf(ref: ChatRef): string {
  return ref.username === null ? (ref.numeric[0] ?? ref.raw) : `@${ref.username}`;
}

export function resolveArgOf(ref: ChatRef): string {
  return ref.username === null ? (ref.numeric[0] ?? ref.raw) : `@${ref.username}`;
}

function identityKeys(identity: ChatIdentity): string[] {
  const keys: string[] = [];
  if (identity.username !== null) {
    keys.push(`u:${identity.username.toLowerCase()}`);
  }
  for (const digits of numericKeys(identity.peerId)) {
    keys.push(`n:${digits}`);
  }
  return keys;
}

function anyKeyAllowed(allowed: readonly string[], keys: readonly string[]): boolean {
  if (allowed.length === 0) {
    return true;
  }
  const used = new Set(keys);
  return allowed.some((entry) => chatKeysOf(entry).some((key) => used.has(key)));
}

export function matchesAllowed(
  allowed: readonly string[],
  ref: ChatRef,
  identity: ChatIdentity,
): boolean {
  return anyKeyAllowed(allowed, [...refKeysOf(ref), ...identityKeys(identity)]);
}

export function matchesIdentity(allowed: readonly string[], identity: ChatIdentity): boolean {
  return anyKeyAllowed(allowed, identityKeys(identity));
}
