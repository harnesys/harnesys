import { AddonError, type AddonErrorReason } from '@harnesys/sdk';

export const MAX_FLOOD_WAIT_SEC = 30;

interface ReasonRule {
  reason: AddonErrorReason;
  retryable: boolean;
  match: readonly string[];
}

const PERMISSION = [
  'CHAT_WRITE_FORBIDDEN',
  'CHANNEL_PRIVATE',
  'CHAT_ADMIN_REQUIRED',
  'CHAT_RESTRICTED',
  'USER_BANNED_IN_CHANNEL',
  'CHAT_SEND_PLAIN_FORBIDDEN',
  'CHAT_SEND_MEDIA_FORBIDDEN',
  'CHAT_FORWARDS_RESTRICTED',
  'USER_NOT_PARTICIPANT',
];
const NOT_FOUND = [
  'PEER_ID_INVALID',
  'CHANNEL_INVALID',
  'CHAT_ID_INVALID',
  'USERNAME_NOT_OCCUPIED',
  'USERNAME_INVALID',
  'USER_ID_INVALID',
  'MESSAGE_ID_INVALID',
  'COULD NOT FIND THE INPUT ENTITY',
  'CANNOT FIND ANY ENTITY',
];
const PERMISSION_DENIED = ['YOU BLOCKED THIS USER', 'USER IS BLOCKED', 'BLOCKED BY'];
const ACCOUNT_FAILED = [
  'AUTH_KEY_UNREGISTERED',
  'AUTH_KEY_INVALID',
  'AUTH_KEY_DUPLICATED',
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
  'SESSION_PASSWORD_NEEDED',
  'USER_DEACTIVATED',
  'API_ID_INVALID',
  'ACCOUNT_BANNED',
];
const INVALID_PARAMS = [
  'MESSAGE_TOO_LONG',
  'MESSAGE_EMPTY',
  'TEXT_EMPTY',
  'MEDIA_EMPTY',
  'MEDIA_INVALID',
  'QUERY_TOO_SHORT',
  'MESSAGE_NOT_MODIFIED',
  'REACTION_INVALID',
  'CHANNEL_FORUM_MISSING',
  'INVITE_HASH_EXPIRED',
  'INVITE_HASH_INVALID',
  'INVITE_REQUEST_SENT',
  'USERS_TOO_FEW',
];
const UNAVAILABLE = [
  'TIMEOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'SOCKET',
  'CONNECTION',
];

const RULES: readonly ReasonRule[] = [
  { reason: 'permission_denied', retryable: false, match: PERMISSION },
  { reason: 'not_found', retryable: false, match: NOT_FOUND },
  { reason: 'permission_denied', retryable: false, match: PERMISSION_DENIED },
  { reason: 'account_failed', retryable: false, match: ACCOUNT_FAILED },
  { reason: 'invalid_params', retryable: false, match: INVALID_PARAMS },
  { reason: 'unavailable', retryable: true, match: UNAVAILABLE },
];

export function telegramErrorText(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const message = (error as { errorMessage?: unknown }).errorMessage;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}

export function floodWaitSeconds(error: unknown): number | null {
  const text = telegramErrorText(error);
  const match = /FLOOD_WAIT_(\d+)/.exec(text);
  if (match === null) {
    return null;
  }
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

export function mapTelegramError(error: unknown): AddonError {
  if (error instanceof AddonError) {
    return error;
  }
  const text = telegramErrorText(error);
  const upper = text.toUpperCase();
  if (upper.includes('FLOOD_WAIT')) {
    const seconds = floodWaitSeconds(text);
    return new AddonError('rate_limited', {
      retryable: true,
      detail:
        seconds === null ? `telegram: ${text}` : `retry_after ${seconds}s (telegram: ${text})`,
    });
  }
  const rule = RULES.find((entry) => entry.match.some((needle) => upper.includes(needle)));
  return new AddonError(rule?.reason ?? 'internal', {
    retryable: rule?.retryable ?? false,
    detail: `telegram: ${text}`,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withFloodRetry<T>(retries: number, run: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (error) {
      const seconds = floodWaitSeconds(error);
      const canRetry =
        seconds !== null && seconds <= MAX_FLOOD_WAIT_SEC && attempt < Math.min(retries, 3);
      if (!canRetry) {
        throw mapTelegramError(error);
      }
      attempt += 1;
      await sleep(seconds * 1000);
    }
  }
}
