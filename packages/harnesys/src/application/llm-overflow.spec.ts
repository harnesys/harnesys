import { describe, expect, test } from 'bun:test';
import { isContextOverflowError } from './llm.ts';

function apiError(status: number, message: string): unknown {
  return Object.assign(new Error(message), { name: 'APICallError', statusCode: status });
}

describe('isContextOverflowError', () => {
  test('matches 400 and 413 with context/token/length wording', () => {
    expect(
      isContextOverflowError(apiError(400, 'prompt is too long: context window exceeded')),
    ).toBe(true);
    expect(
      isContextOverflowError(apiError(413, 'request entity too large: maximum token limit')),
    ).toBe(true);
    expect(isContextOverflowError(apiError(400, 'maximum context length is 200000 tokens'))).toBe(
      true,
    );
  });

  test('rejects other statuses and unrelated messages', () => {
    expect(isContextOverflowError(apiError(400, 'invalid json body'))).toBe(false);
    expect(isContextOverflowError(apiError(429, 'rate limit: too many tokens for you'))).toBe(
      false,
    );
    expect(isContextOverflowError(apiError(500, 'context exploded'))).toBe(false);
    expect(isContextOverflowError(new Error('context length exceeded'))).toBe(false);
  });
});
