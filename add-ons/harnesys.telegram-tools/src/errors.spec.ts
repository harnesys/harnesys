import { describe, expect, test } from 'bun:test';
import { classifyTelegramError } from './errors.ts';

describe('classifyTelegramError', () => {
  test('maps an unknown chat to not_found with a hint', () => {
    const failure = classifyTelegramError(400, 'Bad Request: chat not found');
    expect(failure.reason).toBe('not_found');
    expect(failure.detail).toContain('telegram 400 not_found');
    expect(failure.detail).toContain('chat not found');
    expect(failure.detail).toContain('never seen this chat');
  });

  test('maps a silent edit to conflict', () => {
    const failure = classifyTelegramError(400, 'Bad Request: message is not modified');
    expect(failure.reason).toBe('conflict');
  });

  test('keeps the retry hint for rate limits', () => {
    const failure = classifyTelegramError(429, 'Too Many Requests: retry after 7', {
      retry_after: 7,
    });
    expect(failure.reason).toBe('rate_limited');
    expect(failure.retryable).toBe(true);
    expect(failure.detail).toContain('retry after 7s');
  });

  test('reports a migrated chat with the new supergroup id', () => {
    const failure = classifyTelegramError(400, 'Bad Request: group chat was upgraded', {
      migrate_to_chat_id: -1001234,
    });
    expect(failure.reason).toBe('not_found');
    expect(failure.detail).toContain('-1001234');
  });

  test('treats an invalid token as an account failure', () => {
    const failure = classifyTelegramError(401, 'Unauthorized');
    expect(failure.reason).toBe('account_failed');
    expect(failure.accountCode).toBe('invalid_credentials');
  });
});
