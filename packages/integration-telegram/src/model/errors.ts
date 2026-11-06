export type FeedErrorCode =
  | 'reader_not_connected'
  | 'reader_not_found'
  | 'source_not_found'
  | 'rule_not_found'
  | 'peer_unresolved'
  | 'session_missing'
  | 'login_expired';

export class TelegramFeedError extends Error {
  readonly code: FeedErrorCode;
  readonly status: number;

  constructor(code: FeedErrorCode, message: string, status = 400) {
    super(message);
    this.name = 'TelegramFeedError';
    this.code = code;
    this.status = status;
  }
}

export function readerNotConnected(): TelegramFeedError {
  return new TelegramFeedError(
    'reader_not_connected',
    'Connect a Telegram account before adding sources',
    409,
  );
}

export function notFound(what: 'reader' | 'source' | 'rule', id: string): TelegramFeedError {
  return new TelegramFeedError(
    `${what}_not_found` as FeedErrorCode,
    `Telegram ${what} not found: ${id}`,
    404,
  );
}
